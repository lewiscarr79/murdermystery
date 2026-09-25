# Launch Night 🔪

A real-time murder-mystery party game for 4–22 players on their own phones or laptops. There's no shared screen, and it works in the room or remotely.

> Nimbus AI is launching its first product. At 21:40 the founder is found dead in the green room.
> **One of you did it.**

- One player is secretly **the killer**. From 6 players they have **Accomplices**, and the killer's side knows each other.
- Everyone else is a **detective** holding private evidence notes.
- **Question** each other using preset questions. Everyone answers with **Truth**, **Lie** (3 per case) or **No comment**.
- **Swap** notes blind, **give** a note away, or **show** a note, which flashes on the other player's phone for 5 seconds.
- The killer's side forges notes to frame an innocent **Patsy** and hides the real evidence.
- Timed rounds with hard deadlines: if you miss your chance, it's gone. Accuse the killer with **Sure** or **Hunch**, then see the reveal and the leaderboard.

Every case is generated fresh: traits, the killer, forgeries and clue distribution all change, so it stays replayable.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000 (Vite + Socket.IO on one port)
```

- **Host:** enter a name and tap **Host a new game**. Share the 4-letter code or the invite link.
- **Fill seats with bots:** use **+1 / +3 / +5 bots** in the lobby, at Easy, Normal or Sharp. Bots can be dealt any role, including the killer.
- **Watch bots play:** expand **Test mode** on the home screen for an all-bot game in the spectator view. It shows every secret and has 1× / 4× / 20× speed.
- **Play on real phones on the same Wi-Fi:** open `http://<your-computer-ip>:3000`.

Production:

```bash
npm run build && npm start   # serves dist/ + Socket.IO on $PORT (default 3000)
```

Any Node host that supports WebSockets works: Render, Railway, Fly.io or Cloud Run. Rooms live in memory, so run a single instance.

## Test and tune

```bash
npm run lint                               # TypeScript
npm test                                   # Vitest: generator properties, rules, scoring, redaction, sync, simulator
GEN_SEEDS=500 npm test                     # heavier generator property sweep
npm run sim -- --players 4..22 --cases 200 [--level easy|normal|sharp]
```

The simulator plays all-bot games in virtual time and prints, for each player count: how often detectives catch the killer, average scores by role, how often the killer tops the case, and more.

Bots play only through buttons and never share what they know, so their accuracy is a **floor**. Humans talking at the table should do better.

## How it's built

TypeScript end to end.

| Path | What it is |
|---|---|
| `src/shared/` | Types, every rule constant (`rules.ts`), clock-offset maths, the view types sent to clients |
| `src/engine/` | Pure, deterministic game code: seeded RNG, the *Launch Night* pack, solver, **case generator**, role rotation, state machine (`game.ts`), scoring, per-player redaction (`views.ts`) |
| `src/server/` | Socket.IO rooms with authoritative timers (`rooms.ts`) and bots (`bots/`) that read only their own redacted view |
| `src/client/` | React + Tailwind phone UI: My Card, Case File (auto notebook and suspect grid), Offers, Accusation, Reveal, Spectator |
| `scripts/sim.ts` | Headless balance simulator |

**Keeping every device in sync:**
- The server owns all state and timers.
- It sends **absolute deadlines** (`endsAt`), never "seconds left".
- Each client estimates its clock offset from the lowest-latency of 5 pings, repeated every 30 s, so countdowns agree to within tens of milliseconds even when phones' clocks are minutes out.
- The game starts at a broadcast `startsAt`, so every phone shows the same 3-2-1.
- A phone that locks rejoins its seat automatically using a token stored on the device.

**Keeping secrets:** clients only receive `playerView()`. It never contains:
- the killer's identity (unless you're on the killer's side),
- forgery flags,
- other players' traits or hands,
- where a note came from,
- whether an answer was a lie.

Tests enforce this.

## Tuning notes
- Killer-side scoring was lowered from the first draft: base 100 × share of detectives fooled, small bonuses, cap 120. Bot simulations showed the original values let the killer top almost every case.
- The main balance levers live in `src/shared/rules.ts`.
