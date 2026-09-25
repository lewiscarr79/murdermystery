import { useEffect, useState } from 'react';
import { ROUND_LABELS } from '../../shared/rules.ts';
import type { PlayerView } from '../../shared/view.ts';
import type { Api } from '../net.ts';
import { DIM_LABEL, Name } from '../ui.tsx';
import { CaseFile } from './CaseFile.tsx';
import { Offers, offerCount } from './Offers.tsx';
import { Accuse } from './Accuse.tsx';
import { Reveal } from './Reveal.tsx';
import { Coach, WaitingBar, WrapUp, YouBanner, introBullets, type Tab } from './Coach.tsx';

export function Game({ view, api }: { view: PlayerView; api: Api; now: number }) {
  const cv = view.case!;
  const round = view.round!;
  const [tab, setTab] = useState<Tab>('card');
  const [intro, setIntro] = useState<string | null>(round);

  useEffect(() => {
    setIntro(round);
    setTab(round === 'briefing' ? 'card' : 'file');
    if (view.practice) return; // practice: the intro waits for "Got it"
    const t = setTimeout(() => setIntro(null), 4500);
    return () => clearTimeout(t);
  }, [round, view.caseIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = ROUND_LABELS[round];
  const offers = offerCount(view);

  const header = (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">
            {view.practice ? 'Practice case' : `Case ${view.caseIndex + (view.settings.practice ? 0 : 1)}/${view.settings.cases}`} · Round {(view.roundIndex ?? 0) + 1}/8
          </div>
          <div className="font-display text-xl">{label.title}</div>
        </div>
        <WaitingBar view={view} api={api} />
      </div>
      <YouBanner view={view} setTab={setTab} />
    </header>
  );

  if (round === 'reveal')
    return (
      <div className="min-h-screen">
        {header}
        <Reveal view={view} api={api} />
      </div>
    );

  const wrapping = cv.stage === 'wrap' && round !== 'accusation';

  return (
    <div className="flex min-h-screen flex-col pb-20">
      {header}

      <main className="flex-1 px-4 py-4">
        {round === 'accusation' ? (
          <Accuse view={view} api={api} />
        ) : wrapping && tab !== 'offers' ? (
          <WrapUp view={view} api={api} />
        ) : (
          <>
            <Coach view={view} api={api} setTab={setTab} />
            {tab === 'card' ? <MyCard view={view} /> : tab === 'file' ? <CaseFile view={view} api={api} /> : <Offers view={view} api={api} />}
          </>
        )}
      </main>

      {round !== 'accusation' && (
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-3 border-t border-line bg-ink/95 backdrop-blur">
          {(
            [
              ['card', 'My Card'],
              ['file', wrapping ? 'End of round' : 'Case File'],
              ['offers', 'Requests'],
            ] as [Tab, string][]
          ).map(([t, text]) => (
            <button key={t} className={`relative py-4 text-sm font-semibold ${tab === t ? 'text-white' : 'text-zinc-500'}`} onClick={() => setTab(t)}>
              {text}
              {t === 'offers' && offers > 0 && <span className="absolute right-6 top-2 rounded-full bg-accent px-1.5 text-[11px] text-white">{offers}</span>}
            </button>
          ))}
        </nav>
      )}

      {intro && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-ink/95 px-8 text-center" onClick={() => setIntro(null)}>
          <div className="text-xs uppercase tracking-[0.3em] text-accent">
            {view.practice ? 'Practice · ' : ''}Round {(view.roundIndex ?? 0) + 1} of 8
          </div>
          <div className="pop mt-2 font-display text-5xl">{label.title}</div>
          <div className="mt-3 max-w-xs text-zinc-300">{label.hint}</div>
          <ul className="mt-5 flex max-w-xs flex-col gap-2 text-left text-sm">
            {introBullets(view).map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">{i + 1}.</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <button className="btn-primary mt-6 px-10">Got it</button>
        </div>
      )}
    </div>
  );
}

function MyCard({ view }: { view: PlayerView }) {
  const cv = view.case!;
  const c = cv.card;
  const kb = cv.killerBriefing;
  return (
    <div className="flex flex-col gap-4">
      <div className={`card ${cv.role === 'detective' ? '' : 'border-accent'}`}>
        <div className="text-xs uppercase tracking-widest text-zinc-500">Your role</div>
        <div className={`font-display text-3xl ${cv.role === 'detective' ? 'text-sky-300' : 'text-accent'}`}>
          {cv.role === 'killer' ? '🔪 The Killer' : cv.role === 'accomplice' ? '🤝 Accomplice' : '🔍 Detective'}
        </div>
        {kb ? (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {cv.role === 'accomplice' && (
              <div>
                The killer is <Name view={view} id={kb.killerId} small />
              </div>
            )}
            {kb.accompliceIds.filter((a) => a !== view.you).length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                Your side:{' '}
                {kb.accompliceIds
                  .filter((a) => a !== view.you)
                  .map((a) => (
                    <Name key={a} view={view} id={a} small />
                  ))}
              </div>
            )}
            <div>
              Frame the Patsy: <Name view={view} id={kb.patsyId} small />
            </div>
            <div className="text-zinc-400">
              The evidence covers the killer's: {kb.dangerousDims.map((d) => DIM_LABEL[d]).join(', ')}. You have 3 lies — spend them wisely. Your forged note
              {cv.role === 'killer' && !kb.accompliceIds.length ? 's look' : ' looks'} exactly like real evidence.
            </div>
            {kb.tipOff.length > 0 && (
              <div className="rounded-xl bg-panel2 p-3">
                <div className="mb-1 text-xs uppercase tracking-widest text-gold">Tip-off: genuine evidence is held by</div>
                {kb.tipOff.map((t) => (
                  <div key={t.dim} className="flex items-center justify-between">
                    <span className="text-zinc-400">{DIM_LABEL[t.dim]}</span>
                    <Name view={view} id={t.playerId} small />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ol className="mt-3 flex flex-col gap-1.5 text-sm">
            <li>
              <span className="text-sky-300">1.</span> Clue notes describe the <b>killer</b> — their coat, drink, phone…
            </li>
            <li>
              <span className="text-sky-300">2.</span> Ask players about themselves and find who <b>matches</b>.
            </li>
            <li>
              <span className="text-sky-300">3.</span> Watch out: people can <b>lie</b>, and some notes are <b>forged</b>.
            </li>
          </ol>
        )}
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-widest text-zinc-500">You are</div>
        <div className="font-display text-2xl">{c.name}</div>
        <div className="text-sm text-zinc-400">{c.job}</div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {(['coat', 'arrival', 'drink', 'phone', 'team'] as const).map((d) => (
            <div key={d} className="rounded-lg bg-panel2 px-3 py-2">
              <dt className="text-[11px] uppercase text-zinc-500">{DIM_LABEL[d]}</dt>
              <dd>{c.traits[d]}</dd>
            </div>
          ))}
          <div className="rounded-lg bg-panel2 px-3 py-2">
            <dt className="text-[11px] uppercase text-zinc-500">At 21:30</dt>
            <dd>{c.location}</dd>
          </div>
        </dl>
        <div className="mt-3 text-sm">
          {c.witnesses.length ? (
            <>
              <span className="text-zinc-400">At 21:30 you were with: </span>
              {c.witnesses.map((w, i) => (
                <span key={w}>
                  {i > 0 && ', '}
                  {view.case!.cast[w].name}
                </span>
              ))}
            </>
          ) : (
            <span className="text-zinc-400">Nobody saw you at 21:30.</span>
          )}
        </div>
      </div>

      <div className="card text-sm text-zinc-400">{cv.intro}</div>
    </div>
  );
}
