import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/game/config';
import { Game } from '../src/game/game';
import type { LevelDef } from '../src/game/types';
import { generateLevel } from '../src/levels/generator';
import { LEVELS } from '../src/levels/levels';
import { validateLevel } from '../src/levels/schema';

/** Plays a level with a bot standing in for the human. */
function autoplay(level: LevelDef, seed: number, skill: 'easy' | 'normal' | 'hard', maxSeconds = 600) {
  const g = new Game(level, seed, skill);
  const steps = maxSeconds / SIM_DT;
  for (let i = 0; i < steps && g.world.status === 'playing'; i++) g.tick();
  return g.world;
}

describe('levels', () => {
  it('has at least 10 levels with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    it(`${level.id} "${level.name}" is valid`, () => {
      expect(validateLevel(level)).toEqual([]);
    });
  }

  it('generated skirmishes are valid', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const lvl = generateLevel({ seed });
      expect(validateLevel(lvl), `seed ${seed}`).toEqual([]);
      expect(lvl.bots.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('balance (headless autoplay)', () => {
  for (const level of LEVELS) {
    it(`${level.id} is winnable by a strong player`, () => {
      let wins = 0;
      for (const seed of [1, 2, 3]) if (autoplay(level, seed, 'hard').status === 'won') wins++;
      expect(wins).toBeGreaterThanOrEqual(1);
    });
  }
});
