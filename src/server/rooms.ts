// Room registry and Socket.IO handlers. The server is authoritative: it owns game state and every
// timer, and sends each socket only the redacted view it is entitled to.
import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  act,
  addPlayer,
  createGame,
  hostAdvance,
  nextDeadline,
  removePlayer,
  setConnected,
  startGame,
  tick,
  updateSettings,
  type GameEvent,
  type GameState,
} from '../engine/game.ts';
import { randomSeed } from '../engine/rng.ts';
import { playerView, spectatorView } from '../engine/views.ts';
import { MAX_PLAYERS } from '../shared/rules.ts';
import type { Action, BotLevel, Pace } from '../shared/types.ts';
import { BotRunner } from './bots/botRunner.ts';

const BOT_NAMES = ['Ada', 'Bram', 'Cleo', 'Dex', 'Esme', 'Finn', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kit', 'Lia', 'Milo', 'Nell', 'Otto', 'Pip', 'Quin', 'Rae', 'Sol', 'Tess', 'Uma', 'Vik'];

type Ack = (res: unknown) => void;

class Room {
  state: GameState;
  bots: BotRunner;
  sockets = new Map<string, Set<Socket>>();
  spectators = new Set<Socket>();
  private timer?: NodeJS.Timeout;
  /** Virtual clock so all-bot games can be fast-forwarded. Human games always run at 1×. */
  speed = 1;
  private realBase = Date.now();
  private virtualBase = Date.now();
  lastActivity = Date.now();

  constructor(code: string, host: { id: string; name: string; isBot?: boolean }) {
    const seed = randomSeed();
    this.state = createGame(code, host, seed);
    if (host.isBot) this.state.players[0].isBot = true;
    this.bots = new BotRunner(seed);
  }

  now(): number {
    return this.virtualBase + (Date.now() - this.realBase) * this.speed;
  }

  setSpeed(speed: number) {
    const now = this.now();
    this.virtualBase = now;
    this.realBase = Date.now();
    this.speed = speed;
    this.schedule();
  }

  get hasHumans() {
    return this.state.players.some((p) => !p.isBot);
  }

  /** Run everything due, broadcast, and arm the next timer. */
  pump(events: GameEvent[] = []) {
    const now = this.now();
    this.bots.sync(this.state, now);
    for (let guard = 0; guard < 50; guard++) {
      const before = this.state.round + '|' + this.state.phase + '|' + this.state.caseIndex;
      events.push(...tick(this.state, now));
      events.push(...this.bots.runDue(this.state, now));
      events.push(...tick(this.state, now));
      const after = this.state.round + '|' + this.state.phase + '|' + this.state.caseIndex;
      if (before === after) break;
    }
    this.deliver(events);
    this.broadcast();
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    const next = Math.min(nextDeadline(this.state) ?? Infinity, this.bots.nextDue() ?? Infinity);
    if (!Number.isFinite(next)) return;
    const delay = Math.max(0, (next - this.now()) / this.speed);
    this.timer = setTimeout(() => this.pump(), Math.min(delay, 2 ** 31 - 1));
  }

  private deliver(events: GameEvent[]) {
    for (const e of events) {
      if (e.type === 'flash' || e.type === 'toast') this.sockets.get(e.to)?.forEach((s) => s.emit('event', e));
    }
  }

  broadcast() {
    const now = this.now();
    for (const [pid, set] of this.sockets) {
      if (!set.size) continue;
      const view = playerView(this.state, pid, now);
      set.forEach((s) => s.emit('view', view));
    }
    if (this.spectators.size) {
      const sv = { ...spectatorView(this.state, now), speed: this.speed };
      this.spectators.forEach((s) => s.emit('spectate', sv));
    }
  }

  dispose() {
    clearTimeout(this.timer);
  }
}

const rooms = new Map<string, Room>();
const tokens = new Map<string, { code: string; playerId: string }>();

function newCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code: string;
  do code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

const newId = (p: string) => p + randomBytes(5).toString('hex');

function issueToken(code: string, playerId: string): string {
  const token = randomBytes(16).toString('hex');
  tokens.set(token, { code, playerId });
  return token;
}

function attach(room: Room, pid: string, socket: Socket) {
  const set = room.sockets.get(pid) ?? new Set();
  set.add(socket);
  room.sockets.set(pid, set);
  socket.data.code = room.state.code;
  socket.data.playerId = pid;
  setConnected(room.state, pid, true);
  room.lastActivity = Date.now();
}

function addBots(room: Room, count: number, level: BotLevel) {
  for (let i = 0; i < count && room.state.players.length < MAX_PLAYERS; i++) {
    const used = new Set(room.state.players.map((p) => p.name));
    const base = BOT_NAMES.find((n) => !used.has(`${n} (bot)`)) ?? `Bot ${room.state.players.length}`;
    addPlayer(room.state, { id: newId('b'), name: `${base} (bot)`, isBot: true, botLevel: level });
  }
}

const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '');
const level = (v: unknown): BotLevel => (v === 'easy' || v === 'sharp' ? v : 'normal');

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    socket.on('ping', (_: unknown, ack?: Ack) => ack?.({ server: Date.now() }));

    socket.on('create', (msg: { name?: string }, ack?: Ack) => {
      const code = newCode();
      const pid = newId('p');
      const room = new Room(code, { id: pid, name: str(msg?.name, 16) || 'Host' });
      rooms.set(code, room);
      attach(room, pid, socket);
      ack?.({ ok: true, code, playerId: pid, token: issueToken(code, pid) });
      room.pump();
    });

    socket.on('join', (msg: { code?: string; name?: string }, ack?: Ack) => {
      const code = str(msg?.code, 4).toUpperCase();
      const room = rooms.get(code);
      if (!room) return ack?.({ ok: false, error: 'No game with that code' });
      const pid = newId('p');
      const r = addPlayer(room.state, { id: pid, name: str(msg?.name, 16) || 'Player' });
      if (!r.ok) return ack?.(r);
      attach(room, pid, socket);
      ack?.({ ok: true, code, playerId: pid, token: issueToken(code, pid) });
      room.pump();
    });

    socket.on('resume', (msg: { token?: string }, ack?: Ack) => {
      const t = tokens.get(str(msg?.token, 64));
      const room = t && rooms.get(t.code);
      if (!t || !room || !room.state.players.some((p) => p.id === t.playerId)) return ack?.({ ok: false, error: 'Session expired' });
      attach(room, t.playerId, socket);
      ack?.({ ok: true, code: t.code, playerId: t.playerId });
      room.pump();
    });

    socket.on('spectate', (msg: { code?: string }, ack?: Ack) => {
      const room = rooms.get(str(msg?.code, 4).toUpperCase());
      if (!room) return ack?.({ ok: false, error: 'No game with that code' });
      room.spectators.add(socket);
      socket.data.spectating = room.state.code;
      ack?.({ ok: true, code: room.state.code });
      room.broadcast();
    });

    /** Dev/test: an all-bot game to watch in the spectator view. */
    socket.on('botGame', (msg: { players?: number; level?: string; cases?: number; pace?: Pace }, ack?: Ack) => {
      const n = Math.max(4, Math.min(MAX_PLAYERS, Number(msg?.players) || 6));
      const code = newCode();
      const room = new Room(code, { id: newId('b'), name: `${BOT_NAMES[0]} (bot)`, isBot: true });
      room.state.players[0].botLevel = level(msg?.level);
      rooms.set(code, room);
      addBots(room, n - 1, level(msg?.level));
      updateSettings(room.state, { cases: Number(msg?.cases) || 3, pace: msg?.pace === 'quick' ? 'quick' : 'standard' });
      room.spectators.add(socket);
      socket.data.spectating = code;
      startGame(room.state, room.now());
      ack?.({ ok: true, code });
      room.pump();
    });

    socket.on('setSpeed', (msg: { speed?: number }) => {
      const room = rooms.get(socket.data.spectating);
      if (!room || room.hasHumans) return;
      room.setSpeed(Math.max(1, Math.min(60, Number(msg?.speed) || 1)));
      room.broadcast();
    });

    socket.on('lobby', (msg: { type?: string; level?: string; count?: number; id?: string; cases?: number; pace?: Pace }, ack?: Ack) => {
      const room = rooms.get(socket.data.code);
      const pid = socket.data.playerId as string | undefined;
      if (!room || !pid) return ack?.({ ok: false, error: 'Not in a game' });
      if (room.state.hostId !== pid) return ack?.({ ok: false, error: 'Only the host can do that' });
      let r: { ok: boolean; error?: string } = { ok: true };
      if (msg?.type === 'addBot') addBots(room, Math.max(1, Math.min(21, Number(msg.count) || 1)), level(msg.level));
      else if (msg?.type === 'remove' && msg.id && msg.id !== pid) r = removePlayer(room.state, msg.id);
      else if (msg?.type === 'settings') r = updateSettings(room.state, { cases: msg.cases, pace: msg.pace });
      else if (msg?.type === 'start') r = startGame(room.state, room.now());
      else if (msg?.type === 'advance') r = hostAdvance(room.state, pid, room.now());
      ack?.(r);
      room.pump();
    });

    socket.on('act', (action: Action, ack?: Ack) => {
      const room = rooms.get(socket.data.code);
      const pid = socket.data.playerId as string | undefined;
      if (!room || !pid || !action || typeof action !== 'object') return ack?.({ ok: false, error: 'Not in a game' });
      room.lastActivity = Date.now();
      const r = act(room.state, pid, action, room.now());
      ack?.(r.ok ? { ok: true } : r);
      room.pump(r.ok ? r.events : []);
    });

    socket.on('disconnect', () => {
      const spectating = rooms.get(socket.data.spectating);
      spectating?.spectators.delete(socket);
      const room = rooms.get(socket.data.code);
      const pid = socket.data.playerId as string | undefined;
      if (!room || !pid) return;
      const set = room.sockets.get(pid);
      set?.delete(socket);
      if (!set?.size) {
        setConnected(room.state, pid, false);
        // Hand the host role to someone still here.
        if (room.state.hostId === pid) {
          const next = room.state.players.find((p) => !p.isBot && p.connected);
          if (next) room.state.hostId = next.id;
        }
      }
      room.pump();
    });
  });

  // Garbage-collect idle rooms.
  setInterval(() => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [code, room] of rooms) {
      const anyone = [...room.sockets.values()].some((s) => s.size) || room.spectators.size;
      if (!anyone && room.lastActivity < cutoff) {
        room.dispose();
        rooms.delete(code);
        for (const [t, v] of tokens) if (v.code === code) tokens.delete(t);
      }
    }
  }, 10 * 60 * 1000).unref();
}
