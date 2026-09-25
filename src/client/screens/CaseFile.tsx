import { useState } from 'react';
import { buildProfile, suspectInfo } from '../../shared/profile.ts';
import { isQuestionRound, isTradingRound } from '../../shared/rules.ts';
import { QUESTION_DIMS, type Mark, type NoteView, type StatementType } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { DIM_LABEL, NoteCard, Sheet, who } from '../ui.tsx';
import { SuspectList, TickRow } from './SuspectList.tsx';
import { WantedProfile } from './WantedProfile.tsx';

const MARK_ICON: Record<Mark, string> = { cleared: '✅', suspicious: '❓', liar: '🤥' };

export function CaseFile({ view, api }: { view: PlayerView; api: Api }) {
  const cv = view.case!;
  const [selected, setSelected] = useState<string | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const profile = buildProfile(cv);

  return (
    <div className="flex flex-col gap-5">
      <WantedProfile profile={profile} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500">Suspects — tap one to act</h2>
          <button className={`chip ${focusOnly ? 'border-gold text-gold' : ''}`} onClick={() => setFocusOnly((f) => !f)}>
            📌 Pinned only ({cv.pins.length}/6)
          </button>
        </div>
        <SuspectList view={view} profile={profile} onSelect={setSelected} focusOnly={focusOnly} />
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Your notes — you can trade these ({cv.hand.length})</h2>
        <div className="flex flex-col gap-2">
          {cv.hand.length ? cv.hand.map((n) => <NoteCard key={n.id} note={n} view={view} locked={cv.lockedNoteIds.includes(n.id)} />) : <Empty text="No notes yet — they arrive in the Evidence round." />}
        </div>
      </section>

      {cv.announcements.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Official announcements — always true</h2>
          <div className="flex flex-col gap-2">
            {cv.announcements.map((n) => (
              <NoteCard key={n.id} note={n} view={view} action={<span title="Always genuine">🔒</span>} />
            ))}
          </div>
        </section>
      )}

      {cv.seen.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Notes you've seen — can't trade ({cv.seen.length})</h2>
          <div className="flex flex-col gap-2">
            {cv.seen.map((n) => (
              <NoteCard key={n.id} note={n} view={view} dim />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">What people have said (made at the end of each round)</h2>
        <div className="flex flex-col gap-1 text-sm">
          {cv.statements.length ? (
            cv.statements
              .slice()
              .reverse()
              .map((st) => (
                <div key={st.id} className="rounded-lg bg-panel2 px-3 py-2">
                  <span className="font-semibold">{who(view, st.by).character}:</span> {statementText(view, st.type, st.targetId, st.value)}
                </div>
              ))
          ) : (
            <Empty text="Nobody has said anything yet." />
          )}
        </div>
      </section>

      {selected && <PlayerSheet view={view} api={api} pid={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-line p-3 text-center text-sm text-zinc-500">{text}</div>;
}

export function statementText(view: PlayerView, type: StatementType, targetId?: string, value?: string): string {
  const t = targetId ? who(view, targetId).character : '';
  switch (type) {
    case 'wasAt':
      return `"I was at the ${value?.toLowerCase()} at 21:30."`;
    case 'vouch':
      return `"I vouch for ${t}."`;
    case 'lied':
      return `"${t} lied to me."`;
    case 'suspect':
      return `"I suspect ${t}."`;
  }
}

function PlayerSheet({ view, api, pid, onClose }: { view: PlayerView; api: Api; pid: string; onClose: () => void }) {
  const cv = view.case!;
  const round = view.round!;
  const [mode, setMode] = useState<'menu' | 'ask' | 'give' | 'show'>('menu');
  const name = who(view, pid).character;
  const asked = new Set(cv.asked.filter((q) => q.targetId === pid).map((q) => q.dim));
  const answers = cv.asked.filter((q) => q.targetId === pid);
  const busy = cv.busy.includes(pid);
  const pendingOut = cv.swaps.some((s) => s.iAmRequester && s.status === 'pending') || cv.gives.some((g) => g.fromId === view.you);
  const isAlly = cv.allies.includes(pid);
  const free = cv.hand.filter((n) => !cv.lockedNoteIds.includes(n.id));
  const info = suspectInfo(cv, buildProfile(cv), pid);
  const mainStep = cv.stage === 'main';

  const run = async (a: Parameters<Api['act']>[0], close = true) => {
    const r = await api.act(a);
    if (r.ok && close) onClose();
  };

  const pickNote = (onPick: (n: NoteView) => void) => (
    <div className="flex flex-col gap-2">
      {free.length ? free.map((n) => <NoteCard key={n.id} note={n} view={view} onClick={() => onPick(n)} />) : <Empty text="No free notes to use." />}
    </div>
  );

  return (
    <Sheet title={name} onClose={onClose}>
      {mode === 'ask' && (
        <div className="grid grid-cols-1 gap-2">
          {QUESTION_DIMS.map((d) => (
            <button key={d} className="btn-ghost text-left" disabled={asked.has(d)} onClick={() => run({ type: 'ask', targetId: pid, dim: d })}>
              {cv.questions[d]} {asked.has(d) && <span className="text-xs text-zinc-500">(asked)</span>}
            </button>
          ))}
        </div>
      )}
      {mode === 'give' && pickNote((n) => run({ type: 'give', targetId: pid, noteId: n.id }))}
      {mode === 'show' && pickNote((n) => run({ type: 'show', targetId: pid, noteId: n.id }))}
      {mode === 'menu' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <TickRow ticks={info.ticks} />
            <div className="text-xs text-zinc-400">{info.status}</div>
          </div>
          {answers.length > 0 && (
            <div className="rounded-xl bg-panel2 p-3 text-sm">
              <div className="mb-1 text-xs uppercase tracking-widest text-zinc-500">What {name} told you</div>
              {answers.map((q) => (
                <div key={q.id}>
                  {DIM_LABEL[q.dim]}: <span className="font-semibold">{q.answer ? (q.answer.value ?? 'No comment') : 'waiting…'}</span>
                </div>
              ))}
            </div>
          )}
          {!mainStep && (isQuestionRound(round) || isTradingRound(round)) && (
            <div className="rounded-xl bg-panel2 p-3 text-sm text-zinc-400">You've moved on to the end of the round — questions and trades are done for this round.</div>
          )}
          {mainStep && isQuestionRound(round) && (
            <button className="btn-primary" disabled={cv.left.questions <= 0 || busy} onClick={() => setMode('ask')}>
              {busy ? `${name} is busy (3 questions already)` : cv.left.questions <= 0 ? 'No questions left this round' : `Ask ${name} a question (${cv.left.questions} left)`}
            </button>
          )}
          {mainStep && isTradingRound(round) && (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-zinc-400">
                {cv.left.requests > 0 ? 'Your one move this round:' : isAlly ? 'Your move is used, but allies can always swap:' : "You've used your move this round."}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button className="btn-primary px-2" disabled={(!isAlly && cv.left.requests <= 0) || pendingOut || !cv.hand.length} onClick={() => run({ type: 'requestSwap', targetId: pid })}>
                  Swap{isAlly ? ' (free)' : ''}
                </button>
                <button className="btn-ghost px-2" disabled={cv.left.requests <= 0 || pendingOut || !free.length} onClick={() => setMode('give')}>
                  Give
                </button>
                <button className="btn-ghost px-2" disabled={cv.left.requests <= 0 || !cv.hand.length} onClick={() => setMode('show')}>
                  Show
                </button>
              </div>
              <div className="text-[11px] text-zinc-500">Swap: blind, one note each. Give: hand over a note for nothing. Show: flash a note on their phone and keep it.</div>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs uppercase tracking-widest text-zinc-500">Your private marks</div>
            <div className="grid grid-cols-4 gap-2">
              {(['cleared', 'suspicious', 'liar'] as Mark[]).map((m) => (
                <button
                  key={m}
                  className={`chip py-2 capitalize ${cv.marks[pid] === m ? 'border-gold text-gold' : ''}`}
                  onClick={() => run({ type: 'mark', targetId: pid, mark: cv.marks[pid] === m ? null : m }, false)}
                >
                  {MARK_ICON[m]} {m === 'liar' ? 'Lied' : m}
                </button>
              ))}
              <button className={`chip py-2 ${cv.pins.includes(pid) ? 'border-gold text-gold' : ''}`} onClick={() => run({ type: 'pin', targetId: pid, pinned: !cv.pins.includes(pid) }, false)}>
                📌 {cv.pins.includes(pid) ? 'Unpin' : 'Pin'}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">Mark someone "Lied" when you catch them out — it scores if they really lied to you.</p>
          </div>
        </div>
      )}
    </Sheet>
  );
}
