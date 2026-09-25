// Generates a solvable, balanced case for any player count (4–22).
// Randomness only sets up the case; the constraints below keep it fair and hard.
import {
  accompliceCount,
  evidenceDimCount,
  forgeryCount,
  genuineCopies,
  privateNotesInEvidence2,
} from '../shared/rules.ts';
import {
  QUESTION_DIMS,
  TRAIT_DIMS,
  type CharacterCard,
  type Note,
  type NoteFact,
  type QuestionDim,
  type TraitDim,
  type Traits,
} from '../shared/types.ts';
import type { Pack } from './packs/launchNight.ts';
import { createRng, type Rng } from './rng.ts';
import { candidates, factsFor, subsets } from './solver.ts';

export interface CaseRoles {
  killerId: string;
  accompliceIds: string[];
}

export interface GeneratedCase {
  seed: number;
  playerIds: string[];
  cards: Record<string, CharacterCard>;
  killerId: string;
  accompliceIds: string[];
  patsyId: string;
  evidenceDims: TraitDim[];
  forgedDims: TraitDim[];
  announceDims: [TraitDim, TraitDim];
  notes: Record<string, Note>;
  deal: { evidence: Record<string, string[]>; evidence2: Record<string, string[]> };
  announcements: { evidence: string; evidence2: string };
  tipOff: { dim: TraitDim; playerId: string }[];
  lieOptions: Record<string, Record<QuestionDim, string[]>>;
  attempts: number;
}

export interface GenerateInput {
  pack: Pack;
  playerIds: string[];
  roles: CaseRoles;
  seed: number;
  /** Players who were Patsy recently; avoided when possible. */
  avoidPatsy?: string[];
}

const MAX_ATTEMPTS = 400;

export function generateCase(input: GenerateInput): GeneratedCase {
  const rng = createRng(input.seed);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = tryGenerate(input, rng, attempt);
    if (result) return result;
  }
  throw new Error(`Could not generate a valid case for ${input.playerIds.length} players (seed ${input.seed})`);
}

