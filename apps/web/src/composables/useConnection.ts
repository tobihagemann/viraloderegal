import { ref } from 'vue';
import { type ClientCommand, serverEventSchema } from '@viraloderegal/shared';
import { useGameState } from './useGameState.js';
import { storeSessionToken } from './useStorage.js';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const { applyEvent, reset } = useGameState();

let socket: WebSocket | null = null;
let token: string | null = null;
let stopped = false;
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const status = ref<ConnectionStatus>('closed');

// Same-origin in production (the hub ignores the path); in dev the Vite proxy forwards /ws to the API. The
// dedicated /ws prefix is identical on both sides, so only the port differs.
function wsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

function open(): void {
  status.value = attempts === 0 ? 'connecting' : 'reconnecting';
  const ws = new WebSocket(wsUrl());
  socket = ws;
  ws.addEventListener('open', () => {
    if (socket !== ws) return;
    attempts = 0;
    status.value = 'open';
    if (token) {
      ws.send(JSON.stringify({ type: 'join', sessionToken: token } satisfies ClientCommand));
    }
  });
  ws.addEventListener('message', (event) => {
    if (socket !== ws) return;
    handleFrame(event.data);
  });
  ws.addEventListener('close', () => {
    if (socket !== ws) return;
    socket = null;
    if (stopped) {
      status.value = 'closed';
      return;
    }
    scheduleReconnect();
  });
  // ws emits 'error' then 'close'; the close handler drives the reconnect.
  ws.addEventListener('error', () => undefined);
}

function handleFrame(data: unknown): void {
  let raw: unknown;
  try {
    raw = JSON.parse(typeof data === 'string' ? data : String(data));
  } catch {
    return;
  }
  const parsed = serverEventSchema.safeParse(raw);
  if (!parsed.success) return;
  const event = parsed.data;
  applyEvent(event);
  // A removal or a terminal token rejection ends the session; further reconnects would just be re-rejected.
  if (event.type === 'kicked' || (event.type === 'error' && (event.code === 'banned' || event.code === 'invalid_token'))) {
    stop();
  }
}

function scheduleReconnect(): void {
  status.value = 'reconnecting';
  attempts += 1;
  const delay = Math.min(1000 * 2 ** (attempts - 1), 10_000);
  reconnectTimer = setTimeout(open, delay);
}

function stop(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const current = socket;
  socket = null;
  current?.close();
  status.value = 'closed';
}

function connect(code: string, sessionToken: string): void {
  stop();
  reset();
  stopped = false;
  attempts = 0;
  token = sessionToken;
  storeSessionToken(code, sessionToken);
  open();
}

function disconnect(): void {
  stop();
  token = null;
}

function send(command: ClientCommand): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(command));
  }
}

export function useConnection() {
  return { status, connect, disconnect, send };
}
