import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { hasMinRole } from '../../utils/rbac.utils';
import type { UserRole } from '../../types/user.types';

export default function RoleGuard({ children, minRole }: { children: React.ReactNode; minRole?: UserRole }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (minRole && user && !hasMinRole(user.role, minRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
