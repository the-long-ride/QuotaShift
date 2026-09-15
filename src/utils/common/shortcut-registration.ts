import type { ShortcutPreferences } from "./shortcuts";

export interface ShortcutRegistrationPort {
  register(shortcut: string, onPressed: () => void): Promise<void>;
  unregister(shortcuts: string | string[]): Promise<void>;
}

export interface ShortcutActionHandlers {
  onToggleOverlay: () => void;
  onRefreshAccount: () => void;
}

export interface ShortcutRegistrationController {
  replace(prefs: ShortcutPreferences): Promise<void>;
  dispose(): Promise<void>;
}

let sharedShortcutOperationQueue: Promise<void> = Promise.resolve();

function enqueueShortcutOperation(task: () => Promise<void>): Promise<void> {
  const next = sharedShortcutOperationQueue.catch(() => {}).then(task);
  sharedShortcutOperationQueue = next.catch(() => {});
  return next;
}

export function createShortcutRegistrationController(
  port: ShortcutRegistrationPort,
  handlers: ShortcutActionHandlers,
): ShortcutRegistrationController {
  let activeBindings = new Map<string, () => void>();
  const registeredKeys = new Set<string>();
  let disposed = false;
  let revision = 0;

  const unregisterTracked = async () => {
    for (const shortcut of [...registeredKeys]) {
      try {
        await port.unregister(shortcut);
        registeredKeys.delete(shortcut);
      } catch (error) {
        console.error("Failed to unregister shortcut:", shortcut, error);
      }
    }
  };

  const registerDesired = async (desired: Map<string, () => void>, requestedRevision: number) => {
    for (const shortcut of desired.keys()) {
      if (disposed || requestedRevision !== revision) return;
      if (registeredKeys.has(shortcut)) continue;

      try {
        await port.register(shortcut, () => {
          if (disposed) return;
          activeBindings.get(shortcut)?.();
        });
        registeredKeys.add(shortcut);

        if (disposed || requestedRevision !== revision || !activeBindings.has(shortcut)) {
          try {
            await port.unregister(shortcut);
            registeredKeys.delete(shortcut);
          } catch (error) {
            console.error("Failed to unregister stale shortcut:", shortcut, error);
          }
        }
      } catch (error) {
        console.error("Failed to register shortcut:", shortcut, error);
      }
    }
  };

  return {
    replace(prefs) {
      if (disposed) return Promise.resolve();

      revision += 1;
      const requestedRevision = revision;
      const desired = new Map<string, () => void>();
      if (prefs.toggleOverlay && prefs.toggleOverlayEnabled !== false) {
        desired.set(prefs.toggleOverlay, handlers.onToggleOverlay);
      }
      if (prefs.refreshAccount && prefs.refreshAccountEnabled !== false) {
        desired.set(prefs.refreshAccount, handlers.onRefreshAccount);
      }

      // Update dispatch synchronously so an old OS registration becomes inert immediately.
      activeBindings = desired;

      return enqueueShortcutOperation(async () => {
        await unregisterTracked();
        if (disposed || requestedRevision !== revision) return;
        await registerDesired(desired, requestedRevision);
      });
    },

    dispose() {
      if (!disposed) {
        disposed = true;
        revision += 1;
        activeBindings = new Map();
      }
      return enqueueShortcutOperation(unregisterTracked);
    },
  };
}
