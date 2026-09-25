// Schedules bot "thinks" against a clock. Used by the live server (real time) and the headless
// simulator (virtual time), so bots behave identically in both.
import { act, type GameEvent, type GameState } from '../../engine/game.ts';
import { playerView } from '../../engine/views.ts';
import { Bot } from './bot.ts';

export class BotRunner {
  private bots = new Map<string, Bot>();
  private due = new Map<string, number>();

  constructor(private seed: number) {}

  sync(state: GameState, now: number) {
    for (const p of state.players) {
      if (p.isBot && !this.bots.has(p.id)) {
        const bot = new Bot(p.id, p.botLevel ?? 'normal', this.seed + this.bots.size * 7717);
        this.bots.set(p.id, bot);
        this.due.set(p.id, now + bot.nextDelay());
      }
    }
    for (const id of [...this.bots.keys()]) {
      if (!state.players.some((p) => p.id === id && p.isBot)) {
        this.bots.delete(id);
        this.due.delete(id);
      }
    }
  }

  nextDue(): number | null {
    let t = Infinity;
    for (const v of this.due.values()) t = Math.min(t, v);
    return Number.isFinite(t) ? t : null;
  }

  /** Let every bot whose turn has come think once. `scale` shortens delays (spectator fast-forward). */
  runDue(state: GameState, now: number, scale = 1): GameEvent[] {
    const events: GameEvent[] = [];
    for (const [id, bot] of this.bots) {
      if ((this.due.get(id) ?? Infinity) > now) continue;
      if (state.phase === 'playing') {
        const action = bot.think(playerView(state, id, now));
        if (action) {
          const r = act(state, id, action, now);
          if (r.ok) events.push(...r.events);
        }
      }
      this.due.set(id, now + bot.nextDelay() * scale);
    }
    return events;
  }
}
