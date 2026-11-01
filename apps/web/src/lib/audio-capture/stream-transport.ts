import {
  CAPTURE_MAX_DURATION_MS,
  type CaptureServerMessage,
  captureServerMessageSchema,
} from "@flaremo/contracts";
import type { CaptureSentence, CaptureState } from "./types";

// While the session has no live socket (first connect or reconnect), frames
// are buffered so speech over the gap still reaches the new session. 16 kHz
// mono s16le is ~32 KB/s, so this cap holds about a minute of audio; older
// frames are dropped once it is exceeded.
const CAPTURE_PENDING_BYTES = 2_000_000;

/** The provider's error message, as parsed off the wire. */
export type CaptureStreamError = Extract<
  CaptureServerMessage,
  { type: "error" }
>;

/** The provider facts a streaming session needs to open. */
export type StreamTransportDependencies = {
  status: () => Promise<{
    available: boolean;
    kind?: "streaming" | "batch" | null;
  }>;
  socket: () => WebSocket;
};

/** What the transport asks of the controller while it carries the session.
 * Every policy decision (state, backoff, batch) stays on the controller; the
 * transport owns the socket, the frames it carries and the session timers. */
export type StreamTransportHandlers = {
  /** Published capture state; a ready handshake counts while connecting. */
  state: () => CaptureState;
  /** Published session start: the heartbeat measures the one-hour cap on it. */
  startedAt: () => number | null;
  /** The provider accepted the session: the controller publishes recording. */
  onReady: () => void;
  onSentence: (sentence: CaptureSentence) => void;
  /** The provider finished the session; the controller ends it. */
  onFinished: () => void;
  /** No audio frame for 10 s (heartbeat): the capture is interrupted. */
  onInterrupted: () => void;
  /** The one-hour cap is reached (heartbeat): stop with limitReached. */
  onDurationLimit: () => void;
  /** The provider reports no usable ASR configuration. */
  onUnavailable: () => void;
  /** The provider answered batch: frames feed the local encoder instead. */
  onBatch: () => void;
  /** Streaming confirmed: the controller drops the unused batch sink. */
  onStreaming: () => void;
  /** A parsed provider error; true once the controller finished the session. */
  onError: (error: CaptureStreamError) => boolean;
  /** The current socket is gone: reconnect or end the session. */
  onLost: () => void;
  /** Opening the session failed (status call or socket setup threw). */
  onConnectionFailed: () => void;
  /** The 10 s status deadline expired. */
  onStatusTimeout: () => void;
};

/**
 * The streaming socket of one capture session: status check, handshake, frame
 * sends, heartbeat and reconnect backoff. A reconnect reuses the instance and
 * replaces only the socket; the controller drives it through `send`, `close`
 * and the handlers above.
 */
