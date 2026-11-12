import { GROW_INTERVAL, NEUTRAL, PLAYER, UNIT_SPEED } from './config';
import { dist, pointSegDist } from './geometry';
import { Rng } from './rng';
import type { Difficulty, OwnerId, Tower } from './types';
import { archerRange, maxLinks, type World } from './world';

interface Profile {
  /** Seconds between decisions. */
  think: number;
  /** Chance to skip a decision round entirely (hesitation). */
  idle: number;
  /** How much stronger than the estimated defence an attack must be. */
  margin: number;
  /** Picks randomly among this many best options (sloppiness). */
  topN: number;
  /** Minimum people before a tower considers attacking. */
  minSend: number;
  /** Whether the bot pulls back from attacks to defend. */
  defends: boolean;
  /** Whether back-line towers feed the front line. */
  feeds: boolean;
}

const PROFILES: Record<Difficulty, Profile> = {
  easy: { think: 3.2, idle: 0.35, margin: 1.35, topN: 3, minSend: 10, defends: false, feeds: false },
  normal: { think: 2.0, idle: 0.12, margin: 1.15, topN: 2, minSend: 7, defends: true, feeds: true },
  hard: { think: 1.1, idle: 0, margin: 1.05, topN: 1, minSend: 5, defends: true, feeds: true },
};

/**
 * A bot only uses the same public commands as the human (addLink/removeLink),
 * so it can never cheat and could be swapped for a remote player later.
 */
export class BotBrain {
  readonly owner: OwnerId;
  readonly difficulty: Difficulty;
  private p: Profile;
  private rng: Rng;
  private timer: number;

  constructor(owner: OwnerId, difficulty: Difficulty, seed: number) {
    this.owner = owner;
    this.difficulty = difficulty;
    this.p = PROFILES[difficulty];
    this.rng = new Rng(seed);
    // Stagger bots so they don't all act on the same frame.
    this.timer = this.p.think * (0.6 + this.rng.next() * 0.6);
  }

  update(world: World, dt: number): void {
    if (!world.isAlive(this.owner)) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.p.think * (0.8 + this.rng.next() * 0.4);
    if (this.rng.chance(this.p.idle)) return;
    this.think(world);
  }

  private think(w: World): void {
    const me = this.owner;
    const mine = w.towers.filter((t) => t.owner === me);
    if (!mine.length) return;

    const threat = new Map<number, number>();
    for (const t of mine) {
      const inc = w.incoming(t.id, me);
      threat.set(t.id, inc.hostile - t.count - inc.friendly);
    }

    this.prune(w, threat);

    // Strongest towers decide first.
    const sources = [...mine].sort((a, b) => b.count - a.count);
    for (const src of sources) {
      const slots = maxLinks(src.count) - w.linksFrom(src.id).length;
      if (slots <= 0 || src.count < this.p.minSend) continue;
      if (this.p.defends && (threat.get(src.id) ?? 0) > -3) continue;

      const target = this.pickAttack(w, src);
      if (target) {
        w.addLink(me, src.id, target.id);
        continue;
      }
      // Nothing worth attacking from here: help the most endangered friend,
      // or (back line) feed the tower closest to the enemy.
      const ally = this.pickAlly(w, src, mine, threat);
      if (ally) w.addLink(me, src.id, ally.id);
    }
  }

  /** Drop links that no longer make sense. */
  private prune(w: World, threat: Map<number, number>): void {
    const me = this.owner;
    for (const l of w.links.filter((x) => x.owner === me)) {
      const src = w.towers[l.from];
      const dst = w.towers[l.to];
      if (dst.owner === me) {
        // Reinforcement link: stop once the target is safe and full.
        const safe = (threat.get(dst.id) ?? -99) < -5;
        if (safe && (dst.count >= w.cap - 2 || src.count < 3)) w.removeLink(l);
        else if (this.p.defends && (threat.get(src.id) ?? 0) > 0) w.removeLink(l);
        continue;
      }
      // Attack link: abandon if the source is in danger or the target ran away from us.
      if (this.p.defends && (threat.get(src.id) ?? 0) > 0) {
        w.removeLink(l);
        continue;
      }
      const est = this.defence(w, src, dst);
      if (src.count < 2 && est > 12 + w.incoming(dst.id, dst.owner).hostile) w.removeLink(l);
    }
  }

  /** Estimated people needed to take `dst` with a stream from `src`. */
  private defence(w: World, src: Tower, dst: Tower): number {
    const d = dist(src, dst);
    const travel = d / UNIT_SPEED;
    const inc = w.incoming(dst.id, this.owner);
    let need = dst.count + 1;
    if (dst.owner !== NEUTRAL) need += travel / GROW_INTERVAL + inc.hostile * 0.5;
    need -= inc.friendly;
    // Hostile archer towers covering the path pick off part of the stream.
    for (const t of w.towers) {
      if (t.kind !== 'archer' || t.owner === NEUTRAL || t.owner === this.owner) continue;
      if (pointSegDist(t, src, dst) < archerRange(t.count)) need += 4 + d / 120;
    }
    return need;
  }

  private pickAttack(w: World, src: Tower): Tower | null {
    const me = this.owner;
    const options: { t: Tower; score: number }[] = [];
    for (const t of w.towers) {
      if (t.owner === me || w.findLink(src.id, t.id)) continue;
      const need = this.defence(w, src, t);
      const budget = src.count + (maxLinks(src.count) > 1 ? 4 : 0);
      if (budget < need * this.p.margin) continue;
      const d = dist(src, t);
      let score = need + d / 70;
      if (t.kind === 'archer') score -= 4; // archers are valuable
      if (t.owner !== NEUTRAL) score -= 2; // hurting rivals is worth a bit more
      if (t.owner === PLAYER && this.difficulty === 'hard') score -= 2;
      options.push({ t, score });
    }
    if (!options.length) return null;
    options.sort((a, b) => a.score - b.score);
    const n = Math.min(this.p.topN, options.length);
    return options[Math.floor(this.rng.next() * n)].t;
  }

  private pickAlly(w: World, src: Tower, mine: Tower[], threat: Map<number, number>): Tower | null {
    const me = this.owner;
    // 1) Rescue a tower about to fall.
    let best: Tower | null = null;
    let bestScore = Infinity;
    for (const t of mine) {
      if (t === src || w.findLink(src.id, t.id) || w.findLink(t.id, src.id)) continue;
      const th = threat.get(t.id) ?? -99;
      if (th < -2) continue;
      const score = dist(src, t) - th * 20;
      if (score < bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (best) return best;
    if (!this.p.feeds || src.count < w.cap - 4) return null;

    // 2) Full back-line tower: feed the friend nearest to an enemy.
    const enemies = w.towers.filter((t) => t.owner !== me);
    if (!enemies.length) return null;
    const frontness = (t: Tower) => Math.min(...enemies.map((e) => dist(t, e)));
    const srcFront = frontness(src);
    let feed: Tower | null = null;
    let feedFront = srcFront - 60;
    for (const t of mine) {
      if (t === src || t.count >= w.cap || w.findLink(src.id, t.id) || w.findLink(t.id, src.id)) continue;
      const f = frontness(t);
      if (f < feedFront) {
        feed = t;
        feedFront = f;
      }
    }
    return feed;
  }
}
