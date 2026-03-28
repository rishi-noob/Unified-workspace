import apiClient from './client';

export const ticketsApi = {
  list: (params?: Record<string, any>) =>
    apiClient.get('/tickets', { params }),
  get: (id: string) => apiClient.get(`/tickets/${id}`),
  create: (data: { subject: string; description: string; priority?: string; departmentId?: string }) =>
    apiClient.post('/tickets', data),
  update: (id: string, data: Record<string, any>) =>
    apiClient.patch(`/tickets/${id}`, data),
  delete: (id: string) => apiClient.delete(`/tickets/${id}`),
  addNote: (id: string, content: string) =>
    apiClient.post(`/tickets/${id}/notes`, { content }),
  getNotes: (id: string) => apiClient.get(`/tickets/${id}/notes`),
  reply: (id: string, content: string) =>
    apiClient.post(`/tickets/${id}/reply`, { content }),
  assign: (id: string, assigneeId: string, teamId?: string) =>
    apiClient.post(`/tickets/${id}/assign`, { assigneeId, teamId }),
  aiDraft: (id: string) => apiClient.post(`/tickets/${id}/ai-reply-draft`, {}),
  aiInsights: (id: string) => apiClient.get(`/tickets/${id}/ai-insights`),
};
