import {
  CODEX_ACTIVE_ID_KEY,
  CODEX_ACTIVE_POOL_ID_KEY,
  CODEX_POOL_ROUTING_KEY,
} from "../common/app-constants.js";

type StorageWriter = Pick<Storage, "setItem" | "removeItem">;
type RoutingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function persistCodexActiveAccount(storage: StorageWriter, accountId: string): void {
  storage.setItem(CODEX_ACTIVE_ID_KEY, accountId);
}

export function persistCodexActivePool(storage: StorageWriter, poolId: string): void {
  storage.setItem(CODEX_ACTIVE_POOL_ID_KEY, poolId);
}

export function clearCodexActivePool(storage: StorageWriter): void {
  storage.removeItem(CODEX_ACTIVE_POOL_ID_KEY);
}

export function restoreCodexPoolRoutingSelection(
  storage: RoutingStorage,
  pools: Array<{ id: string }>,
): {
  activePoolId: string | null;
  shouldRestoreRouting: boolean;
  disabledMissingPool: boolean;
} {
  const storedPoolId = storage.getItem(CODEX_ACTIVE_POOL_ID_KEY);
  const activePoolId =
    storedPoolId && pools.some((pool) => pool.id === storedPoolId) ? storedPoolId : null;
  if (storedPoolId && !activePoolId) storage.removeItem(CODEX_ACTIVE_POOL_ID_KEY);

  const routingRequested = storage.getItem(CODEX_POOL_ROUTING_KEY) === "true";
  const shouldRestoreRouting = routingRequested && activePoolId !== null;
  if (routingRequested && !shouldRestoreRouting) storage.setItem(CODEX_POOL_ROUTING_KEY, "false");

  return {
    activePoolId,
    shouldRestoreRouting,
    disabledMissingPool: routingRequested && activePoolId === null,
  };
}
