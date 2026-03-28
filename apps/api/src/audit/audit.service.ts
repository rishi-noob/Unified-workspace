import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

interface AuditLogEntry {
  entityType: string;
  entityId: string;
  action: string;
  changedById?: string;
  beforeState?: string;
  afterState?: string;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<AuditLog> {
    const log = this.auditRepo.create(entry);
    return this.auditRepo.save(log);
  }

  async findAll(filter: {
    entityType?: string;
    entityId?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, filter.limit || 20);
    const skip = (page - 1) * limit;

    const qb = this.auditRepo.createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (filter.entityType) qb.andWhere('log.entityType = :et', { et: filter.entityType });
    if (filter.entityId) qb.andWhere('log.entityId = :eid', { eid: filter.entityId });
    if (filter.action) qb.andWhere('log.action = :action', { action: filter.action });
    if (filter.from) qb.andWhere('log.createdAt >= :from', { from: new Date(filter.from) });
    if (filter.to) qb.andWhere('log.createdAt <= :to', { to: new Date(filter.to) });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
