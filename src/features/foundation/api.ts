import { apiClient } from '@/lib/api-client';
import type { FoundationState, FoundationUpdatedEvent } from '@/domain/contracts';

export async function getFoundationState(signal?: AbortSignal) {
  const response = await apiClient.get<FoundationState>('/foundation', { signal });
  return response.data;
}

export async function resetFoundationProof() {
  const response = await apiClient.post<FoundationState>('/foundation/reset');
  return response.data;
}

export async function emitFoundationEvent() {
  const response = await apiClient.post<FoundationUpdatedEvent>('/foundation/events');
  return response.data;
}
