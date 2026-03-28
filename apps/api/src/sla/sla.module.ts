import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SlaPolicy } from './entities/sla-policy.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { SlaService } from './sla.service';
import { SlaController } from './sla.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SlaPolicy, Ticket]),
    ScheduleModule,
    AuditModule,
    AuthModule,
  ],
  controllers: [SlaController],
  providers: [SlaService],
  exports: [SlaService],
})
export class SlaModule {}
