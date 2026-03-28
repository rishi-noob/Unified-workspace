import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DepartmentEntity } from '../../departments/entities/department.entity';
import { TicketPriority } from '../../common/types/ticket-status.enum';

@Entity('sla_policies')
export class SlaPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  departmentId: string;

  @ManyToOne(() => DepartmentEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'departmentId' })
  department: DepartmentEntity;

  @Column({ type: 'varchar' })
  priority: TicketPriority;

  @Column()
  firstResponseHours: number;

  @Column()
  resolutionHours: number;

  @CreateDateColumn()
  createdAt: Date;
}
