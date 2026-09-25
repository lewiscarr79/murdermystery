import { useState } from 'react';
import type { Stake } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { Name, who } from '../ui.tsx';

export function Accuse({ view, api }: { view: PlayerView; api: Api }) {
  const cv = view.case!;
  const [target, setTarget] = useState<string | null>(null);
  const [stake, setStake] = useState<Stake>('hunch');

  if (cv.accusation)
    return (
      <div className="card pop text-center">
        <div className="text-sm text-zinc-400">Locked in</div>
        <div className="mt-2 font-display text-3xl">{who(view, cv.accusation.targetId).character}</div>
        <div className="mt-1 text-sm uppercase tracking-widest text-gold">{cv.accusation.stake}</div>
        <div className="mt-4 text-sm text-zinc-500">Waiting for everyone else…</div>
      </div>
    );

  const others = Object.keys(cv.cast)
    .filter((id) => id !== view.you)
    .sort((a, b) => Number(cv.pins.includes(b)) - Number(cv.pins.includes(a)));

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-zinc-400">
        {cv.role === 'detective' ? 'Who killed Marcus Vale?' : 'Everyone accuses — even you. Pick someone to look innocent.'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {others.map((id) => (
          <button key={id} className={`btn-ghost text-left ${target === id ? 'border-accent bg-accent/15' : ''}`} onClick={() => setTarget(id)}>
            {cv.pins.includes(id) && '📌 '}
            <Name view={view} id={id} small />
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className={`card text-left ${stake === 'sure' ? 'border-accent' : ''}`} onClick={() => setStake('sure')}>
          <div className="font-semibold">Sure</div>
          <div className="text-xs text-zinc-400">+100 if right, −30 if wrong</div>
        </button>
        <button className={`card text-left ${stake === 'hunch' ? 'border-accent' : ''}`} onClick={() => setStake('hunch')}>
          <div className="font-semibold">Hunch</div>
          <div className="text-xs text-zinc-400">+50 if right, 0 if wrong</div>
        </button>
      </div>
      <button className="btn-primary py-4 text-lg" disabled={!target} onClick={() => target && api.act({ type: 'accuse', targetId: target, stake })}>
        Lock in accusation
      </button>
      <p className="text-center text-xs text-zinc-500">No accusation by the buzzer scores 0.</p>
    </div>
  );
}
