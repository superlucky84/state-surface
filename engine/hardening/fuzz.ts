/**
 * Seeded random input for the stage 9 fuzz suites. A failing case prints its seed; rerun
 * one with `FUZZ_SEED=<seed> pnpm test engine/hardening`, or more with `FUZZ_SCALE=20`.
 */
export type Random = {
  (): number;
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  subset<T>(items: readonly T[]): T[];
};

/** mulberry32: small, fast and good enough to explore input shapes. */
export function random(seed: number): Random {
  let state = seed >>> 0;
  const next = (() => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Random;
  next.int = max => Math.floor(next() * max);
  next.pick = items => items[next.int(items.length)];
  next.chance = p => next() < p;
  next.subset = items => items.filter(() => next.chance(0.5));
  return next;
}

/** Seeds to run: FUZZ_SEED alone, else `count` (× FUZZ_SCALE) seeds from `base`. */
export function seeds(count: number, base: number): number[] {
  const fixed = process.env.FUZZ_SEED;
  if (fixed) return [Number(fixed)];
  const scale = Number(process.env.FUZZ_SCALE ?? 1);
  return Array.from({ length: Math.round(count * scale) }, (_, i) => base + i);
}

/** Test timeout that grows with FUZZ_SCALE. */
export const fuzzTimeout = (base = 20_000) => base * Number(process.env.FUZZ_SCALE ?? 1);
