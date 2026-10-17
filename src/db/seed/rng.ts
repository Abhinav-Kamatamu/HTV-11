// Seeded RNG (mulberry32) so every teammate gets identical synthetic data.
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Box-Muller. */
  normal(mean: number, sd: number): number {
    const u1 = 1 - this.next();
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}

/** One independent stream per (seed, patient number), so adding patients never shifts the others. */
export function subRng(seed: number, ...parts: number[]): Rng {
  let h = seed >>> 0;
  for (const p of parts) {
    h = Math.imul(h ^ (p + 0x9e3779b9), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return new Rng(h >>> 0);
}
