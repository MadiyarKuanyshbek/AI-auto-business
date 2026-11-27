import { useSyncExternalStore } from "react";

// Общий журнал событий приложения: что делает радар, связь компьютера, подключение. Показывается в реальном времени.
export type LiveEvent = { t: number; text: string; real: boolean };

let events: LiveEvent[] = [];
const listeners = new Set<() => void>();

export function logEvent(text: string, real = true): void {
  events = [...events, { t: Date.now(), text, real }].slice(-60);
  listeners.forEach((l) => l());
}

export function useLiveEvents(): LiveEvent[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => events,
    () => events,
  );
}
