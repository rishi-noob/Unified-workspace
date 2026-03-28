import { DepartmentEntity } from '../../departments/entities/department.entity';

const SLUGS = ['it', 'hr', 'travel'] as const;
type DeptSlug = (typeof SLUGS)[number];

/** Gmail-style: rishabhathrit+it@gmail.com → it */
const PLUS_ROUTE = /\+(it|hr|travel)@/i;

/** Subject line: [IT] Laptop issue */
const SUBJECT_TAG = /^\s*\[(IT|HR|TRAVEL)\]\s*/i;

function normalizeSlug(raw: string): DeptSlug | null {
  const s = raw.toLowerCase();
  if (s === 'it' || s === 'hr' || s === 'travel') return s;
  return null;
}

/**
 * Optional overrides when everything goes to one mailbox.
 * Primary routing is: AI + keywords in AiService → IT/HR/Travel → auto-assign to agents.
 * Priority here: 1) +it / +hr / +travel in recipient  2) [IT]/[HR]/[TRAVEL] in subject  3) emailAlias match
 */
export function resolveDepartmentIdFromMail(
  departments: DepartmentEntity[],
  recipientEmails: string[],
  subject: string,
): string | null {
  const bySlug = (slug: string) => departments.find((d) => d.slug === slug) ?? null;

  for (const addr of recipientEmails) {
    const m = addr.match(PLUS_ROUTE);
    if (m) {
      const slug = normalizeSlug(m[1]);
      if (slug) {
        const d = bySlug(slug);
        if (d) return d.id;
      }
    }
  }

  const tag = subject.trim().match(SUBJECT_TAG);
  if (tag) {
    const slug = normalizeSlug(tag[1]);
    if (slug) {
      const d = bySlug(slug);
      if (d) return d.id;
    }
  }

  for (const dept of departments) {
    if (!dept.emailAlias?.trim()) continue;
    const alias = dept.emailAlias.trim().toLowerCase();
    for (const addr of recipientEmails) {
      if (addr.toLowerCase() === alias || addr.toLowerCase().includes(alias)) {
        return dept.id;
      }
    }
  }

  return null;
}
