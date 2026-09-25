// Headless simulator: plays full all-bot games in virtual time and reports balance per player count.
//   npm run sim -- --players 4..22 --cases 200 [--level normal] [--seed 1]
import { addPlayer, createGame, nextDeadline, startGame, tick, type GameState } from '../src/engine/game.ts';
import { BotRunner } from '../src/server/bots/botRunner.ts';
import type { BotLevel } from '../src/shared/types.ts';
import type { CaseResult } from '../src/engine/scoring.ts';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export function simulateGame(n: number, seed: number, level: BotLevel, cases: number): { state: GameState; stuck: boolean } {
  const state = createGame('SIM', { id: 'b0', name: 'Bot 0' }, seed);
  state.players[0].isBot = true;
  state.players[0].botLevel = level;
  for (let i = 1; i < n; i++) addPlayer(state, { id: `b${i}`, name: `Bot ${i}`, isBot: true, botLevel: level });
  state.settings.cases = cases;
  state.settings.practice = false;
  const runner = new BotRunner(seed);
  let now = 0;
  startGame(state, now);
  runner.sync(state, now);
  let steps = 0;
  while (state.phase !== 'over') {
    const t = Math.min(nextDeadline(state) ?? Infinity, runner.nextDue() ?? Infinity);
    if (!Number.isFinite(t) || ++steps > 200_000) return { state, stuck: true };
    now = Math.max(now, t);
    tick(state, now);
    runner.runDue(state, now);
    tick(state, now);
  }
  return { state, stuck: false };
}

function main() {
  const [lo, hi] = arg('players', '4..22').split('..').map(Number);
  const total = Number(arg('cases', '100'));
  const level = arg('level', 'normal') as BotLevel;
  const seed0 = Number(arg('seed', '1'));
  const perGame = 5;
  console.log(`Simulating ${total} cases per size, bots: ${level}\n`);
  console.log('players | detectives correct | killer avg | accomplice avg | detective avg | killer wins | stuck | lies | forgeries believed');
  for (let n = lo; n <= (hi || lo); n++) {
    const results: CaseResult[] = [];
    let stuck = 0;
    for (let g = 0; results.length < total; g++) {
      const { state, stuck: s } = simulateGame(n, seed0 + g * 101 + n * 10007, level, perGame);
      if (s) stuck++;
      results.push(...state.results);
    }
    const r = results.slice(0, total);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const acc = avg(r.map((x) => x.detectiveAccuracy));
    const killer = avg(r.map((x) => x.scores[x.killerId].total));
    const accomplice = avg(r.flatMap((x) => x.accompliceIds.map((a) => x.scores[a].total)));
    const detective = avg(
      r.flatMap((x) => Object.keys(x.scores).filter((id) => id !== x.killerId && !x.accompliceIds.includes(id)).map((id) => x.scores[id].total)),
    );
    // "Killer wins" = killer scored more than the best detective.
    const wins = r.filter((x) => {
      const dets = Object.keys(x.scores).filter((id) => id !== x.killerId && !x.accompliceIds.includes(id));
      return x.scores[x.killerId].total > Math.max(...dets.map((d) => x.scores[d].total));
    }).length;
    const lies = avg(r.map((x) => x.lies.length));
    const believed = avg(r.map((x) => x.forgeryTrails.filter((f) => !x.accompliceIds.includes(f.endedWith) && f.endedWith !== x.killerId).length));
    console.log(
      `${String(n).padStart(7)} | ${(acc * 100).toFixed(0).padStart(17)}% | ${killer.toFixed(0).padStart(10)} | ${accomplice
        .toFixed(0)
        .padStart(14)} | ${detective.toFixed(0).padStart(13)} | ${((wins / r.length) * 100).toFixed(0).padStart(10)}% | ${String(stuck).padStart(5)} | ${lies
        .toFixed(1)
        .padStart(4)} | ${believed.toFixed(1)}`,
    );
  }
}

if (process.argv[1]?.endsWith('sim.ts')) main();
