import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notifyAssignment(ticketId: string, agentEmail: string, subject: string) {
    this.logger.log(`[Notification] Ticket ${ticketId} assigned to ${agentEmail}: ${subject}`);
    // Email sending via nodemailer can be wired when SMTP is configured
  }

  async notifySlaBreach(ticketId: string, agentEmail: string, subject: string) {
    this.logger.warn(`[SLA BREACH] Ticket ${ticketId} (${subject}) — notifying ${agentEmail}`);
  }

  async notifyNewTicket(departmentName: string, ticketId: string, subject: string) {
    this.logger.log(`[New Ticket] ${departmentName} queue: ${ticketId} — ${subject}`);
  }
}
