import { http, HttpResponse } from 'msw';
import type {
  FoundationUpdatedEvent,
  NftUpdatedEvent,
  OrderUpdatedEvent,
} from '../domain/contracts';
import { readMarketplaceState } from './marketplace-store';

interface PollingSession {
  packets: string[];
  waiters: Set<(packet: string) => void>;
  userId: string | null;
}

const sessions = new Map<string, PollingSession>();

/**
 * Últimos eventos publicados, mantidos em memória do mock para reenvio controlado
 * (`POST /api/mock/socket/replay`): simula entrega duplicada e fora de ordem.
 */
const publishedEvents: Array<{ eventName: string; event: { eventId: string }; userId?: string }> = [];
const MAX_PUBLISHED_EVENTS = 50;

function textResponse(body: string, status = 200) {
  return new HttpResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
  });
}

function enqueue(session: PollingSession, packet: string) {
  const waiter = [...session.waiters][0];

  if (waiter) {
    waiter(packet);
    return;
  }

  session.packets.push(packet);
}

function waitForPacket(session: PollingSession, signal: AbortSignal) {
  return new Promise<string>((resolve) => {
    let settled = false;
    const finish = (packet: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      session.waiters.delete(finish);
      resolve(packet);
    };
    const onAbort = () => finish('6');
    const timeout = setTimeout(() => finish('2'), 10_000);

    session.waiters.add(finish);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function parsePacketPayload(body: string) {
  return body.split('\u001e').filter(Boolean);
}

export function publishFoundationEvent(event: FoundationUpdatedEvent) {
  publishSocketEvent('foundation.updated', event);
}

export function publishMarketplaceEvent(
  eventName: 'nft.updated',
  event: NftUpdatedEvent,
): void;
export function publishMarketplaceEvent(
  eventName: 'order.updated',
  event: OrderUpdatedEvent,
  userId: string,
): void;
export function publishMarketplaceEvent(
  eventName: 'nft.updated' | 'order.updated',
  event: NftUpdatedEvent | OrderUpdatedEvent,
  userId?: string,
): void {
  publishedEvents.push({ eventName, event, userId });
  if (publishedEvents.length > MAX_PUBLISHED_EVENTS) publishedEvents.shift();
  publishSocketEvent(eventName, event, userId);
}

/** Reenvia um evento já publicado, com o mesmo `eventId` e versão. Retorna `false` se não existir. */
export function replayMarketplaceEvent(eventId: string) {
  const published = publishedEvents.find(({ event }) => event.eventId === eventId);
  if (!published) return false;
  publishSocketEvent(published.eventName, published.event, published.userId);
  return true;
}

function publishSocketEvent(
  eventName: string,
  event: unknown,
  userId?: string,
) {
  const packet = `42${JSON.stringify([eventName, event])}`;

  for (const session of sessions.values()) {
    if (userId === undefined || session.userId === userId) enqueue(session, packet);
  }
}

function getSessionOwner(request: Request, cookies: Record<string, string> = {}) {
  if (cookies.kurio_session) return getSessionOwnerByToken(cookies.kurio_session);
  const cookie = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('kurio_session='));
  if (!cookie) return null;

  try {
    const token = decodeURIComponent(cookie.slice('kurio_session='.length));
    return getSessionOwnerByToken(token);
  } catch {
    return null;
  }
}

function getSessionOwnerByToken(token: string) {
  const session = readMarketplaceState().sessions[token];
  return session && session.expiresAt > Date.now() ? session.userId : null;
}

export function resetSocketSessions() {
  for (const session of sessions.values()) {
    for (const waiter of session.waiters) waiter('1');
  }
  sessions.clear();
}

export const socketIoPollingHandlers = [
  http.get('*/socket.io/', async ({ request, cookies }) => {
    const url = new URL(request.url);

    if (url.searchParams.get('EIO') !== '4' || url.searchParams.get('transport') !== 'polling') {
      return textResponse('Unsupported Engine.IO polling request', 400);
    }

    const sid = url.searchParams.get('sid');

    if (!sid) {
      const newSid = crypto.randomUUID();
      sessions.set(newSid, {
        packets: [],
        waiters: new Set(),
        userId: getSessionOwner(request, cookies),
      });

      return textResponse(
        `0${JSON.stringify({
          sid: newSid,
          upgrades: [],
          pingInterval: 10_000,
          pingTimeout: 20_000,
          maxPayload: 1_000_000,
        })}`,
      );
    }

    const session = sessions.get(sid);

    if (!session) {
      return textResponse('Unknown session', 400);
    }

    const packet = session.packets.shift() ?? (await waitForPacket(session, request.signal));
    return textResponse(packet);
  }),
  http.post('*/socket.io/', async ({ request }) => {
    const url = new URL(request.url);
    const sid = url.searchParams.get('sid');

    if (url.searchParams.get('EIO') !== '4' || url.searchParams.get('transport') !== 'polling' || !sid) {
      return textResponse('Unknown session', 400);
    }

    const session = sessions.get(sid);

    if (!session) {
      return textResponse('Unknown session', 400);
    }

    const packets = parsePacketPayload(await request.text());

    for (const packet of packets) {
      if (packet === '40') {
        enqueue(session, `40${JSON.stringify({ sid })}`);
      } else if (packet.startsWith('40')) {
        let auth: unknown;
        try {
          auth = JSON.parse(packet.slice(2));
        } catch {
          auth = undefined;
        }
        if (typeof auth === 'object' && auth !== null
          && 'token' in auth && typeof auth.token === 'string') {
          session.userId = getSessionOwnerByToken(auth.token);
        }
        enqueue(session, `40${JSON.stringify({ sid })}`);
      } else if (packet === '41' || packet === '1') {
        for (const waiter of session.waiters) waiter('1');
        sessions.delete(sid);
      }
    }

    return textResponse('ok');
  }),
];
