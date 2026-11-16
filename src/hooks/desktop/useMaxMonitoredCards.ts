import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  MAX_MONITORED_CARDS_EVENT,
  MAX_MONITORED_CARDS_KEY,
  MAX_MONITORED_CARDS_TAURI_EVENT,
  loadMaxMonitoredCards,
  normalizeMaxMonitoredCards,
} from "../../utils/common/settings/max-monitored-cards";

/** Subscribes to the configured max simultaneous monitored cards count across windows. */
export function useMaxMonitoredCards(): number {
  const [maxCards, setMaxCards] = useState<number>(() => loadMaxMonitoredCards());

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const sync = (next?: unknown) => {
      setMaxCards(next === undefined ? loadMaxMonitoredCards() : normalizeMaxMonitoredCards(next));
    };

    const onLocalEvent = (event: Event) => {
      sync((event as CustomEvent<number>).detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MAX_MONITORED_CARDS_KEY) sync();
    };
    const onFocus = () => sync();

    window.addEventListener(MAX_MONITORED_CARDS_EVENT, onLocalEvent);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    void listen<number>(MAX_MONITORED_CARDS_TAURI_EVENT, (event) => {
      sync(event.payload);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener(MAX_MONITORED_CARDS_EVENT, onLocalEvent);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return maxCards;
}
