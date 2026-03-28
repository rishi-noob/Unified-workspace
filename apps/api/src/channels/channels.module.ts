import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExcelController } from './excel/excel.controller';
import { FreshdeskController } from './freshdesk/freshdesk.controller';
import { MailIngestService } from './mail/mail-ingest.service';
import { TicketsModule } from '../tickets/tickets.module';
import { AiModule } from '../ai/ai.module';
import { DepartmentsModule } from '../departments/departments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, TicketsModule, AiModule, DepartmentsModule, NotificationsModule],
  controllers: [ExcelController, FreshdeskController],
  providers: [MailIngestService],
})
export class ChannelsModule {}
