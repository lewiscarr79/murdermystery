// The "Wanted" poster: what your clues say about the killer so far.
import type { ProfileEntry } from '../../shared/profile.ts';
import { DIM_LABEL } from '../ui.tsx';

export function WantedProfile({ profile, compact }: { profile: ProfileEntry[]; compact?: boolean }) {
  const known = profile.filter((p) => p.status !== 'unknown');
  const unknown = profile.filter((p) => p.status === 'unknown');
  return (
    <div className="rounded-2xl border-2 border-dashed border-gold/60 bg-[#1a1609] p-3">
      <div className="flex items-baseline justify-between">
        <div className="font-display text-lg tracking-[0.3em] text-gold">WANTED</div>
        <div className="text-[11px] text-zinc-400">What your clues say about the killer</div>
      </div>
      {known.length === 0 ? (
        <div className="mt-2 text-sm text-zinc-400">No clues yet. Clues arrive in the Evidence round.</div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {known.map((p) => (
            <div key={p.dim} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-zinc-400">{DIM_LABEL[p.dim]}</span>
              <span className="text-right">
                {p.status === 'conflict' ? (
                  <>
                    <span className="font-semibold text-accent">{p.values.map((v) => v.value).join(' or ')}</span>
                    {!compact && <div className="text-[11px] text-accent/80">Your notes disagree — one of them is forged</div>}
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-white">{p.best}</span>{' '}
                    <span className="text-[11px] text-zinc-400">
                      {p.status === 'confirmed' ? '🔒 confirmed' : `${p.values[0].notes} note${p.values[0].notes > 1 ? 's' : ''}`}
                    </span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {!compact && unknown.length > 0 && known.length > 0 && (
        <div className="mt-2 text-[11px] text-zinc-500">Not found yet: {unknown.map((p) => DIM_LABEL[p.dim].toLowerCase()).join(', ')}</div>
      )}
    </div>
  );
}
