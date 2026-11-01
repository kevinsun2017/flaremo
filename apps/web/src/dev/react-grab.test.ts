import { describe, expect, it, vi } from "vitest";
import { installReactGrab, type ReactGrabModule } from "./react-grab";

/**
 * `ReactGrabModule` is derived from the real package, so a faithful double
 * would need a full 19-method API. The double only has to be the same object
 * identity that `init` returns and `setGlobalApi` receives, so the cast is
 * confined to these two fields.
 */
function fakeModule() {
  const api = { toggle: vi.fn() };
  const init = vi.fn(() => api) as unknown as ReactGrabModule["init"];
  const setGlobalApi = vi.fn() as unknown as ReactGrabModule["setGlobalApi"];
  const module: ReactGrabModule = { init, setGlobalApi };
  return { api, init, setGlobalApi, load: () => Promise.resolve(module) };
}

describe("installReactGrab", () => {
  it("initialises with telemetry disabled and publishes the API", async () => {
    const { api, init, setGlobalApi, load } = fakeModule();
    const host = {};
    expect(installReactGrab({ isDevelopment: true, host }, load)).toBe(true);
    await vi.waitFor(() => expect(init).toHaveBeenCalledTimes(1));
    // The package self-initialises with telemetry on when its module entry is
    // evaluated, so the flag must be set before the import resolves.
    expect(host).toEqual({ __REACT_GRAB_DISABLED__: true });
    expect(init).toHaveBeenCalledWith({ telemetry: false });
    // `init` alone leaves window.__REACT_GRAB__ undefined, so the picker would
    // be mounted but not addressable.
    expect(setGlobalApi).toHaveBeenCalledWith(api);
  });

  it("stays out of production builds", () => {
    const { init, load } = fakeModule();
    expect(installReactGrab({ isDevelopment: false, host: {} }, load)).toBe(
      false,
    );
    expect(init).not.toHaveBeenCalled();
  });

  it("stays out of non-browser runtimes", () => {
    const { init, load } = fakeModule();
    expect(installReactGrab({ isDevelopment: true }, load)).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("does not re-initialise when a hot update re-runs the module", () => {
    const { init, load } = fakeModule();
    const runtime = { isDevelopment: true, host: { __REACT_GRAB__: {} } };
    expect(installReactGrab(runtime, load)).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });

  it("swallows a load failure so the app still boots", async () => {
    const load = () => Promise.reject(new Error("offline"));
    expect(installReactGrab({ isDevelopment: true, host: {} }, load)).toBe(
      true,
    );
    // No unhandled rejection reaches the test runner.
    await Promise.resolve();
  });
});
