import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { foundationKeys } from '@/lib/query-keys';

export function useFoundationEvents() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io({
      path: '/socket.io/',
      transports: ['polling'],
      reconnection: false,
    });
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onFoundationUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: foundationKeys.state });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('foundation.updated', onFoundationUpdated);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('foundation.updated', onFoundationUpdated);
      socket.disconnect();
    };
  }, [queryClient]);

  return { connected };
}
