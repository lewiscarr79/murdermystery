import { useState } from 'react';
import { MIN_PLAYERS, MAX_PLAYERS } from '../../shared/rules.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';

export function Lobby({ view, api }: { view: PlayerView; api: Api }) {
  const isHost = view.hostId === view.you;
  const [level, setLevel] = useState('normal');
  const link = `${window.location.origin}${window.location.pathname}?code=${view.code}`;
  const need = Math.max(0, MIN_PLAYERS - view.players.length);

  return (
    <div className="flex min-h-screen flex-col gap-4 px-4 py-8">
      <div className="text-center">
        <div className="text-sm text-zinc-400">Game code</div>
        <div className="font-display text-6xl tracking-[0.2em]">{view.code}</div>
        <button className="mt-2 text-sm text-accent underline" onClick={() => navigator.clipboard?.writeText(link)}>
          Copy invite link
        </button>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Players ({view.players.length}/{MAX_PLAYERS})
          </h2>
          {need > 0 && <span className="text-xs text-gold">Need {need} more</span>}
        </div>
        <ul className="flex flex-col gap-2">
          {view.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl bg-panel2 px-3 py-2">
              <span>
                {p.name} {p.id === view.hostId && <span className="chip ml-1">host</span>}
                {p.id === view.you && <span className="chip ml-1">you</span>}
                {!p.connected && !p.isBot && <span className="chip ml-1 text-zinc-500">offline</span>}
              </span>
              {isHost && p.id !== view.you && (
                <button className="text-sm text-zinc-400" onClick={() => api.lobby({ type: 'remove', id: p.id })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <div className="card flex flex-col gap-4">
          <div>
            <div className="mb-2 text-sm text-zinc-400">Add bots to fill seats (any role, even the killer)</div>
            <div className="flex gap-2">
              {['easy', 'normal', 'sharp'].map((l) => (
                <button key={l} className={`chip flex-1 py-2 capitalize ${level === l ? 'border-accent text-white' : ''}`} onClick={() => setLevel(l)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[1, 3, 5].map((n) => (
                <button key={n} className="btn-ghost py-2" onClick={() => api.lobby({ type: 'addBot', level, count: n })}>
                  +{n} bot{n > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="mb-1 text-zinc-400">Cases</div>
              <div className="flex gap-2">
                {[1, 3, 5].map((c) => (
                  <button key={c} className={`chip flex-1 py-2 ${view.settings.cases === c ? 'border-accent text-white' : ''}`} onClick={() => api.lobby({ type: 'settings', cases: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-zinc-400">Pace</div>
              <div className="flex gap-2">
                {(['quick', 'standard'] as const).map((p) => (
                  <button key={p} className={`chip flex-1 py-2 capitalize ${view.settings.pace === p ? 'border-accent text-white' : ''}`} onClick={() => api.lobby({ type: 'settings', pace: p })}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button className="btn-primary py-4 text-lg" disabled={need > 0} onClick={() => api.lobby({ type: 'start' })}>
            Start the party
          </button>
        </div>
      ) : (
        <div className="card text-center text-zinc-400">
          Waiting for the host to start… {view.settings.cases} case{view.settings.cases > 1 ? 's' : ''}, {view.settings.pace} pace.
        </div>
      )}
      <button className="text-sm text-zinc-500" onClick={api.leave}>
        Leave game
      </button>
    </div>
  );
}
