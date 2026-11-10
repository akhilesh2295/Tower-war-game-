import { PLAYER, TOWER_RADIUS, WORLD_H, WORLD_W } from '../game/config';
import type { LevelDef, TowerDef, TowerKind } from '../game/types';

/** Compact tower constructor used by level files: t(x, y, owner, count, kind?). */
export function t(x: number, y: number, owner: number, count: number, kind: TowerKind = 'normal'): TowerDef {
  return { x, y, owner, count, kind };
}

/** Minimum centre-to-centre spacing between towers, in world units. */
export const MIN_TOWER_GAP = TOWER_RADIUS * 2.6;

/** Returns a list of human-readable problems; empty means the level is valid. */
export function validateLevel(level: LevelDef): string[] {
  const errs: string[] = [];
  const where = `level "${level.id}"`;
  if (!level.id) errs.push('level is missing an id');
  if (!level.name) errs.push(`${where}: missing name`);
  if (!(level.parTime > 0)) errs.push(`${where}: parTime must be > 0`);

  const owners = new Set(level.towers.map((tw) => tw.owner));
  if (!owners.has(PLAYER)) errs.push(`${where}: player (owner ${PLAYER}) has no tower`);
  const botOwners = new Set<number>();
  for (const b of level.bots) {
    if (b.owner <= PLAYER) errs.push(`${where}: bot owner ids must be >= 2 (got ${b.owner})`);
    if (botOwners.has(b.owner)) errs.push(`${where}: bot owner ${b.owner} listed twice`);
    botOwners.add(b.owner);
    if (!owners.has(b.owner)) errs.push(`${where}: bot ${b.owner} has no tower`);
  }
  if (!level.bots.length) errs.push(`${where}: needs at least one bot`);

  const mx = TOWER_RADIUS / WORLD_W;
  const my = TOWER_RADIUS / WORLD_H;
  level.towers.forEach((tw, i) => {
    if (tw.x < mx || tw.x > 1 - mx || tw.y < my || tw.y > 1 - my) errs.push(`${where}: tower ${i} is off the board`);
    if (!Number.isInteger(tw.count) || tw.count < 0) errs.push(`${where}: tower ${i} has an invalid count`);
    if (tw.owner !== 0 && tw.owner !== PLAYER && !botOwners.has(tw.owner))
      errs.push(`${where}: tower ${i} belongs to unknown owner ${tw.owner}`);
    for (let j = 0; j < i; j++) {
      const o = level.towers[j];
      const d = Math.hypot((tw.x - o.x) * WORLD_W, (tw.y - o.y) * WORLD_H);
      if (d < MIN_TOWER_GAP) errs.push(`${where}: towers ${j} and ${i} overlap (${d.toFixed(0)} < ${MIN_TOWER_GAP.toFixed(0)})`);
    }
  });
  return errs;
}
