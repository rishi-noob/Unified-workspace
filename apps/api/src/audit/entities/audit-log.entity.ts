import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  entityType: string;

  @Column()
  entityId: string;

  @Column({ length: 50 })
  action: string;

  @Column({ nullable: true })
  changedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'changedById' })
  changedBy: User;

  @Column({ type: 'text', nullable: true })
  beforeState: string; // JSON string

  @Column({ type: 'text', nullable: true })
  afterState: string; // JSON string

  @Column({ nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}
