// Dev/test-only god view: watch an all-bot game with every secret visible.
import type { SpectatorView } from '../../engine/views.ts';
import { ROUND_LABELS } from '../../shared/rules.ts';
import type { Api } from '../net.ts';
import { ICON, formatClock } from '../ui.tsx';

export function Spectator({ view, api }: { view: SpectatorView & { speed: number }; api: Api }) {
  const c = view.case;
  const remaining = view.roundEndsAt ? Math.max(0, view.roundEndsAt - view.serverNow) / view.speed : 0;
  const role = (id: string) => (c?.killerId === id ? '🔪' : c?.accompliceIds.includes(id) ? '🤝' : c?.patsyId === id ? '🎯' : '');
  const results = view.results;
  return (
    <div className="flex flex-col gap-3 px-3 py-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent">Spectator · {view.code}</div>
          <div className="font-display text-xl">
            {view.phase === 'over' ? 'Game over' : view.round ? `Case ${view.caseIndex + 1}: ${ROUND_LABELS[view.round].title}` : 'Starting…'}
          </div>
        </div>
        <div className="font-mono text-xl">{formatClock(remaining)}</div>
      </div>
      <div className="flex gap-2">
        {[1, 4, 20].map((s) => (
          <button key={s} className={`chip flex-1 py-2 ${view.speed === s ? 'border-accent text-white' : ''}`} onClick={() => api.setSpeed(s)}>
            {s}×
          </button>
        ))}
        <button className="chip py-2" onClick={api.leave}>
          Exit
        </button>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="font-semibold">Results so far</div>
          {results.map((r) => (
            <div key={r.caseIndex} className="text-zinc-400">
              Case {r.caseIndex + 1}: {r.cards[r.killerId].name} — {Math.round(r.detectiveAccuracy * 100)}% of detectives correct
            </div>
          ))}
        </div>
      )}

      {c && (
        <>
          <div className="card">
            <div className="mb-1 text-xs text-zinc-500">Evidence traits: {c.evidenceDims.join(', ')} · Announcements</div>
            {c.announcements.map((n) => (
              <div key={n.id}>
                {ICON[n.icon]} {n.text}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-panel2 text-zinc-400">
                <tr>
                  <th className="p-2">Player</th>
                  <th className="p-2">Traits</th>
                  <th className="p-2">Hand</th>
                  <th className="p-2">Lies left</th>
                  <th className="p-2">Accused</th>
                  <th className="p-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {view.players.map((p) => {
                  const card = c.cards[p.id];
                  const acc = c.accusations[p.id];
                  return (
                    <tr key={p.id} className="border-t border-line align-top">
                      <td className="p-2">
                        {role(p.id)} {card?.name}
                        <div className="text-zinc-500">{p.name}</div>
                      </td>
                      <td className="p-2 text-zinc-400">
                        {card && Object.values(card.traits).join(', ')}
                        <div>{card?.location}</div>
                      </td>
                      <td className="p-2">
                        {c.hands[p.id]?.map((n) => (
                          <div key={n.id} className={n.forged ? 'text-accent' : ''}>
                            {ICON[n.icon]} {n.fact.kind === 'killer' ? `${n.fact.dim}=${n.fact.value}` : n.fact.kind}
                            {n.forged && ' (forged)'}
                          </div>
                        ))}
                      </td>
                      <td className="p-2">{c.liesLeft[p.id]}</td>
                      <td className="p-2">{acc ? `${c.cards[acc.targetId]?.name} (${acc.stake})` : '—'}</td>
                      <td className="p-2">{p.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card max-h-80 overflow-y-auto font-mono text-[11px] text-zinc-400">
            {c.log
              .slice()
              .reverse()
              .map((l, i) => (
                <div key={i}>{l.text}</div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
