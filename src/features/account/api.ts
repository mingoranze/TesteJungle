import type {
  ChangePasswordRequest,
  Profile,
  UpdateProfileRequest,
  Wallet,
  WalletInput,
} from '@/domain/contracts';
import { apiClient } from '@/lib/api-client';
import { privateQueryKey } from '@/lib/query-keys';

export const accountKeys = {
  profile: (userId: string) => privateQueryKey(userId, 'profile'),
  wallets: (userId: string) => privateQueryKey(userId, 'wallets'),
};

export async function getProfile(signal?: AbortSignal) {
  const { data } = await apiClient.get<Profile>('/profile', { signal });
  return data;
}

export async function updateProfile(input: UpdateProfileRequest) {
  const { data } = await apiClient.patch<Profile>('/profile', input);
  return data;
}

export async function changePassword(input: ChangePasswordRequest) {
  await apiClient.post('/profile/password', input);
}

export async function listWallets(signal?: AbortSignal) {
  const { data } = await apiClient.get<Wallet[]>('/wallets', { signal });
  return data;
}

export async function createWallet(input: Omit<WalletInput, 'role'> & { role: Wallet['role'] }) {
  const { data } = await apiClient.post<Wallet>('/wallets', input);
  return data;
}

export async function updateWallet(walletId: string, input: Partial<WalletInput>) {
  const { data } = await apiClient.patch<Wallet>(`/wallets/${encodeURIComponent(walletId)}`, input);
  return data;
}

export async function deleteWallet(walletId: string) {
  await apiClient.delete(`/wallets/${encodeURIComponent(walletId)}`);
}
