export interface AnalyticsOverview {
  openCount: number;
  resolvedToday: number;
  breachRate: number;
  avgResolutionHours: number;
  totalTickets: number;
}

export interface VolumeDataPoint {
  date: string;
  count: number;
}

export interface SlaData {
  total: number;
  breached: number;
  onTime: number;
  breachRate: number;
  data: { name: string; value: number }[];
}

export interface ChannelData {
  channel: string;
  count: number;
}

export interface AgentStat {
  agentId: string;
  name: string;
  total: number;
  resolved: number;
  breached: number;
}
