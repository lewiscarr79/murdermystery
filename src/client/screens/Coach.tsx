// "Your job now": one clear step at a time, plus who the table is waiting on.
import { useState, type ReactNode } from 'react';
import { buildProfile, suggestNext, TRAIT_LABEL } from '../../shared/profile.ts';
import { isQuestionRound, isTradingRound, maxAllies } from '../../shared/rules.ts';
import type { RoundId, StatementType } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { Name, Sheet, who } from '../ui.tsx';
import { statementText } from './CaseFile.tsx';
import { WantedProfile } from './WantedProfile.tsx';

export type Tab = 'card' | 'file' | 'offers';

/** Bullet points for the full-screen round intro. */
export function introBullets(view: PlayerView): string[] {
  const cv = view.case!;
  const round = view.round!;
  const killer = cv.role !== 'detective';
  const q = cv.left.questions;
  switch (round) {
    case 'briefing':
      return killer
        ? ['You are on the killer\'s side — nobody else knows.', 'Read who you are and who to frame.', 'Tap "I\'m ready" when done.']
        : ['Read who you are: your coat, drink, phone…', 'Clues will describe the killer. Your job: find who matches.', 'Tap "I\'m ready" when done.'];
    case 'evidence':
      return ['You get your first clue notes.', 'The WANTED poster shows what they say about the killer.', 'Then: make a statement or team up, or skip.'];
    case 'questioning':
    case 'evidence2':
      return killer
        ? [`Ask up to ${q} questions to look innocent.`, 'When asked, lie only about the traits in your briefing.', 'Then: make a statement or team up, or skip.']
        : [`Ask up to ${q} players about themselves.`, 'Compare their answers with the WANTED poster.', 'Answer anyone who asks you — truth, lie or no comment.'];
    case 'trading':
    case 'finalTrades':
      return killer
        ? ['First, a forced blind swap: pick a note to hand over.', 'Then one move: slip your forged note to someone, or grab real evidence.', 'Then: make a statement or team up, or skip.']
        : ['First, a forced blind swap: pick a note to hand over.', 'Then one optional move: swap, give or show a note.', 'Careful — anyone could hand you a forgery.'];
    case 'accusation':
      return ['Pick who you think the killer is.', 'Sure = +100 or −30. Hunch = +50 or 0.'];
    case 'reveal':
      return ['See who did it and how.', 'Tap Continue when you\'re ready.'];
  }
}

function Step({ done, children, action }: { done?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={done ? 'text-zinc-500 line-through' : ''}>
        {done ? '✓' : '○'} {children}
      </span>
      {action}
    </div>
  );
}

