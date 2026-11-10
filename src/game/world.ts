import {
  ARCHER,
  GROW_INTERVAL,
  LINK_DROP_MARGIN,
  NEUTRAL,
  PLAYER,
  SEND_INTERVAL,
  TOWER_CAP,
  TOWER_LEVELS,
  TOWER_RADIUS,
  UNIT_SPEED,
  WORLD_H,
  WORLD_W,
} from './config';
import { dist, segmentsIntersect, type Vec } from './geometry';
import type {
  Arrow,
  GameEvent,
  GameStatus,
  LevelDef,
  Link,
  LinkError,
  OwnerId,
  Tower,
  Unit,
} from './types';

/** Tower level index (0..2) for a given head count. */
export function towerLevel(count: number): number {
  let lvl = 0;
  for (let i = 0; i < TOWER_LEVELS.length; i++) if (count >= TOWER_LEVELS[i].min) lvl = i;
  return lvl;
}

/** Max simultaneous outgoing links for a given head count. */
export function maxLinks(count: number): number {
  return TOWER_LEVELS[towerLevel(count)].links;
}

/** Links a tower may keep (looser than maxLinks, see LINK_DROP_MARGIN). */
export function keptLinks(count: number): number {
  let links: number = TOWER_LEVELS[0].links;
  for (const lvl of TOWER_LEVELS) if (count >= lvl.min - LINK_DROP_MARGIN) links = lvl.links;
  return links;
}

export function archerRange(count: number): number {
  return Math.min(ARCHER.maxRange, ARCHER.baseRange + ARCHER.rangePerPerson * Math.max(0, count));
}

/**
 * The authoritative, renderer-free game state. Everything that affects the
 * outcome happens in `step`, so the same World can be driven by the browser,
 * by headless tests, or (later) by a multiplayer server.
 */
export class World {
  readonly level: LevelDef;
  towers: Tower[] = [];
  links: Link[] = [];
  units: Unit[] = [];
  arrows: Arrow[] = [];
  /** Events produced since the last `drainEvents` (used for FX / sound). */
  events: GameEvent[] = [];
  time = 0;
  status: GameStatus = 'playing';
  /** All non-neutral owners that started in the level. */
  readonly owners: OwnerId[];
  private alive = new Set<OwnerId>();
  private nextId = 1;

  constructor(level: LevelDef) {
    this.level = level;
    this.towers = level.towers.map((t, i) => ({
      id: i,
      x: t.x * WORLD_W,
      y: t.y * WORLD_H,
      owner: t.owner,
      count: t.count,
      kind: t.kind ?? 'normal',
      growAcc: 0,
      fireAcc: 0,
    }));
    const owners = new Set<OwnerId>([PLAYER]);
    for (const b of level.bots) owners.add(b.owner);
    this.owners = [...owners].sort((a, b) => a - b);
    this.owners.forEach((o) => this.alive.add(o));
  }

  /* ------------------------------ queries ------------------------------ */

  tower(id: number): Tower | undefined {
    return this.towers[id];
  }

  linksFrom(towerId: number): Link[] {
    return this.links.filter((l) => l.from === towerId);
  }

  findLink(from: number, to: number): Link | undefined {
    return this.links.find((l) => l.from === from && l.to === to);
  }

  isAlive(owner: OwnerId): boolean {
    return this.alive.has(owner);
  }

  /** People an owner has in towers plus on the move. */
  strength(owner: OwnerId): number {
    let n = 0;
    for (const t of this.towers) if (t.owner === owner) n += t.count;
    for (const u of this.units) if (u.owner === owner) n++;
    return n;
  }

  /** Units currently heading to `towerId`, split by friend / foe of `owner`. */
  incoming(towerId: number, owner: OwnerId): { friendly: number; hostile: number } {
    let friendly = 0;
    let hostile = 0;
    for (const u of this.units) {
      if (u.to !== towerId) continue;
      if (u.owner === owner) friendly++;
      else hostile++;
    }
    return { friendly, hostile };
  }

  /* ------------------------------ commands ----------------------------- */

