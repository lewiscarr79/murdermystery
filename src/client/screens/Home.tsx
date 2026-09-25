import { useState } from 'react';
import type { Api } from '../net.ts';

export function Home({ api, connected }: { api: Api; connected: boolean }) {
  const params = new URLSearchParams(window.location.search);
  const [name, setName] = useState('');
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [botPlayers, setBotPlayers] = useState(6);
  const [botLevel, setBotLevel] = useState('normal');

  const run = async (f: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError('');
    const r = await f();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Something went wrong');
  };

  return (
    <div className="flex min-h-screen flex-col gap-6 px-4 py-10">
      <header className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-accent">A murder mystery for your phone</div>
        <h1 className="mt-2 font-display text-5xl">Launch Night</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
          The founder is dead. One of you did it. Question each other, trade evidence, and catch the killer before the timer runs out.
        </p>
      </header>

      <div className="card flex flex-col gap-3">
        <label className="text-sm text-zinc-400" htmlFor="name">
          Your name
        </label>
        <input id="name" className="input" maxLength={16} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lewis" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            className="input uppercase tracking-[0.3em]"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            aria-label="Game code"
          />
          <button className="btn-primary" disabled={busy || !connected || code.length !== 4 || !name.trim()} onClick={() => run(() => api.join(code, name))}>
            Join
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
        </div>
        <button className="btn-ghost" disabled={busy || !connected || !name.trim()} onClick={() => run(() => api.create(name))}>
          Host a new game
        </button>
        {error && <div className="text-sm text-accent">{error}</div>}
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm text-zinc-300">Test mode: watch an all-bot game</summary>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <label className="flex items-center justify-between">
            Players <span className="font-semibold">{botPlayers}</span>
          </label>
          <input type="range" min={4} max={22} value={botPlayers} onChange={(e) => setBotPlayers(Number(e.target.value))} />
          <div className="flex gap-2">
            {['easy', 'normal', 'sharp'].map((l) => (
              <button key={l} className={`chip flex-1 py-2 capitalize ${botLevel === l ? 'border-accent text-white' : ''}`} onClick={() => setBotLevel(l)}>
                {l}
              </button>
            ))}
          </div>
          <button className="btn-ghost" disabled={busy || !connected} onClick={() => run(() => api.botGame({ players: botPlayers, level: botLevel, cases: 3, pace: 'quick' }))}>
            Watch bots play
          </button>
        </div>
      </details>
    </div>
  );
}
