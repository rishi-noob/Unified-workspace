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
    refetchInterval: 30000,
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
    onError: () => message.error('Failed to create ticket'),
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
  });
}
