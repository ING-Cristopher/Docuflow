import axios from 'axios';
import { env } from '@/lib/env';
import { getStoredSession, notifyUnauthorized } from '@/features/auth/sessionStorage';

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
});

apiClient.interceptors.request.use((config) => {
  const session = getStoredSession();
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      const isAuthCredentialCall = url.includes('/api/auth/login') || url.includes('/api/auth/register');
      if (!isAuthCredentialCall) {
        notifyUnauthorized();
      }
    }
    return Promise.reject(error);
  },
);

