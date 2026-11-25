export async function openUrl(url: string): Promise<void> {
  if (/^https?:\/\//i.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function openPath(_path: string): Promise<void> {}

export async function revealItemInDir(_path: string): Promise<void> {}

export class Store {
  private readonly data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async save(): Promise<void> {}

  async clear(): Promise<void> {
    this.data.clear();
  }
}

const stores = new Map<string, Store>();

export async function load(path: string): Promise<Store> {
  let store = stores.get(path);
  if (!store) {
    store = new Store();
    stores.set(path, store);
  }
  return store;
}

export async function isRegistered(_shortcut: string): Promise<boolean> {
  return false;
}

export async function register(_shortcut: string, _handler?: () => void): Promise<void> {}

export async function unregister(_shortcut: string): Promise<void> {}

export async function unregisterAll(): Promise<void> {}

export async function isPermissionGranted(): Promise<boolean> {
  return false;
}

export async function requestPermission(): Promise<"granted" | "denied" | "default"> {
  return "denied";
}

export function sendNotification(_options: string | Record<string, unknown>): void {}
