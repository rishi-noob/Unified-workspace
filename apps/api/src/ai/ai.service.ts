import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ticket } from '../tickets/entities/ticket.entity';
import { User } from '../users/entities/user.entity';
import { DepartmentsService } from '../departments/departments.service';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { UserRole } from '../common/types/role.enum';
import { TicketStatus } from '../common/types/ticket-status.enum';
import { CLASSIFY_SYSTEM_PROMPT } from './prompts/classify.prompt';
import { REPLY_DRAFT_SYSTEM_PROMPT } from './prompts/reply-draft.prompt';
import { TicketsGateway } from '../tickets/tickets.gateway';

/** First match wins — HR before Travel so “salary reimbursement” hits HR; Travel catches trip/expense claims */
const KEYWORD_RULES = [
  {
    dept: 'IT',
    patterns: [
      /\b(vscode|vs\s*code|visual\s+studio|visualstudio|github|git\b|docker|kubernetes|terminal|ide|extension|npm|node\.?js|python|java|sql|database|api\s+key|oauth|sso|mfa|2fa|vpn|laptop|software|install|access|password|server|network|wifi|wi-?fi|email\s+setup|computer|pc|hardware|printer|monitor|screen|keyboard|mouse|browser|antivirus|malware|outlook|teams|slack|zoom|sharepoint|onedrive|excel\s+crash|word\s+crash|error|bug|glitch|not\s+working|broken)\b/i,
    ],
  },
  {
    dept: 'HR',
    patterns: [
      /\b(pay\s*check|paycheque|salary|wages|wage|payroll|not\s+credited|missing\s+payment|bonus|compensation|leave|pto|vacation|sick\s+leave|onboard|offboard|policy|contract|benefits|appraisal|pf\b|provident|insurance|resignation|joining|attendance|\bhr\b|human\s+resources?)\b/i,
    ],
  },
  {
    dept: 'Travel',
    patterns: [
      /\b(flight|hotel|travel|reimbursement|mileage|per\s*diem|expense\s+claim|cab|taxi|uber|lyft|visa|booking|trip|accommodation|train|bus|transit|airport|expense\s+report)\b/i,
    ],
  },
];

interface ClassifyResult {
  category: string;
  confidence: number;
  sentiment: string;
  sentimentReason: string;
  reasoning: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private gemini: GoogleGenerativeAI | null = null;
  private circuitOpen = false;
  private consecutiveFailures = 0;
  private circuitOpenedAt: Date | null = null;
  private readonly CIRCUIT_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_MS = 5 * 60 * 1000;

  constructor(
    @InjectRepository(Ticket) private ticketsRepo: Repository<Ticket>,
    @InjectRepository(User) private usersRepo: Repository<User>,
    private configService: ConfigService,
    private deptService: DepartmentsService,
    private auditService: AuditService,
    private slaService: SlaService,
    @Inject(forwardRef(() => TicketsGateway))
    private ticketsGateway: TicketsGateway,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey && apiKey !== 'placeholder' && apiKey.length > 10) {
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.logger.log('Gemini AI client initialized');
    } else {
      this.logger.warn('No valid GEMINI_API_KEY — using keyword-only classification (still fully functional)');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private stripPii(text: string): string {
    return text
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
      .replace(/\b(\+91|0)?[6-9]\d{9}\b/g, '[PHONE]')
      .replace(/\b[2-9]\d{11}\b/g, '[AADHAAR]')
      .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN]');
  }

