import { describe, expect, it } from 'vitest';
import { allSuspects, buildProfile, noteMeaning, suggestNext, suspectInfo } from '../src/shared/profile.ts';
import type { NoteFact, NoteView } from '../src/shared/types.ts';
import type { CaseView } from '../src/shared/view.ts';

let n = 0;
const note = (fact: NoteFact): NoteView => ({ id: `n${++n}`, text: 'flavour', icon: 'cctv', fact });
const killer = (dim: 'coat' | 'drink' | 'phone' | 'team' | 'arrival', value: string) => note({ kind: 'killer', dim, value });

function view(over: Partial<CaseView> = {}): CaseView {
  return {
    intro: '',
    card: { playerId: 'me', name: 'Me', job: '', traits: { coat: 'Black', arrival: 'Train', drink: 'Beer', phone: 'Pixel', team: 'Sales' }, location: 'Rooftop bar', witnesses: [] },
    role: 'detective',
    cast: { me: { name: 'Me', job: '' }, a: { name: 'Ann', job: '' }, b: { name: 'Bob', job: '' }, c: { name: 'Cat', job: '' } },
    hand: [],
    seen: [],
    announcements: [],
    liesLeft: 3,
    lieOptions: { coat: [], arrival: [], drink: [], phone: [], team: [], location: [] },
    left: { questions: 2, requests: 2, shows: 2, statements: 3 },
    busy: [],
    asked: [],
    incoming: [],
    swaps: [],
    gives: [],
    allies: [],
    allianceRequests: [],
    alliancesEnabled: true,
    statements: [],
    statementOptions: { suspectAllowed: true, spots: [] },
    marks: {},
    pins: [],
    ready: false,
    stage: 'main',
    finished: false,
    questions: { coat: '', arrival: '', drink: '', phone: '', team: '', location: '' },
    lockedNoteIds: [],
    ...over,
  };
}
const nameOf = (id: string) => ({ a: 'Ann', b: 'Bob', c: 'Cat' })[id] ?? id;

describe('Wanted profile', () => {
  it('marks announcements as confirmed, single notes as likely, disagreements as conflicts', () => {
    const cv = view({
      announcements: [killer('coat', 'Red')],
      hand: [killer('drink', 'Beer'), killer('phone', 'iPhone'), killer('coat', 'Black')],
      seen: [killer('drink', 'Beer'), killer('phone', 'Pixel')],
    });
    const p = Object.fromEntries(buildProfile(cv).map((e) => [e.dim, e]));
    expect(p.coat).toMatchObject({ status: 'confirmed', best: 'Red' });
    expect(p.drink).toMatchObject({ status: 'likely', best: 'Beer' });
    expect(p.drink.values[0].notes).toBe(2);
    expect(p.phone.status).toBe('conflict');
    expect(p.phone.best).toBeUndefined();
    expect(p.team.status).toBe('unknown');
    // Known entries come first.
    expect(buildProfile(cv)[0].status).toBe('confirmed');
  });
});

describe('suspect ticks', () => {
  const base = { announcements: [killer('coat', 'Red')], hand: [killer('drink', 'Beer')] };

  it('ticks answers as claims and records as certain', () => {
    const cv = view({
      ...base,
      asked: [{ id: 'q1', targetId: 'a', dim: 'coat', round: 'questioning', answer: { mode: 'truth', value: 'Red' } }],
      seen: [note({ kind: 'record', playerId: 'a', dim: 'drink', value: 'Gin & tonic' })],
    });
    const s = suspectInfo(cv, buildProfile(cv), 'a');
    expect(s.ticks.find((t) => t.dim === 'coat')).toMatchObject({ mark: 'match', source: 'claim' });
    expect(s.ticks.find((t) => t.dim === 'drink')).toMatchObject({ mark: 'mismatch', source: 'record' });
    expect(s.recordMismatch).toBe(true);
    expect(s.status).toContain('record');
  });

  it('a record beats a (possibly lying) answer', () => {
    const cv = view({
      ...base,
      asked: [{ id: 'q1', targetId: 'b', dim: 'coat', round: 'questioning', answer: { mode: 'truth', value: 'White' } }],
      hand: [killer('drink', 'Beer'), note({ kind: 'record', playerId: 'b', dim: 'coat', value: 'Red' })],
    });
    const s = suspectInfo(cv, buildProfile(cv), 'b');
    expect(s.ticks.find((t) => t.dim === 'coat')).toMatchObject({ mark: 'match', source: 'record', value: 'Red' });
  });

  it('an alibi clears a suspect and sinks them to the bottom', () => {
    const cv = view({ ...base, hand: [killer('drink', 'Beer'), note({ kind: 'alibi', playerId: 'c' })] });
    const list = allSuspects(cv, buildProfile(cv), 'me');
    expect(list.at(-1)!.id).toBe('c');
    expect(list.at(-1)!.status).toBe('Cleared by an alibi');
    expect(list.map((s) => s.id)).not.toContain('me');
  });

  it('pins float to the top', () => {
    const cv = view({ ...base, pins: ['c'] });
    expect(allSuspects(cv, buildProfile(cv), 'me')[0].id).toBe('c');
  });
});

describe('note meanings', () => {
  it('explains each kind of note in plain English', () => {
    expect(noteMeaning(killer('coat', 'Red'), nameOf).text).toBe("Tells you: the killer's coat is Red");
    expect(noteMeaning(note({ kind: 'record', playerId: 'a', dim: 'phone', value: 'iPhone' }), nameOf).text).toBe("Fact: Ann's phone is iPhone");
    expect(noteMeaning(note({ kind: 'alibi', playerId: 'b' }), nameOf).text).toContain('Clears Bob');
  });
});

describe('suggested next move', () => {
  it('suggests an unasked, known-trait question to a non-busy suspect', () => {
    const cv = view({
      announcements: [killer('coat', 'Red')],
      busy: ['a'],
      asked: [{ id: 'q1', targetId: 'b', dim: 'coat', round: 'questioning', answer: { mode: 'truth', value: 'Red' } }],
    });
    const s = suggestNext(cv, buildProfile(cv), 'questioning', 'me', nameOf);
    expect(s?.kind).toBe('ask');
    if (s?.kind !== 'ask') return;
    expect(s.targetId).not.toBe('a'); // busy
    expect(`${s.targetId}:${s.dim}`).not.toBe('b:coat'); // already asked
    expect(s.dim).toBe('coat');
  });

  it('points out conflicting notes in trading rounds', () => {
    const cv = view({ hand: [killer('phone', 'iPhone')], seen: [killer('phone', 'Pixel')] });
    expect(suggestNext(cv, buildProfile(cv), 'trading', 'me', nameOf)?.text).toContain('forged');
  });

  it('tells the killer where lying is needed', () => {
    const cv = view({
      role: 'killer',
      killerBriefing: { killerId: 'me', accompliceIds: [], patsyId: 'a', dangerousDims: ['coat', 'drink'], tipOff: [] },
    });
    expect(suggestNext(cv, buildProfile(cv), 'questioning', 'me', nameOf)?.text).toContain('coat, drink');
  });

  it('never suggests a question when none are left', () => {
    const cv = view({ announcements: [killer('coat', 'Red')], left: { questions: 0, requests: 2, shows: 2, statements: 3 } });
    expect(suggestNext(cv, buildProfile(cv), 'questioning', 'me', nameOf)).toBeNull();
  });
});
