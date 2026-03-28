import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, Not, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { SlaPolicy } from './entities/sla-policy.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus, TicketPriority } from '../common/types/ticket-status.enum';
import { AuditService } from '../audit/audit.service';

const PRIORITY_ORDER = [TicketPriority.LOW, TicketPriority.NORMAL, TicketPriority.HIGH, TicketPriority.CRITICAL];

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    @InjectRepository(SlaPolicy) private slaPolicyRepo: Repository<SlaPolicy>,
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    private auditService: AuditService,
  ) {}

  async findPolicy(departmentId: string, priority: TicketPriority): Promise<SlaPolicy | null> {
    return this.slaPolicyRepo.findOne({ where: { departmentId, priority } }) || null;
  }

  async findAll(deptId?: string): Promise<SlaPolicy[]> {
    const where = deptId ? { departmentId: deptId } : {};
    return this.slaPolicyRepo.find({ where, relations: ['department'] });
  }

  async create(data: Partial<SlaPolicy>): Promise<SlaPolicy> {
    const policy = this.slaPolicyRepo.create(data);
    return this.slaPolicyRepo.save(policy);
  }

  async update(id: string, data: Partial<SlaPolicy>): Promise<SlaPolicy> {
    await this.slaPolicyRepo.update(id, data);
    return this.slaPolicyRepo.findOne({ where: { id }, relations: ['department'] });
  }

  @Cron('*/5 * * * *')
  async checkSlaBreaches() {
    this.logger.debug('Running SLA breach check...');

    const activeStatuses = [TicketStatus.NEW, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, TicketStatus.PENDING];

    // Find breached but not yet marked
    const breached = await this.ticketsRepo.find({
      where: {
        status: In(activeStatuses),
        slaBreached: false,
      },
    });

    const now = new Date();
    for (const ticket of breached) {
      if (ticket.slaResolutionAt && ticket.slaResolutionAt < now) {
        ticket.slaBreached = true;
        await this.ticketsRepo.save(ticket);
        await this.auditService.log({
          entityType: 'ticket',
          entityId: ticket.id,
          action: 'sla_breached',
          afterState: JSON.stringify({ slaBreached: true, breachedAt: now }),
        });
        this.logger.warn(`SLA breached for ticket ${ticket.id}`);
      }
    }

    // Auto-bump priority for stale tickets (>24h no update)
    const staleThreshold = new Date(now.getTime() - 24 * 3600 * 1000);
    const stale = await this.ticketsRepo.find({
      where: { status: In([TicketStatus.NEW, TicketStatus.ASSIGNED]) },
    });
    for (const ticket of stale) {
      if (ticket.updatedAt < staleThreshold) {
        const currentIdx = PRIORITY_ORDER.indexOf(ticket.priority);
        if (currentIdx < PRIORITY_ORDER.length - 1) {
          const oldPriority = ticket.priority;
          ticket.priority = PRIORITY_ORDER[currentIdx + 1];
          await this.ticketsRepo.save(ticket);
          await this.auditService.log({
            entityType: 'ticket',
            entityId: ticket.id,
            action: 'priority_auto_escalated',
            beforeState: JSON.stringify({ priority: oldPriority }),
            afterState: JSON.stringify({ priority: ticket.priority }),
          });
          this.logger.log(`Auto-escalated ticket ${ticket.id}: ${oldPriority} → ${ticket.priority}`);
        }
      }
    }
  }
}
