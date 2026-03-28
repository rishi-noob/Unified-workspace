import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth.store';

interface SocketState {
  socket: Socket | null;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connected: false,
  connect: () => {
    const token = useAuthStore.getState().accessToken;
    if (!token || get().socket) return;

    const socket = io('/tickets', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      set({ connected: true });
      console.log('[WS] Connected');
    });

    socket.on('disconnect', () => {
      set({ connected: false });
      console.log('[WS] Disconnected');
    });

    set({ socket });
  },
  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },
}));
