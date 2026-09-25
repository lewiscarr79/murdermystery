// Suspect cards: each player's ✓ / ✗ / ? against the Wanted poster.
import type { ProfileEntry, SuspectInfo, Tick } from '../../shared/profile.ts';
import { allSuspects } from '../../shared/profile.ts';
import type { PlayerView } from '../../shared/view.ts';
import { DIM_LABEL, Name } from '../ui.tsx';

const MARK_ICON = { cleared: '✅', suspicious: '❓', liar: '🤥' } as const;

export function TickRow({ ticks }: { ticks: Tick[] }) {
  if (!ticks.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {ticks.map((t) => (
        <span
          key={t.dim}
          className={`rounded-md px-1.5 py-0.5 text-[11px] ${
            t.mark === 'match' ? 'bg-accent/25 text-white' : t.mark === 'mismatch' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-panel2 text-zinc-500'
          }`}
          title={t.value}
        >
          {t.mark === 'match' ? '✓' : t.mark === 'mismatch' ? '✗' : '?'} {DIM_LABEL[t.dim]}
          {t.source === 'record' ? ' 📄' : t.source === 'claim' ? ' 💬' : ''}
        </span>
      ))}
    </div>
  );
}

const TONE: Record<SuspectInfo['tone'], string> = {
  good: 'text-accent',
  bad: 'text-emerald-300',
  neutral: 'text-zinc-500',
  cleared: 'text-emerald-300',
};

export function SuspectList({ view, profile, onSelect, focusOnly }: { view: PlayerView; profile: ProfileEntry[]; onSelect?: (id: string) => void; focusOnly?: boolean }) {
  const cv = view.case!;
  const list = allSuspects(cv, profile, view.you).filter((s) => !focusOnly || cv.pins.includes(s.id));
  return (
    <div className="flex flex-col gap-2">
      {list.map((s) => (
        <button key={s.id} className={`card flex flex-col gap-1.5 p-3 text-left ${s.cleared ? 'opacity-60' : ''}`} onClick={() => onSelect?.(s.id)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {cv.pins.includes(s.id) && '📌'}
              {cv.marks[s.id] && MARK_ICON[cv.marks[s.id]]}
              {cv.allies.includes(s.id) && '🤝'}
              <Name view={view} id={s.id} small />
            </div>
            {view.case?.busy.includes(s.id) && <span className="chip text-[10px] text-zinc-400">busy</span>}
          </div>
          <TickRow ticks={s.ticks} />
          <div className={`text-xs ${TONE[s.tone]}`}>{s.status}</div>
        </button>
      ))}
      <p className="text-[11px] text-zinc-500">
        ✓ matches the killer · ✗ doesn't · ? unknown. 📄 = from a record (certain). 💬 = what they told you (could be a lie).
      </p>
    </div>
  );
}
