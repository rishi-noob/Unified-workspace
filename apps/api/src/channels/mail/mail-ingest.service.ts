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

  /**
   * Tracks last processed IMAP UID so new mail is ingested even if already marked read in Gmail.
   * Default path is next to the API package (3 levels up from this file: src/channels/mail → apps/api),
   * not process.cwd(), so the cursor is stable when pnpm/nest change the working directory.
   */
  private getUidStatePath(): string {
    const custom = this.config.get<string>('IMAP_UID_STATE_FILE');
    if (custom?.trim()) return path.resolve(custom.trim());
    return path.resolve(__dirname, '..', '..', '..', 'mail-ingest-uid.state.json');
  }

  /** @deprecated cwd-based path; read once for migration */
  private getLegacyUidStatePathCwd(): string {
    return path.join(process.cwd(), 'mail-ingest-uid.state.json');
  }

  private async readUidState(): Promise<number | null> {
    const primary = this.getUidStatePath();
    const legacy = this.getLegacyUidStatePathCwd();
    for (const p of [primary, legacy]) {
      try {
        const raw = await fs.readFile(p, 'utf8');
        const j = JSON.parse(raw) as MailUidStateFile;
        const last =
          typeof j.lastUid === 'number' && j.lastUid >= 0 ? j.lastUid : null;
        if (last !== null && p === legacy && legacy !== primary) {
          this.logger.warn(
            `Mail ingest: loaded UID state from legacy cwd path ${p}. Future updates → ${primary}.`,
          );
        }
        return last;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async writeUidState(lastUid: number): Promise<void> {
    try {
      const payload: MailUidStateFile = { lastUid };
      await fs.writeFile(this.getUidStatePath(), JSON.stringify(payload), 'utf8');
    } catch (err) {
      this.logger.warn(
        `Could not persist IMAP UID state: ${err instanceof Error ? err.message : err}`,
      );
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
        : 900000;
    // Node: setTimeout(0) disables idle timeout. ImapFlow default is 5m which is tight for big fetches.

    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false,
      socketTimeout: Number.isFinite(socketTimeoutMs) ? socketTimeoutMs : 900000,
    });

    // Without a listener, ImapFlow emits 'error' on socket timeout and crashes the process.
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

        const persisted = await this.readUidState();
        const baseline = persisted !== null ? persisted : Math.max(0, uidNext - 1);

        const includeUnseenBacklog =
          this.config.get<string>('IMAP_INCLUDE_UNSEEN_BACKLOG')?.toLowerCase() === 'true';

        if (persisted === null) {
          this.logger.log(
            `Mail ingest: UID baseline ${baseline} (uidNext=${uidNext}). ` +
              (includeUnseenBacklog
                ? 'Including UNSEEN backlog + new UIDs (IMAP_INCLUDE_UNSEEN_BACKLOG=true).'
                : 'Only NEW messages (UID > baseline) — old unread mail is NOT ingested. Set IMAP_INCLUDE_UNSEEN_BACKLOG=true to also ticket legacy unread.'),
          );
        }

        const unseen = includeUnseenBacklog
          ? normSearch(await client.search({ seen: false }))
          : [];
        const sinceBaseline = normSearch(await client.search({ uid: `${baseline + 1}:*` }));
        /** Recent UNSEEN only (last ~300 UIDs) — catches edge cases without ingesting full legacy unread */
        let recentUnseen: number[] = [];
        if (!includeUnseenBacklog && uidNext > 1) {
          const recentUidFloor = Math.max(1, uidNext - 300);
          try {
            recentUnseen = normSearch(
              await client.search({
                uid: `${recentUidFloor}:${uidNext - 1}`,
                seen: false,
              }),
            );
          } catch (e) {
            this.logger.warn(`IMAP recent UNSEEN search skipped: ${e instanceof Error ? e.message : e}`);
          }
        }
        const uidSet = new Set([...unseen, ...sinceBaseline, ...recentUnseen]);
        /** Newest first — large UNSEEN backlogs used to starve new mail when sorted ascending. */
        const allUidsDesc = [...uidSet].sort((a, b) => b - a);

        const maxPerPoll = Math.max(
          1,
          parseInt(
            this.config.get<string>('IMAP_MAX_MESSAGES_PER_POLL') || '50',
            10,
          ) || 50,
        );
        const uids = allUidsDesc.slice(0, maxPerPoll);

        this.logger.log(
          `Mail ingest poll: uidNext=${uidNext} lastSavedUid=${persisted ?? 'none'} baseline=${baseline} ` +
            `unseenBacklog=${includeUnseenBacklog ? unseen.length : 'off'} uidRangeNew=${sinceBaseline.length} ` +
            `recentUnseen=${recentUnseen.length} mergedUids=${uidSet.size} processingThisRound=${uids.length} (newest-first, cap=${maxPerPoll})`,
        );

        if (includeUnseenBacklog && allUidsDesc.length > uids.length) {
          this.logger.warn(
            `Mail ingest: ${allUidsDesc.length - uids.length} messages deferred to later polls — increase IMAP_MAX_MESSAGES_PER_POLL or mark junk as read in Gmail.`,
          );
        }

        if (!uids.length) {
          if (persisted === null) {
            await this.writeUidState(baseline);
          }
          return;
        }

        const departments = await this.departmentsService.findAll();
        let maxProcessed = baseline;

        for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
          maxProcessed = Math.max(maxProcessed, msg.uid);
          const source = msg.source;
          if (!source) continue;

          const parsed = await simpleParser(source);
          const messageId =
            normalizeMessageId(parsed.messageId) ||
            normalizeMessageId(msg.envelope?.messageId as string | undefined) ||
            `imap-${msg.uid}-${Date.now()}`;

          const existing = await this.ticketsService.findBySourceExternalId(messageId);
          if (existing) {
            await client.messageFlagsAdd(msg.uid, ['\\Seen']);
            continue;
          }

          const skipBulk =
            this.config.get<string>('IMAP_INGEST_SKIP_BULK')?.toLowerCase() !== 'false';
          if (skipBulk && shouldSkipIngest(parsed)) {
            await client.messageFlagsAdd(msg.uid, ['\\Seen']);
            this.logger.log(
              `Mail ingest: skipped bulk/automated/list uid=${msg.uid} from=${parsed.from?.value?.[0]?.address || '?'}`,
            );
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
          this.logger.log(
            `Ingested mail → ticket ${ticket.id} (dept: ${departmentId ? 'routed' : 'unassigned → AI'})`,
          );
        }

        await this.writeUidState(Math.max(baseline, maxProcessed));
      } finally {
        lock.release();
      }
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
  }
}
