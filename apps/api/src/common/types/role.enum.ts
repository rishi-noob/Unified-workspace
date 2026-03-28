export enum UserRole {
  AGENT = 'agent',
  TEAM_LEAD = 'team_lead',
  MANAGER = 'manager',
  SUPER_ADMIN = 'super_admin',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.AGENT]: 0,
  [UserRole.TEAM_LEAD]: 1,
  [UserRole.MANAGER]: 2,
  [UserRole.SUPER_ADMIN]: 3,
};
