import type { FoundationState, FoundationUpdatedEvent } from '@/domain/contracts';

let state: FoundationState = {
  id: 'stage-one',
  status: 'ready',
  version: 0,
};

export function readFoundationState(): FoundationState {
  return { ...state };
}

export function resetFoundationState(): FoundationState {
  state = { id: 'stage-one', status: 'ready', version: 0 };
  return readFoundationState();
}

export function updateFoundationState(): FoundationUpdatedEvent {
  state = {
    id: 'stage-one',
    status: state.status === 'ready' ? 'updated' : 'ready',
    version: state.version + 1,
  };

  return {
    eventId: crypto.randomUUID(),
    version: state.version,
    resource: readFoundationState(),
    occurredAt: new Date().toISOString(),
  };
}
