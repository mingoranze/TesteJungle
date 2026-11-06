import axios from 'axios';
import { ApiError, normalizeApiError } from '@/lib/api-error';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 10_000,
  headers: {
    Accept: 'application/json',
  },
});

type UnauthorizedListener = (error: ApiError) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Notifica respostas 401 de endpoints que não são de sessão. O ciclo de vida da sessão
 * decide se isso representa expiração (havia usuário autenticado) ou apenas acesso anônimo.
 */
export function onUnauthorizedResponse(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeApiError(error);
    const url = axios.isAxiosError(error) ? error.config?.url ?? '' : '';
    if (normalized instanceof ApiError && normalized.status === 401 && !url.startsWith('/session')) {
      unauthorizedListeners.forEach((listener) => listener(normalized));
    }
    return Promise.reject(normalized);
  },
);
