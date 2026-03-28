import {
  Controller, Post, Get, Param, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import * as XLSX from 'xlsx';
import { TicketsService } from '../../tickets/tickets.service';
import { AiService } from '../../ai/ai.service';
import { DepartmentsService } from '../../departments/departments.service';
import { TicketsGateway } from '../../tickets/tickets.gateway';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../common/types/role.enum';
import { TicketChannel, TicketPriority } from '../../common/types/ticket-status.enum';
import { EXCEL_REQUIRED_COLUMNS, EXCEL_PRIORITY_VALUES } from './excel-import.constants';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normField(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v !== undefined && v !== null && String(v).trim() !== '') {
    return String(v).trim();
  }
  const matchKey = Object.keys(row).find(
    (k) => k.toLowerCase().replace(/\s+/g, '_') === key,
  );
  if (matchKey === undefined) return '';
  return String(row[matchKey] ?? '').trim();
}

@ApiTags('Channels')
@ApiBearerAuth()
@Controller('api/v1/channels/excel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExcelController {
  private jobs: Map<string, any> = new Map();

  constructor(
    private ticketsService: TicketsService,
    private aiService: AiService,
    private deptService: DepartmentsService,
    private ticketsGateway: TicketsGateway,
  ) {}

  @Post('upload')
  @Roles(UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Bulk import tickets from first sheet (.xlsx / .xls / .csv)' })
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
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      throw new BadRequestException('Spreadsheet is empty — add a header row plus at least one data row.');
    }

    const headerKeys = Object.keys(rows[0]);
    const normalizedHeaders = headerKeys.map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    const missing = EXCEL_REQUIRED_COLUMNS.filter((c) => !normalizedHeaders.includes(c));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required columns: ${missing.join(', ')}. Required (row 1): ${EXCEL_REQUIRED_COLUMNS.join(', ')}`,
      );
    }

    const departments = await this.deptService.findAll();
    const deptMap = Object.fromEntries(departments.map((d) => [d.slug, d]));
    const validSlugs = new Set(departments.map((d) => d.slug));
    const slugHint = departments.map((d) => d.slug).join(', ');

    const errors: { row: number; errors: string[] }[] = [];
    const valid: { subject: string; description: string; department: string; priority: string; email: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      const subject = normField(row, 'subject');
      const description = normField(row, 'description');
      const department = normField(row, 'department').toLowerCase();
      const priority = normField(row, 'priority').toLowerCase();
      const email = normField(row, 'requester_email');

      const rowErrors: string[] = [];
      if (!subject || subject.length > 255) rowErrors.push('subject must be 1–255 characters');
      if (!description) rowErrors.push('description is required');
      if (!validSlugs.has(department)) {
        rowErrors.push(`department must be one of: ${slugHint}`);
      }
      if (!(EXCEL_PRIORITY_VALUES as readonly string[]).includes(priority)) {
        rowErrors.push(`priority must be one of: ${EXCEL_PRIORITY_VALUES.join(', ')}`);
      }
      if (!EMAIL_RE.test(email)) rowErrors.push(`requester_email is not a valid email`);

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors });
      } else {
        valid.push({ subject, description, department, priority, email });
      }
    }

    let imported = 0;
    const jobId = `excel_${Date.now()}`;

    for (const item of valid) {
      const dept = deptMap[item.department];
      if (!dept?.id) continue;

      const ticket = await this.ticketsService.createFromChannel({
        subject: item.subject,
        description: item.description,
        channel: TicketChannel.EXCEL,
        priority: item.priority as TicketPriority,
        departmentId: dept.id,
        metadata: { requesterEmail: item.email, source: 'excel_upload' },
      });
      this.aiService.classifyTicket(ticket.id).catch(() => undefined);
      try {
        const full = await this.ticketsService.findById(ticket.id);
        this.ticketsGateway.emitTicketCreated(full, full.departmentId || undefined);
      } catch {
        /* non-fatal */
      }
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
