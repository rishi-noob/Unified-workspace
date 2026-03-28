export type TicketStatus = 'new' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'critical';
export type TicketChannel = 'email' | 'excel' | 'freshdesk' | 'manual';
export type AiSentiment = 'positive' | 'neutral' | 'negative' | 'urgent';

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  channel: TicketChannel;
  departmentId: string | null;
  department: { id: string; name: string; slug: string } | null;
  createdById: string | null;
  createdBy: { id: string; name: string; email: string } | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  teamId: string | null;
  slaFirstResponseAt: string | null;
  slaResolutionAt: string | null;
  slaBreached: boolean;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  aiCategory: string | null;
  aiSentiment: AiSentiment | null;
  aiConfidence: number | null;
  aiReplyDraft: string | null;
  sourceExternalId: string | null;
  metadata: string;
  notes?: TicketNote[];
  replies?: TicketReply[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  authorId: string;
  author: { id: string; name: string; email: string };
  content: string;
  createdAt: string;
}

export interface TicketReply {
  id: string;
  ticketId: string;
  authorId: string | null;
  author: { id: string; name: string; email: string } | null;
  content: string;
  direction: 'inbound' | 'outbound';
  channel: TicketChannel;
  createdAt: string;
}

export interface TicketListResponse {
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
