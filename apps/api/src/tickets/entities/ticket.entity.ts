import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import {
  TicketStatus,
  TicketPriority,
  TicketChannel,
  AiSentiment,
} from '../../common/types/ticket-status.enum';
import { User } from '../../users/entities/user.entity';
import { DepartmentEntity } from '../../departments/entities/department.entity';
import { TicketNote } from './ticket-note.entity';
import { TicketReply } from './ticket-reply.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  subject: string;

  @Column('text')
  description: string;

  @Column({ type: 'varchar', default: TicketStatus.NEW })
  status: TicketStatus;

  @Column({ type: 'varchar', default: TicketPriority.NORMAL })
  priority: TicketPriority;

  @Column({ type: 'varchar' })
  channel: TicketChannel;

  @Column({ nullable: true })
  departmentId: string;

  @ManyToOne(() => DepartmentEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'departmentId' })
  department: DepartmentEntity;

  @Column({ nullable: true })
  createdById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ nullable: true })
  assignedToId: string;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User;

  @Column({ nullable: true })
  teamId: string;

  @Column({ nullable: true })
  slaFirstResponseAt: Date;

  @Column({ nullable: true })
  slaResolutionAt: Date;

  @Column({ default: false })
  slaBreached: boolean;

  @Column({ nullable: true })
  firstRespondedAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true, length: 100 })
  aiCategory: string;

  @Column({ type: 'varchar', nullable: true })
  aiSentiment: AiSentiment;

  @Column({ type: 'float', nullable: true })
  aiConfidence: number;

  @Column({ type: 'text', nullable: true })
  aiReplyDraft: string;

  @Column({ nullable: true, length: 255 })
  sourceExternalId: string;

  // Stored as JSON string for SQLite
  @Column({ type: 'text', default: '{}' })
  metadata: string;

  @OneToMany(() => TicketNote, (note) => note.ticket)
  notes: TicketNote[];

  @OneToMany(() => TicketReply, (reply) => reply.ticket)
  replies: TicketReply[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
