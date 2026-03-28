import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { AddressObject, ParsedMail } from 'mailparser';
import { TicketsService } from '../../tickets/tickets.service';
import { AiService } from '../../ai/ai.service';
import { DepartmentsService } from '../../departments/departments.service';
import { TicketChannel, TicketPriority } from '../../common/types/ticket-status.enum';
import { resolveDepartmentIdFromMail } from './mail-department.router';

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

@Injectable()
export class MailIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailIngestService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollLock = false;

  constructor(
    private readonly config: ConfigService,
    private readonly ticketsService: TicketsService,
    private readonly aiService: AiService,
    private readonly departmentsService: DepartmentsService,
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
        '60000',
      10,
    );

    this.logger.log(`Mail ingest: polling every ${ms}ms for ${user}`);
    this.timer = setInterval(() => void this.pollOnce(), ms);
    setTimeout(() => void this.pollOnce(), 8000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async pollOnce() {
    if (this.pollLock) return;
    this.pollLock = true;
    try {
      await this.pollInbox();
    } catch (err) {
      this.logger.error(`IMAP poll failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.pollLock = false;
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

    const client = new ImapFlow({
      host,
      port,
      secure: port === 993,
      auth: { user, pass },
      logger: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock(mailbox);
    try {
      const search = await client.search({ seen: false });
      const uids = search === false ? [] : search;
      if (!uids.length) {
        return;
      }

      const departments = await this.departmentsService.findAll();

      for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
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

        const recipients = collectRecipientAddresses(parsed);
        const subject = (parsed.subject || '(No subject)').trim();
        const departmentId = resolveDepartmentIdFromMail(departments, recipients, subject);

        const textBody =
          (parsed.text && parsed.text.trim()) ||
          (parsed.html ? stripHtml(parsed.html) : '') ||
          '(No body)';

        const fromAddr =
          parsed.from?.value?.[0]?.address ||
          parsed.from?.value?.[0]?.name ||
          'unknown';

        const ticket = await this.ticketsService.createFromChannel({
          subject: subject.substring(0, 255),
          description: textBody,
          channel: TicketChannel.EMAIL,
          priority: TicketPriority.NORMAL,
          departmentId: departmentId || undefined,
          sourceExternalId: messageId,
          metadata: {
            fromEmail: fromAddr,
            messageId,
            recipients,
            routedDepartmentId: departmentId || null,
          },
        });

        this.aiService.classifyTicket(ticket.id).catch(() => undefined);

        await client.messageFlagsAdd(msg.uid, ['\\Seen']);
        this.logger.log(
          `Ingested mail → ticket ${ticket.id} (dept: ${departmentId ? 'routed' : 'unassigned → AI'})`,
        );
      }
    } finally {
      lock.release();
    }

    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}
