import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private deptRepo: Repository<DepartmentEntity>,
  ) {}

  async findAll(): Promise<DepartmentEntity[]> {
    return this.deptRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<DepartmentEntity | null> {
    return this.deptRepo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<DepartmentEntity | null> {
    return this.deptRepo.findOne({ where: { slug } });
  }

  async findByName(name: string): Promise<DepartmentEntity | null> {
    return this.deptRepo.findOne({ where: { name } });
  }

  async create(data: Partial<DepartmentEntity>): Promise<DepartmentEntity> {
    const existing = await this.deptRepo.findOne({ where: { slug: data.slug } });
    if (existing) throw new ConflictException(`Department '${data.slug}' already exists`);
    const dept = this.deptRepo.create(data);
    return this.deptRepo.save(dept);
  }

  async update(id: string, data: Partial<DepartmentEntity>): Promise<DepartmentEntity> {
    const dept = await this.findById(id);
    if (!dept) throw new NotFoundException('Department not found');
    Object.assign(dept, data);
    return this.deptRepo.save(dept);
  }
}
