import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole } from '../../common/types/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({ type: 'varchar', default: UserRole.AGENT })
  role: UserRole;

  // Stored as JSON string for SQLite compatibility (comma-separated UUIDs)
  @Column({ type: 'text', default: '[]' })
  departmentIds: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  refreshToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper to get department IDs as array
  getDepartmentIdArray(): string[] {
    try {
      return JSON.parse(this.departmentIds || '[]');
    } catch {
      return [];
    }
  }

  setDepartmentIdArray(ids: string[]) {
    this.departmentIds = JSON.stringify(ids);
  }
}
