import { useSyncExternalStore } from 'react';

export interface RealtimeNotice {
  id: string;
  message: string;
}

/** Avisos de mudanças recebidas em tempo real (fila pequena, exibida pelo shell). */
let notices: RealtimeNotice[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function dismissRealtimeNotice(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  notices = notices.filter((notice) => notice.id !== id);
  emit();
}

export function pushRealtimeNotice(message: string, ttlMs = 10_000) {
  const id = crypto.randomUUID();
  notices = [...notices.slice(-2), { id, message }];
  timers.set(id, setTimeout(() => dismissRealtimeNotice(id), ttlMs));
  emit();
}

export function clearRealtimeNotices() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  notices = [];
  emit();
}

export function useRealtimeNotices() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notices,
  );
}