function Why({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? <div className="-mt-1 pl-4 text-[11px] text-sky-300/80">Why? {children}</div> : null;
}

export function Coach({ view, api, setTab }: { view: PlayerView; api: Api; setTab: (t: Tab) => void }) {
  const cv = view.case!;
  const round = view.round! as RoundId;
  const killer = cv.role !== 'detective';
  const practice = view.practice;
  const profile = buildProfile(cv);
  const nameOf = (id: string) => who(view, id).character;
  const tip = cv.stage === 'main' ? suggestNext(cv, profile, round, view.you, nameOf) : null;
  const pick = cv.swaps.find((s) => s.status === 'picking' && !s.myPick);
  const replies = cv.swaps.filter((s) => s.status === 'pending' && !s.iAmRequester).length + cv.gives.filter((g) => g.toId === view.you).length + cv.allianceRequests.filter((a) => a.toId === view.you).length;
  const askedThisRound = cv.asked.filter((q) => q.round === round).length;
  const pulse = practice ? 'animate-pulse' : '';

  if (cv.stage === 'wrap' || round === 'accusation' || round === 'reveal') return null;

  let goal = '';
  let steps: ReactNode = null;
  let finishLabel = "I'm done — next";
  if (round === 'briefing') {
    goal = killer ? 'Learn your secret role and who to frame.' : 'Get to know your character.';
    steps = (
      <>
        <Step>Read your role and your character card below</Step>
        <Why show={practice}>Other players will ask about these details. Clues describe the killer's details.</Why>
      </>
    );
    finishLabel = "I'm ready";
  } else if (round === 'evidence') {
    goal = killer ? 'See the real clues — and your forged note.' : 'Read your first clues.';
    steps = (
      <>
        <Step action={<button className="chip" onClick={() => setTab('file')}>Open</button>}>Read your notes in the Case File</Step>
        <Why show={practice}>Each note tells you one thing about the killer — the WANTED poster adds them up for you.</Why>
      </>
    );
    finishLabel = "I've read them";
  } else if (isQuestionRound(round)) {
    goal = killer ? 'Blend in. Lie only where the clues point at you.' : 'Find out who matches the WANTED poster.';
    steps = (
      <>
        <Step done={cv.left.questions <= 0} action={cv.left.questions > 0 && <button className="chip" onClick={() => setTab('file')}>Pick someone</button>}>
          Ask questions ({askedThisRound} asked, {cv.left.questions} left)
        </Step>
        <Why show={practice}>Players answer from their card — but anyone can lie. Tap a suspect in the Case File to ask.</Why>
        {cv.incoming.length > 0 && (
          <Step action={<button className={`chip border-accent text-white ${pulse}`} onClick={() => setTab('offers')}>Answer</button>}>
            <span className="text-accent">{cv.incoming.length} question{cv.incoming.length > 1 ? 's' : ''} waiting for you</span>
          </Step>
        )}
        {killer && cv.killerBriefing && (
          <div className="text-xs text-accent">
            Lie only about: {cv.killerBriefing.dangerousDims.map((d) => TRAIT_LABEL[d]).join(', ')} · {cv.liesLeft} lies left
          </div>
        )}
      </>
    );
    finishLabel = "I'm done asking";
  } else if (isTradingRound(round)) {
    goal = killer ? 'Spread your forgery. Hide the real evidence.' : 'Get more clues by trading notes.';
    steps = (
      <>
        <Step done={!pick} action={pick && <button className={`chip border-accent text-white ${pulse}`} onClick={() => setTab('offers')}>Pick</button>}>
          Forced blind swap: choose a note to hand over
        </Step>
        <Why show={practice}>Everyone swaps one note blind with a random player. You won't know what you'll get.</Why>
        <Step done={cv.left.requests <= 0} action={cv.left.requests > 0 && <button className="chip" onClick={() => setTab('file')}>Choose</button>}>
          Optional: one move — swap, give or show a note
        </Step>
        <Why show={practice}>Tap a suspect in the Case File. A swap is blind; a show flashes your note on their phone and you keep it.</Why>
        {replies > 0 && (
          <Step action={<button className={`chip border-accent text-white ${pulse}`} onClick={() => setTab('offers')}>Reply</button>}>
            <span className="text-accent">{replies} request{replies > 1 ? 's' : ''} waiting for your reply</span>
          </Step>
        )}
      </>
    );
    finishLabel = "I'm done trading";
  }

  return (
    <div className="card mb-4 border-sky-900/60 bg-[#101725]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-sky-300">Your job now{round !== 'briefing' ? ' · step 1 of 2' : ''}</div>
        {practice && <span className="chip border-sky-700 text-sky-300">practice</span>}
      </div>
      <div className="mt-1 font-semibold">{goal}</div>
      <div className="mt-2 flex flex-col gap-2">{steps}</div>
      {tip && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-panel2 p-2 text-sm">
          <span>💡 {tip.text}</span>
          {tip.kind === 'ask' && (
            <button className="chip shrink-0 border-gold text-gold" onClick={() => api.act({ type: 'ask', targetId: tip.targetId, dim: tip.dim })}>
              Ask
            </button>
          )}
          {tip.kind === 'swap' && tip.targetId && cv.left.requests > 0 && (
            <button className="chip shrink-0 border-gold text-gold" onClick={() => api.act({ type: 'requestSwap', targetId: tip.targetId! })}>
              Swap
            </button>
          )}
        </div>
      )}
      <button className={`btn-primary mt-3 w-full ${cv.ready ? 'opacity-60' : ''}`} disabled={cv.ready} onClick={() => api.act({ type: 'done' })}>
        {finishLabel}
      </button>
    </div>
  );
}

