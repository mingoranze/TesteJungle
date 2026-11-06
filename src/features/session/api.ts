import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  Session,
} from '@/domain/contracts';
import { apiClient } from '@/lib/api-client';

export async function getSession(signal?: AbortSignal) {
  const { data } = await apiClient.get<Session>('/session', { signal });
  return data;
}

export async function login(input: LoginRequest) {
  const { data } = await apiClient.post<AuthResponse>('/session/login', input);
  return data;
}

export async function register(input: RegisterRequest) {
  const { data } = await apiClient.post<AuthResponse>('/session/register', input);
  return data;
}

export async function logout() {
  await apiClient.post('/session/logout');
}
