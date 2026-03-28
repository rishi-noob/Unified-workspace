import {
  Controller, Post, Get, Headers, Body, HttpCode, BadRequestException, Logger, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { TicketsService } from '../../tickets/tickets.service';
import { AiService } from '../../ai/ai.service';
import { TicketChannel, TicketPriority, TicketStatus } from '../../common/types/ticket-status.enum';

const FD_PRIORITY_MAP: Record<number, TicketPriority> = {
  1: TicketPriority.LOW,
  2: TicketPriority.NORMAL,
  3: TicketPriority.HIGH,
  4: TicketPriority.CRITICAL,
};

const FD_STATUS_MAP: Record<number, TicketStatus> = {
  2: TicketStatus.NEW,
  3: TicketStatus.PENDING,
  4: TicketStatus.RESOLVED,
  5: TicketStatus.CLOSED,
};

@ApiTags('Webhooks')
@Controller('webhooks/freshdesk')
export class FreshdeskController {
  private readonly logger = new Logger(FreshdeskController.name);

  constructor(
    private configService: ConfigService,
    private readonly ticketsService: TicketsService,
    private aiService: AiService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Headers('x-freshdesk-signature') signature: string,
    @Body() payload: any,
  ) {
    // HMAC verification
    const secret = this.configService.get<string>('FRESHDESK_WEBHOOK_SECRET');
    if (secret && secret !== 'your_hmac_secret') {
      if (!signature) throw new UnauthorizedException('Missing signature');
      const expected = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('base64');
      if (signature !== expected) {
        this.logger.warn('Invalid Freshdesk webhook signature');
        throw new UnauthorizedException('Invalid signature');
      }
    }

    const eventType = payload.event_type;
    const data = payload.data || payload;

    this.logger.log(`Freshdesk webhook: ${eventType}`);

    if (eventType === 'ticket_created') {
      await this.handleTicketCreated(data);
    } else if (eventType === 'ticket_updated') {
      // Idempotency handled by sourceExternalId check
      this.logger.log(`Ticket updated event for FD#${data.id} — ignored in MVP`);
    }

    return { received: true };
  }

  private async handleTicketCreated(data: any) {
    const fdId = String(data.id);

    // Idempotency: check if already imported
    const existing = await this.ticketsService.findBySourceExternalId(fdId);
    if (existing) {
      this.logger.log(`Freshdesk ticket ${fdId} already imported, skipping`);
      return;
    }

    const priority = FD_PRIORITY_MAP[data.priority] || TicketPriority.NORMAL;
    const ticket = await this.ticketsService.createFromChannel({
      subject: data.subject || 'No subject',
      description: data.description || data.description_text || '',
      channel: TicketChannel.FRESHDESK,
      priority,
      sourceExternalId: fdId,
      metadata: { freshdeskId: fdId, freshdeskStatus: data.status },
    });

    this.aiService.classifyTicket(ticket.id).catch(() => {});
    this.logger.log(`Created ticket ${ticket.id} from Freshdesk #${fdId}`);
  }

  @Get('status')
  getStatus() {
    return { status: 'active', lastEvent: new Date().toISOString() };
  }
}
