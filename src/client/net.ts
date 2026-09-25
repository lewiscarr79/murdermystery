// Socket connection, server-clock sync and session persistence.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { bestOffset, type ClockSample } from '../shared/clock.ts';
import type { Action } from '../shared/types.ts';
import type { PlayerView } from '../shared/view.ts';
import type { SpectatorView } from '../engine/views.ts';

const TOKEN_KEY = 'launch-night-token';

export interface Toast {
  id: number;
  text: string;
}

export interface Flash {
  id: number;
  text: string;
  fromName: string;
}

export type Result = { ok: boolean; error?: string; code?: string; token?: string };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

let socket: Socket | null = null;
function getSocket(): Socket {
  socket ??= io({ transports: ['websocket', 'polling'] });
  return socket;
}

function emit(ev: string, payload: unknown): Promise<Result> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'No response from server' }), 8000);
    getSocket().emit(ev, payload, (res: Result) => {
      clearTimeout(timer);
      resolve(res ?? { ok: true });
    });
  });
}

export function useGame() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [spectate, setSpectate] = useState<(SpectatorView & { speed: number }) | null>(null);
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const toastId = useRef(0);

  const pushToast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    const s = getSocket();
    const sync = async () => {
      const samples: ClockSample[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = Date.now();
        const res = await new Promise<{ server: number }>((r) => s.emit('ping', {}, r));
        samples.push({ t0, server: res.server, t1: Date.now() });
      }
      setOffset(bestOffset(samples));
    };
    const onConnect = async () => {
      setConnected(true);
      void sync();
      const token = storage()?.getItem(TOKEN_KEY);
      if (token) {
        const r = await emit('resume', { token });
        if (!r.ok) storage()?.removeItem(TOKEN_KEY);
      }
    };
    s.on('connect', onConnect);
    s.on('disconnect', () => setConnected(false));
    s.on('view', (v: PlayerView) => setView(v));
    s.on('spectate', (v: SpectatorView & { speed: number }) => setSpectate(v));
    s.on('event', (e: { type: string; text: string; fromName?: string }) => {
      if (e.type === 'toast') pushToast(e.text);
      if (e.type === 'flash') setFlash({ id: Date.now(), text: e.text, fromName: e.fromName ?? '' });
    });
    if (s.connected) void onConnect();
    const interval = setInterval(() => s.connected && void sync(), 30_000);
    return () => {
      clearInterval(interval);
      s.off('connect', onConnect);
      s.off('disconnect');
      s.off('view');
      s.off('spectate');
      s.off('event');
    };
  }, [pushToast]);

  const remember = (r: Result) => {
    if (r.ok && r.token) storage()?.setItem(TOKEN_KEY, r.token);
    return r;
  };

  const api = {
    create: async (name: string) => remember(await emit('create', { name })),
    join: async (code: string, name: string) => remember(await emit('join', { code, name })),
    act: async (action: Action) => {
      const r = await emit('act', action);
      if (!r.ok && r.error) pushToast(r.error);
      return r;
    },
    lobby: async (msg: Record<string, unknown>) => {
      const r = await emit('lobby', msg);
      if (!r.ok && r.error) pushToast(r.error);
      return r;
    },
    botGame: (opts: { players: number; level: string; cases: number }) => emit('botGame', opts),
    spectate: (code: string) => emit('spectate', { code }),
    setSpeed: (speed: number) => getSocket().emit('setSpeed', { speed }),
    leave: () => {
      storage()?.removeItem(TOKEN_KEY);
      window.location.href = window.location.pathname;
    },
  };

  return { view, spectate, connected, offset, toasts, flash, clearFlash: () => setFlash(null), api };
}

/** Re-renders every 200 ms and returns the current server time. */
export function useServerNow(offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 200);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

export type Api = ReturnType<typeof useGame>['api'];
