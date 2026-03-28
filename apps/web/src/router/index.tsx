import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import RoleGuard from '../components/layout/RoleGuard';
import LoginPage from '../pages/Login';
import DashboardPage from '../pages/Dashboard';
import TicketList from '../pages/Tickets/TicketList';
import TicketDetail from '../pages/Tickets/TicketDetail';
import CreateTicket from '../pages/Tickets/CreateTicket';
import ExcelUpload from '../pages/Upload/ExcelUpload';
import AnalyticsPage from '../pages/Analytics';
import UserManagement from '../pages/Admin/UserManagement';
import DepartmentConfig from '../pages/Admin/DepartmentConfig';
import SlaConfig from '../pages/Admin/SlaConfig';

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={<RoleGuard><DashboardPage /></RoleGuard>} />
      <Route path="/tickets" element={<RoleGuard><TicketList /></RoleGuard>} />
      <Route path="/tickets/create" element={<RoleGuard><CreateTicket /></RoleGuard>} />
      <Route path="/tickets/:id" element={<RoleGuard><TicketDetail /></RoleGuard>} />

      <Route path="/upload" element={<RoleGuard minRole="team_lead"><ExcelUpload /></RoleGuard>} />
      <Route path="/analytics" element={<RoleGuard minRole="team_lead"><AnalyticsPage /></RoleGuard>} />

      <Route path="/admin/users" element={<RoleGuard minRole="super_admin"><UserManagement /></RoleGuard>} />
      <Route path="/admin/departments" element={<RoleGuard minRole="super_admin"><DepartmentConfig /></RoleGuard>} />
      <Route path="/admin/sla" element={<RoleGuard minRole="super_admin"><SlaConfig /></RoleGuard>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
