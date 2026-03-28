import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketNote } from './entities/ticket-note.entity';
import { TicketReply } from './entities/ticket-reply.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsGateway } from './tickets.gateway';
import { AuthModule } from '../auth/auth.module';
import { DepartmentsModule } from '../departments/departments.module';
import { AuditModule } from '../audit/audit.module';
import { SlaModule } from '../sla/sla.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketNote, TicketReply]),
    AuthModule,
    DepartmentsModule,
    AuditModule,
    SlaModule,
    AiModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsGateway],
  exports: [TicketsService, TicketsGateway],
})
export class TicketsModule {}
