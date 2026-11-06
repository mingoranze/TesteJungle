import { io } from 'socket.io-client';
import type { NftUpdatedEvent, OrderUpdatedEvent } from '../domain/contracts';

export function connectMarketplaceSocket(token?: string, url?: string) {
  return io(url, {
    path: '/socket.io/',
    transports: ['polling'],
    forceNew: true,
    reconnection: false,
    auth: token ? { token } : undefined,
  });
}

export type { NftUpdatedEvent, OrderUpdatedEvent };
