import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics.api';

export function useAnalyticsOverview(dept?: string) {
  return useQuery({
    queryKey: ['analytics', 'overview', dept],
    queryFn: async () => {
      const res = await analyticsApi.overview(dept);
      return res.data || res;
    },
  });
}

export function useAnalyticsVolume(params?: Record<string, any>) {
  return useQuery({
    queryKey: ['analytics', 'volume', params],
    queryFn: async () => {
      const res = await analyticsApi.volume(params);
      return res.data || res;
    },
  });
}

export function useAnalyticsSla(params?: Record<string, any>) {
  return useQuery({
    queryKey: ['analytics', 'sla', params],
    queryFn: async () => {
      const res = await analyticsApi.sla(params);
      return res.data || res;
    },
  });
}

export function useAnalyticsChannels(params?: Record<string, any>) {
  return useQuery({
    queryKey: ['analytics', 'channels', params],
    queryFn: async () => {
      const res = await analyticsApi.channels(params);
      return res.data || res;
    },
  });
}