  canLink(owner: OwnerId, from: number, to: number): LinkError | null {
    const a = this.towers[from];
    const b = this.towers[to];
    if (!a || !b) return 'bad-tower';
    if (from === to) return 'same-tower';
    if (a.owner !== owner) return 'not-owner';
    if (this.findLink(from, to)) return 'duplicate';
    // A reverse link we own gets replaced, so it frees a slot on the target, not here.
    if (this.linksFrom(from).length >= maxLinks(a.count)) return 'no-slots';
    return null;
  }

  addLink(owner: OwnerId, from: number, to: number): LinkError | null {
    const err = this.canLink(owner, from, to);
    if (err) return err;
    // Two links between the same pair owned by the same player make no sense:
    // dragging the other way reverses the flow.
    const reverse = this.findLink(to, from);
    if (reverse && reverse.owner === owner) this.removeLink(reverse);
    const link: Link = { id: this.nextId++, owner, from, to, sendAcc: SEND_INTERVAL * 0.5, createdAt: this.time };
    this.links.push(link);
    this.events.push({ type: 'linkAdded', link });
    return null;
  }

  removeLink(link: Link): void {
    const i = this.links.indexOf(link);
    if (i < 0) return;
    this.links.splice(i, 1);
    this.events.push({ type: 'linkRemoved', link });
  }

