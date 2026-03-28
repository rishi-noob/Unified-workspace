import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { databaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { TicketsModule } from './tickets/tickets.module';
import { AiModule } from './ai/ai.module';
import { SlaModule } from './sla/sla.module';
import { AuditModule } from './audit/audit.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ChannelsModule } from './channels/channels.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => databaseConfig(),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    DepartmentsModule,
    TicketsModule,
    AiModule,
    SlaModule,
    AuditModule,
    AnalyticsModule,
    ChannelsModule,
  ],
})
export class AppModule {}
