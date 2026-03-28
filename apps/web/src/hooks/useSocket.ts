import { useEffect } from 'react';
import { useSocketStore } from '../store/socket.store';
import { useAuthStore } from '../store/auth.store';

export function useSocket() {
  const { socket, connected, connect, disconnect } = useSocketStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && !socket) connect();
    return () => {};
  }, [isAuthenticated]);

  return { socket, connected };
}
