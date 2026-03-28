import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi } from '../api/tickets.api';
import { message } from 'antd';

export function useTickets(params?: Record<string, any>) {
  return useQuery({
    queryKey: ['tickets', params],
    queryFn: async () => {
      const res = await ticketsApi.list(params);
      return res.data || res;
    },
    refetchInterval: 20000,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const res = await ticketsApi.get(id);
      return res.data || res;
    },
    enabled: !!id,
    refetchInterval: 20000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { subject: string; description: string; priority?: string; departmentId?: string }) => {
      const res = await ticketsApi.create(data);
      return res.data || res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      message.success('Ticket created');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(typeof msg === 'string' ? msg : 'Failed to create ticket');
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await ticketsApi.update(id, data);
      return res.data || res;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket', vars.id] });
      message.success('Ticket updated');
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { message?: string; errors?: unknown } } })?.response?.data;
      const msg = d?.message || (Array.isArray(d?.errors) ? 'Validation failed — check required fields' : null);
      message.error(typeof msg === 'string' ? msg : 'Could not update ticket');
    },
  });
}

export function useReplyTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await ticketsApi.reply(id, content);
      return res.data || res;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['ticket', vars.id] });
      message.success('Reply sent');
    },
  });
}

export function useAiDraft() {
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await ticketsApi.aiDraft(ticketId);
      return res.data || res;
    },
    onSuccess: (data: { draft?: string }) => {
      if (data?.draft) message.success('AI draft generated — review and edit before sending');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      message.error(typeof msg === 'string' ? msg : 'Could not generate AI draft');
    },
  });
}
