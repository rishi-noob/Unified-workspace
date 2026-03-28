import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: Transporter | null | undefined;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter | null {
    if (this.transporter === null) return null;
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('MAIL_HOST');
    const port = parseInt(this.config.get<string>('MAIL_PORT') || '587', 10);
    const user = this.config.get<string>('MAIL_USER');
    const pass = this.config.get<string>('MAIL_PASSWORD');
    if (!host || !user || !pass || pass === 'app_specific_password') {
      this.transporter = null;
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  /**
   * Reply to an external requester confirming we received their email (mail-ingest only).
   */
  async sendInboundAutoAck(params: {
    to: string;
    ticketId: string;
    originalSubject: string;
  }): Promise<void> {
    const disabled = this.config.get<string>('MAIL_AUTO_ACK')?.toLowerCase() === 'false';
    if (disabled) return;

    if (!EMAIL_RE.test(params.to)) return;

    const mailbox = (
      this.config.get<string>('IMAP_USER') ||
      this.config.get<string>('SMTP_USER') ||
      this.config.get<string>('MAIL_USER') ||
      ''
    ).toLowerCase();

    if (mailbox && params.to.toLowerCase() === mailbox) {
      this.logger.debug('Skipping auto-ack: requester is the helpdesk mailbox');
      return;
    }

    const transport = this.getTransporter();
    if (!transport) {
      this.logger.warn('Auto-ack skipped: set MAIL_HOST, MAIL_USER, MAIL_PASSWORD (Gmail app password)');
      return;
    }

    const mailUser = this.config.get<string>('MAIL_USER') || '';
    const fromRaw =
      this.config.get<string>('MAIL_FROM')?.trim() || `Helpdesk <${mailUser}>`;

    const baseSubj = params.originalSubject.replace(/^\s*Re:\s*/i, '').trim() || 'Your request';
    const replySubject = `Re: ${baseSubj}`;

    const body =
      'Thank you for contacting us.\n\n' +
      'We have received your request and our team will be in touch with you shortly.\n\n' +
      `Reference: ${params.ticketId}\n\n` +
      'Please keep this email for your records.';

    try {
      await transport.sendMail({
        from: fromRaw,
        to: params.to,
        replyTo: mailUser || undefined,
        subject: replySubject,
        text: body,
      });
      this.logger.log(`Auto-ack sent to ${params.to} (ticket ${params.ticketId})`);
    } catch (err) {
      this.logger.warn(
        `Auto-ack failed for ${params.to}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async notifyAssignment(ticketId: string, agentEmail: string, subject: string) {
    this.logger.log(`[Notification] Ticket ${ticketId} assigned to ${agentEmail}: ${subject}`);
  }

  async notifySlaBreach(ticketId: string, agentEmail: string, subject: string) {
    this.logger.warn(`[SLA BREACH] Ticket ${ticketId} (${subject}) — notifying ${agentEmail}`);
  }

  async notifyNewTicket(departmentName: string, ticketId: string, subject: string) {
    this.logger.log(`[New Ticket] ${departmentName} queue: ${ticketId} — ${subject}`);
  }
}
