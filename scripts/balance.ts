/**
 * Balance report: plays every level headlessly with a bot standing in for the
 * player and prints win rate and average duration per skill level.
 *   npm run balance
 */
import { SIM_DT } from '../src/game/config';
import { Game } from '../src/game/game';
import { LEVELS } from '../src/levels/levels';

const seeds = Number(process.env.SEEDS ?? 8);
for (const level of LEVELS) {
  const row: string[] = [];
  for (const skill of ['easy', 'normal', 'hard'] as const) {
    let wins = 0;
    let time = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const g = new Game(level, seed, skill);
      for (let i = 0; i < 900 / SIM_DT && g.world.status === 'playing'; i++) g.tick();
      if (g.world.status === 'won') wins++;
      time += g.world.time;
    }
    row.push(`${skill}: ${wins}/${seeds} ~${Math.round(time / seeds)}s`);
  }
  console.log(`${level.id} ${level.name.padEnd(14)} ${row.join('   ')}`);
}
