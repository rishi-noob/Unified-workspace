import { useAuthStore } from '../store/auth.store';
import { authApi } from '../api/auth.api';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';

export function useAuth() {
  const { user, isAuthenticated, setAuth, logout: clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const login = async (email: string, password: string) => {
    try {
      const res = await authApi.login(email, password);
      const data = res.data || res;
      setAuth(data.user, data.accessToken, data.refreshToken);
      message.success(`Welcome back, ${data.user.name}!`);
      navigate('/');
      return data;
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Login failed';
      message.error(typeof msg === 'string' ? msg : 'Invalid credentials');
      throw err;
    }
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    clearAuth();
    navigate('/login');
  };

  return { user, isAuthenticated, login, logout };
}
