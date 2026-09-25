// End-to-end: 22 socket clients with skewed clocks agree on countdowns and receive round changes together.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSocketHandlers } from '../src/server/rooms.ts';
import { bestOffset, msRemaining, type ClockSample } from '../src/shared/clock.ts';
import type { PlayerView } from '../src/shared/view.ts';

let url = '';
let io: Server;
let http: ReturnType<typeof createServer>;

beforeAll(async () => {
  http = createServer();
  io = new Server(http);
  registerSocketHandlers(io);
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  io.close();
  http.close();
});

interface Client {
  socket: Socket;
  skew: number;
  offset: number;
  view?: PlayerView;
  briefingAt?: number;
  clock: () => number;
}

const emit = <T>(s: Socket, ev: string, payload: unknown) => new Promise<T>((r) => s.emit(ev, payload, r));

async function makeClient(skew: number): Promise<Client> {
  const socket = connect(url, { transports: ['websocket'], forceNew: true });
  await new Promise<void>((r) => socket.on('connect', () => r()));
  const c: Client = { socket, skew, offset: 0, clock: () => Date.now() + skew };
  const samples: ClockSample[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = c.clock();
    const { server } = await emit<{ server: number }>(socket, 'ping', {});
    samples.push({ t0, server, t1: c.clock() });
  }
  c.offset = bestOffset(samples);
  socket.on('view', (v: PlayerView) => {
    c.view = v;
    if (v.round === 'briefing' && c.briefingAt === undefined) c.briefingAt = Date.now();
  });
  return c;
}

describe('real-time sync', () => {
  it('keeps 22 skewed clients within 100 ms of each other', async () => {
    const skews = Array.from({ length: 22 }, (_, i) => (i % 2 ? 1 : -1) * i * 37_000); // up to ±13 minutes off
    const clients = await Promise.all(skews.map(makeClient));
    const host = clients[0];
    const created = await emit<{ ok: boolean; code: string }>(host.socket, 'create', { name: 'Host' });
    expect(created.ok).toBe(true);
    for (const c of clients.slice(1)) {
      const r = await emit<{ ok: boolean }>(c.socket, 'join', { code: created.code, name: 'P' });
      expect(r.ok).toBe(true);
    }
    const start = await emit<{ ok: boolean }>(host.socket, 'lobby', { type: 'start' });
    expect(start.ok).toBe(true);

    // Everyone gets the same absolute start time.
    await new Promise((r) => setTimeout(r, 300));
    const startsAt = new Set(clients.map((c) => c.view?.startsAt));
    expect(startsAt.size).toBe(1);

    // At one real instant, every client's computed countdown to the start agrees.
    const remaining = clients.map((c) => msRemaining(c.view!.startsAt!, c.clock(), c.offset));
    expect(Math.max(...remaining) - Math.min(...remaining)).toBeLessThan(100);

    // Round changes arrive together.
    await new Promise((r) => setTimeout(r, 3500));
    const arrivals = clients.map((c) => c.briefingAt!);
    expect(arrivals.every(Boolean)).toBe(true);
    expect(Math.max(...arrivals) - Math.min(...arrivals)).toBeLessThan(250);
    const ends = clients.map((c) => msRemaining(c.view!.roundEndsAt!, c.clock(), c.offset));
    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(100);

    clients.forEach((c) => c.socket.close());
  }, 20_000);

  it('restores a player seat from their token after a disconnect', async () => {
    const a = await makeClient(0);
    const created = await emit<{ ok: boolean; code: string; token: string; playerId: string }>(a.socket, 'create', { name: 'A' });
    a.socket.close();
    const b = await makeClient(5000);
    const resumed = await emit<{ ok: boolean; playerId: string }>(b.socket, 'resume', { token: created.token });
    expect(resumed).toMatchObject({ ok: true, playerId: created.playerId });
    await new Promise((r) => setTimeout(r, 100));
    expect(b.view?.you).toBe(created.playerId);
    expect(b.view?.players.find((p) => p.id === created.playerId)?.connected).toBe(true);
    b.socket.close();
  });
});
