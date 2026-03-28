import {
  Controller, Post, Get, Param, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import * as XLSX from 'xlsx';
import { TicketsService } from '../../tickets/tickets.service';
import { AiService } from '../../ai/ai.service';
import { DepartmentsService } from '../../departments/departments.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../common/types/role.enum';
import { TicketChannel, TicketPriority } from '../../common/types/ticket-status.enum';

const REQUIRED_COLS = ['subject', 'description', 'department', 'priority', 'requester_email'];
const VALID_DEPTS = ['it', 'hr', 'travel'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@ApiTags('Channels')
@ApiBearerAuth()
@Controller('api/v1/channels/excel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExcelController {
  // In-memory job store (sufficient for MVP)
  private jobs: Map<string, any> = new Map();

  constructor(
    private ticketsService: TicketsService,
    private aiService: AiService,
    private deptService: DepartmentsService,
  ) {}

  @Post('upload')
  @Roles(UserRole.TEAM_LEAD)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      const allowed = ['.xlsx', '.xls', '.csv'];
      const ext = '.' + file.originalname.split('.').pop()?.toLowerCase();
      cb(null, allowed.includes(ext));
    },
  }))
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No valid file uploaded. Accepted: .xlsx, .xls, .csv');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) throw new BadRequestException('Spreadsheet is empty');

    // Normalize headers
    const headers = Object.keys(rows[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
    }

    const jobId = `excel_${Date.now()}`;
    const errors: any[] = [];
    const valid: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row
      const norm = (key: string) => (row[key] || row[Object.keys(row).find(k => k.toLowerCase().replace(/\s+/g, '_') === key) || '']).toString().trim();

      const subject = norm('subject');
      const description = norm('description');
      const department = norm('department').toLowerCase();
      const priority = norm('priority').toLowerCase();
      const email = norm('requester_email');

      const rowErrors: string[] = [];
      if (!subject || subject.length > 255) rowErrors.push('subject must be 1-255 chars');
      if (!description) rowErrors.push('description is required');
      if (!VALID_DEPTS.includes(department)) rowErrors.push(`Invalid department '${norm('department')}'`);
      if (!VALID_PRIORITIES.includes(priority)) rowErrors.push(`Invalid priority '${norm('priority')}'`);
      if (!EMAIL_RE.test(email)) rowErrors.push(`Invalid email '${email}'`);

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors });
      } else {
        valid.push({ subject, description, department, priority, email });
      }
    }

    // Batch insert valid rows
    let imported = 0;
    const departments = await this.deptService.findAll();
    const deptMap = Object.fromEntries(departments.map((d) => [d.slug, d]));

    for (const item of valid) {
      const dept = deptMap[item.department];
      const ticket = await this.ticketsService.createFromChannel({
        subject: item.subject,
        description: item.description,
        channel: TicketChannel.EXCEL,
        priority: item.priority as TicketPriority,
        departmentId: dept?.id,
        metadata: { requesterEmail: item.email },
      });
      // Fire AI classification async
      this.aiService.classifyTicket(ticket.id).catch(() => {});
      imported++;
    }

    const result = { total: rows.length, imported, failed: errors.length, errors, jobId };
    this.jobs.set(jobId, { status: 'done', ...result });
    return result;
  }

  @Get('jobs/:jobId')
  @Roles(UserRole.TEAM_LEAD)
  getJobStatus(@Param('jobId') jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new BadRequestException('Job not found');
    return job;
  }
}
