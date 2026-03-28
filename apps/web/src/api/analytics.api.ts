import apiClient from './client';

export const analyticsApi = {
  overview: (dept?: string) => apiClient.get('/analytics/overview', { params: { dept } }),
  volume: (params?: Record<string, any>) => apiClient.get('/analytics/volume', { params }),
  sla: (params?: Record<string, any>) => apiClient.get('/analytics/sla', { params }),
  channels: (params?: Record<string, any>) => apiClient.get('/analytics/channels', { params }),
  agents: (params?: Record<string, any>) => apiClient.get('/analytics/agents', { params }),
};
