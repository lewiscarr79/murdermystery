import { useMemo, useState } from 'react';
import { isQuestionRound, isTradingRound } from '../../shared/rules.ts';
import { QUESTION_DIMS, type Mark, type NoteView, type QuestionDim, type StatementType } from '../../shared/types.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { DIM_LABEL, Name, NoteCard, Sheet, who } from '../ui.tsx';

const MARK_ICON: Record<Mark, string> = { cleared: '✅', suspicious: '❓', liar: '🤥' };

export function CaseFile({ view, api }: { view: PlayerView; api: Api }) {
  const cv = view.case!;
  const [selected, setSelected] = useState<string | null>(null);
  const [focusOnly, setFocusOnly] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);

  // What my notes say about the killer, per trait (conflicts show as multiple values).
  const evidence = useMemo(() => {
    const out = new Map<QuestionDim, Set<string>>();
    for (const n of [...cv.announcements, ...cv.hand, ...cv.seen]) {
      if (n.fact.kind !== 'killer') continue;
      const s = out.get(n.fact.dim) ?? new Set();
      s.add(n.fact.value);
      out.set(n.fact.dim, s);
    }
    return out;
  }, [cv.announcements, cv.hand, cv.seen]);

  // What I know or have been told about each player.
  const grid = useMemo(() => {
    const cells = new Map<string, Map<QuestionDim, { value: string; record: boolean }>>();
    const set = (pid: string, dim: QuestionDim, value: string, record: boolean) => {
      const m = cells.get(pid) ?? new Map();
      if (!m.get(dim)?.record) m.set(dim, { value, record });
      cells.set(pid, m);
    };
    for (const q of cv.asked) if (q.answer?.value) set(q.targetId, q.dim, q.answer.value, false);
    for (const n of [...cv.hand, ...cv.seen]) if (n.fact.kind === 'record') set(n.fact.playerId, n.fact.dim, n.fact.value, true);
    return cells;
  }, [cv.asked, cv.hand, cv.seen]);

  const others = Object.keys(cv.cast).filter((id) => id !== view.you);
  const matches = (pid: string) =>
    [...(grid.get(pid)?.entries() ?? [])].filter(([d, c]) => evidence.get(d)?.has(c.value)).length;
  const rows = others
    .filter((id) => !focusOnly || cv.pins.includes(id))
    .sort((a, b) => Number(cv.pins.includes(b)) - Number(cv.pins.includes(a)) || matches(b) - matches(a));

  const round = view.round!;
  const canTalk = isQuestionRound(round) || isTradingRound(round);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Official announcements</h2>
        <div className="flex flex-col gap-2">
          {cv.announcements.length ? cv.announcements.map((n) => <NoteCard key={n.id} note={n} action={<span title="Always genuine">🔒</span>} />) : <Empty text="None yet." />}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Notes you hold ({cv.hand.length})</h2>
        <div className="flex flex-col gap-2">
          {cv.hand.length ? cv.hand.map((n) => <NoteCard key={n.id} note={n} locked={cv.lockedNoteIds.includes(n.id)} />) : <Empty text="No notes yet." />}
        </div>
      </section>

      {cv.seen.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Seen, not held ({cv.seen.length})</h2>
          <div className="flex flex-col gap-2">
            {cv.seen.map((n) => (
              <NoteCard key={n.id} note={n} dim />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500">Suspects — tap to act</h2>
          <button className={`chip ${focusOnly ? 'border-gold text-gold' : ''}`} onClick={() => setFocusOnly((f) => !f)}>
            📌 Focus ({cv.pins.length}/6)
          </button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-panel2 text-zinc-400">
              <tr>
                <th className="p-2">Player</th>
                {QUESTION_DIMS.map((d) => (
                  <th key={d} className="p-2">
                    {DIM_LABEL[d]}
                    {evidence.get(d) && <div className="font-semibold text-gold">{[...evidence.get(d)!].join(' / ')}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((pid) => (
                <tr key={pid} className="cursor-pointer border-t border-line active:bg-panel2" onClick={() => setSelected(pid)}>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      {cv.pins.includes(pid) && '📌'}
                      {cv.marks[pid] && MARK_ICON[cv.marks[pid]]}
                      {cv.allies.includes(pid) && '🤝'}
                      <Name view={view} id={pid} small />
                    </div>
                  </td>
                  {QUESTION_DIMS.map((d) => {
                    const c = grid.get(pid)?.get(d);
                    const hit = c && evidence.get(d)?.has(c.value);
                    return (
                      <td key={d} className={`p-2 ${hit ? 'bg-accent/20 text-white' : 'text-zinc-300'}`}>
                        {c ? (
                          <>
                            {c.value}
                            {c.record && ' 📄'}
                          </>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">Answers people gave you, and 📄 facts from records you've seen. Highlighted cells match your evidence. Nothing here is checked for lies — that's your job.</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500">Statements</h2>
          {canTalk && (
            <button className="chip" disabled={cv.left.statements <= 0} onClick={() => setStatementOpen(true)}>
              + Make a statement ({cv.left.statements})
            </button>
          )}
        </div>
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
      {statementOpen && <StatementSheet view={view} api={api} onClose={() => setStatementOpen(false)} />}
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

  const run = async (a: Parameters<Api['act']>[0], close = true) => {
    const r = await api.act(a);
    if (r.ok && close) onClose();
  };

  const pickNote = (onPick: (n: NoteView) => void) => (
    <div className="flex flex-col gap-2">
      {free.length ? free.map((n) => <NoteCard key={n.id} note={n} onClick={() => onPick(n)} />) : <Empty text="No free notes to use." />}
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
          {isQuestionRound(round) && (
            <button className="btn-primary" disabled={cv.left.questions <= 0 || busy} onClick={() => setMode('ask')}>
              {busy ? `${name} is busy` : `Question ${name} (${cv.left.questions} left)`}
            </button>
          )}
          {isTradingRound(round) && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary col-span-2" disabled={(!isAlly && cv.left.requests <= 0) || pendingOut || !cv.hand.length} onClick={() => run({ type: 'requestSwap', targetId: pid })}>
                Request blind swap {isAlly ? '(ally: free)' : ''}
              </button>
              <button className="btn-ghost" disabled={cv.left.requests <= 0 || pendingOut || !free.length} onClick={() => setMode('give')}>
                Give a note
              </button>
              <button className="btn-ghost" disabled={cv.left.shows <= 0 || !cv.hand.length} onClick={() => setMode('show')}>
                Show a note
              </button>
              {cv.alliancesEnabled && !isAlly && (
                <button className="btn-ghost col-span-2" onClick={() => run({ type: 'proposeAlliance', targetId: pid })}>
                  🤝 Propose secret alliance
                </button>
              )}
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

function StatementSheet({ view, api, onClose }: { view: PlayerView; api: Api; onClose: () => void }) {
  const cv = view.case!;
  const [type, setType] = useState<StatementType | null>(null);
  const others = Object.keys(cv.cast).filter((id) => id !== view.you);
  const types: [StatementType, string][] = [
    ['wasAt', 'I was at…'],
    ['vouch', 'I vouch for…'],
    ['lied', '… lied to me'],
    ...(cv.statementOptions.suspectAllowed ? ([['suspect', 'I suspect…']] as [StatementType, string][]) : []),
  ];
  const post = async (payload: { targetId?: string; value?: string }) => {
    const r = await api.act({ type: 'statement', statementType: type!, ...payload });
    if (r.ok) onClose();
  };
  return (
    <Sheet title="Make a public statement" onClose={onClose}>
      {!type ? (
        <div className="grid grid-cols-2 gap-2">
          {types.map(([t, label]) => (
            <button key={t} className="btn-ghost" onClick={() => setType(t)}>
              {label}
            </button>
          ))}
        </div>
      ) : type === 'wasAt' ? (
        <div className="grid grid-cols-2 gap-2">
          {cv.statementOptions.spots.map((s) => (
            <button key={s} className="btn-ghost text-sm" onClick={() => post({ value: s })}>
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {others.map((id) => (
            <button key={id} className="btn-ghost text-left" onClick={() => post({ targetId: id })}>
              <Name view={view} id={id} small />
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">Everyone sees statements. They can be lies.</p>
    </Sheet>
  );
}
