import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketNote } from './entities/ticket-note.entity';
import { TicketReply } from './entities/ticket-reply.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../common/types/role.enum';
import {
  TicketStatus,
  TicketPriority,
  TicketChannel,
} from '../common/types/ticket-status.enum';
import { DepartmentsService } from '../departments/departments.service';
import { SlaService } from '../sla/sla.service';
import { AuditService } from '../audit/audit.service';

export interface TicketQueryFilter {
  status?: string;
  dept?: string;
  priority?: string;
  assignee?: string;
  channel?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    @InjectRepository(TicketNote) private notesRepo: Repository<TicketNote>,
    @InjectRepository(TicketReply) private repliesRepo: Repository<TicketReply>,
    private deptService: DepartmentsService,
    private slaService: SlaService,
    private auditService: AuditService,
  ) {}

  /** Same visibility rules as list queries — used for single-ticket access */
  canAccessTicket(user: User, ticket: Ticket): boolean {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
      return true;
    }
    if (ticket.createdById === user.id) return true;
    const deptIds = user.getDepartmentIdArray();
    if (user.role === UserRole.TEAM_LEAD) {
      return !!(ticket.departmentId && deptIds.includes(ticket.departmentId));
    }
    // Agent: assigned to them OR ticket belongs to one of their departments (dept queue)
    if (ticket.assignedToId === user.id) return true;
    return !!(ticket.departmentId && deptIds.includes(ticket.departmentId));
  }

  async findAll(user: User, filter: TicketQueryFilter) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, filter.limit || 20);
    const skip = (page - 1) * limit;

    const qb = this.ticketsRepo.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.department', 'department')
      .leftJoinAndSelect('ticket.assignedTo', 'assignedTo')
      .leftJoinAndSelect('ticket.createdBy', 'createdBy')
      .orderBy('ticket.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const deptIds = user.getDepartmentIdArray();

    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
      // no RBAC filter
    } else if (user.role === UserRole.TEAM_LEAD) {
      if (deptIds.length > 0) {
        qb.where('ticket.departmentId IN (:...deptIds)', { deptIds });
      }
    } else {
      // Agent: own assignments, dept queue, or tickets they created
      const d = deptIds.length > 0 ? deptIds : ['__none__'];
      qb.where(
        '(ticket.assignedToId = :userId OR ticket.createdById = :userId OR ticket.departmentId IN (:...deptIds))',
        { userId: user.id, deptIds: d },
      );
    }

    // Filters
    if (filter.status) qb.andWhere('ticket.status = :status', { status: filter.status });
    if (filter.priority) qb.andWhere('ticket.priority = :priority', { priority: filter.priority });
    if (filter.channel) qb.andWhere('ticket.channel = :channel', { channel: filter.channel });
    if (filter.assignee) qb.andWhere('ticket.assignedToId = :assignee', { assignee: filter.assignee });
    if (filter.dept) qb.andWhere('ticket.departmentId = :dept', { dept: filter.dept });
    if (filter.q) {
      qb.andWhere('(ticket.subject LIKE :q OR ticket.description LIKE :q)', { q: `%${filter.q}%` });
    }
    if (filter.from) qb.andWhere('ticket.createdAt >= :from', { from: new Date(filter.from) });
    if (filter.to) qb.andWhere('ticket.createdAt <= :to', { to: new Date(filter.to) });

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, user?: User): Promise<Ticket> {
    const ticket = await this.ticketsRepo.findOne({
      where: { id },
      relations: ['department', 'assignedTo', 'createdBy', 'notes', 'notes.author', 'replies', 'replies.author'],
    });
    if (!ticket) throw new NotFoundException(`Ticket #${id} not found`);
    if (user && !this.canAccessTicket(user, ticket)) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    return ticket;
  }

  async findBySourceExternalId(sourceExternalId: string): Promise<Ticket | null> {
    return this.ticketsRepo.findOne({ where: { sourceExternalId } });
  }

  async create(dto: CreateTicketDto, user: User, aiService?: any): Promise<Ticket> {
    let dept = null;
    if (dto.departmentId) {
      dept = await this.deptService.findById(dto.departmentId);
    }

    const ticket = this.ticketsRepo.create({
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority || TicketPriority.NORMAL,
      channel: dto.channel || TicketChannel.MANUAL,
      departmentId: dto.departmentId || null,
      assignedToId: dto.assignedToId || null,
      createdById: user.id,
      status: TicketStatus.NEW,
    });

    // Compute SLA deadlines if dept exists
    if (dept) {
      const sla = await this.slaService.findPolicy(dept.id, ticket.priority);
      if (sla) {
        const now = new Date();
        ticket.slaFirstResponseAt = new Date(now.getTime() + sla.firstResponseHours * 3600000);
        ticket.slaResolutionAt = new Date(now.getTime() + sla.resolutionHours * 3600000);
      }
    }

    const saved = await this.ticketsRepo.save(ticket);

    await this.auditService.log({
      entityType: 'ticket',
      entityId: saved.id,
      action: 'created',
      changedById: user.id,
      afterState: JSON.stringify({ subject: saved.subject, status: saved.status, channel: saved.channel }),
    });

    // Trigger AI classification async (fire and forget)
    if (aiService) {
      aiService.classifyTicket(saved.id).catch((err) =>
        this.logger.error(`AI classification failed for ticket ${saved.id}: ${err.message}`),
      );
    }

    return this.findById(saved.id, user);
  }

  async update(id: string, dto: UpdateTicketDto, user: User): Promise<Ticket> {
    const ticket = await this.findById(id, user);
    const before = { status: ticket.status, priority: ticket.priority, assignedToId: ticket.assignedToId };

    if (dto.status) {
      ticket.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED && !ticket.resolvedAt) {
        ticket.resolvedAt = new Date();
      }
    }
    if (dto.priority) ticket.priority = dto.priority;
    if (dto.assignedToId !== undefined) ticket.assignedToId = dto.assignedToId;
    if (dto.departmentId !== undefined) ticket.departmentId = dto.departmentId;

    const saved = await this.ticketsRepo.save(ticket);

    await this.auditService.log({
      entityType: 'ticket',
      entityId: id,
      action: 'updated',
      changedById: user.id,
      beforeState: JSON.stringify(before),
      afterState: JSON.stringify({ status: saved.status, priority: saved.priority, assignedToId: saved.assignedToId }),
    });

    return this.findById(saved.id, user);
  }

  async softDelete(id: string, user: User): Promise<void> {
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException('Only super admins can delete tickets');
    const ticket = await this.findById(id, user);
    ticket.status = TicketStatus.CLOSED;
    ticket.metadata = JSON.stringify({ ...JSON.parse(ticket.metadata || '{}'), deletedAt: new Date(), deletedBy: user.id });
    await this.ticketsRepo.save(ticket);
    await this.auditService.log({ entityType: 'ticket', entityId: id, action: 'soft_deleted', changedById: user.id });
  }

  async addNote(ticketId: string, content: string, user: User): Promise<TicketNote> {
    await this.findById(ticketId, user);
    const note = this.notesRepo.create({ ticketId, content, authorId: user.id });
    return this.notesRepo.save(note);
  }

  async addReply(ticketId: string, dto: ReplyTicketDto, user: User): Promise<TicketReply> {
    const ticket = await this.findById(ticketId, user);

    const reply = this.repliesRepo.create({
      ticketId,
      content: dto.content,
      authorId: user.id,
      direction: 'outbound',
      channel: ticket.channel,
    });
    const saved = await this.repliesRepo.save(reply);

    // Update first responded if not set
    if (!ticket.firstRespondedAt) {
      ticket.firstRespondedAt = new Date();
      if (ticket.status === TicketStatus.NEW || ticket.status === TicketStatus.ASSIGNED) {
        ticket.status = TicketStatus.IN_PROGRESS;
      }
      await this.ticketsRepo.save(ticket);
    }

    await this.auditService.log({ entityType: 'ticket', entityId: ticketId, action: 'reply_sent', changedById: user.id });
    return saved;
  }

  async assign(ticketId: string, dto: AssignTicketDto, user: User): Promise<Ticket> {
    const ticket = await this.findById(ticketId, user);
    ticket.assignedToId = dto.assigneeId;
    if (dto.teamId) ticket.teamId = dto.teamId;
    if (ticket.status === TicketStatus.NEW) ticket.status = TicketStatus.ASSIGNED;
    const saved = await this.ticketsRepo.save(ticket);
    await this.auditService.log({
      entityType: 'ticket',
      entityId: ticketId,
      action: 'assigned',
      changedById: user.id,
      afterState: JSON.stringify({ assignedToId: dto.assigneeId }),
    });
    return this.findById(saved.id, user);
  }

  async getNotes(ticketId: string, user: User): Promise<TicketNote[]> {
    await this.findById(ticketId, user);
    return this.notesRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
      relations: ['author'],
    });
  }

  /** Used by channels to create tickets programmatically */
  async createFromChannel(data: {
    subject: string;
    description: string;
    channel: TicketChannel;
    priority?: TicketPriority;
    departmentId?: string;
    sourceExternalId?: string;
    metadata?: object;
    requesterEmail?: string;
  }): Promise<Ticket> {
    const ticket = this.ticketsRepo.create({
      subject: data.subject.substring(0, 255),
      description: data.description,
      channel: data.channel,
      priority: data.priority || TicketPriority.NORMAL,
      departmentId: data.departmentId || null,
      status: TicketStatus.NEW,
      sourceExternalId: data.sourceExternalId || null,
      metadata: JSON.stringify(data.metadata || {}),
    });

    if (data.departmentId) {
      const sla = await this.slaService.findPolicy(data.departmentId, ticket.priority);
      if (sla) {
        const now = new Date();
        ticket.slaFirstResponseAt = new Date(now.getTime() + sla.firstResponseHours * 3600000);
        ticket.slaResolutionAt = new Date(now.getTime() + sla.resolutionHours * 3600000);
      }
    }

    return this.ticketsRepo.save(ticket);
  }
}