export class StreamTransport {
  private socket: WebSocket | undefined;
  private ready = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastMessage = 0;
  private lastAudio = 0;
  private pendingFrames: ArrayBuffer[] = [];
  private pendingBytes = 0;
  private readonly deps: StreamTransportDependencies;
  private readonly handlers: StreamTransportHandlers;
  constructor(
    deps: StreamTransportDependencies,
    handlers: StreamTransportHandlers,
  ) {
    this.deps = deps;
    this.handlers = handlers;
  }
  /** Opens the session: the status check picks the mode, then the socket
   * handshake runs; the reconnect backoff re-enters here (D1). */
  async connect(abort: AbortController) {
    const statusDeadline = setTimeout(
      () => this.handlers.onStatusTimeout(),
      10_000,
    );
    this.timer = statusDeadline;
    try {
      const status = await this.deps.status();
      clearTimeout(statusDeadline);
      if (abort.signal.aborted || this.handlers.state() === "stopping") return;
      if (!status.available) return this.handlers.onUnavailable();
      // Batch mode (rollout §3.3): no socket; frames feed the local encoder
      // and the provider is only contacted after Stop.
      if (status.kind === "batch") return this.handlers.onBatch();
      // Streaming confirmed: the unused batch sink is dropped.
      this.handlers.onStreaming();
      const socket = this.deps.socket();
      this.socket = socket;
      this.ready = false;
      this.timer = setTimeout(() => {
        if (this.socket === socket) this.lost(socket);
      }, 30_000);
      socket.onopen = () => {
        if (this.socket !== socket || abort.signal.aborted) return;
        socket.send(
          JSON.stringify({
            type: "start",
            sampleRate: 16000,
            encoding: "pcm_s16le",
            language: "auto",
          }),
        );
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket || abort.signal.aborted) return;
        try {
          if (typeof event.data !== "string" || event.data.length > 128_000)
            throw new Error("Invalid response");
          const message = captureServerMessageSchema.parse(
            JSON.parse(event.data),
          );
          this.lastMessage = Date.now();
          if (message.type === "ready") {
            if (
              this.handlers.state() !== "connecting" &&
              this.handlers.state() !== "reconnecting"
            )
              return;
            clearTimeout(this.timer);
            this.ready = true;
            this.lastAudio = Date.now();
            this.flush(socket);
            this.handlers.onReady();
            this.heartbeat = setInterval(() => {
              if (Date.now() - this.lastAudio > 10_000)
                return this.handlers.onInterrupted();
              if (
                Date.now() - (this.handlers.startedAt() ?? Date.now()) >=
                CAPTURE_MAX_DURATION_MS
              ) {
                this.handlers.onDurationLimit();
                return;
              }
              if (Date.now() - this.lastMessage > 15_000)
                return this.lost(socket);
              if (socket.readyState === 1)
                socket.send(JSON.stringify({ type: "ping" }));
            }, 5_000);
          } else if (message.type === "sentence")
            this.handlers.onSentence(message);
          else if (message.type === "finished") {
            if (this.handlers.state() === "stopping")
              this.handlers.onFinished();
            else this.lost(socket);
          } else if (message.type === "error") {
            if (!this.handlers.onError(message)) this.lost(socket);
          }
        } catch {
          this.handlers.onConnectionFailed();
        }
      };
      socket.onclose = () => this.lost(socket);
      socket.onerror = () => this.lost(socket);
    } catch {
      clearTimeout(statusDeadline);
      if (!abort.signal.aborted) this.handlers.onConnectionFailed();
    }
  }
  /** True once the provider accepted the session. */
  get isReady() {
    return this.ready;
  }
  /** True while the live socket can still take the final stop frame. */
  live() {
    return this.ready && this.socket?.readyState === 1;
  }
  /** Sends the session-level stop frame; false when it could not be sent. */
  requestStop() {
    const socket = this.socket;
    if (!socket) return false;
    try {
      socket.send(JSON.stringify({ type: "stop" }));
    } catch {
      return false;
    }
    return true;
  }
  /** Sends one live audio frame; a socket that cannot take it is dropped. */
  send(frame: ArrayBuffer) {
    const socket = this.socket;
    if (socket?.readyState !== 1) return;
    if (socket.bufferedAmount + frame.byteLength > 64_000)
      return this.lost(socket);
    try {
      socket.send(frame);
    } catch {
      this.lost(socket);
    }
  }
  /** Buffers a frame while the session has no live socket (the reconnect gap
   * or a batch sink still being created); the oldest frames are dropped once
   * the pending cap is exceeded. */
  buffer(frame: ArrayBuffer) {
    this.pendingFrames.push(frame);
    this.pendingBytes += frame.byteLength;
    while (
      this.pendingBytes > CAPTURE_PENDING_BYTES &&
      this.pendingFrames.length > 1
    ) {
      const oldest = this.pendingFrames[0];
      if (!oldest) break;
      this.pendingBytes -= oldest.byteLength;
      this.pendingFrames.shift();
    }
  }
  /** Takes the buffered frames: the batch sink adopts them once it exists. */
  drain() {
    const frames = this.pendingFrames;
    this.pendingFrames = [];
    this.pendingBytes = 0;
    return frames;
  }
  /** Drops buffered frames: the session ended, nothing will replay them. */
  clearPending() {
    this.pendingFrames = [];
    this.pendingBytes = 0;
  }
  /** Records that a frame arrived, whichever path consumed it (heartbeat
   * liveness). */
  noteAudio() {
    this.lastAudio = Date.now();
  }
  /** True once the backoff attempts are spent: the session must fail. */
  get retriesExhausted() {
    return this.retry >= 6;
  }
  /** Schedules the next connect attempt on the backoff table. */
  scheduleReconnect(abort: AbortController) {
    const delay = [1000, 2000, 4000, 8000, 15000, 15000][this.retry++];
    this.timer = setTimeout(() => {
      void this.connect(abort);
    }, delay);
  }
  /** Cancels the session timers without touching the socket: Stop keeps the
   * live session up until its final drain. */
  cancelTimers() {
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
  }
  /** Detaches from the current socket, cancels the timers and closes it; the
   * buffered frames stay for the next session. */
  close() {
    this.cancelTimers();
    this.ready = false;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        /* Closed. */
      }
    }
  }
  private flush(socket: WebSocket) {
    const frames = this.drain();
    for (const frame of frames) {
      if (socket.readyState !== 1) return this.lost(socket);
      if (socket.bufferedAmount + frame.byteLength > 64_000)
        return this.lost(socket);
      try {
        socket.send(frame);
      } catch {
        return this.lost(socket);
      }
    }
  }
  private lost(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.close();
    this.handlers.onLost();
  }
}
