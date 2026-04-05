import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { AddressObject, ParsedMail } from 'mailparser';
import { TicketsService } from '../../tickets/tickets.service';
import { AiService } from '../../ai/ai.service';
import { DepartmentsService } from '../../departments/departments.service';
import { TicketChannel, TicketPriority } from '../../common/types/ticket-status.enum';
import { resolveDepartmentIdFromMail } from './mail-department.router';
import { NotificationsService } from '../../notifications/notifications.service';
import { TicketsGateway } from '../../tickets/tickets.gateway';

function collectRecipientAddresses(parsed: ParsedMail): string[] {
  const emails: string[] = [];
  const push = (obj?: AddressObject | AddressObject[]) => {
    if (!obj) return;
    const list = Array.isArray(obj) ? obj : [obj];
    for (const o of list) {
      for (const v of o.value) {
        if (v.address) emails.push(v.address);
      }
    }
  };
  push(parsed.to);
  push(parsed.cc);
  push(parsed.bcc);
  if (parsed.headers?.get('delivered-to')) {
    const d = parsed.headers.get('delivered-to');
    if (typeof d === 'string' && d.includes('@')) emails.push(d.trim());
  }
  return [...new Set(emails.map((e) => e.trim()))];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeMessageId(id: string | undefined): string {
  if (!id) return '';
  return id.replace(/^<|>$/g, '').trim();
}

function normSearch(result: number[] | false): number[] {
  return result === false ? [] : result;
}

const EMAIL_ADDR_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** Prefer Reply-To (real person) when bulk senders put a service address in From (e.g. Twilio). */
function resolveRequesterAddress(parsed: ParsedMail): string {
  const rt = parsed.replyTo?.value?.[0]?.address?.trim();
  if (rt && EMAIL_ADDR_RE.test(rt)) return rt;
  const from = parsed.from?.value?.[0]?.address?.trim();
  if (from && EMAIL_ADDR_RE.test(from)) return from;
  return '';
}

function inferInboundPriority(subject: string, body: string): TicketPriority {
  const t = `${subject}\n${body}`.toLowerCase();
  if (/\b(sev-?1|p1\b|data\s+breach|security\s+incident|legal\s+hold|outage|completely\s+down|production\s+down)\b/i.test(t)) {
    return TicketPriority.CRITICAL;
  }
  if (/\b(urgent|asap|immediately|blocking|cannot\s+work)\b/i.test(t)) {
    return TicketPriority.HIGH;
  }
  return TicketPriority.NORMAL;
}

/** Skip newsletters / bounces so the shared inbox does not open junk tickets */
function shouldSkipIngest(parsed: ParsedMail): boolean {
  const from = parsed.from?.value?.[0]?.address?.toLowerCase() || '';
  const fromName = (parsed.from?.value?.[0]?.name || '').toLowerCase();
  if (!from && !fromName) return false;
  if (/^mailer-daemon@|^postmaster@|^bounce|^no-?reply|^donotreply/i.test(from)) return true;
  if (/no-?reply@|donotreply@|mailer-daemon|do_not_reply/i.test(from)) return true;
  const prec = String(parsed.headers?.get('precedence') || '').toLowerCase();
  if (prec === 'bulk' || prec === 'list' || prec === 'junk') return true;
  const autoSub = String(parsed.headers?.get('auto-submitted') || '').toLowerCase();
  if (autoSub && autoSub !== 'no') return true;
  return false;
}

interface MailUidStateFile {
  lastUid: number;
}

@Injectable()
export class MailIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailIngestService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollLock = false;
  /** If a poll overlaps the next interval, run again immediately after (no skipped cycles). */
  private pollQueued = false;

  /**
   * IN-MEMORY cursor — the single source of truth between polls.
   * File is ONLY used for recovery after a full process restart.
   * This guarantees we never lose track even if the disk write fails.
   */
  private memoryBaseline: number | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly ticketsService: TicketsService,
    private readonly aiService: AiService,
    private readonly departmentsService: DepartmentsService,
    private readonly notificationsService: NotificationsService,
    private readonly ticketsGateway: TicketsGateway,
  ) {}

  onModuleInit() {
    const enabled = this.config.get<string>('IMAP_ENABLED')?.toLowerCase() === 'true';
    if (!enabled) {
      this.logger.log('Mail ingest: disabled (set IMAP_ENABLED=true to poll Gmail/IMAP)');
      return;
    }

    const user =
      this.config.get<string>('IMAP_USER') ||
      this.config.get<string>('SMTP_USER');
    const pass =
      this.config.get<string>('IMAP_PASSWORD') ||
      this.config.get<string>('SMTP_PASSWORD');

    if (!user || !pass || pass === 'app_specific_password') {
      this.logger.warn(
        'Mail ingest: IMAP_ENABLED but IMAP_USER / IMAP_PASSWORD missing or placeholder — skipping poller',
      );
      return;
    }

    const ms = parseInt(
      this.config.get<string>('IMAP_POLL_INTERVAL_MS') ||
        this.config.get<string>('SMTP_POLL_INTERVAL_MS') ||
        '25000',
      10,
    );

    this.logger.log(`Mail ingest: polling every ${ms}ms for ${user}`);
    this.logger.log(`Mail ingest: UID state file = ${this.getUidStatePath()}`);
    this.timer = setInterval(() => void this.pollOnce(), ms);
    setTimeout(() => void this.pollOnce(), 2000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async pollOnce() {
    if (this.pollLock) {
      this.pollQueued = true;
      return;
    }
    this.pollLock = true;
    try {
      do {
        this.pollQueued = false;
        await this.pollInbox();
      } while (this.pollQueued);
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.pollLock = false;
    }
  }

  private getUidStatePath(): string {
    const custom = this.config.get<string>('IMAP_UID_STATE_FILE');
    if (custom?.trim()) return path.resolve(process.cwd(), custom.trim());
    // Use apps/api directory directly (relative to compiled output)
    return path.resolve(__dirname, '..', '..', '..', '.mail-ingest-uid.state.json');
  }

  private async readUidStateFromDisk(): Promise<number | null> {
    // Try the primary path and a few fallback locations
    const candidates = [
      this.getUidStatePath(),
      path.join(process.cwd(), '.mail-ingest-uid.state.json'),
      path.join(process.cwd(), 'mail-ingest-uid.state.json'),
    ];
    // Deduplicate
    const unique = [...new Set(candidates)];
    for (const p of unique) {
      try {
        const raw = await fs.readFile(p, 'utf8');
        const j = JSON.parse(raw) as MailUidStateFile;
        if (typeof j.lastUid === 'number' && j.lastUid >= 0) {
          this.logger.log(`Mail ingest: restored UID cursor ${j.lastUid} from ${p}`);
          return j.lastUid;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private async writeUidStateToDisk(lastUid: number): Promise<void> {
    const filePath = this.getUidStatePath();
    try {
      const payload: MailUidStateFile = { lastUid };
      await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
      this.logger.debug(`Mail ingest: persisted UID cursor ${lastUid} → ${filePath}`);
    } catch (err) {
      this.logger.warn(
        `Could not persist IMAP UID state to ${filePath}: ${err instanceof Error ? err.message : err}`,
      );
      // Fallback: try writing to cwd as well
      try {
        const fallbackPath = path.join(process.cwd(), '.mail-ingest-uid.state.json');
        if (fallbackPath !== filePath) {
          await fs.writeFile(fallbackPath, JSON.stringify({ lastUid }), 'utf8');
          this.logger.log(`Mail ingest: persisted UID cursor ${lastUid} → fallback ${fallbackPath}`);
        }
      } catch {
        this.logger.error(`Mail ingest: FAILED to persist UID cursor anywhere! In-memory cursor is ${lastUid}, will survive until process restarts.`);
      }
    }
  }

  private async pollInbox() {
    const host =
      this.config.get<string>('IMAP_HOST') || this.config.get<string>('SMTP_HOST') || 'imap.gmail.com';
    const port = parseInt(
      this.config.get<string>('IMAP_PORT') || this.config.get<string>('SMTP_PORT') || '993',
      10,
    );
    const user =
      this.config.get<string>('IMAP_USER') || this.config.get<string>('SMTP_USER') || '';
    const pass =
      this.config.get<string>('IMAP_PASSWORD') || this.config.get<string>('SMTP_PASSWORD') || '';
    const mailbox = this.config.get<string>('IMAP_MAILBOX') || this.config.get<string>('SMTP_MAILBOX') || 'INBOX';

    const socketTimeoutRaw = this.config.get<string>('IMAP_SOCKET_TIMEOUT_MS');
    const socketTimeoutMs =
      socketTimeoutRaw !== undefined && socketTimeoutRaw !== ''
        ? parseInt(socketTimeoutRaw, 10)
        : 30000;

    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false,
      socketTimeout: Number.isFinite(socketTimeoutMs) && socketTimeoutMs > 0 ? socketTimeoutMs : 30000,
    });

    client.on('error', (err: Error & { code?: string }) => {
      this.logger.warn(
        `IMAP connection error (will reconnect on next poll): ${err.message}${err.code ? ` [${err.code}]` : ''}`,
      );
    });

    await client.connect();

    try {
      const lock = await client.getMailboxLock(mailbox);
      try {
        const status = await client.status(mailbox, { uidNext: true });
        const uidNext = status.uidNext ?? 1;

        // ── Resolve baseline: memory → disk → uidNext - 1 ──
        let baseline: number;
        let isFirstBoot = false;

        if (this.memoryBaseline !== null) {
          // Best case: we already know where we left off from the previous poll
          baseline = this.memoryBaseline;
        } else {
          // Process just started — try to recover from disk
          const fromDisk = await this.readUidStateFromDisk();
          if (fromDisk !== null) {
            baseline = fromDisk;
            this.memoryBaseline = fromDisk;
          } else {
            // True first boot — anchor at current uidNext so we ONLY get future emails
            baseline = Math.max(0, uidNext - 1);
            isFirstBoot = true;
            this.memoryBaseline = baseline;
            // Persist immediately so even if we crash before finding any email, we don't re-anchor
            await this.writeUidStateToDisk(baseline);
            this.logger.log(
              `Mail ingest: FIRST BOOT — anchored at UID ${baseline} (uidNext=${uidNext}). ` +
                `Only emails arriving from NOW will be ingested. Old unread mail is ignored.`,
            );
          }
        }

        // ── Search for new emails ──
        const searchFrom = baseline + 1;
        // MUST pass { uid: true } so it returns actual UIDs, not sequence numbers.
        const newUids = normSearch(await client.search({ uid: `${searchFrom}:*` }, { uid: true }))
          // Filter out UIDs <= baseline (IMAP `UID x:*` can return x-1 in edge cases)
          .filter(uid => uid > baseline);

        // Sort ascending — process oldest first so cursor advances linearly with no gaps
        newUids.sort((a, b) => a - b);

        if (newUids.length === 0) {
          if (!isFirstBoot) {
            this.logger.debug(
              `Mail ingest poll: no new mail (baseline=${baseline}, uidNext=${uidNext})`,
            );
          }
          return;
        }

        this.logger.log(
          `Mail ingest poll: found ${newUids.length} new email(s) — ` +
            `UIDs [${newUids.join(',')}] (baseline=${baseline}, uidNext=${uidNext})`,
        );

        // ── Process each email ──
        const departments = await this.departmentsService.findAll();

        // MUST pass { uid: true } to fetch so it treats newUids as UIDs!
        for await (const msg of client.fetch(newUids, { source: true, envelope: true }, { uid: true })) {
          const source = msg.source;
          if (!source) continue;

          const parsed = await simpleParser(source);
          const messageId =
            normalizeMessageId(parsed.messageId) ||
            normalizeMessageId(msg.envelope?.messageId as string | undefined) ||
            `imap-${msg.uid}-${Date.now()}`;

          // Deduplicate — skip if we already created a ticket for this message
          const existing = await this.ticketsService.findBySourceExternalId(messageId);
          if (existing) {
            this.logger.debug(`Mail ingest: uid=${msg.uid} already ticketed (${messageId}) — skipping`);
            await client.messageFlagsAdd(msg.uid, ['\\Seen']);
            // Still advance cursor past this UID
            this.memoryBaseline = Math.max(this.memoryBaseline!, msg.uid);
            await this.writeUidStateToDisk(this.memoryBaseline);
            continue;
          }

          // Skip newsletters / bounces
          const skipBulk =
            this.config.get<string>('IMAP_INGEST_SKIP_BULK')?.toLowerCase() !== 'false';
          if (skipBulk && shouldSkipIngest(parsed)) {
            await client.messageFlagsAdd(msg.uid, ['\\Seen']);
            this.logger.log(
              `Mail ingest: skipped bulk/automated uid=${msg.uid} from=${parsed.from?.value?.[0]?.address || '?'}`,
            );
            this.memoryBaseline = Math.max(this.memoryBaseline!, msg.uid);
            await this.writeUidStateToDisk(this.memoryBaseline);
            continue;
          }

          const recipients = collectRecipientAddresses(parsed);
          const subject = (parsed.subject || '(No subject)').trim();
          const departmentId = resolveDepartmentIdFromMail(departments, recipients, subject);

          const textBody =
            (parsed.text && parsed.text.trim()) ||
            (parsed.html ? stripHtml(parsed.html) : '') ||
            '(No body)';

          const replyToAddr = resolveRequesterAddress(parsed);
          const envelopeFrom = parsed.from?.value?.[0]?.address?.trim() || '';
          const autoAckTo =
            replyToAddr || (EMAIL_ADDR_RE.test(envelopeFrom) ? envelopeFrom : '');
          const requesterLabel = autoAckTo || envelopeFrom || parsed.from?.value?.[0]?.name || 'unknown';

          const priority = inferInboundPriority(subject, textBody);

          const ticket = await this.ticketsService.createFromChannel({
            subject: subject.substring(0, 255),
            description: textBody,
            channel: TicketChannel.EMAIL,
            priority,
            departmentId: departmentId || undefined,
            sourceExternalId: messageId,
            metadata: {
              fromEmail: requesterLabel,
              replyToEmail: replyToAddr || undefined,
              envelopeFrom: envelopeFrom || undefined,
              messageId,
              recipients,
              routedDepartmentId: departmentId || null,
            },
          });

          this.aiService.classifyTicket(ticket.id).catch(() => undefined);

          try {
            const full = await this.ticketsService.findById(ticket.id);
            this.ticketsGateway.emitTicketCreated(full, ticket.departmentId || undefined);
          } catch (e) {
            this.logger.warn(`Could not emit ticket:created for ${ticket.id}: ${e instanceof Error ? e.message : e}`);
          }

          if (autoAckTo) {
            void this.notificationsService.sendInboundAutoAck({
              to: autoAckTo,
              ticketId: ticket.id,
              originalSubject: subject,
            });
          }

          await client.messageFlagsAdd(msg.uid, ['\\Seen']);

          // ── Advance cursor IMMEDIATELY after each email ──
          this.memoryBaseline = Math.max(this.memoryBaseline!, msg.uid);
          await this.writeUidStateToDisk(this.memoryBaseline);

          this.logger.log(
            `✅ Ingested uid=${msg.uid} → ticket ${ticket.id} | from=${requesterLabel} | subject="${subject.substring(0, 60)}" | cursor now=${this.memoryBaseline}`,
          );
        }
      } finally {
        lock.release();
      }
    } finally {
      // Aggressively destroy the connection to prevent random socket hangs
      // that could deadlock `pollLock` and permanently freeze the cron job.
      try {
        client.close();
      } catch (err) {
        this.logger.debug(`Mail ingest: error closing client - ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
