import apiClient from './client';
import axios from 'axios';

export const channelsApi = {
  uploadExcel: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post('/channels/excel/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total));
      },
    });
  },
  getJobStatus: (jobId: string) => apiClient.get(`/channels/excel/jobs/${jobId}`),
  freshdeskStatus: () => apiClient.get('/channels/freshdesk/status'),
};

export const usersApi = {
  list: () => apiClient.get('/users'),
  create: (data: any) => apiClient.post('/users', data),
  update: (id: string, data: any) => apiClient.patch(`/users/${id}`, data),
  delete: (id: string) => apiClient.delete(`/users/${id}`),
};

export const departmentsApi = {
  list: () => apiClient.get('/departments'),
  create: (data: any) => apiClient.post('/departments', data),
};

export const slaPoliciesApi = {
  list: (dept?: string) => apiClient.get('/sla-policies', { params: { dept } }),
  update: (id: string, data: any) => apiClient.patch(`/sla-policies/${id}`, data),
};
