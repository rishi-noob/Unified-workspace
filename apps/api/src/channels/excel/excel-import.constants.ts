/** First row of the sheet must be these headers (spacing/case-insensitive; normalized to snake_case). */
export const EXCEL_REQUIRED_COLUMNS = [
  'subject',
  'description',
  'department',
  'priority',
  'requester_email',
] as const;

export const EXCEL_PRIORITY_VALUES = ['low', 'normal', 'high', 'critical'] as const;
