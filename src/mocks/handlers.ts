import { http, HttpResponse } from 'msw';
import { readFoundationState, resetFoundationState, updateFoundationState } from '@/mocks/foundation-store';
import { marketplaceHandlers } from '@/mocks/marketplace-handlers';
import { publishFoundationEvent, resetSocketSessions, socketIoPollingHandlers } from '@/mocks/socket-io-polling';

export const handlers = [
  ...marketplaceHandlers,
  http.get('/api/foundation', () => HttpResponse.json(readFoundationState())),
  http.post('/api/foundation/reset', () => {
    resetFoundationState();
    resetSocketSessions();
    return HttpResponse.json(readFoundationState());
  }),
  http.post('/api/foundation/events', () => {
    const event = updateFoundationState();
    publishFoundationEvent(event);
    return HttpResponse.json(event, { status: 202 });
  }),
  ...socketIoPollingHandlers,
];
