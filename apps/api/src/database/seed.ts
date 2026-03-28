import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { hashPassword } from '../common/password.util';
import * as path from 'path';
import { User } from '../users/entities/user.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';
import { SlaPolicy } from '../sla/entities/sla-policy.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketNote } from '../tickets/entities/ticket-note.entity';
import { TicketReply } from '../tickets/entities/ticket-reply.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { UserRole } from '../common/types/role.enum';
import { TicketPriority } from '../common/types/ticket-status.enum';

const AppDataSource = new DataSource({
  type: 'sqljs',
  location: path.join(process.cwd(), 'ticketing.db'),
  autoSave: true,
  entities: [User, DepartmentEntity, SlaPolicy, Ticket, TicketNote, TicketReply, AuditLog],
  synchronize: true,
});

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const deptRepo = AppDataSource.getRepository(DepartmentEntity);
  const userRepo = AppDataSource.getRepository(User);
  const slaRepo = AppDataSource.getRepository(SlaPolicy);

  // ── Departments ──────────────────────────────────────────────────────────
  const deptData = [
    { name: 'IT',     slug: 'it',     emailAlias: 'helpdesk-it@company.com' },
    { name: 'HR',     slug: 'hr',     emailAlias: 'helpdesk-hr@company.com' },
    { name: 'Travel', slug: 'travel', emailAlias: 'helpdesk-travel@company.com' },
  ];

  const depts: Record<string, DepartmentEntity> = {};
  for (const d of deptData) {
    let dept = await deptRepo.findOne({ where: { slug: d.slug } });
    if (!dept) {
      dept = deptRepo.create(d);
      dept = await deptRepo.save(dept);
      console.log(`  ✅ Dept created: ${dept.name}`);
    } else {
      console.log(`  ↩  Dept already exists: ${dept.name}`);
    }
    depts[dept.slug] = dept;
  }

  // ── SLA Policies ─────────────────────────────────────────────────────────
  const slaPolicies = [
    // IT
    { dept: 'it', priority: TicketPriority.CRITICAL, firstResponse: 1,  resolution: 4  },
    { dept: 'it', priority: TicketPriority.HIGH,     firstResponse: 2,  resolution: 8  },
    { dept: 'it', priority: TicketPriority.NORMAL,   firstResponse: 4,  resolution: 24 },
    { dept: 'it', priority: TicketPriority.LOW,      firstResponse: 8,  resolution: 48 },
    // HR
    { dept: 'hr', priority: TicketPriority.CRITICAL, firstResponse: 2,  resolution: 8  },
    { dept: 'hr', priority: TicketPriority.HIGH,     firstResponse: 4,  resolution: 24 },
    { dept: 'hr', priority: TicketPriority.NORMAL,   firstResponse: 8,  resolution: 48 },
    { dept: 'hr', priority: TicketPriority.LOW,      firstResponse: 12, resolution: 72 },
    // Travel
    { dept: 'travel', priority: TicketPriority.CRITICAL, firstResponse: 4,  resolution: 24 },
    { dept: 'travel', priority: TicketPriority.HIGH,     firstResponse: 4,  resolution: 24 },
    { dept: 'travel', priority: TicketPriority.NORMAL,   firstResponse: 4,  resolution: 24 },
    { dept: 'travel', priority: TicketPriority.LOW,      firstResponse: 4,  resolution: 24 },
  ];

  for (const s of slaPolicies) {
    const existing = await slaRepo.findOne({ where: { departmentId: depts[s.dept].id, priority: s.priority } });
    if (!existing) {
      const policy = slaRepo.create({
        departmentId: depts[s.dept].id,
        priority: s.priority,
        firstResponseHours: s.firstResponse,
        resolutionHours: s.resolution,
      });
      await slaRepo.save(policy);
    }
  }
  console.log('  ✅ SLA policies seeded');

  // ── Demo Users ───────────────────────────────────────────────────────────
  const PASSWORD_HASH = await hashPassword('Demo@1234', 12);

  const usersData = [
    { name: 'Super Admin',    email: 'admin@company.com',        role: UserRole.SUPER_ADMIN, depts: ['it', 'hr', 'travel'] },
    { name: 'IT Manager',     email: 'it-manager@company.com',   role: UserRole.MANAGER,     depts: ['it'] },
    { name: 'HR Manager',     email: 'hr-manager@company.com',   role: UserRole.MANAGER,     depts: ['hr'] },
    { name: 'IT Lead',        email: 'it-lead@company.com',      role: UserRole.TEAM_LEAD,   depts: ['it'] },
    { name: 'IT Agent 1',     email: 'it-agent1@company.com',    role: UserRole.AGENT,       depts: ['it'] },
    { name: 'IT Agent 2',     email: 'it-agent2@company.com',    role: UserRole.AGENT,       depts: ['it'] },
    { name: 'HR Agent 1',     email: 'hr-agent1@company.com',    role: UserRole.AGENT,       depts: ['hr'] },
    { name: 'Travel Agent',   email: 'travel@company.com',       role: UserRole.AGENT,       depts: ['travel'] },
    { name: 'Multi-dept Lead',email: 'multilead@company.com',    role: UserRole.TEAM_LEAD,   depts: ['it', 'travel'] },
  ];

  for (const u of usersData) {
    let user = await userRepo.findOne({ where: { email: u.email } });
    if (!user) {
      const deptIds = u.depts.map((slug) => depts[slug]?.id).filter(Boolean);
      user = userRepo.create({
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash: PASSWORD_HASH,
        departmentIds: JSON.stringify(deptIds),
      });
      await userRepo.save(user);
      console.log(`  ✅ User created: ${u.email} [${u.role}]`);
    } else {
      console.log(`  ↩  User exists: ${u.email}`);
    }
  }

  console.log('\n🎉 Seed complete! Demo credentials: <email> / Demo@1234');
  console.log('   admin@company.com | it-manager@company.com | it-lead@company.com | it-agent1@company.com');

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
