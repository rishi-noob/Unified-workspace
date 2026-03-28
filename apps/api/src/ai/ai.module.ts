import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { AiService } from './ai.service';
import { DepartmentsModule } from '../departments/departments.module';
import { AuditModule } from '../audit/audit.module';
import { SlaModule } from '../sla/sla.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, User]),
    ConfigModule,
    DepartmentsModule,
    AuditModule,
    SlaModule,
    forwardRef(() => TicketsModule),
  ],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
