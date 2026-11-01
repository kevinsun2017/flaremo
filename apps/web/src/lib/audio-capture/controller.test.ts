import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureController, type CaptureDependencies } from "./controller";

class Socket {
  readyState = 1;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  message(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
function setup() {
  vi.useFakeTimers();
  let frame!: (data: ArrayBuffer) => void;
  const mic = { stop: vi.fn(async () => {}), dispose: vi.fn() };
  const sockets: Socket[] = [];
  const deps: CaptureDependencies = {
    microphone: vi.fn(async (onFrame) => {
      frame = onFrame;
      return mic;
    }),
    status: vi.fn(async () => ({ available: true })),
    socket: () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
  };
  const controller = new CaptureController(deps);
  return {
    controller,
    deps,
    sockets,
    mic,
    // Filled so tests can tell real audio apart from zero-filled pause
    // silence on the wire.
    frame: () => {
      const buffer = new ArrayBuffer(3200);
      new Uint8Array(buffer).fill(7);
      frame(buffer);
    },
  };
}
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const sentence = (text: string, final = true) => ({
  type: "sentence",
  id: "sentence-1",
  text,
  final,
  receivedAt: 1000,
});
describe("voice capture controller", () => {
  it.each([
    ["NotAllowedError", "permissionDenied"],
    ["NotFoundError", "noMicrophone"],
    ["NotReadableError", "microphoneBusy"],
  ] as const)("maps %s without opening a socket", async (name, expected) => {
    const s = setup();
    s.deps.microphone = vi.fn(async () => {
      throw new DOMException("microphone failed", name);
    });
    await s.controller.start();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "error",
      error: expected,
      microphoneActive: false,
    });
    expect(s.sockets).toHaveLength(0);
  });
  it("releases the microphone when ASR configuration is unavailable", async () => {
    const s = setup();
    s.deps.status = vi.fn(async () => ({ available: false }));
    await s.controller.start();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "error",
      error: "unavailable",
      microphoneActive: false,
    });
    expect(s.mic.dispose).toHaveBeenCalledOnce();
    expect(s.sockets).toHaveLength(0);
  });
  it("waits for ASR ready, deduplicates finals and receives the last sentence after stop", async () => {
    const s = setup();
    await s.controller.start();
    const socket = s.sockets[0];
    socket.onopen?.();
    s.frame();
    // Pre-ready audio is buffered, not dropped, so nothing is sent yet.
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(
      socket.send.mock.calls.every(([data]) => typeof data === "string"),
    ).toBe(true);
    expect(s.controller.getSnapshot().state).toBe("connecting");
    expect(s.controller.getSnapshot().startedAt).toBeNull();
    socket.message({ type: "ready" });
    expect(s.controller.getSnapshot().startedAt).not.toBeNull();
    s.frame();
    expect(socket.send).toHaveBeenCalledTimes(3); // start + buffered frame + live frame
    socket.message(sentence("part", false));
    expect(s.controller.getSnapshot().partial).toBe("part");
    expect(s.controller.getSnapshot().sentenceVersion).toBe(0);
    await s.controller.stop();
    expect(s.mic.stop).toHaveBeenCalledOnce();
    expect(s.controller.getSnapshot().state).toBe("stopping");
    socket.message(sentence("final"));
    socket.message(sentence("final"));
    socket.message({ type: "finished" });
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      microphoneActive: false,
      partial: "",
      sentenceVersion: 1,
      sentences: [expect.objectContaining({ text: "final" })],
    });
    expect(socket.close).toHaveBeenCalledOnce();
  });
  it("cancels pending microphone permission and disposes a late result", async () => {
    const s = setup();
    let grant!: () => void;
    s.deps.microphone = vi.fn(
      (_frame, signal) =>
        new Promise<typeof s.mic>((resolve) => {
          grant = () => {
            expect(signal.aborted).toBe(true);
            resolve(s.mic);
          };
        }),
    );
    const starting = s.controller.start();
    await s.controller.stop();
    grant();
    await starting;
    expect(s.mic.dispose).toHaveBeenCalledOnce();
    expect(s.sockets).toHaveLength(0);
  });
  it("buffers audio across a reconnect and flushes it to the new session", async () => {
    const s = setup();
    await s.controller.start();
    const first = s.sockets[0];
    first.message({ type: "ready" });
    first.onclose?.();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "reconnecting",
      gap: true,
    });
    s.frame();
    s.frame();
    expect(first.send).toHaveBeenCalledTimes(0); // frames buffered, not dropped
    await vi.advanceTimersByTimeAsync(1000);
    const second = s.sockets[1];
    second.onopen?.();
    second.message({ type: "ready" });
    // Gap frames are replayed into the fresh session before live audio.
    expect(second.send).toHaveBeenCalledTimes(3); // start + 2 buffered frames
    expect(
      second.send.mock.calls
        .slice(1)
        .every(([data]) => data instanceof ArrayBuffer),
    ).toBe(true);
    s.frame();
    expect(second.send).toHaveBeenCalledTimes(4);
  });
  it("drops the oldest buffered frames once the pending cap is exceeded", async () => {
    const s = setup();
    await s.controller.start();
    s.sockets[0].message({ type: "ready" });
    s.sockets[0].onclose?.();
    for (let index = 0; index < 1000; index += 1) s.frame();
    await vi.advanceTimersByTimeAsync(1000);
    const second = s.sockets[1];
    second.onopen?.();
    second.message({ type: "ready" });
    // 1000 × 3200 B = 3.2 MB exceeds the 2 MB cap: oldest frames are trimmed
    // until the pending buffer fits, so only the newest ~2 MB is replayed.
    const replayed = second.send.mock.calls.length;
    expect(replayed).toBeGreaterThan(0);
    expect(replayed * 3200).toBeLessThanOrEqual(2_000_000 + 3200);
  });
  it("pauses by sending silence frames, then resumes with live audio", async () => {
    const s = setup();
    await s.controller.start();
    const socket = s.sockets[0];
    socket.onopen?.();
    socket.message({ type: "ready" });
    s.frame();
    const liveSentences = socket.send.mock.calls.length;
    s.controller.pause();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "paused",
      partial: "",
      microphoneActive: true,
    });
    expect(socket.send).toHaveBeenCalledTimes(liveSentences);
    s.frame();
    const silenced = socket.send.mock.calls.at(-1)?.[0] as ArrayBuffer;
    expect(silenced.byteLength).toBe(3200);
    expect(new Uint8Array(silenced).every((byte) => byte === 0)).toBe(true);
    s.controller.resume();
    expect(s.controller.getSnapshot().state).toBe("recording");
    s.frame();
    const resumed = socket.send.mock.calls.at(-1)?.[0] as ArrayBuffer;
    expect(new Uint8Array(resumed).every((byte) => byte === 7)).toBe(true);
  });
  it("ignores pause while still connecting and never pauses twice", async () => {
    const s = setup();
    await s.controller.start(); // connecting: no ready yet
    s.controller.pause();
    expect(s.controller.getSnapshot().state).toBe("connecting");
    s.sockets[0].onopen?.();
    s.sockets[0].message({ type: "ready" });
    expect(s.controller.getSnapshot().state).toBe("recording");
    s.controller.pause();
    s.controller.pause();
    expect(s.controller.getSnapshot().state).toBe("paused");
    s.controller.resume();
    expect(s.controller.getSnapshot().state).toBe("recording");
    s.controller.resume();
    expect(s.controller.getSnapshot().state).toBe("recording");
  });
  it("stops cleanly from paused and keeps the captured sentences", async () => {
    const s = setup();
    await s.controller.start();
    const socket = s.sockets[0];
    socket.message({ type: "ready" });
    socket.message(sentence("kept while paused"));
    s.controller.pause();
    expect(s.controller.getSnapshot().state).toBe("paused");
    await s.controller.stop();
    socket.message({ type: "finished" });
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      microphoneActive: false,
      sentences: [expect.objectContaining({ text: "kept while paused" })],
    });
  });
  it("keeps a pause across a reconnect and buffers silence for the gap", async () => {
    const s = setup();
    await s.controller.start();
    const first = s.sockets[0];
    first.message({ type: "ready" });
    s.controller.pause();
    first.onclose?.();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "reconnecting",
      gap: true,
      microphoneActive: true,
    });
    s.frame();
    s.frame();
    await vi.advanceTimersByTimeAsync(1000);
    const second = s.sockets[1];
    second.onopen?.();
    second.message({ type: "ready" });
    // The user's pause survives the reconnect; the gap audio was silence, so
    // the timeline stays continuous and no pause speech leaks to the ASR.
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "paused",
      gap: true,
    });
    const replayed = second.send.mock.calls
      .slice(1)
      .map(([data]) => data as ArrayBuffer);
    expect(replayed.length).toBeGreaterThan(0);
    expect(
      replayed.every(
        (buffer) =>
          buffer.byteLength === 3200 &&
          new Uint8Array(buffer).every((byte) => byte === 0),
      ),
    ).toBe(true);
  });
  it("applies the one-hour cap to the whole session including pauses", async () => {
    const s = setup();
    await s.controller.start();
    const socket = s.sockets[0];
    socket.onopen?.();
    socket.message({ type: "ready" });
    s.controller.pause();
    // Mic frames keep arriving while paused (the microphone stays open);
    // pause silence keeps the ASR timeline aligned and the heartbeat fed.
    for (let index = 0; index < 730; index += 1) {
      if (s.controller.getSnapshot().state === "stopping") break;
      s.frame();
      // The server keeps answering heartbeats while nothing is spoken.
      socket.message({ type: "pong" });
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "stopping",
      error: "limitReached",
    });
  });
  it("stops while reconnecting and never opens a second microphone", async () => {
    const s = setup();
    await s.controller.start();
    s.sockets[0].message({ type: "ready" });
    s.sockets[0].onclose?.();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "reconnecting",
      microphoneActive: true,
      gap: true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.sockets).toHaveLength(2);
    await s.controller.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.sockets).toHaveLength(2);
    expect(s.deps.microphone).toHaveBeenCalledOnce();
    expect(s.mic.stop).toHaveBeenCalledOnce();
  });
  it("times out final drain without throwing away captured text", async () => {
    const s = setup();
    await s.controller.start();
    s.sockets[0].message({ type: "ready" });
    s.sockets[0].message(sentence("keep me"));
    await s.controller.stop();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      error: "finishFailed",
      sentences: [expect.objectContaining({ text: "keep me" })],
    });
  });
  it("closes on unmount and provider authorization errors", async () => {
    const s = setup();
    await s.controller.start();
    s.sockets[0].message({
      type: "error",
      code: "SESSION_EXPIRED",
      message: "ended",
    });
    expect(s.mic.dispose).toHaveBeenCalledOnce();
    expect(s.controller.getSnapshot().microphoneActive).toBe(false);
    const next = setup();
    await next.controller.start();
    next.controller.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(next.mic.dispose).toHaveBeenCalledOnce();
    expect(next.sockets).toHaveLength(1);
  });
  it("bounds buffered audio and reconnect attempts", async () => {
    const s = setup();
    await s.controller.start();
    s.sockets[0].message({ type: "ready" });
    s.sockets[0].bufferedAmount = 61_000;
    s.frame();
    expect(s.controller.getSnapshot().state).toBe("reconnecting");
    for (const delay of [1000, 2000, 4000, 8000, 15000, 15000]) {
      await vi.advanceTimersByTimeAsync(delay);
      s.sockets.at(-1)?.onclose?.();
    }
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      error: "connectionFailed",
      microphoneActive: false,
    });
  });

  it("stops immediately for a permanent provider failure", async () => {
    const s = setup();
    await s.controller.start();
    s.sockets[0].message({
      type: "error",
      code: "ASR_UPSTREAM_FAILED",
      message: "Capture interrupted",
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "error",
      error: "connectionFailed",
      microphoneActive: false,
      gap: false,
    });
    expect(s.sockets).toHaveLength(1);
  });
  it("keeps a long transcript ordered, deduplicated, and bounded", async () => {
    const s = setup();
    await s.controller.start();
    const socket = s.sockets[0];
    socket.message({ type: "ready" });
    const sentenceList = s.controller.getSnapshot().sentences;

    for (let index = 0; index < 4000; index += 1) {
      const event = {
        type: "sentence",
        id: `sentence-${index}`,
        text: "x",
        receivedAt: index * 1000,
      };
      socket.message({ ...event, text: `partial-${index}`, final: false });
      socket.message({ ...event, final: true });
      expect(s.controller.getSnapshot().sentences).toBe(sentenceList);
      socket.message({ ...event, final: true });
    }

    const transcript = s.controller.getSnapshot().sentences;
    expect(transcript).toHaveLength(4000);
    expect(transcript[0]?.id).toBe("sentence-0");
    expect(transcript.at(-1)?.id).toBe("sentence-3999");
    expect(s.controller.getSnapshot().partial).toBe("");
    expect(s.controller.getSnapshot().sentenceVersion).toBe(4000);

    socket.message({
      type: "sentence",
      id: "sentence-overflow",
      text: "x",
      final: true,
      receivedAt: 4_000_000,
    });
    await Promise.resolve();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "stopping",
      error: "limitReached",
      microphoneActive: false,
    });
    expect(s.controller.getSnapshot().sentences).toHaveLength(4000);
  });
});

