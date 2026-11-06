import type { EventEnvelope } from '@/domain/contracts';

/**
 * Aceita cada evento uma única vez e somente se a versão for maior que a última aplicada para
 * o mesmo recurso. Eventos duplicados (mesmo `eventId`) ou antigos (versão ≤ atual) são
 * descartados. A memória de `eventId` é limitada para conexões longas.
 */
export function createEventGuard(maxRememberedEvents = 500) {
  const seenEventIds = new Set<string>();
  const versions = new Map<string, number>();

  return {
    accept(event: EventEnvelope<{ id: string }>) {
      if (seenEventIds.has(event.eventId)) return false;
      seenEventIds.add(event.eventId);
      if (seenEventIds.size > maxRememberedEvents) {
        const oldest = seenEventIds.values().next().value;
        if (oldest !== undefined) seenEventIds.delete(oldest);
      }

      const resourceId = event.resource.id;
      if (!Number.isSafeInteger(event.version) || event.version <= (versions.get(resourceId) ?? 0)) return false;
      versions.set(resourceId, event.version);
      return true;
    },
  };
}
