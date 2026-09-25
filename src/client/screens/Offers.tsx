import { useState } from 'react';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { ICON, NoteCard, formatClock, who } from '../ui.tsx';
import type { NoteIcon } from '../../shared/types.ts';

export function offerCount(view: PlayerView): number {
  const cv = view.case;
  if (!cv) return 0;
  return (
    cv.incoming.length +
    cv.swaps.filter((s) => (s.status === 'pending' && !s.iAmRequester) || (s.status === 'picking' && !s.myPick)).length +
    cv.gives.filter((g) => g.toId === view.you).length +
    cv.allianceRequests.filter((a) => a.toId === view.you).length
  );
}

export function Offers({ view, api, now }: { view: PlayerView; api: Api; now: number }) {
  const cv = view.case!;
  const name = (id: string) => who(view, id).character;
  const [lying, setLying] = useState<string | null>(null);
  const left = (deadline: number) => formatClock(Math.max(0, deadline - now));
  const free = cv.hand.filter((n) => !cv.lockedNoteIds.includes(n.id));
  const nothing = offerCount(view) === 0 && !cv.swaps.length && !cv.gives.length && !cv.allianceRequests.length;

  return (
    <div className="flex flex-col gap-3">
      {nothing && <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-500">Nothing waiting for you. Questions, swaps and offers land here.</div>}

      {cv.incoming.map((q) => (
        <div key={q.id} className="card pop border-gold">
          <div className="text-xs uppercase tracking-widest text-gold">{name(q.askerId)} asks</div>
          <div className="mt-1 font-display text-xl">{q.question}</div>
          {lying === q.id ? (
            <div className="mt-3 grid grid-cols-1 gap-2">
              {cv.lieOptions[q.dim].map((v) => (
                <button key={v} className="btn-ghost" onClick={() => api.act({ type: 'answer', questionId: q.id, mode: 'lie', lieValue: v })}>
                  "{v}"
                </button>
              ))}
              <button className="text-sm text-zinc-400" onClick={() => setLying(null)}>
                Back
              </button>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button className="btn-primary px-2" onClick={() => api.act({ type: 'answer', questionId: q.id, mode: 'truth' })}>
                Truth
              </button>
              <button className="btn-ghost px-2" disabled={cv.liesLeft <= 0} onClick={() => setLying(q.id)}>
                Lie ({cv.liesLeft})
              </button>
              <button className="btn-ghost px-2" onClick={() => api.act({ type: 'answer', questionId: q.id, mode: 'nocomment' })}>
                No comment
              </button>
            </div>
          )}
          <div className="mt-2 text-xs text-zinc-500">
            Truth: <span className="text-zinc-300">{q.dim === 'location' ? cv.card.location : cv.card.traits[q.dim]}</span> · unanswered becomes "No comment" at the buzzer
          </div>
        </div>
      ))}

      {cv.swaps.map((s) => {
        const others = s.members.filter((m) => m !== view.you).map(name).join(' & ');
        if (s.status === 'pending' && !s.iAmRequester)
          return (
            <div key={s.id} className="card pop">
              <div className="font-semibold">{others} wants to swap evidence</div>
              <div className="text-xs text-zinc-500">Blind: you each pick a note without seeing theirs · {left(s.deadline)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => api.act({ type: 'respondSwap', swapId: s.id, accept: true })}>
                  Accept
                </button>
                <button className="btn-ghost" onClick={() => api.act({ type: 'respondSwap', swapId: s.id, accept: false })}>
                  Decline
                </button>
              </div>
            </div>
          );
        if (s.status === 'pending')
          return (
            <div key={s.id} className="card text-sm text-zinc-400">
              Waiting for {others} to answer your swap… {left(s.deadline)}
            </div>
          );
        if (s.myPick)
          return (
            <div key={s.id} className="card text-sm text-zinc-400">
              {s.kind === 'forced' ? 'Forced swap' : 'Swap'} with {others}: waiting for their pick… {left(s.deadline)}
            </div>
          );
        return (
          <div key={s.id} className="card pop border-accent">
            <div className="font-semibold">
              {s.kind === 'forced' ? '🎲 Forced blind swap' : 'Swap'} with {others}
            </div>
            <div className="text-xs text-zinc-500">
              Pick a note to give · {left(s.deadline)} {s.kind === 'forced' ? '(random pick if time runs out)' : '(or the swap is cancelled)'}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {free.map((n) => (
                <NoteCard key={n.id} note={n} onClick={() => api.act({ type: 'pickSwap', swapId: s.id, noteId: n.id })} />
              ))}
            </div>
          </div>
        );
      })}

      {cv.gives.map((g) =>
        g.toId === view.you ? (
          <div key={g.id} className="card pop">
            <div className="font-semibold">
              {name(g.fromId)} wants to give you a note {g.icon && ICON[g.icon as NoteIcon]}
            </div>
            <div className="text-xs text-zinc-500">You'll see it once you accept · {left(g.deadline)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => api.act({ type: 'respondGive', giveId: g.id, accept: true })}>
                Accept
              </button>
              <button className="btn-ghost" onClick={() => api.act({ type: 'respondGive', giveId: g.id, accept: false })}>
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div key={g.id} className="card text-sm text-zinc-400">
            Waiting for {name(g.toId)} to accept your note… {left(g.deadline)}
          </div>
        ),
      )}

      {cv.allianceRequests.map((a) =>
        a.toId === view.you ? (
          <div key={a.id} className="card pop">
            <div className="font-semibold">🤝 {name(a.fromId)} proposes a secret alliance</div>
            <div className="text-xs text-zinc-500">Allies swap freely and score +20 each if both catch the killer. It stays secret until the reveal. · {left(a.deadline)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => api.act({ type: 'respondAlliance', allianceId: a.id, accept: true })}>
                Accept
              </button>
              <button className="btn-ghost" onClick={() => api.act({ type: 'respondAlliance', allianceId: a.id, accept: false })}>
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div key={a.id} className="card text-sm text-zinc-400">
            Waiting for {name(a.toId)} to answer your alliance… {left(a.deadline)}
          </div>
        ),
      )}
    </div>
  );
}
