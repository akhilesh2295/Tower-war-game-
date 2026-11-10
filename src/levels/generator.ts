import { TOWER_RADIUS, WORLD_H, WORLD_W } from '../game/config';
import { Rng } from '../game/rng';
import type { Difficulty, LevelDef, TowerDef } from '../game/types';
import { MIN_TOWER_GAP, t } from './schema';

export interface GenOptions {
  seed: number;
  bots?: number; // 1..4, random if omitted
  towers?: number; // total towers, random if omitted
  difficulty?: Difficulty;
}

/**
 * Procedural "skirmish" levels: random number of bots and towers, the player
 * at the bottom, bots spread along the top/sides, neutrals in between.
 * Mirrors left/right for fairness when possible.
 */
export function generateLevel(opts: GenOptions): LevelDef {
  const rng = new Rng(opts.seed);
  const botCount = opts.bots ?? rng.int(1, 3);
  const target = opts.towers ?? rng.int(8 + botCount * 2, 12 + botCount * 2);
  const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
  const towers: TowerDef[] = [];
  const mx = (TOWER_RADIUS * 1.6) / WORLD_W;
  const my = (TOWER_RADIUS * 1.6) / WORLD_H;

  const fits = (x: number, y: number) =>
    towers.every((o) => Math.hypot((x - o.x) * WORLD_W, (y - o.y) * WORLD_H) >= MIN_TOWER_GAP * 1.15);

  towers.push(t(0.5, 0.88, 1, 15));

  // Bot homes: spread on an arc across the top half.
  const slots = [
    [0.5, 0.1],
    [0.12, 0.2],
    [0.88, 0.2],
    [0.1, 0.5],
    [0.9, 0.5],
  ];
  const order = botCount === 1 ? [0] : botCount === 2 ? [1, 2] : botCount === 3 ? [0, 3, 4] : [1, 2, 3, 4];
  const bots = order.map((slot, i) => {
    const [x, y] = slots[slot];
    towers.push(t(x, y, i + 2, 15));
    return { owner: i + 2, difficulty: opts.difficulty ?? rng.pick(diffs.slice(0, Math.min(3, 1 + botCount))) };
  });

  let guard = 0;
  while (towers.length < target && guard++ < 2000) {
    const x = rng.range(mx, 1 - mx);
    const y = rng.range(my + 0.05, 1 - my - 0.02);
    const mirror = Math.abs(x - 0.5) > 0.12;
    if (!fits(x, y) || (mirror && !fits(1 - x, y))) continue;
    const count = rng.pick([5, 5, 10, 10, 15, 20]);
    const kind = rng.chance(0.12) && count >= 10 ? 'archer' : 'normal';
    towers.push(t(x, y, 0, count, kind));
    if (mirror && towers.length < target) towers.push(t(1 - x, y, 0, count, kind));
  }

  return {
    id: `gen-${opts.seed}`,
    name: `Skirmish #${opts.seed % 10000}`,
    parTime: 60 + towers.length * 12,
    bots,
    towers: towers.map((tw) => ({ ...tw, x: round(tw.x), y: round(tw.y) })),
  };
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