describe("voice capture controller — batch mode", () => {
  function fakeSink() {
    const pushed: ArrayBuffer[] = [];
    return {
      pushed,
      push: vi.fn((frame: ArrayBuffer) => {
        pushed.push(frame.slice(0));
      }),
      finalize: vi.fn(async () => ({
        slices: [{ blob: new Blob([new Uint8Array(16)]), startMs: 0 }],
        mimeType: "audio/wav" as const,
      })),
      dispose: vi.fn(),
    };
  }
  function batchSetup(
    status: { available: boolean; kind: "batch" | "streaming" } = {
      available: true,
      kind: "batch",
    },
  ) {
    const base = setup();
    const sink = fakeSink();
    const transcribe = vi.fn<
      (
        audio: unknown,
        input: {
          language: string;
          startedAtMs: number;
          onProgress: unknown;
          signal: AbortSignal;
        },
      ) => Promise<unknown[]>
    >(async () => [
      {
        id: "batch:0:0:0",
        text: "hello",
        final: true,
        receivedAt: (base.controller.getSnapshot().startedAt ?? 0) + 0,
      },
    ]);
    const deps = base.deps as CaptureDependencies & {
      batch: {
        createSink: () => Promise<typeof sink>;
        transcribe: unknown;
      };
    };
    deps.status = vi.fn(async () => status);
    deps.batch = {
      createSink: vi.fn(async () => sink as never),
      transcribe: transcribe as never,
    };
    const controller = base.controller as CaptureController & {
      cancelTranscription: () => void;
    };
    return { ...base, sink, transcribe, controller };
  }

  it("records without a socket, transcribes on stop and lands in review", async () => {
    const s = batchSetup();
    await s.controller.start();
    expect(s.sockets).toHaveLength(0);
    const before = s.sink.push.mock.calls.length;
    s.frame();
    expect(s.sink.push.mock.calls.length).toBe(before + 1);
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "recording",
      startedAt: expect.any(Number),
    });
    await s.controller.stop();
    expect(s.sink.finalize).toHaveBeenCalledOnce();
    expect(s.transcribe).toHaveBeenCalledTimes(1);
    const input = s.transcribe.mock.calls[0]?.[1] as {
      startedAtMs: number;
      language: string;
    };
    expect(input.startedAtMs).toBe(s.controller.getSnapshot().startedAt ?? -1);
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      transcribing: null,
      sentences: [expect.objectContaining({ text: "hello", final: true })],
    });
  });

  it("zero-fills paused frames before they reach the encoder (D1)", async () => {
    const s = batchSetup();
    await s.controller.start();
    s.frame();
    s.controller.pause();
    s.frame();
    s.controller.resume();
    s.frame();
    const pushes = s.sink.push.mock.calls.map(([frame]) =>
      new Uint8Array(frame as ArrayBuffer).every((byte) => byte === 0),
    );
    // First and last frames carry real audio; the paused one is silence.
    expect(pushes).toEqual([false, true, false]);
  });

  it("cancelling the transcription keeps the session in review with the draft", async () => {
    const s = batchSetup();
    await s.controller.start();
    s.frame();
    let release!: (value: unknown) => void;
    s.transcribe.mockReturnValue(
      new Promise((resolve) => {
        release = resolve as (value: unknown) => void;
      }),
    );
    void s.controller.stop();
    await vi.waitFor(() =>
      expect(s.controller.getSnapshot().state).toBe("transcribing"),
    );
    (
      s.controller as unknown as {
        cancelTranscription: () => void;
      }
    ).cancelTranscription();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      transcribing: null,
      sentences: [],
    });
    release([]); // A late result must be ignored.
    await Promise.resolve();
    expect(s.controller.getSnapshot().state).toBe("review");
  });

  it("surfaces a transcription failure as review with the error kept", async () => {
    const s = batchSetup();
    await s.controller.start();
    s.frame();
    s.transcribe.mockRejectedValue(new Error("502"));
    await s.controller.stop();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      error: "transcribeFailed",
    });
  });

  it("retries a failed transcription with the same encoded audio", async () => {
    const s = batchSetup();
    await s.controller.start();
    s.frame();
    s.transcribe.mockRejectedValueOnce(new Error("502"));
    await s.controller.stop();
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      error: "transcribeFailed",
    });
    s.transcribe.mockRejectedValueOnce(new Error("502"));
    const audio = s.transcribe.mock.calls[0]?.[0];
    s.controller.retryTranscription();
    await vi.waitFor(() =>
      expect(s.controller.getSnapshot().state).toBe("transcribing"),
    );
    await vi.waitFor(() =>
      expect(s.controller.getSnapshot().state).toBe("review"),
    );
    expect(s.transcribe).toHaveBeenCalledTimes(2);
    // The same captured audio object is re-uploaded, not a re-encode.
    expect(s.transcribe.mock.calls[1]?.[0]).toBe(audio);
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      error: "transcribeFailed",
      sentences: [],
    });
    s.controller.retryTranscription();
    await vi.waitFor(() =>
      expect(s.controller.getSnapshot().state).toBe("review"),
    );
    expect(s.transcribe).toHaveBeenCalledTimes(3);
    expect(s.controller.getSnapshot()).toMatchObject({
      state: "review",
      error: null,
      sentences: [expect.objectContaining({ text: "hello", final: true })],
    });
  });

  it("does not offer a transcription retry after a user cancel", async () => {
    const s = batchSetup();
    await s.controller.start();
    s.frame();
    let release!: (value: unknown) => void;
    s.transcribe.mockReturnValue(
      new Promise((resolve) => {
        release = resolve as (value: unknown) => void;
      }),
    );
    void s.controller.stop();
    await vi.waitFor(() =>
      expect(s.controller.getSnapshot().state).toBe("transcribing"),
    );
    (
      s.controller as unknown as {
        cancelTranscription: () => void;
      }
    ).cancelTranscription();
    release([]); // A late result must be ignored.
    await Promise.resolve();
    s.controller.retryTranscription();
    await Promise.resolve();
    expect(s.transcribe).toHaveBeenCalledTimes(1);
    expect(s.controller.getSnapshot().state).toBe("review");
  });

  it("drops the unused batch sink when the provider turns out streaming", async () => {
    const s = batchSetup({ available: true, kind: "streaming" });
    await s.controller.start();
    const socket = s.sockets[0];
    socket.onopen?.();
    socket.message({ type: "ready" });
    expect(s.controller.getSnapshot().state).toBe("recording");
    expect(s.sink.dispose).toHaveBeenCalledOnce();
    expect(s.sink.push).not.toHaveBeenCalled();
    await s.controller.stop();
  });
});
