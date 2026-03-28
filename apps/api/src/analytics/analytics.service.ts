import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus, TicketChannel } from '../common/types/ticket-status.enum';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
  ) {}

  async getOverview(departmentId?: string) {
    const where: any = {};
    if (departmentId) where.departmentId = departmentId;

    const all = await this.ticketsRepo.find({ where });
    const open = all.filter(t => ![TicketStatus.RESOLVED, TicketStatus.CLOSED].includes(t.status));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resolvedToday = all.filter(t => t.resolvedAt && new Date(t.resolvedAt) >= today);
    const breached = all.filter(t => t.slaBreached);
    const resolved = all.filter(t => t.resolvedAt);
    const avgResolution = resolved.length > 0
      ? resolved.reduce((sum, t) => {
          const hrs = (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
          return sum + hrs;
        }, 0) / resolved.length
      : 0;

    return {
      openCount: open.length,
      resolvedToday: resolvedToday.length,
      breachRate: all.length > 0 ? Math.round((breached.length / all.length) * 100) : 0,
      avgResolutionHours: Math.round(avgResolution * 10) / 10,
      totalTickets: all.length,
    };
  }

  async getVolume(filter: { from?: string; to?: string; dept?: string; groupBy?: string }) {
    const qb = this.ticketsRepo.createQueryBuilder('ticket');
    if (filter.dept) qb.where('ticket.departmentId = :dept', { dept: filter.dept });
    if (filter.from) qb.andWhere('ticket.createdAt >= :from', { from: new Date(filter.from) });
    if (filter.to) qb.andWhere('ticket.createdAt <= :to', { to: new Date(filter.to) });
    const tickets = await qb.getMany();

    // Group by day
    const groups: Record<string, number> = {};
    for (const t of tickets) {
      const date = new Date(t.createdAt).toISOString().substring(0, 10);
      groups[date] = (groups[date] || 0) + 1;
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }

  async getSla(filter: { from?: string; to?: string; dept?: string }) {
    const qb = this.ticketsRepo.createQueryBuilder('ticket');
    if (filter.dept) qb.where('ticket.departmentId = :dept', { dept: filter.dept });
    if (filter.from) qb.andWhere('ticket.createdAt >= :from', { from: new Date(filter.from) });
    if (filter.to) qb.andWhere('ticket.createdAt <= :to', { to: new Date(filter.to) });
    const tickets = await qb.getMany();

    const breached = tickets.filter(t => t.slaBreached).length;
    const onTime = tickets.length - breached;

    return {
      total: tickets.length,
      breached,
      onTime,
      breachRate: tickets.length > 0 ? Math.round((breached / tickets.length) * 100) : 0,
      data: [
        { name: 'On Time', value: onTime },
        { name: 'Breached', value: breached },
      ],
    };
  }

  async getChannelBreakdown(filter: { from?: string; to?: string }) {
    const qb = this.ticketsRepo.createQueryBuilder('ticket');
    if (filter.from) qb.where('ticket.createdAt >= :from', { from: new Date(filter.from) });
    if (filter.to) qb.andWhere('ticket.createdAt <= :to', { to: new Date(filter.to) });
    const tickets = await qb.getMany();

    const channels = [TicketChannel.EMAIL, TicketChannel.EXCEL, TicketChannel.FRESHDESK, TicketChannel.MANUAL];
    return channels.map(ch => ({
      channel: ch,
      count: tickets.filter(t => t.channel === ch).length,
    }));
  }

  async getAgentStats(filter: { dept?: string; from?: string; to?: string }) {
    const qb = this.ticketsRepo.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.assignedTo', 'assignedTo')
      .where('ticket.assignedToId IS NOT NULL');
    if (filter.dept) qb.andWhere('ticket.departmentId = :dept', { dept: filter.dept });
    if (filter.from) qb.andWhere('ticket.createdAt >= :from', { from: new Date(filter.from) });
    if (filter.to) qb.andWhere('ticket.createdAt <= :to', { to: new Date(filter.to) });
    const tickets = await qb.getMany();

    const agentMap: Record<string, { name: string; total: number; resolved: number; breached: number }> = {};
    for (const t of tickets) {
      const agentId = t.assignedToId;
      if (!agentId) continue;
      if (!agentMap[agentId]) {
        agentMap[agentId] = { name: t.assignedTo?.name || agentId, total: 0, resolved: 0, breached: 0 };
      }
      agentMap[agentId].total++;
      if (t.status === TicketStatus.RESOLVED || t.status === TicketStatus.CLOSED) agentMap[agentId].resolved++;
      if (t.slaBreached) agentMap[agentId].breached++;
    }

    return Object.entries(agentMap).map(([id, stats]) => ({ agentId: id, ...stats }));
  }
}
