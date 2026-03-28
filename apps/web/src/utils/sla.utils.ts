import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration);

export function getSlaStatus(slaResolutionAt: string | null, slaBreached: boolean, createdAt: string) {
  if (slaBreached) return { label: 'Breached', color: '#EF4444', percent: 0, timeLeft: 'Breached' };
  if (!slaResolutionAt) return { label: 'No SLA', color: '#9CA3AF', percent: 100, timeLeft: 'No SLA' };

  const now = dayjs();
  const deadline = dayjs(slaResolutionAt);
  const created = dayjs(createdAt);
  const totalMs = deadline.diff(created);
  const remainMs = deadline.diff(now);

  if (remainMs <= 0) return { label: 'Breached', color: '#EF4444', percent: 0, timeLeft: 'Breached' };

  const percent = Math.round((remainMs / totalMs) * 100);
  const dur = dayjs.duration(remainMs);
  const hours = Math.floor(dur.asHours());
  const mins = dur.minutes();

  let color = '#0F9D58'; // green >50%
  if (percent <= 10) color = '#EF4444'; // red
  else if (percent <= 50) color = '#F59E0B'; // amber

  return {
    label: `${hours}h ${mins}m`,
    color,
    percent,
    timeLeft: `${hours}h ${mins}m`,
  };
}
