import { handleDemoAgentApiInvoke } from "./demo-agent-api-shim";

export type UnlistenFn = () => void;

export interface Event<T = unknown> {
  event: string;
  id: number;
  payload: T;
}

export type EventCallback<T = unknown> = (event: Event<T>) => void;

let nextEventId = 1;
const listeners = new Map<string, Set<EventCallback<unknown>>>();

export async function listen<T = unknown>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  let bucket = listeners.get(event);
  if (!bucket) {
    bucket = new Set();
    listeners.set(event, bucket);
  }
  const wrapped = handler as EventCallback<unknown>;
  bucket.add(wrapped);
  return () => {
    bucket?.delete(wrapped);
  };
}

export async function once<T = unknown>(
  event: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  let unlisten: UnlistenFn = () => {};
  unlisten = await listen<T>(event, (payload) => {
    unlisten();
    handler(payload);
  });
  return unlisten;
}

export async function emit<T = unknown>(event: string, payload?: T): Promise<void> {
  const bucket = listeners.get(event);
  if (!bucket) return;
  const evt: Event<unknown> = { event, id: nextEventId++, payload };
  for (const fn of Array.from(bucket)) {
    fn(evt);
  }
}

export async function emitTo<T = unknown>(
  _target: string,
  event: string,
  payload?: T,
): Promise<void> {
  await emit(event, payload);
}

const INVOKE_DEFAULTS: Record<string, () => unknown> = {
  get_codex_router_status: () => ({
    running: false,
    host: "127.0.0.1",
    port: 0,
    active_account_id: null,
    active_account_email: null,
  }),
  restart_codex_router: () => ({
    running: false,
    host: "127.0.0.1",
    port: 0,
    active_account_id: null,
    active_account_email: null,
  }),
  get_codex_router_key: () => "qs-demo-router-key",
  get_codex_router_logs: () => [
    "[demo] Codex model-pool router preview mode (local backend disabled in browser)",
  ],
  get_codex_router_telemetry: () => ({
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    recentEvents: [],
  }),
  get_session_logs_revision: () => 1,
  get_session_logs: () => [],
  get_siwc_models: () => [],
  update_claude_profiles_routing_key: () => [],
  list_siwc_accounts: () => [],
  get_siwc_sign_in_status: () => ({ in_progress: false, state: "idle" }),
  get_claude_account_statuses: () => [],
  get_claude_connect_targets: () => ({ installations: [], profiles: [] }),
  get_claude_gateway_status: () => ({
    running: false,
    port: 0,
    baseUrl: "",
    connections: [],
  }),
  get_claude_reset_credits: () => ({}),
  get_frontend_logs: () => "",
  read_app_logs: () => "",
};

export async function invoke<T = unknown>(
  cmd: string,
  _args?: Record<string, unknown>,
): Promise<T> {
  const agentApiResult = handleDemoAgentApiInvoke(cmd, _args);
  if (agentApiResult.handled) {
    return agentApiResult.value as T;
  }
  const resolver = INVOKE_DEFAULTS[cmd];
  if (resolver) {
    return resolver() as T;
  }
  if (cmd.startsWith("list_")) {
    return [] as T;
  }
  return null as T;
}

export const getVersion = async (): Promise<string> => "1.3.2";
export const getName = async (): Promise<string> => "QuotaShift";

export class LogicalSize {
  readonly type = "Logical";
  constructor(
    public width: number,
    public height: number,
  ) {}
}

export class LogicalPosition {
  readonly type = "Logical";
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export class PhysicalPosition {
  readonly type = "Physical";
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export class PhysicalSize {
  readonly type = "Physical";
  constructor(
    public width: number,
    public height: number,
  ) {}
}

export interface Monitor {
  name: string | null;
  size: PhysicalSize;
  position: PhysicalPosition;
  workArea: { size: PhysicalSize; position: PhysicalPosition };
  scaleFactor: number;
}

const PRIMARY_MONITOR: Monitor = {
  name: "Primary",
  size: new PhysicalSize(1920, 1080),
  position: new PhysicalPosition(0, 0),
  workArea: {
    size: new PhysicalSize(1920, 1040),
    position: new PhysicalPosition(0, 0),
  },
  scaleFactor: 1,
};

export const currentMonitor = async (): Promise<Monitor | null> => PRIMARY_MONITOR;
export const primaryMonitor = async (): Promise<Monitor | null> => PRIMARY_MONITOR;
export const monitorFromPoint = async (_x: number, _y: number): Promise<Monitor | null> =>
  PRIMARY_MONITOR;
export const availableMonitors = async (): Promise<Monitor[]> => [PRIMARY_MONITOR];

const noopAsync = async (): Promise<void> => {};
const noopUnlisten = async (): Promise<UnlistenFn> => () => {};

export class Window {
  constructor(public readonly label = "main") {}
  setPosition = async (_pos: LogicalPosition | PhysicalPosition): Promise<void> => {};
  setSize = async (_size: LogicalSize | PhysicalSize): Promise<void> => {};
  outerPosition = async (): Promise<PhysicalPosition> => new PhysicalPosition(0, 0);
  outerSize = async (): Promise<PhysicalSize> => new PhysicalSize(1280, 800);
  innerSize = async (): Promise<PhysicalSize> => new PhysicalSize(1280, 800);
  scaleFactor = async (): Promise<number> => 1;
  isMaximized = async (): Promise<boolean> => false;
  minimize = noopAsync;
  toggleMaximize = noopAsync;
  close = noopAsync;
  hide = noopAsync;
  show = noopAsync;
  setFocus = noopAsync;
  startDragging = noopAsync;
  startResizeDragging = async (_direction?: string): Promise<void> => {};
  onMoved = noopUnlisten;
  onResized = noopUnlisten;
  onScaleChanged = noopUnlisten;
  onFocusChanged = noopUnlisten;
  setZoom = async (_factor: number): Promise<void> => {};
}

export class WebviewWindow extends Window {}

const mainWindow = new WebviewWindow("main");

export const getCurrentWindow = (): Window => mainWindow;
export const getCurrentWebviewWindow = (): WebviewWindow => mainWindow;
export const getCurrentWebview = (): WebviewWindow => mainWindow;
