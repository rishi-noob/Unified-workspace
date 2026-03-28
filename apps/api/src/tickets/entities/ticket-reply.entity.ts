import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../../users/entities/user.entity';
import { TicketChannel } from '../../common/types/ticket-status.enum';

@Entity('ticket_replies')
export class TicketReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ticketId: string;

  @ManyToOne(() => Ticket, (ticket) => ticket.replies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: Ticket;

  @Column({ nullable: true })
  authorId: string;

  @ManyToOne(() => User, { nullable: true, eager: true })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column('text')
  content: string;

  @Column({ length: 10 })
  direction: string; // 'inbound' | 'outbound'

  @Column({ type: 'varchar' })
  channel: TicketChannel;

  @Column({ nullable: true, length: 500 })
  sourceMsgId: string;

  @CreateDateColumn()
  createdAt: Date;
}
