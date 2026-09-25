import type { CaseResultView, PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { DIM_LABEL, formatClock } from '../ui.tsx';

function names(view: PlayerView, r: CaseResultView) {
  const player = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  return (id: string) => `${r.cards[id]?.name ?? '?'} (${player(id)})`;
}

export function Reveal({ view, api, remaining }: { view: PlayerView; api: Api; remaining: number }) {
  const r = view.lastResult;
  if (!r) return null;
  const n = names(view, r);
  const mine = r.scores[view.you];
  const sorted = [...view.players].sort((a, b) => b.score - a.score);
  const accusedCounts = new Map<string, number>();
  Object.values(r.accusations).forEach((a) => a && accusedCounts.set(a.targetId, (accusedCounts.get(a.targetId) ?? 0) + 1));
  const biggestCamp = [...accusedCounts.entries()].filter(([id]) => id !== r.killerId && !r.accompliceIds.includes(id)).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-4 px-4 py-6 pb-12">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-accent">Case {r.caseIndex + 1} solved?</div>
        <div className="pop mt-2 font-display text-4xl">{r.cards[r.killerId].name}</div>
        <div className="text-sm text-zinc-400">played by {view.players.find((p) => p.id === r.killerId)?.name}</div>
        <div className="text-zinc-400">was the killer 🔪</div>
        <div className="mt-2 text-sm">
          {r.correctIds.length} of {Object.keys(r.scores).length - 1 - r.accompliceIds.length} detectives caught them ({Math.round(r.detectiveAccuracy * 100)}%)
        </div>
      </div>

      <div className="card text-sm">
        <div className="grid grid-cols-2 gap-2">
          {(['coat', 'arrival', 'drink', 'phone', 'team'] as const).map((d) => (
            <div key={d}>
              <span className="text-zinc-500">{DIM_LABEL[d]}: </span>
              {r.cards[r.killerId].traits[d]}
            </div>
          ))}
        </div>
        {r.accompliceIds.length > 0 && <div className="mt-2">🤝 Accomplice{r.accompliceIds.length > 1 ? 's' : ''}: {r.accompliceIds.map(n).join(', ')}</div>}
        <div className="mt-1">🎯 The Patsy they framed: {n(r.patsyId)}</div>
        {biggestCamp && (
          <div className="mt-1">
            Biggest fooled camp: {biggestCamp[1]} accused {n(biggestCamp[0])}
          </div>
        )}
      </div>

      {r.forgeryTrails.length > 0 && (
        <div className="card text-sm">
          <h3 className="mb-2 font-semibold">Forged notes</h3>
          {r.forgeryTrails.map((f) => (
            <div key={f.noteId} className="mb-2 rounded-lg bg-panel2 p-2">
              <div className="italic">{f.text}</div>
              <div className="mt-1 text-xs text-zinc-400">Travelled: {f.holders.map((h) => r.cards[h]?.name).join(' → ')}</div>
            </div>
          ))}
        </div>
      )}

      {(r.hiddenEvidence.length > 0 || r.lies.length > 0 || r.alliances.length > 0) && (
        <div className="card flex flex-col gap-2 text-sm">
          {r.hiddenEvidence.length > 0 && (
            <div>
              <h3 className="font-semibold">Evidence the killer's side was sitting on</h3>
              {r.hiddenEvidence.map((h, i) => (
                <div key={i} className="text-zinc-400">
                  {r.cards[h.holderId].name}: {h.text}
                </div>
              ))}
            </div>
          )}
          {r.lies.length > 0 && (
            <div>
              <h3 className="font-semibold">Lies told</h3>
              {r.lies.map((l, i) => (
                <div key={i} className="text-zinc-400">
                  {r.cards[l.by].name} told {r.cards[l.to].name} {DIM_LABEL[l.dim].toLowerCase()} "{l.claimed}" (really {l.truth}) {l.exposed ? '— caught! 🤥' : ''}
                </div>
              ))}
            </div>
          )}
          {r.alliances.length > 0 && (
            <div>
              <h3 className="font-semibold">Secret alliances</h3>
              {r.alliances.map(([a, b], i) => (
                <div key={i} className="text-zinc-400">
                  {r.cards[a].name} 🤝 {r.cards[b].name}
                  {[a, b].some((x) => x === r.killerId || r.accompliceIds.includes(x)) ? ' — a trap!' : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mine && (
        <div className="card">
          <h3 className="mb-2 font-semibold">Your points: {mine.total}</h3>
          {mine.lines.map((l, i) => (
            <div key={i} className="flex justify-between text-sm text-zinc-300">
              <span>{l.label}</span>
              <span className={l.points < 0 ? 'text-accent' : 'text-gold'}>{l.points > 0 ? `+${l.points}` : l.points}</span>
            </div>
          ))}
        </div>
      )}

      <Leaderboard view={view} sorted={sorted} />

      <div className="text-center text-sm text-zinc-500">Next case in {formatClock(remaining)}</div>
      {view.hostId === view.you && (
        <button className="btn-primary" onClick={() => api.lobby({ type: 'advance' })}>
          {view.caseIndex + 1 >= view.settings.cases ? 'Finish game' : 'Next case now'}
        </button>
      )}
    </div>
  );
}

function Leaderboard({ view, sorted }: { view: PlayerView; sorted: PlayerView['players'] }) {
  return (
    <div className="card">
      <h3 className="mb-2 font-semibold">Leaderboard</h3>
      {sorted.map((p, i) => (
        <div key={p.id} className={`flex justify-between py-1 text-sm ${p.id === view.you ? 'text-gold' : ''}`}>
          <span>
            {i + 1}. {p.name}
          </span>
          <span className="tabular-nums">{p.score}</span>
        </div>
      ))}
    </div>
  );
}

export function Podium({ view, api }: { view: PlayerView; api: Api }) {
  const sorted = [...view.players].sort((a, b) => b.score - a.score);
  const accuracy = view.results.length ? view.results.reduce((s, r) => s + r.detectiveAccuracy, 0) / view.results.length : 0;
  return (
    <div className="flex min-h-screen flex-col gap-4 px-4 py-10">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-accent">Game over</div>
        <div className="mt-2 font-display text-5xl">🏆 {sorted[0]?.name}</div>
        <div className="text-zinc-400">wins with {sorted[0]?.score} points</div>
      </div>
      <div className="grid grid-cols-3 items-end gap-2 text-center">
        {[1, 0, 2].map((i) =>
          sorted[i] ? (
            <div key={i} className={`card ${i === 0 ? 'border-gold py-8' : 'py-5'}`}>
              <div className="text-2xl">{['🥇', '🥈', '🥉'][i]}</div>
              <div className="truncate font-semibold">{sorted[i].name}</div>
              <div className="text-sm text-zinc-400">{sorted[i].score}</div>
            </div>
          ) : (
            <div key={i} />
          ),
        )}
      </div>
      <Leaderboard view={view} sorted={sorted} />
      <div className="text-center text-sm text-zinc-500">Detectives caught the killer {Math.round(accuracy * 100)}% of the time across {view.results.length} cases.</div>
      <button className="btn-primary" onClick={api.leave}>
        Play again
      </button>
    </div>
  );
}