function tryGenerate(input: GenerateInput, rng: Rng, attempt: number): GeneratedCase | null {
  const { pack, playerIds, roles } = input;
  const n = playerIds.length;
  if (roles.accompliceIds.length !== accompliceCount(n)) throw new Error('Accomplice count does not match player count');
  const killerId = roles.killerId;
  const killerSide = new Set([killerId, ...roles.accompliceIds]);
  const innocents = playerIds.filter((id) => !killerSide.has(id));

  const patsyPool = innocents.filter((id) => !(input.avoidPatsy ?? []).includes(id));
  const patsyId = rng.pick(patsyPool.length ? patsyPool : innocents);

  // --- 1. Evidence dimensions ---
  const evidenceDims = rng.shuffle(TRAIT_DIMS).slice(0, evidenceDimCount(n));
  const forgedDims = evidenceDims.slice(0, forgeryCount(n));
  const rest = evidenceDims.slice(forgeryCount(n));
  const announceDims: [TraitDim, TraitDim] = [rest[0], rest[1]];

  // --- 2. Traits ---
  const traits: Record<string, Traits> = {};
  for (const id of playerIds) {
    traits[id] = Object.fromEntries(TRAIT_DIMS.map((d) => [d, rng.pick(pack.traitValues[d])])) as Traits;
  }
  const k = traits[killerId];
  for (const d of evidenceDims) {
    if (forgedDims.includes(d)) {
      traits[patsyId][d] = rng.pick(pack.traitValues[d].filter((v) => v !== k[d]));
    } else {
      traits[patsyId][d] = k[d];
    }
  }
  if (!repairTraits(traits, killerId, patsyId, evidenceDims, forgedDims, pack, rng)) return null;

  // --- 3. Locations and witnesses ---
  const locations: Record<string, string> = {};
  const solitary = rng.shuffle(pack.solitarySpots);
  locations[killerId] = solitary[0];
  locations[patsyId] = solitary[1];
  const spareSolitary = solitary.slice(2);
  for (const id of rng.shuffle(playerIds)) {
    if (locations[id]) continue;
    if (spareSolitary.length && rng.chance(0.12)) locations[id] = spareSolitary.pop()!;
    else locations[id] = rng.pick(pack.socialSpots);
  }
  // A social spot with a single person would make them effectively alone; fold them into a busier spot.
  for (const spot of pack.socialSpots) {
    const at = playerIds.filter((id) => locations[id] === spot);
    if (at.length === 1) {
      const busy = pack.socialSpots.filter((s) => s !== spot && playerIds.some((id) => locations[id] === s));
      locations[at[0]] = busy.length ? rng.pick(busy) : spot;
    }
  }

  const characters = rng.shuffle(pack.characters).slice(0, n);
  const cards: Record<string, CharacterCard> = {};
  playerIds.forEach((id, i) => {
    const isSocial = pack.socialSpots.includes(locations[id]);
    cards[id] = {
      playerId: id,
      name: characters[i].name,
      job: characters[i].job,
      traits: traits[id],
      location: locations[id],
      witnesses: isSocial ? playerIds.filter((o) => o !== id && locations[o] === locations[id]) : [],
    };
  });

  // --- 4. Notes ---
  const notes: Record<string, Note> = {};
  const usedIds = new Set<string>();
  const newId = () => {
    let id: string;
    do id = 'n' + Math.floor(rng.next() * 36 ** 5).toString(36).padStart(5, '0');
    while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  const templateCursor: Partial<Record<TraitDim, number>> = {};
  const killerNote = (dim: TraitDim, value: string, forged: boolean): string => {
    const templates = pack.killerTemplates[dim];
    const i = templateCursor[dim] ?? rng.int(templates.length);
    templateCursor[dim] = (i + 1) % templates.length;
    const t = templates[i];
    const id = newId();
    notes[id] = { id, text: t.text(value), icon: t.icon, fact: { kind: 'killer', dim, value }, forged };
    return id;
  };
  const recordNote = (playerId: string, dim: QuestionDim): string => {
    const value = dim === 'location' ? locations[playerId] : traits[playerId][dim];
    const t = pack.recordTemplates[dim];
    const id = newId();
    const fact: NoteFact = { kind: 'record', playerId, dim, value };
    notes[id] = { id, text: t.text(cards[playerId].name, value), icon: t.icon, fact, forged: false };
    return id;
  };

  const announceEvidence = killerNote(announceDims[0], k[announceDims[0]], false);
  const announceEvidence2 = killerNote(announceDims[1], k[announceDims[1]], false);

  // Genuine killer-trait notes for every evidence dim except the one announced first.
  const privateDims = evidenceDims.filter((d) => d !== announceDims[0]);
  const copies = genuineCopies(n);
  const genuine: { id: string; dim: TraitDim }[] = [];
  for (const d of privateDims) for (let c = 0; c < copies; c++) genuine.push({ id: killerNote(d, k[d], false), dim: d });

  // Forgeries: true of the Patsy, false of the killer.
  const forgeries = forgedDims.map((d) => killerNote(d, traits[patsyId][d], true));

  const alibiTemplate = rng.pick(pack.alibiTemplates);
  const alibiId = newId();
  notes[alibiId] = {
    id: alibiId,
    text: alibiTemplate.text(cards[patsyId].name, locations[patsyId]),
    icon: alibiTemplate.icon,
    fact: { kind: 'alibi', playerId: patsyId },
    forged: false,
  };

  // Records that can expose the killer's lies, dealt late.
  const killerRecords = rng.shuffle([...evidenceDims] as QuestionDim[]).map((d) => recordNote(killerId, d));

  const innocentRecord = (holder: string): string => {
    const subject = rng.pick(playerIds.filter((id) => id !== holder && id !== killerId));
    return recordNote(subject, rng.pick(QUESTION_DIMS));
  };

  // --- 5. Deal ---
  const deal = dealNotes({
    rng,
    n,
    innocents,
    killerSide: [killerId, ...roles.accompliceIds],
    killerId,
    patsyId,
    genuine,
    forgeries,
    alibiId,
    killerRecords,
    innocentRecord,
    traits,
    announceDim: announceDims[0],
  });
  if (!deal) return null;

  // Stay solvable when the killer's side hides any two genuine notes it trades for.
  if (!survivesHoarding(traits, killerId, patsyId, evidenceDims, announceDims, genuine)) return null;

  const tipOff: { dim: TraitDim; playerId: string }[] = [];
  if (roles.accompliceIds.length) {
    for (const d of privateDims) {
      const holders = innocents.filter((id) => deal.evidence[id].some((nid) => genuine.some((g) => g.id === nid && g.dim === d)));
      if (holders.length) tipOff.push({ dim: d, playerId: rng.pick(holders) });
    }
  }

  const lieOptions: Record<string, Record<QuestionDim, string[]>> = {};
  const allSpots = [...pack.socialSpots, ...pack.solitarySpots];
  for (const id of playerIds) {
    const opts = {} as Record<QuestionDim, string[]>;
    for (const d of TRAIT_DIMS) opts[d] = rng.shuffle(pack.traitValues[d].filter((v) => v !== traits[id][d]));
    opts.location = rng.shuffle(allSpots.filter((s) => s !== locations[id])).slice(0, 3);
    lieOptions[id] = opts;
  }

  return {
    seed: input.seed,
    playerIds,
    cards,
    killerId,
    accompliceIds: roles.accompliceIds,
    patsyId,
    evidenceDims,
    forgedDims,
    announceDims,
    notes,
    deal,
    announcements: { evidence: announceEvidence, evidence2: announceEvidence2 },
    tipOff,
    lieOptions,
    attempts: attempt,
  };
}

/** Enforce: every single/pair of evidence traits matches ≥2 players; the full set matches only the killer;
 *  and removing one forged dim leaves nobody but killer and Patsy. */
function repairTraits(
  traits: Record<string, Traits>,
  killerId: string,
  patsyId: string,
  evidenceDims: TraitDim[],
  forgedDims: TraitDim[],
  pack: Pack,
  rng: Rng,
): boolean {
  const k = traits[killerId];
  const others = Object.keys(traits).filter((id) => id !== killerId && id !== patsyId);
  const small = [...subsets(evidenceDims, 1), ...subsets(evidenceDims, 2)];
  for (let iter = 0; iter < 200; iter++) {
    let changed = false;
    // Full set must identify only the killer.
    for (const id of candidates(traits, factsFor(k, evidenceDims))) {
      if (id === killerId) continue;
      const d = rng.pick(evidenceDims);
      traits[id][d] = rng.pick(pack.traitValues[d].filter((v) => v !== k[d]));
      changed = true;
    }
    // Hoarding safety: without any one forged dim, only killer (and Patsy) remain.
    for (const f of forgedDims) {
      const dims = evidenceDims.filter((d) => d !== f);
      for (const id of candidates(traits, factsFor(k, dims))) {
        if (id === killerId || id === patsyId) continue;
        const d = rng.pick(dims);
        traits[id][d] = rng.pick(pack.traitValues[d].filter((v) => v !== k[d]));
        changed = true;
      }
    }
    // Singles and pairs must not isolate the killer.
    for (const dims of small) {
      if (candidates(traits, factsFor(k, dims)).length >= 2) continue;
      const p = rng.pick(others);
      for (const d of dims) traits[p][d] = k[d];
      changed = true;
    }
    if (!changed) return true;
  }
  return false;
}

interface DealInput {
  rng: Rng;
  n: number;
  innocents: string[];
  killerSide: string[];
  killerId: string;
  patsyId: string;
  genuine: { id: string; dim: TraitDim }[];
  forgeries: string[];
  alibiId: string;
  killerRecords: string[];
  innocentRecord: (holder: string) => string;
  traits: Record<string, Traits>;
  announceDim: TraitDim;
}

function dealNotes(input: DealInput): GeneratedCase['deal'] | null {
  const { rng, n, innocents, killerSide, killerId, patsyId, genuine, traits, announceDim } = input;
  const evidence: Record<string, string[]> = {};
  const evidence2: Record<string, string[]> = {};
  const dimOf = new Map(genuine.map((g) => [g.id, g.dim]));
  // Round 2: each innocent gets at most one genuine killer note; pairs of hands must not solve the case.
  let r2Assign: Map<string, string> | null = null;
  for (let tries = 0; tries < 60 && !r2Assign; tries++) {
    const pool = rng.shuffle(genuine);
    const assign = new Map<string, string>();
    const usedDims = new Map<TraitDim, number>();
    for (const holder of rng.shuffle(innocents)) {
      const idx = pool.findIndex((g) => (usedDims.get(g.dim) ?? 0) < Math.max(1, Math.ceil(innocents.length / 3)));
      if (idx === -1) continue;
      const [g] = pool.splice(idx, 1);
      assign.set(holder, g.id);
      usedDims.set(g.dim, (usedDims.get(g.dim) ?? 0) + 1);
    }
    // Drop holders until no pair of hands solves.
    for (let guard = 0; guard < innocents.length; guard++) {
      const bad = firstSolvingPair(assign, dimOf, traits, killerId, announceDim);
      if (!bad) break;
      assign.delete(rng.pick(bad));
    }
    const minGenuine = Math.min(2, innocents.length);
    if (!firstSolvingPair(assign, dimOf, traits, killerId, announceDim) && assign.size >= minGenuine) r2Assign = assign;
  }
  if (!r2Assign) return null;

  for (const id of innocents) {
    evidence[id] = [];
    const g = r2Assign.get(id);
    if (g) evidence[id].push(g);
    while (evidence[id].length < 2) evidence[id].push(input.innocentRecord(id));
  }
  const forgeries = input.forgeries.slice();
  for (const id of killerSide) {
    evidence[id] = [];
    const mine = killerSide.length === 1 ? forgeries.splice(0) : forgeries.splice(0, 1);
    evidence[id].push(...mine);
    while (evidence[id].length < 2) evidence[id].push(input.innocentRecord(id));
  }

  // Round 5: remaining genuine notes, the Patsy's alibi, killer records, then filler.
  const dealtR2 = new Set(r2Assign.values());
  const remaining = rng.shuffle(genuine.filter((g) => !dealtR2.has(g.id)));
  const perHand = privateNotesInEvidence2(n);
  for (const id of [...innocents, ...killerSide]) evidence2[id] = [];

  const holdsDim = (holder: string, dim: TraitDim) =>
    [...evidence[holder], ...evidence2[holder]].some((nid) => dimOf.get(nid) === dim);

  const order = rng.shuffle(innocents);
  const slotsFree = (id: string) => perHand - evidence2[id].length;
  // Alibi first so the Patsy always has a way out, held by someone else.
  const alibiHolder = rng.pick(innocents.filter((id) => id !== patsyId));
  evidence2[alibiHolder].push(input.alibiId);

  for (const g of remaining) {
    const holder = order.find((id) => slotsFree(id) > 0 && !holdsDim(id, g.dim));
    if (!holder) break; // not enough seats; copies already dealt in round 2 still exist
    evidence2[holder].push(g.id);
  }
  const killerRecords = input.killerRecords.slice();
  for (const id of order) {
    while (slotsFree(id) > 0 && killerRecords.length) evidence2[id].push(killerRecords.pop()!);
    while (slotsFree(id) > 0) evidence2[id].push(input.innocentRecord(id));
  }
  for (const id of killerSide) evidence2[id].push(input.innocentRecord(id));

  // Every key killer trait must be dealt to at least two different innocents overall (or one, when tiny).
  const needed = Math.min(2, innocents.length - 1);
  const privateDims = [...new Set(genuine.map((g) => g.dim))];
  for (const d of privateDims) {
    const holders = innocents.filter((id) => holdsDim(id, d));
    if (holders.length < needed) return null;
  }
  return { evidence, evidence2 };
}

function firstSolvingPair(
  assign: Map<string, string>,
  dimOf: Map<string, TraitDim>,
  traits: Record<string, Traits>,
  killerId: string,
  announceDim: TraitDim,
): [string, string] | null {
  const holders = [...assign.keys()];
  const k = traits[killerId];
  for (let i = 0; i < holders.length; i++) {
    for (let j = i + 1; j < holders.length; j++) {
      const dims = new Set<TraitDim>([announceDim, dimOf.get(assign.get(holders[i])!)!, dimOf.get(assign.get(holders[j])!)!]);
      if (candidates(traits, factsFor(k, dims)).length < 2) return [holders[i], holders[j]];
    }
  }
  return null;
}

function survivesHoarding(
  traits: Record<string, Traits>,
  killerId: string,
  patsyId: string,
  evidenceDims: TraitDim[],
  announceDims: [TraitDim, TraitDim],
  genuine: { id: string; dim: TraitDim }[],
): boolean {
  const k = traits[killerId];
  for (const [a, b] of subsets(genuine, 2)) {
    const left = genuine.filter((g) => g !== a && g !== b);
    const dims = new Set<TraitDim>([...announceDims, ...left.map((g) => g.dim)]);
    const c = candidates(traits, factsFor(k, dims), [patsyId]);
    if (c.length !== 1 || c[0] !== killerId) return false;
  }
  return evidenceDims.length > 0;
}
