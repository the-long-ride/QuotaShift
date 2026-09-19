import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

export function createPollingHookHarness(options = {}) {
  let currentTime = 1_000_000;
  let nextTimerId = 1;
  const timers = new Map();
  const invocations = new Map();
  const eventListeners = new Map();
  const ipcHandlers = new Map(Object.entries(options.ipcHandlers || {}));

  const fakeSetTimeout = (cb, delay = 0) => {
    const id = nextTimerId++;
    timers.set(id, {
      id,
      dueTime: currentTime + Math.max(0, delay),
      callback: cb,
      cleared: false,
    });
    return id;
  };

  const fakeClearTimeout = (id) => {
    const t = timers.get(id);
    if (t) {
      t.cleared = true;
      timers.delete(id);
    }
  };

  const fakeSetInterval = (cb, delay = 0) => {
    const id = nextTimerId++;
    const interval = Math.max(1, delay);
    timers.set(id, {
      id,
      dueTime: currentTime + interval,
      callback: cb,
      interval,
      cleared: false,
    });
    return id;
  };

  const fakeClearInterval = (id) => {
    fakeClearTimeout(id);
  };

  const mockInvoke = async (cmd, args) => {
    if (!invocations.has(cmd)) invocations.set(cmd, []);
    invocations.get(cmd).push(args);

    if (ipcHandlers.has(cmd)) {
      const handler = ipcHandlers.get(cmd);
      return await handler(args);
    }

    if (cmd === "get_claude_account_statuses") {
      // Default: return fresh array each time
      return [];
    }
    if (cmd === "get_codex_router_status") {
      return {
        running: true,
        healthy: true,
        routedRequestCount: 0,
        lastRoutedAccountId: null,
        lastRoutedModel: null,
      };
    }
    if (
      cmd === "set_poll_interval" ||
      cmd === "configure_codex_router" ||
      cmd === "start_codex_router" ||
      cmd === "stop_codex_router"
    ) {
      return {};
    }
    return null;
  };

  const mockListen = async (event, callback) => {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set());
    eventListeners.get(event).add(callback);
    return () => {
      eventListeners.get(event)?.delete(callback);
    };
  };

  const emitEvent = async (event, payload) => {
    const listeners = eventListeners.get(event);
    if (listeners) {
      for (const cb of Array.from(listeners)) {
        cb({ payload, event });
      }
    }
  };

  const mockLocalStorage = new Map();
  const storageFacade = {
    getItem: (k) => (mockLocalStorage.has(k) ? mockLocalStorage.get(k) : null),
    setItem: (k, v) => mockLocalStorage.set(k, String(v)),
    removeItem: (k) => mockLocalStorage.delete(k),
    clear: () => mockLocalStorage.clear(),
  };

  const mockWindow = {
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    setInterval: fakeSetInterval,
    clearInterval: fakeClearInterval,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: storageFacade,
  };

  let hooks = [];
  let hookIndex = 0;
  let isRerenderScheduled = false;
  let currentProps = options.initialProps;
  let currentResult = null;
  let renderFn = options.render || null;
  let mounted = false;

  const scheduleRerender = () => {
    isRerenderScheduled = true;
  };

  const reactMock = {
    useState(initial) {
      const idx = hookIndex++;
      if (hooks[idx] === undefined) {
        const val = typeof initial === "function" ? initial() : initial;
        hooks[idx] = {
          type: "state",
          value: val,
        };
      }
      const record = hooks[idx];
      const setter = (nextVal) => {
        const next = typeof nextVal === "function" ? nextVal(record.value) : nextVal;
        if (!Object.is(record.value, next)) {
          record.value = next;
          scheduleRerender();
        }
      };
      return [record.value, setter];
    },

    useRef(initial) {
      const idx = hookIndex++;
      if (hooks[idx] === undefined) {
        hooks[idx] = {
          type: "ref",
          value: { current: initial },
        };
      }
      return hooks[idx].value;
    },

    useCallback(fn, deps) {
      const idx = hookIndex++;
      if (hooks[idx] === undefined) {
        hooks[idx] = {
          type: "callback",
          fn,
          deps,
        };
        return fn;
      }
      const prev = hooks[idx];
      const changed =
        !prev.deps ||
        !deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        prev.fn = fn;
        prev.deps = deps;
      }
      return prev.fn;
    },

    useMemo(fn, deps) {
      const idx = hookIndex++;
      if (hooks[idx] === undefined) {
        hooks[idx] = {
          type: "memo",
          value: fn(),
          deps,
        };
        return hooks[idx].value;
      }
      const prev = hooks[idx];
      const changed =
        !prev.deps ||
        !deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        prev.value = fn();
        prev.deps = deps;
      }
      return prev.value;
    },

    useEffect(effect, deps) {
      const idx = hookIndex++;
      if (hooks[idx] === undefined) {
        hooks[idx] = {
          type: "effect",
          effect,
          deps,
          cleanup: undefined,
          pending: true,
        };
        return;
      }
      const prev = hooks[idx];
      const changed =
        !prev.deps ||
        !deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        prev.effect = effect;
        prev.deps = deps;
        prev.pending = true;
      }
    },

    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
    Fragment: Symbol.for("react.fragment"),
  };

  const runCommitPhase = () => {
    for (const hook of hooks) {
      if (hook && hook.type === "effect" && hook.pending) {
        if (typeof hook.cleanup === "function") {
          try {
            hook.cleanup();
          } catch (e) {
            console.error("Effect cleanup error:", e);
          }
          hook.cleanup = undefined;
        }
        try {
          const cleanup = hook.effect();
          if (typeof cleanup === "function") {
            hook.cleanup = cleanup;
          }
        } catch (e) {
          console.error("Effect execution error:", e);
        }
        hook.pending = false;
      }
    }
  };

  const drainMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

  const flush = async () => {
    let renders = 0;
    while (true) {
      await drainMicrotasks();
      if (isRerenderScheduled) {
        isRerenderScheduled = false;
        renders++;
        if (renders > 25) {
          throw new Error("Exceeded bounded flush limit (non-settling render loop detected)");
        }
        hookIndex = 0;
        currentResult = renderFn(currentProps);
        runCommitPhase();
        continue;
      }
      await drainMicrotasks();
      if (!isRerenderScheduled) {
        break;
      }
    }
    return currentResult;
  };

  const mount = async (props = currentProps) => {
    mounted = true;
    currentProps = props;
    hookIndex = 0;
    currentResult = renderFn(currentProps);
    runCommitPhase();
    await flush();
    return currentResult;
  };

  const rerender = async (newProps = currentProps) => {
    if (!mounted) throw new Error("Harness not mounted");
    currentProps = newProps;
    hookIndex = 0;
    currentResult = renderFn(currentProps);
    runCommitPhase();
    await flush();
    return currentResult;
  };

  const advanceBy = async (ms) => {
    const target = currentTime + ms;
    while (true) {
      let earliest = null;
      for (const t of timers.values()) {
        if (!t.cleared && t.dueTime <= target) {
          if (
            !earliest ||
            t.dueTime < earliest.dueTime ||
            (t.dueTime === earliest.dueTime && t.id < earliest.id)
          ) {
            earliest = t;
          }
        }
      }
      if (!earliest) {
        currentTime = target;
        break;
      }
      currentTime = earliest.dueTime;
      if (earliest.interval) {
        earliest.dueTime = currentTime + earliest.interval;
      } else {
        earliest.cleared = true;
        timers.delete(earliest.id);
      }
      earliest.callback();
      await flush();
    }
  };

  const unmount = () => {
    mounted = false;
    for (const hook of hooks) {
      if (hook && hook.type === "effect" && typeof hook.cleanup === "function") {
        try {
          hook.cleanup();
        } catch (e) {}
        hook.cleanup = undefined;
      }
    }
    timers.clear();
    eventListeners.clear();
  };

  const countInvocations = (cmd) => (invocations.get(cmd) || []).length;
  const getInvocations = (cmd) => invocations.get(cmd) || [];
  const resetInvocations = (cmd) => {
    if (cmd) invocations.delete(cmd);
    else invocations.clear();
  };

  const transpileAndLoadModule = (relPath, customMocks = {}) => {
    const fullPath = path.resolve(projectRoot, relPath);
    const sourceCode = fs.readFileSync(fullPath, "utf8");
    const transpiled = ts.transpileModule(sourceCode, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: fullPath,
    });

    const moduleObj = { exports: {} };
    const customRequire = (specifier) => {
      if (customMocks[specifier]) return customMocks[specifier];
      if (specifier === "react") return reactMock;
      if (specifier === "react/jsx-runtime") {
        return {
          jsx: () => null,
          jsxs: () => null,
          Fragment: reactMock.Fragment,
        };
      }
      if (specifier === "@tauri-apps/api/core") {
        return { invoke: mockInvoke };
      }
      if (specifier === "@tauri-apps/api/event") {
        return { listen: mockListen, emit: emitEvent };
      }
      if (specifier === "@tauri-apps/api/window") {
        return {
          getCurrentWindow: () => ({
            onFocusChanged: () => Promise.resolve(() => {}),
          }),
        };
      }
      const resolved = path.resolve(path.dirname(fullPath), specifier).replace(/\\/g, "/");
      for (const [k, v] of Object.entries(customMocks)) {
        const normK = k.replace(/\\/g, "/");
        if (normK === specifier || resolved.endsWith(normK.replace(/^\.\//, ""))) {
          return v;
        }
      }
      // Default empty module
      return {};
    };

    const mockDate = class extends Date {
      constructor(...args) {
        if (args.length === 0) super(currentTime);
        else super(...args);
      }
      static now() {
        return currentTime;
      }
    };

    const fn = new Function(
      "exports",
      "require",
      "module",
      "__filename",
      "__dirname",
      "window",
      "localStorage",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      transpiled.outputText,
    );
    fn(
      moduleObj.exports,
      customRequire,
      moduleObj,
      fullPath,
      path.dirname(fullPath),
      mockWindow,
      storageFacade,
      fakeSetTimeout,
      fakeClearTimeout,
      fakeSetInterval,
      fakeClearInterval,
      mockDate,
    );
    return moduleObj.exports;
  };

  const setRender = (fn) => {
    renderFn = fn;
  };

  return {
    mount,
    rerender,
    flush,
    advanceBy,
    unmount,
    countInvocations,
    getInvocations,
    resetInvocations,
    setIpcHandler: (cmd, handler) => ipcHandlers.set(cmd, handler),
    emitEvent,
    transpileAndLoadModule,
    reactMock,
    setRender,
    window: mockWindow,
    storage: storageFacade,
  };
}