  /** Remove every link of `owner` crossed by the swipe segment a-b. */
  cutLinks(owner: OwnerId, a: Vec, b: Vec): number {
    let n = 0;
    for (const l of [...this.links]) {
      if (l.owner !== owner) continue;
      const ta = this.towers[l.from];
      const tb = this.towers[l.to];
      if (segmentsIntersect(a, b, ta, tb)) {
        this.removeLink(l);
        n++;
      }
    }
    return n;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ----------------------------- simulation ---------------------------- */

  step(dt: number): void {
    if (this.status !== 'playing') return;
    this.time += dt;
    this.grow(dt);
    this.send(dt);
    this.moveUnits(dt);
    this.resolveClashes();
    this.fireArchers(dt);
    this.moveArrows(dt);
    this.enforceLinkLimits();
    this.checkElimination();
  }

  private grow(dt: number): void {
    for (const t of this.towers) {
      if (t.owner === NEUTRAL) continue;
      if (t.count >= TOWER_CAP) {
        t.growAcc = 0;
        continue;
      }
      t.growAcc += dt;
      while (t.growAcc >= GROW_INTERVAL && t.count < TOWER_CAP) {
        t.growAcc -= GROW_INTERVAL;
        t.count++;
      }
    }
  }

  private send(dt: number): void {
    for (const l of this.links) {
      const a = this.towers[l.from];
      const b = this.towers[l.to];
      l.sendAcc += dt;
      if (l.sendAcc < SEND_INTERVAL) continue;
      if (a.count < 1) {
        l.sendAcc = SEND_INTERVAL; // ready to fire as soon as someone shows up
        continue;
      }
      l.sendAcc -= SEND_INTERVAL;
      a.count--;
      const d = dist(a, b);
      const u: Unit = { id: this.nextId++, owner: l.owner, from: a.id, to: b.id, s: TOWER_RADIUS * 0.8, d, x: 0, y: 0 };
      this.placeUnit(u);
      this.units.push(u);
    }
  }

  private placeUnit(u: Unit): void {
    const a = this.towers[u.from];
    const b = this.towers[u.to];
    const k = u.s / u.d;
    u.x = a.x + (b.x - a.x) * k;
    u.y = a.y + (b.y - a.y) * k;
  }

  private moveUnits(dt: number): void {
    const survivors: Unit[] = [];
    for (const u of this.units) {
      u.s += UNIT_SPEED * dt;
      if (u.s >= u.d - TOWER_RADIUS * 0.8) {
        this.arrive(u);
        continue;
      }
      this.placeUnit(u);
      survivors.push(u);
    }
    this.units = survivors;
  }

  private arrive(u: Unit): void {
    const t = this.towers[u.to];
    if (t.owner === u.owner) {
      t.count++;
      return;
    }
    t.count--;
    if (t.count <= 0) {
      const prev = t.owner;
      t.owner = u.owner;
      t.count = Math.max(0, -t.count);
      t.growAcc = 0;
      t.fireAcc = 0;
      for (const l of this.linksFrom(t.id)) this.removeLink(l);
      this.events.push({ type: 'capture', tower: t.id, owner: u.owner, prev });
    }
  }

  /** Opposing streams on the same pair of towers annihilate where they meet. */
  private resolveClashes(): void {
    if (this.units.length < 2) return;
    const groups = new Map<number, { ab: Unit[]; ba: Unit[]; lo: number }>();
    for (const u of this.units) {
      const lo = Math.min(u.from, u.to);
      const hi = Math.max(u.from, u.to);
      const key = lo * 4096 + hi;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { ab: [], ba: [], lo }));
      (u.from === lo ? g.ab : g.ba).push(u);
    }
    const dead = new Set<Unit>();
    for (const g of groups.values()) {
      if (!g.ab.length || !g.ba.length) continue;
      g.ab.sort((p, q) => q.s - p.s);
      g.ba.sort((p, q) => q.s - p.s);
      let i = 0;
      let j = 0;
      while (i < g.ab.length && j < g.ba.length) {
        const p = g.ab[i];
        const q = g.ba[j];
        if (p.s + q.s < p.d) break; // fronts haven't met yet
        if (p.owner === q.owner) {
          // Friends pass through each other; check the next pair.
          i++;
          continue;
        }
        dead.add(p);
        dead.add(q);
        this.events.push({ type: 'unitKilled', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, owner: p.owner });
        i++;
        j++;
      }
    }
    if (dead.size) this.units = this.units.filter((u) => !dead.has(u));
  }

  private fireArchers(dt: number): void {
    for (const t of this.towers) {
      if (t.kind !== 'archer' || t.owner === NEUTRAL) continue;
      t.fireAcc += dt;
      if (t.fireAcc < ARCHER.fireInterval) continue;
      const range = archerRange(t.count);
      let best: Unit | null = null;
      let bestD = Infinity;
      for (const u of this.units) {
        if (u.owner === t.owner) continue;
        // Don't waste arrows on units already targeted.
        if (this.arrows.some((a) => a.targetId === u.id)) continue;
        const d = dist(t, u);
        if (d <= range && d < bestD) {
          best = u;
          bestD = d;
        }
      }
      if (!best) {
        t.fireAcc = ARCHER.fireInterval;
        continue;
      }
      t.fireAcc = 0;
      this.arrows.push({ id: this.nextId++, owner: t.owner, x: t.x, y: t.y - TOWER_RADIUS * 0.6, targetId: best.id });
    }
  }

  private moveArrows(dt: number): void {
    if (!this.arrows.length) return;
    const byId = new Map(this.units.map((u) => [u.id, u]));
    const killed = new Set<number>();
    const step = ARCHER.arrowSpeed * dt;
    this.arrows = this.arrows.filter((a) => {
      const u = byId.get(a.targetId);
      if (!u || killed.has(u.id)) return false;
      const dx = u.x - a.x;
      const dy = u.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d <= step) {
        killed.add(u.id);
        this.events.push({ type: 'unitKilled', x: u.x, y: u.y, owner: u.owner });
        return false;
      }
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      return true;
    });
    if (killed.size) this.units = this.units.filter((u) => !killed.has(u.id));
  }

  /** Towers that fall well below a level threshold lose their newest links. */
  private enforceLinkLimits(): void {
    for (const t of this.towers) {
      const out = this.linksFrom(t.id);
      if (out.length <= 1) continue;
      const allowed = keptLinks(t.count);
      if (out.length <= allowed) continue;
      out.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
      for (let i = 0; i < out.length - allowed; i++) this.removeLink(out[i]);
    }
  }

  private checkElimination(): void {
    for (const o of [...this.alive]) {
      const hasTower = this.towers.some((t) => t.owner === o);
      const hasUnits = this.units.some((u) => u.owner === o);
      if (!hasTower && !hasUnits) {
        this.alive.delete(o);
        this.links = this.links.filter((l) => l.owner !== o);
        this.events.push({ type: 'eliminated', owner: o });
      }
    }
    if (!this.alive.has(PLAYER)) this.status = 'lost';
    else if (this.alive.size === 1) this.status = 'won';
  }
}
