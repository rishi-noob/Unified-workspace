import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ticket } from '../tickets/entities/ticket.entity';
import { DepartmentsService } from '../departments/departments.service';
import { AuditService } from '../audit/audit.service';
import { CLASSIFY_SYSTEM_PROMPT } from './prompts/classify.prompt';
import { REPLY_DRAFT_SYSTEM_PROMPT } from './prompts/reply-draft.prompt';

const KEYWORD_RULES = [
  { dept: 'IT',     patterns: [/\b(vpn|laptop|software|install|access|password|server|network|wifi|email setup|computer|pc|hardware|printer|monitor|screen|keyboard|mouse|browser|antivirus|malware)\b/i] },
  { dept: 'HR',     patterns: [/\b(leave|payroll|salary|onboard|offboard|policy|contract|benefits|appraisal|pf|provident|insurance|resignation|joining|attendance|hr|human resource)\b/i] },
  { dept: 'Travel', patterns: [/\b(flight|hotel|travel|reimbursement|cab|taxi|visa|booking|trip|accommodation|train|bus|transit|airport|expense)\b/i] },
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
    private configService: ConfigService,
    private deptService: DepartmentsService,
    private auditService: AuditService,
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
    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return {
          category: rule.dept,
          confidence: 0.95,
          sentiment: 'neutral',
          sentimentReason: 'Keyword match — sentiment not analyzed',
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

  // ── Classification ────────────────────────────────────────────────────────

  async classifyTicket(ticketId: string): Promise<void> {
    try {
      const ticket = await this.ticketsRepo.findOne({ where: { id: ticketId } });
      if (!ticket) return;

      const text = `${ticket.subject} ${ticket.description.substring(0, 500)}`;
      const cleanText = this.stripPii(text);

      // 1. Try keyword rules first (free, instant)
      let result: ClassifyResult | null = this.keywordClassify(cleanText);

      // 2. Try Gemini if no keyword match and circuit is closed
      if (!result && this.gemini && !this.isCircuitOpen()) {
        result = await this.callGeminiClassify(ticket.subject, cleanText);
      }

      // 3. Fallback: unclassified
      if (!result) {
        result = { category: 'Other', confidence: 0, sentiment: 'neutral', sentimentReason: 'Could not classify', reasoning: 'No keyword match and AI unavailable' };
      }

      // Persist results
      ticket.aiCategory = result.category;
      ticket.aiSentiment = result.sentiment as any;
      ticket.aiConfidence = result.confidence;

      // Auto-assign dept when confident enough
      if (result.confidence >= 0.8 && result.category !== 'Other' && !ticket.departmentId) {
        const dept = await this.deptService.findByName(result.category);
        if (dept) ticket.departmentId = dept.id;
      }

      await this.ticketsRepo.save(ticket);
      await this.auditService.log({
        entityType: 'ticket', entityId: ticketId, action: 'ai_classified',
        afterState: JSON.stringify({ category: result.category, confidence: result.confidence, sentiment: result.sentiment }),
      });

      this.logger.log(`Classified ticket ${ticketId}: ${result.category} (${(result.confidence * 100).toFixed(0)}%) via ${this.gemini && result.confidence < 0.95 ? 'Gemini' : 'keywords'}`);
    } catch (err) {
      this.logger.error(`classifyTicket failed for ${ticketId}: ${err.message}`);
    }
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
      this.logger.error(`Gemini classify error: ${err.message}`);
      this.recordFailure();
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
