// Requests: everything waiting for your reply (questions, swaps, gives, alliances) and your own pending asks.
import { useState } from 'react';
import type { NoteIcon } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { ICON, NoteCard, who } from '../ui.tsx';

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

export function Offers({ view, api }: { view: PlayerView; api: Api }) {
  const cv = view.case!;
  const name = (id: string) => who(view, id).character;
  const [lying, setLying] = useState<string | null>(null);
  const free = cv.hand.filter((n) => !cv.lockedNoteIds.includes(n.id));
  const nothing = !cv.incoming.length && !cv.swaps.length && !cv.gives.length && !cv.allianceRequests.length;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-widest text-zinc-500">Waiting for you</h2>
      {nothing && <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-500">Nothing waiting for you. Questions and trade requests appear here.</div>}

      {cv.incoming.map((q) => {
        const truth = q.dim === 'location' ? cv.card.location : cv.card.traits[q.dim];
        return (
          <div key={q.id} className="card pop border-gold">
            <div className="text-xs uppercase tracking-widest text-gold">{name(q.askerId)} asks you</div>
            <div className="mt-1 font-display text-xl">{q.question}</div>
            <div className="mt-1 text-sm text-zinc-400">
              The truth (from your card): <span className="font-semibold text-white">{truth}</span>
            </div>
            {lying === q.id ? (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="text-xs text-zinc-400">Pick your lie ({cv.liesLeft} left):</div>
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
                  Tell truth
                </button>
                <button className="btn-ghost px-2" disabled={cv.liesLeft <= 0} onClick={() => setLying(q.id)}>
                  Lie ({cv.liesLeft})
                </button>
                <button className="btn-ghost px-2" onClick={() => api.act({ type: 'answer', questionId: q.id, mode: 'nocomment' })}>
                  No comment
                </button>
              </div>
            )}
            <div className="mt-2 text-[11px] text-zinc-500">Only {name(q.askerId)} sees your answer. "No comment" looks suspicious.</div>
          </div>
        );
      })}

      {cv.swaps
        .filter((s) => (s.status === 'pending' && !s.iAmRequester) || (s.status === 'picking' && !s.myPick))
        .map((s) => {
          const others = s.members.filter((m) => m !== view.you).map(name).join(' & ');
          if (s.status === 'pending')
            return (
              <div key={s.id} className="card pop">
                <div className="font-semibold">{others} wants to swap notes with you</div>
                <div className="text-xs text-zinc-500">Blind swap: you each pick one note to hand over without seeing theirs. It could be a forgery.</div>
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
          return (
            <div key={s.id} className="card pop border-accent">
              <div className="font-semibold">
                {s.kind === 'forced' ? '🎲 Forced blind swap' : 'Swap'} with {others}
              </div>
              <div className="text-xs text-zinc-500">Tap the note you want to hand over. You'll get one of theirs back.</div>
              <div className="mt-3 flex flex-col gap-2">
                {free.map((n) => (
                  <NoteCard key={n.id} note={n} view={view} onClick={() => api.act({ type: 'pickSwap', swapId: s.id, noteId: n.id })} />
                ))}
              </div>
            </div>
          );
        })}

      {cv.gives
        .filter((g) => g.toId === view.you)
        .map((g) => (
          <div key={g.id} className="card pop">
            <div className="font-semibold">
              {name(g.fromId)} wants to give you a note {g.icon && ICON[g.icon as NoteIcon]}
            </div>
            <div className="text-xs text-zinc-500">A free note — but why are they giving it away? You'll see it once you accept.</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => api.act({ type: 'respondGive', giveId: g.id, accept: true })}>
                Accept
              </button>
              <button className="btn-ghost" onClick={() => api.act({ type: 'respondGive', giveId: g.id, accept: false })}>
                Decline
              </button>
            </div>
          </div>
        ))}

      {cv.allianceRequests
        .filter((a) => a.toId === view.you)
        .map((a) => (
          <div key={a.id} className="card pop">
            <div className="font-semibold">🤝 {name(a.fromId)} wants to be your secret ally</div>
            <div className="text-xs text-zinc-500">Allies swap freely and each get +20 if both catch the killer. Your ally could be the killer.</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={() => api.act({ type: 'respondAlliance', allianceId: a.id, accept: true })}>
                Accept
              </button>
              <button className="btn-ghost" onClick={() => api.act({ type: 'respondAlliance', allianceId: a.id, accept: false })}>
                Go it alone
              </button>
            </div>
          </div>
        ))}

      {(cv.swaps.some((s) => (s.iAmRequester && s.status === 'pending') || (s.status === 'picking' && s.myPick)) ||
        cv.gives.some((g) => g.fromId === view.you) ||
        cv.allianceRequests.some((a) => a.fromId === view.you)) && <h2 className="mt-2 text-xs uppercase tracking-widest text-zinc-500">Your requests</h2>}
      {cv.swaps
        .filter((s) => s.iAmRequester && s.status === 'pending')
        .map((s) => (
          <Pending key={s.id} text={`Waiting for ${name(s.members[1])} to accept your swap…`} onCancel={() => api.act({ type: 'cancelRequest', requestId: s.id })} />
        ))}
      {cv.swaps
        .filter((s) => s.status === 'picking' && s.myPick)
        .map((s) => (
          <Pending key={s.id} text={`You picked your note — waiting for ${s.members.filter((m) => m !== view.you).map(name).join(' & ')} to pick theirs…`} />
        ))}
      {cv.gives
        .filter((g) => g.fromId === view.you)
        .map((g) => (
          <Pending key={g.id} text={`Waiting for ${name(g.toId)} to accept your note…`} onCancel={() => api.act({ type: 'cancelRequest', requestId: g.id })} />
        ))}
      {cv.allianceRequests
        .filter((a) => a.fromId === view.you)
        .map((a) => (
          <Pending key={a.id} text={`Waiting for ${name(a.toId)} to answer your alliance…`} onCancel={() => api.act({ type: 'cancelRequest', requestId: a.id })} />
        ))}
    </div>
  );
}

function Pending({ text, onCancel }: { text: string; onCancel?: () => void }) {
  return (
    <div className="card flex items-center justify-between gap-2 text-sm text-zinc-400">
      <span>{text}</span>
      {onCancel && (
        <button className="chip shrink-0" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
