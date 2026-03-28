import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).format('MMM D, YYYY h:mm A');
}

export function formatRelative(d: string | null | undefined): string {
  if (!d) return '—';
  return dayjs(d).fromNow();
}