/** Step 2: the end-of-round moment — say something, team up, or go it alone. */
export function WrapUp({ view, api }: { view: PlayerView; api: Api }) {
  const cv = view.case!;
  const round = view.round!;
  const practice = view.practice;
  const [type, setType] = useState<StatementType | null>(null);
  const others = Object.keys(cv.cast).filter((id) => id !== view.you);
  const mySaid = cv.statements.filter((s) => s.by === view.you && s.round === round);
  const canSay = cv.left.statements > 0;
  const allyLimit = maxAllies(view.players.length);
  const incoming = cv.allianceRequests.filter((a) => a.toId === view.you);
  const outgoing = cv.allianceRequests.filter((a) => a.fromId === view.you);
  const [teamUp, setTeamUp] = useState(false);
  const killer = cv.role !== 'detective';

  const say = async (payload: { targetId?: string; value?: string }) => {
    const r = await api.act({ type: 'statement', statementType: type!, ...payload });
    if (r.ok) setType(null);
  };
  const types: [StatementType, string][] = [
    ['wasAt', 'I was at…'],
    ['vouch', 'I vouch for…'],
    ['lied', '… lied to me'],
    ...(cv.statementOptions.suspectAllowed ? ([['suspect', 'I suspect…']] as [StatementType, string][]) : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="card border-gold/50">
        <div className="text-[11px] uppercase tracking-widest text-gold">End of round · step 2 of 2</div>
        <div className="mt-1 font-semibold">Say something? Team up? Both are optional.</div>
        {practice && <div className="mt-1 text-xs text-sky-300/80">Why? Statements are public — use them to clear your name, point a finger, or throw people off. Allies can swap freely and score together.</div>}
      </div>

      <div className="card">
        <div className="mb-2 font-semibold">📣 Make a statement {!canSay && <span className="text-xs text-zinc-500">(done)</span>}</div>
        {mySaid.map((s) => (
          <div key={s.id} className="mb-2 rounded-lg bg-panel2 px-3 py-2 text-sm">
            You said: {statementText(view, s.type, s.targetId, s.value)}
          </div>
        ))}
        {canSay && !type && (
          <div className="grid grid-cols-2 gap-2">
            {types.map(([t, label]) => (
              <button key={t} className="btn-ghost py-2 text-sm" onClick={() => setType(t)}>
                {label}
              </button>
            ))}
          </div>
        )}
        {canSay && type === 'wasAt' && (
          <div className="grid grid-cols-2 gap-2">
            {cv.statementOptions.spots.map((s) => (
              <button key={s} className="btn-ghost py-2 text-sm" onClick={() => say({ value: s })}>
                {s}
              </button>
            ))}
          </div>
        )}
        {canSay && type && type !== 'wasAt' && (
          <div className="grid grid-cols-2 gap-2">
            {others.map((id) => (
              <button key={id} className="btn-ghost py-2 text-left" onClick={() => say({ targetId: id })}>
                <Name view={view} id={id} small />
              </button>
            ))}
          </div>
        )}
        {type && (
          <button className="mt-2 text-sm text-zinc-400" onClick={() => setType(null)}>
            Back
          </button>
        )}
        <div className="mt-2 text-[11px] text-zinc-500">Everyone sees statements. They can be lies{killer ? ' — useful for you.' : '.'}</div>
      </div>

      {cv.alliancesEnabled && (
        <div className="card">
          <div className="mb-2 font-semibold">🤝 Team up?</div>
          {cv.allies.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              Your secret ally: {cv.allies.map((a) => <Name key={a} view={view} id={a} small />)}
            </div>
          )}
          {incoming.map((a) => (
            <div key={a.id} className="mb-2 rounded-xl bg-panel2 p-3">
              <div className="text-sm">
                <span className="font-semibold">{who(view, a.fromId).character}</span> wants to be your secret ally
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="btn-primary py-2" onClick={() => api.act({ type: 'respondAlliance', allianceId: a.id, accept: true })}>
                  Accept
                </button>
                <button className="btn-ghost py-2" onClick={() => api.act({ type: 'respondAlliance', allianceId: a.id, accept: false })}>
                  Go it alone
                </button>
              </div>
            </div>
          ))}
          {outgoing.map((a) => (
            <div key={a.id} className="mb-2 flex items-center justify-between rounded-xl bg-panel2 p-3 text-sm">
              <span>Waiting for {who(view, a.toId).character} to answer…</span>
              <button className="chip" onClick={() => api.act({ type: 'cancelRequest', requestId: a.id })}>
                Cancel
              </button>
            </div>
          ))}
          {cv.allies.length < allyLimit && outgoing.length === 0 && (
            <>
              {!teamUp ? (
                <button className="btn-ghost w-full py-2" onClick={() => setTeamUp(true)}>
                  Propose an alliance…
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {others
                    .filter((id) => !cv.allies.includes(id))
                    .map((id) => (
                      <button
                        key={id}
                        className="btn-ghost py-2 text-left"
                        onClick={async () => {
                          const r = await api.act({ type: 'proposeAlliance', targetId: id });
                          if (r.ok) setTeamUp(false);
                        }}
                      >
                        <Name view={view} id={id} small />
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          <div className="mt-2 text-[11px] text-zinc-500">
            Allies swap notes freely and each get +20 if you both catch the killer. It's secret until the reveal — and your ally could be the killer.
          </div>
        </div>
      )}

      <button className="btn-primary py-4 text-lg" disabled={cv.ready} onClick={() => api.act({ type: 'done' })}>
        {cv.ready ? 'Finished ✓' : 'Finish round'}
      </button>
      <WantedProfile profile={buildProfile(cv)} compact />
    </div>
  );
}

const PRIORITY_REASONS = ['answering a question', 'choosing a note to swap', 'responding to a request'];

/** Header pill + sheet: who is holding up the game (including you). */
export function WaitingBar({ view, api }: { view: PlayerView; api: Api }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const waiting = view.waitingOn;
  const me = waiting.find((w) => w.playerId === view.you);
  const label = (id: string) => (id === view.you ? 'You' : view.players.find((p) => p.id === id)?.name ?? '?');
  const names = waiting.slice(0, 3).map((w) => label(w.playerId)).join(', ') + (waiting.length > 3 ? ` +${waiting.length - 3}` : '');
  return (
    <>
      <button className={`chip max-w-[55%] truncate py-1.5 text-left ${me ? 'border-accent text-white' : ''}`} onClick={() => setOpen(true)}>
        {waiting.length === 0 ? 'Moving on…' : me ? `⏳ Waiting on ${names}` : `✓ Done · waiting on ${names}`}
      </button>
      {open && (
        <Sheet title={`Waiting on ${waiting.length}`} onClose={() => { setOpen(false); setConfirm(false); }}>
          <div className="flex flex-col gap-2">
            {waiting.map((w) => (
              <div key={w.playerId} className={`flex items-center justify-between rounded-xl px-3 py-2 ${w.playerId === view.you ? 'bg-accent/20' : 'bg-panel2'}`}>
                <span className="font-semibold">{label(w.playerId)}</span>
                <span className={`text-sm ${PRIORITY_REASONS.includes(w.reason) ? 'text-accent' : 'text-zinc-400'}`}>{w.reason}</span>
              </div>
            ))}
          </div>
          {view.hostId === view.you && waiting.length > 0 && (
            <div className="mt-4">
              {!confirm ? (
                <button className="btn-ghost w-full" onClick={() => setConfirm(true)}>
                  Host: move on without them
                </button>
              ) : (
                <button
                  className="btn-primary w-full"
                  onClick={async () => {
                    await api.lobby({ type: 'advance' });
                    setOpen(false);
                    setConfirm(false);
                  }}
                >
                  Skip {waiting.map((w) => label(w.playerId)).join(', ')}?
                </button>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Loud banner when the table is waiting on you for something specific. */
export function YouBanner({ view, setTab }: { view: PlayerView; setTab: (t: Tab) => void }) {
  const me = view.waitingOn.find((w) => w.playerId === view.you);
  const others = view.waitingOn.filter((w) => w.playerId !== view.you).length;
  if (!me) return null;
  const urgent = PRIORITY_REASONS.includes(me.reason);
  if (!urgent && others > 0) return null;
  const text: Record<string, string> = {
    'answering a question': 'Everyone is waiting for you — answer your question',
    'choosing a note to swap': 'Everyone is waiting for you — pick a note to swap',
    'responding to a request': 'Everyone is waiting for you — reply to a request',
  };
  return (
    <button
      className="w-full bg-accent px-4 py-2 text-left text-sm font-semibold text-white"
      onClick={() => urgent && setTab('offers')}
    >
      {text[me.reason] ?? "You're the last one — finish when you're ready"} {urgent && '→'}
    </button>
  );
}
