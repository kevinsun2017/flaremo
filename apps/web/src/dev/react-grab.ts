/**
 * React Grab (https://github.com/aidenybai/react-grab) — a dev-only element
 * picker. Hover a rendered element, copy, and paste into an agent to hand it
 * the exact component and source location instead of describing the spot.
 *
 * Reachable only from the `pnpm dev:hot` / Vite dev-server path. The gate that
 * keeps it out of production lives at the import site in `main.tsx`, where
 * `import.meta.env.DEV` lets the bundler drop this module and everything it
 * imports; the check here is the second layer, and the one the unit test
 * pins. Server-rendered surfaces (share pages, article pages) are separate
 * documents the Worker renders, so grabbing is limited to the app shell.
 *
 * Two deliberate departures from the README's one-liner:
 *
 * 1. `init` is called explicitly with `telemetry: false`. The package's own
 *    module entry auto-initialises with telemetry on, which sends an anonymous
 *    version check to react-grab.com. This project's posture is that the app
 *    talks to no third party unless it was configured to, so the dynamic
 *    import is preceded by the package's `__REACT_GRAB_DISABLED__` switch and
 *    initialised here instead.
 * 2. Re-initialisation is guarded. Vite re-executes this module on hot
 *    updates, and the package exposes no cheaper "already mounted" test than
 *    the global it installs.
 *
 * Known limitation: the component stack names files by basename only
 * ("input.tsx"), because Vite's dev sourcemaps publish bare filenames in
 * `sources` — the picker reports faithfully what the map says. Component
 * names plus line/column and the CSS selector disambiguate in practice.
 */

/** The globals the package installs on `window` (see its Window type). */
export type ReactGrabHost = {
  __REACT_GRAB__?: unknown;
  __REACT_GRAB_DISABLED__?: boolean;
};

/**
 * The slice of the package this module drives, derived from its own types so a
 * signature change upstream fails `tsc` here instead of drifting silently.
 * `init` alone is not enough: it builds the picker and returns the API, and
 * only `setGlobalApi` publishes it on `window.__REACT_GRAB__`.
 */
export type ReactGrabModule = Pick<
  typeof import("react-grab"),
  "init" | "setGlobalApi"
>;

export type ReactGrabRuntime = {
  isDevelopment: boolean;
  /** Absent outside a browser. */
  host?: ReactGrabHost;
};

function getReactGrabRuntime(): ReactGrabRuntime {
  return {
    isDevelopment: import.meta.env.DEV,
    host: typeof window !== "undefined" ? window : undefined,
  };
}

/**
 * Install React Grab when running the dev server. Returns whether an install
 * was attempted, which is what the unit test asserts on; the import itself is
 * fire-and-forget so a failure to load a development convenience can never
 * break the app.
 */
export function installReactGrab(
  runtime: ReactGrabRuntime = getReactGrabRuntime(),
  load: () => Promise<ReactGrabModule> = () => import("react-grab"),
): boolean {
  const { host } = runtime;
  if (!runtime.isDevelopment || !host) return false;
  if (host.__REACT_GRAB__) return false;

  // Read by the package's module entry, which otherwise self-initialises with
  // telemetry enabled before this module's own `init` call runs.
  host.__REACT_GRAB_DISABLED__ = true;

  void load()
    .then(({ init, setGlobalApi }) => {
      // Two steps, exactly as the package's own entry does it: `init` builds
      // the picker and returns its API, `setGlobalApi` publishes it.
      setGlobalApi(init({ telemetry: false }));
    })
    .catch(() => undefined);

  return true;
}
