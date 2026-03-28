import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Ticket } from '../tickets/entities/ticket.entity';
import { AiService } from './ai.service';
import { DepartmentsModule } from '../departments/departments.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket]),
    ConfigModule,
    DepartmentsModule,
    AuditModule,
  ],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
