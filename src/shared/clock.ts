// Clock-offset maths shared by client and tests (NTP-style estimate).

export interface ClockSample {
  /** Client time when the ping was sent. */
  t0: number;
  /** Server time when it handled the ping. */
  server: number;
  /** Client time when the pong arrived. */
  t1: number;
}

/** Offset such that serverNow ≈ Date.now() + offset. */
export function offsetFromSample(s: ClockSample): { offset: number; rtt: number } {
  const rtt = s.t1 - s.t0;
  return { offset: s.server - (s.t0 + rtt / 2), rtt };
}

/** Best estimate from several samples: take the one with the lowest round trip. */
export function bestOffset(samples: ClockSample[]): number {
  if (samples.length === 0) return 0;
  let best = offsetFromSample(samples[0]);
  for (const s of samples.slice(1)) {
    const o = offsetFromSample(s);
    if (o.rtt < best.rtt) best = o;
  }
  return best.offset;
}

export function msRemaining(endsAt: number, clientNow: number, offset: number): number {
  return Math.max(0, endsAt - (clientNow + offset));
}
