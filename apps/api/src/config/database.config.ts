import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'sqljs',
  location: join(process.cwd(), 'ticketing.db'),
  autoSave: true,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  synchronize: true, // Auto-create tables — fine for MVP/dev
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : false,
});
