import type { UserRole } from '../types/user.types';

const ROLE_LEVELS: Record<UserRole, number> = {
  agent: 0,
  team_lead: 1,
  manager: 2,
  super_admin: 3,
};

export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return (ROLE_LEVELS[userRole] ?? -1) >= (ROLE_LEVELS[minRole] ?? 99);
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  if (path.startsWith('/admin')) return hasMinRole(role, 'super_admin');
  if (path.startsWith('/analytics')) return hasMinRole(role, 'team_lead');
  if (path.startsWith('/upload')) return hasMinRole(role, 'team_lead');
  return true;
}
