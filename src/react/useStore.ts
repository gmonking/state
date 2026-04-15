import { useSyncExternalStore } from "use-sync-external-store/shim";
import type { StoreLike } from "../core/create";

export function useStore<T>(store: StoreLike<T>) {
  const value = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store._getServerSnapshot,
  );

  return [value, store.setValue] as const;
}