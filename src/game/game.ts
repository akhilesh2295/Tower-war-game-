import { BotBrain } from './ai';
import { PLAYER, SIM_DT } from './config';
import type { Difficulty, LevelDef } from './types';
import { World } from './world';

/**
 * A World plus the bots that play in it, advanced with a fixed timestep so
 * results don't depend on frame rate.
 */
export class Game {
  readonly world: World;
  readonly bots: BotBrain[];
  private acc = 0;

  /**
   * @param autoPlayer if set, a bot also plays the human's side (attract-mode
   *   demo on the menu, headless balance tests).
   */
  constructor(level: LevelDef, seed = 1, autoPlayer?: Difficulty) {
    this.world = new World(level);
    this.bots = level.bots.map((b, i) => new BotBrain(b.owner, b.difficulty, seed * 7919 + i * 104729 + 13));
    if (autoPlayer) this.bots.push(new BotBrain(PLAYER, autoPlayer, seed + 999));
  }

  /** Advance by real elapsed time (seconds); runs whole fixed steps. */
  advance(elapsed: number): void {
    this.acc += Math.min(elapsed, 0.25);
    while (this.acc >= SIM_DT) {
      this.acc -= SIM_DT;
      this.tick();
    }
  }

  tick(): void {
    for (const b of this.bots) b.update(this.world, SIM_DT);
    this.world.step(SIM_DT);
  }
}
