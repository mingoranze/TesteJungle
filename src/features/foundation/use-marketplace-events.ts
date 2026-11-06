import { useEffect, useState } from 'react';
import {
  connectMarketplaceSocket,
  type NftUpdatedEvent,
  type OrderUpdatedEvent,
} from '@/mocks/marketplace-socket-client';

type MarketplaceEvent =
  | { name: 'nft.updated'; event: NftUpdatedEvent }
  | { name: 'order.updated'; event: OrderUpdatedEvent };

export function useMarketplaceEvents() {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<MarketplaceEvent>();

  useEffect(() => {
    const socket = connectMarketplaceSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onNftUpdated = (event: NftUpdatedEvent) => setLastEvent({ name: 'nft.updated', event });
    const onOrderUpdated = (event: OrderUpdatedEvent) => setLastEvent({ name: 'order.updated', event });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('nft.updated', onNftUpdated);
    socket.on('order.updated', onOrderUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('nft.updated', onNftUpdated);
      socket.off('order.updated', onOrderUpdated);
      socket.disconnect();
    };
  }, []);

  return { connected, lastEvent };
}
