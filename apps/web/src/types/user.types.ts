export type UserRole = 'agent' | 'team_lead' | 'manager' | 'super_admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  departmentIds: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
