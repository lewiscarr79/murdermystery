import { useState } from 'react';
import { allSuspects, buildProfile } from '../../shared/profile.ts';
import type { Stake } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { Name, who } from '../ui.tsx';
import { TickRow } from './SuspectList.tsx';
import { WantedProfile } from './WantedProfile.tsx';

export function Accuse({ view, api }: { view: PlayerView; api: Api }) {
  const cv = view.case!;
  const [target, setTarget] = useState<string | null>(null);
  const [stake, setStake] = useState<Stake>('hunch');
  const profile = buildProfile(cv);

  if (cv.accusation)
    return (
      <div className="card pop text-center">
        <div className="text-sm text-zinc-400">Locked in</div>
        <div className="mt-2 font-display text-3xl">{who(view, cv.accusation.targetId).character}</div>
        <div className="mt-1 text-sm uppercase tracking-widest text-gold">{cv.accusation.stake}</div>
        <div className="mt-4 text-sm text-zinc-500">Waiting for everyone else — see the bar at the top.</div>
      </div>
    );

  const suspects = allSuspects(cv, profile, view.you);

  return (
    <div className="flex flex-col gap-4">
      <div className="card border-sky-900/60 bg-[#101725]">
        <div className="text-[11px] uppercase tracking-widest text-sky-300">Your job now</div>
        <div className="mt-1 font-semibold">
          {cv.role === 'detective' ? 'Pick the player who best fits the WANTED poster.' : 'Everyone accuses — even you. Pick someone so you look innocent.'}
        </div>
        {view.practice && <div className="mt-1 text-xs text-sky-300/80">Why? ✓ marks show who matches the clues. Remember: 💬 answers could be lies, 📄 records can't.</div>}
      </div>
      {cv.role === 'detective' && <WantedProfile profile={profile} compact />}
      <div className="flex flex-col gap-2">
        {suspects.map((s) => (
          <button key={s.id} className={`card flex flex-col gap-1 p-3 text-left ${target === s.id ? 'border-accent bg-accent/15' : ''}`} onClick={() => setTarget(s.id)}>
            <div className="flex items-center gap-1.5">
              {cv.pins.includes(s.id) && '📌'}
              {cv.marks[s.id] === 'liar' && '🤥'}
              <Name view={view} id={s.id} small />
            </div>
            {cv.role === 'detective' && <TickRow ticks={s.ticks} />}
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
        {target ? `Accuse ${who(view, target).character}` : 'Pick a suspect'}
      </button>
    </div>
  );
}