  private keywordClassify(text: string): ClassifyResult | null {
    const isUrgent = /\b(urgent|asap|immediately|p1|sev-?1|critical|outage|down|broken)\b/i.test(text);
    const isNegative = /\b(annoyed|frustrated|angry|unacceptable|awful|terrible|worst|hate|stupid|furious|not\s+working|delayed|missing)\b/i.test(text);
    
    let derivedSentiment = 'neutral';
    if (isUrgent) derivedSentiment = 'urgent';
    else if (isNegative) derivedSentiment = 'negative';

    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return {
          category: rule.dept,
          confidence: 0.95,
          sentiment: derivedSentiment,
          sentimentReason: `Keyword match — sentiment heuristically scaled to ${derivedSentiment}`,
          reasoning: `Matched keyword patterns for ${rule.dept}`,
        };
      }
    }
    return null;
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitOpen) return false;
    if (this.circuitOpenedAt && Date.now() - this.circuitOpenedAt.getTime() > this.CIRCUIT_RESET_MS) {
      this.circuitOpen = false;
      this.consecutiveFailures = 0;
      this.logger.log('Circuit breaker reset — retrying Gemini');
      return false;
    }
    return true;
  }

  private recordFailure() {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.CIRCUIT_THRESHOLD) {
      this.circuitOpen = true;
      this.circuitOpenedAt = new Date();
      this.logger.error(`Circuit breaker OPEN after ${this.consecutiveFailures} consecutive Gemini failures`);
    }
  }

  private recordSuccess() { this.consecutiveFailures = 0; }

  private forceCircuitOpen(reason: string) {
    this.circuitOpen = true;
    this.circuitOpenedAt = new Date();
    this.logger.warn(`Gemini circuit forced OPEN: ${reason}`);
  }

  private geminiClassifyEnabled(): boolean {
    return this.configService.get<string>('GEMINI_CLASSIFY_ENABLED')?.toLowerCase() !== 'false';
  }

  private async resolveDepartmentForCategory(category: string) {
    const raw = category.trim();
    if (!raw || raw === 'Other') return null;
    const byName = await this.deptService.findByName(raw);
    if (byName) return byName;
    const slug = raw.toLowerCase();
    if (['it', 'hr', 'travel'].includes(slug)) {
      return this.deptService.findBySlug(slug);
    }
    return null;
  }

  // ── Classification ────────────────────────────────────────────────────────

  async classifyTicket(ticketId: string): Promise<void> {
    try {
      const ticket = await this.ticketsRepo.findOne({ where: { id: ticketId } });
      if (!ticket) return;

      const text = `${ticket.subject} ${ticket.description.substring(0, 500)}`;
      const cleanText = this.stripPii(text);

      // 1. Keywords on raw + cleaned (emails stripped only for Gemini)
      let result: ClassifyResult | null = this.keywordClassify(text) || this.keywordClassify(cleanText);

      let source: 'keywords' | 'gemini' | 'fallback' = result ? 'keywords' : 'fallback';

      // 2. Gemini only when enabled, no keyword hit, key present, circuit closed
      if (!result && this.gemini && this.geminiClassifyEnabled() && !this.isCircuitOpen()) {
        const geminiResult = await this.callGeminiClassify(ticket.subject, cleanText);
        if (geminiResult) {
          result = geminiResult;
          source = 'gemini';
        }
      }

      // 3. Fallback: unclassified (no random department — stays unassigned or keeps mail-routed dept)
      if (!result) {
        result = {
          category: 'Other',
          confidence: 0,
          sentiment: 'neutral',
          sentimentReason: 'Could not classify',
          reasoning:
            source === 'fallback' && this.gemini && !this.geminiClassifyEnabled()
              ? 'GEMINI_CLASSIFY_ENABLED=false — keyword-only mode'
              : 'No keyword match; Gemini unavailable, rate-limited, or returned nothing',
        };
        source = 'fallback';
      }

      const deptBefore = ticket.departmentId;

      // Persist AI fields (category is advisory; department only applied when confident)
      ticket.aiCategory = result.category;
      ticket.aiSentiment = result.sentiment as any;
      ticket.aiConfidence = result.confidence;

      if (result.confidence >= 0.8 && result.category !== 'Other') {
        const dept = await this.resolveDepartmentForCategory(result.category);
        if (dept) {
          if (ticket.departmentId !== dept.id) {
            ticket.slaFirstResponseAt = null;
            ticket.slaResolutionAt = null;
          }
          ticket.departmentId = dept.id;
        }
      }

      await this.slaService.ensureSlaForTicket(ticket);
      const assignedNow = await this.tryAssignToTeamMember(ticket);

      await this.ticketsRepo.save(ticket);
      await this.auditService.log({
        entityType: 'ticket', entityId: ticketId, action: 'ai_classified',
        afterState: JSON.stringify({ category: result.category, confidence: result.confidence, sentiment: result.sentiment }),
      });

      this.ticketsGateway.emitTicketUpdated(ticketId, { status: ticket.status, aiCategory: ticket.aiCategory }, ticket.departmentId);
      this.ticketsGateway.emitAiInsightsReady(ticketId, result.category, result.sentiment, ticket.departmentId);
      if (assignedNow && ticket.assignedToId) {
        const u = await this.usersRepo.findOne({ where: { id: ticket.assignedToId } });
        if (u) this.ticketsGateway.emitTicketAssigned(ticket.id, u.id, u);
      }

      this.logger.log(
        `Classified ticket ${ticketId}: ${result.category} (${(result.confidence * 100).toFixed(0)}%) [${source}]` +
          (deptBefore !== ticket.departmentId ? ` dept ${deptBefore || 'none'} → ${ticket.departmentId || 'none'}` : ''),
      );
    } catch (err) {
      this.logger.error(`classifyTicket failed for ${ticketId}: ${err.message}`);
    }
  }

  /**
   * Single shared inbox: after content routing sets department (AI/keywords or mail),
   * assign to the active agent in that dept with the fewest open tickets (load balance).
   */
  private async tryAssignToTeamMember(ticket: Ticket): Promise<boolean> {
    if (!ticket.departmentId || ticket.assignedToId) return false;

    const agents = await this.usersRepo.find({
      where: { isActive: true, role: UserRole.AGENT },
    });
    const inDept = agents.filter((a) => a.getDepartmentIdArray().includes(ticket.departmentId));
    if (!inDept.length) {
      this.logger.debug(`No active agent in department ${ticket.departmentId} — ticket stays unassigned`);
      return false;
    }

    const openStatuses = [
      TicketStatus.NEW,
      TicketStatus.ASSIGNED,
      TicketStatus.IN_PROGRESS,
      TicketStatus.PENDING,
    ];
    let best = inDept[0];
    let bestCount = Number.MAX_SAFE_INTEGER;
    for (const a of inDept) {
      const n = await this.ticketsRepo.count({
        where: {
          assignedToId: a.id,
          departmentId: ticket.departmentId,
          status: In(openStatuses),
        },
      });
      if (n < bestCount) {
        bestCount = n;
        best = a;
      }
    }

    ticket.assignedToId = best.id;
    if (ticket.status === TicketStatus.NEW) ticket.status = TicketStatus.ASSIGNED;

    await this.auditService.log({
      entityType: 'ticket',
      entityId: ticket.id,
      action: 'auto_assigned',
      afterState: JSON.stringify({ assignedToId: best.id, assigneeEmail: best.email }),
    });

    this.logger.log(`Ticket ${ticket.id} → ${best.email} (least busy agent in department)`);
    return true;
  }

  private async callGeminiClassify(subject: string, cleanText: string): Promise<ClassifyResult | null> {
    try {
      const model = this.gemini.getGenerativeModel({
        model: this.configService.get('GEMINI_MODEL_CLASSIFY') || 'gemini-2.0-flash',
      });

      const prompt = `${CLASSIFY_SYSTEM_PROMPT}\n\nSubject: ${subject}\nDescription: ${cleanText}`;
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();

      // Strip markdown fences if present
      const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(jsonStr);

      this.recordSuccess();
      return {
        category: parsed.category || 'Other',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        sentiment: parsed.sentiment || 'neutral',
        sentimentReason: parsed.sentiment_reason || '',
        reasoning: parsed.reasoning || '',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('quota');
      if (is429) {
        this.logger.warn(`Gemini classify rate limited / quota — using keywords only until circuit resets (${msg.substring(0, 120)}…)`);
        this.forceCircuitOpen('429 / quota');
      } else {
        this.logger.error(`Gemini classify error: ${msg}`);
        this.recordFailure();
      }
      return null;
    }
  }

  // ── Reply Draft ───────────────────────────────────────────────────────────

  async generateReplyDraft(ticketId: string): Promise<{ draft: string }> {
    const ticket = await this.ticketsRepo.findOne({
      where: { id: ticketId },
      relations: ['replies', 'department'],
    });
    if (!ticket) return { draft: 'Ticket not found.' };

    const lastReplies = (ticket.replies || [])
      .slice(-3)
      .map((r) => `[${r.direction === 'inbound' ? 'Customer' : 'Agent'}]: ${r.content}`)
      .join('\n');

    const draft = await this.callGeminiReplyDraft(ticket, lastReplies);
    ticket.aiReplyDraft = draft;
    await this.ticketsRepo.save(ticket);

    await this.auditService.log({
      entityType: 'ticket', entityId: ticketId, action: 'ai_draft_generated',
      afterState: JSON.stringify({ draftLength: draft.length }),
    });

    return { draft };
  }

  private async callGeminiReplyDraft(ticket: Ticket, threadContext: string): Promise<string> {
    // Generic fallback (no AI needed)
    const fallback = `Thank you for contacting our ${ticket.department?.name || 'support'} team.\n\nWe have received your request regarding "${ticket.subject}" and are currently looking into it. We will provide you with an update within our standard SLA timeframe.\n\nIf you have any additional information that may help us resolve this faster, please reply to this message.`;

    if (!this.gemini || this.isCircuitOpen()) return fallback;

    try {
      const model = this.gemini.getGenerativeModel({
        model: this.configService.get('GEMINI_MODEL_DRAFT') || 'gemini-2.0-flash',
      });

      const prompt = `${REPLY_DRAFT_SYSTEM_PROMPT}\n\nDepartment: ${ticket.department?.name || 'Support'}\nTicket Subject: ${ticket.subject}\nDescription: ${ticket.description.substring(0, 800)}\n\nRecent thread:\n${threadContext || 'No prior replies'}`;
      const result = await model.generateContent(prompt);
      this.recordSuccess();
      return result.response.text().trim();
    } catch (err) {
      this.logger.error(`Gemini reply draft error: ${err.message}`);
      this.recordFailure();
      return fallback;
    }
  }
}
