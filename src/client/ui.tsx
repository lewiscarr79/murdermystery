// Small shared UI helpers.
import type { ReactNode } from 'react';
import type { NoteIcon, NoteView, QuestionDim } from '../shared/types.ts';
import type { PlayerView } from '../shared/view.ts';
import { noteMeaning } from '../shared/profile.ts';

export const DIM_LABEL: Record<QuestionDim, string> = {
  coat: 'Coat',
  arrival: 'Arrived by',
  location: '21:30',
  drink: 'Drink',
  phone: 'Phone',
  team: 'Team',
};

export const ICON: Record<NoteIcon, string> = {
  cctv: '🎥',
  receipt: '🧾',
  glass: '🍸',
  phone: '📱',
  badge: '🪪',
  coat: '🧥',
  photo: '📸',
  witness: '🗣️',
};

/** Character name, with the real player's name underneath where useful. */
export function who(view: PlayerView, id: string): { character: string; player: string } {
  const player = view.players.find((p) => p.id === id)?.name ?? '?';
  const character = view.case?.cast[id]?.name ?? view.lastResult?.cards[id]?.name ?? player;
  return { character, player };
}

export function Name({ view, id, small }: { view: PlayerView; id: string; small?: boolean }) {
  const w = who(view, id);
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={small ? 'text-sm font-medium' : 'font-semibold'}>{w.character}</span>
      {w.character !== w.player && <span className="text-[11px] text-zinc-400">{w.player}</span>}
    </span>
  );
}

export function NoteCard({
  note,
  view,
  dim,
  locked,
  onClick,
  action,
}: {
  note: NoteView;
  view?: PlayerView;
  dim?: boolean;
  locked?: boolean;
  onClick?: () => void;
  action?: ReactNode;
}) {
  const meaning = view ? noteMeaning(note, (id) => who(view, id).character) : null;
  return (
    <div
      onClick={onClick}
      className={`flex gap-3 rounded-xl border p-3 ${dim ? 'border-line/60 bg-panel/60 text-zinc-400' : 'border-line bg-panel2'} ${onClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
    >
      <div className="text-2xl leading-none">{ICON[note.icon]}</div>
      <div className="flex-1 text-sm leading-snug">
        {meaning && (
          <div className={`mb-1 font-semibold ${dim ? 'text-zinc-300' : note.fact.kind === 'killer' ? 'text-gold' : 'text-sky-200'}`}>
            {meaning.icon} {meaning.text}
          </div>
        )}
        <div className={meaning ? 'text-xs text-zinc-400' : ''}>{note.text}</div>
        {locked && <div className="mt-1 text-xs text-gold">Committed to a trade…</div>}
      </div>
      {action}
    </div>
  );
}

export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <div className="pop max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-panel p-4 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl">{title}</h3>
          <button className="text-2xl text-zinc-400" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
