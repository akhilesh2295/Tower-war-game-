import { NEUTRAL, TOWER_RADIUS, WORLD_H, WORLD_W } from '../game/config';
import type { Vec } from '../game/geometry';
import type { GameEvent, Tower, Unit } from '../game/types';
import { archerRange, maxLinks, towerLevel, type World } from '../game/world';
import { SCENE, team, type TeamColors } from './palette';
import { paintScenery, planScenery, roundRect } from './scenery';

interface Fx {
  kind: 'ring' | 'puff' | 'text';
  x: number;
  y: number;
  color: string;
  t: number;
  life: number;
  text?: string;
}

/** What the input layer wants drawn on top of the world. */
export interface Overlay {
  dragFrom: number | null;
  dragTo: Vec | null;
  hoverTarget: number | null;
  dragValid: boolean;
  cutTrail: Vec[];
}

/** Buildings are drawn upward from a ground point just below the tower centre. */
const GROUND = 28;
const TIER_H = 26;
/** Buildings are drawn a bit wider than their hit radius. */
const BODY_R = TOWER_RADIUS * 1.12;
/** People are drawn larger than their simulation footprint. */
const PERSON_SCALE = 1.35;
/** Vertical squash of top faces to fake a tilted camera. */
const TILT = 0.5;
const FONT = '900 {s}px "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, sans-serif';

/**
 * Canvas 2D renderer with a cartoony pseudo-3D look. Draws in world units;
 * one transform maps the portrait world onto any screen (crisp via DPR).
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private topInset = 0;
  private fx: Fx[] = [];
  private clock = 0;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  /** Call when the canvas' CSS size changes. `topInset` = CSS px covered by the HUD. */
  resize(topInset = this.topInset): void {
    this.topInset = topInset;
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    const pad = 4;
    const availH = this.cssH - topInset - pad * 2;
    // Leave headroom above the top row of buildings.
    this.scale = Math.min((this.cssW - pad * 2) / WORLD_W, availH / (WORLD_H + 70));
    this.ox = (this.cssW - WORLD_W * this.scale) / 2;
    this.oy = topInset + pad + 60 * this.scale + (availH - (WORLD_H + 70) * this.scale) / 2;
    this.bgKey = '';
  }

  /** CSS pixel (relative to the canvas) -> world coordinates. */
  toWorld(cx: number, cy: number): Vec {
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  }

  /** World units per CSS pixel; used to make touch targets finger-sized. */
  get worldPerPx(): number {
    return 1 / this.scale;
  }

  pushEvents(world: World, events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'capture') {
        const tw = world.towers[e.tower];
        this.fx.push({ kind: 'ring', x: tw.x, y: tw.y + GROUND, color: team(e.owner).main, t: 0, life: 0.7 });
      } else if (e.type === 'unitKilled') {
        this.fx.push({ kind: 'puff', x: e.x, y: e.y, color: team(e.owner).light, t: 0, life: 0.35 });
      }
    }
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  }

  flashText(at: Vec, text: string, color = '#ffffff'): void {
    this.fx.push({ kind: 'text', x: at.x, y: at.y - 110, color, t: 0, life: 1.2, text });
  }

  draw(world: World, overlay: Overlay, dt: number): void {
    this.clock += dt;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBackground(world);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);

    this.drawArcherRanges(world);
    this.drawLinks(world);
    this.drawDragLine(world, overlay);
    this.drawUnits(world);
    const order = [...world.towers].sort((a, b) => a.y - b.y);
    for (const t of order) this.drawGroundMarker(t, overlay);
    for (const t of order) {
      if (t.kind === 'archer') this.drawWatchtower(world, t);
      else this.drawBuilding(world, t);
    }
    this.drawArrows(world);
    this.drawCutTrail(overlay);
    this.drawFx(dt);
  }

  /* ----------------------------- background ----------------------------- */

  private drawBackground(world: World): void {
    const key = `${world.level.id}|${this.canvas.width}x${this.canvas.height}`;
    if (key !== this.bgKey || !this.bg) {
      this.bgKey = key;
      this.bg = this.bg ?? document.createElement('canvas');
      this.bg.width = this.canvas.width;
      this.bg.height = this.canvas.height;
      const b = this.bg.getContext('2d')!;
      b.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);
      const tl = this.toWorld(0, 0);
      const br = this.toWorld(this.cssW, this.cssH);
      const towers = world.towers.map((t) => ({ x: t.x, y: t.y }));
      paintScenery(b, { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y }, planScenery(world.level.id, towers));
    }
    this.ctx.drawImage(this.bg, 0, 0);
  }

  /* ------------------------------- layers ------------------------------- */

  private drawArcherRanges(world: World): void {
    const { ctx } = this;
    for (const t of world.towers) {
      if (t.kind !== 'archer') continue;
      const r = archerRange(t.count);
      const owned = t.owner !== NEUTRAL;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + GROUND * 0.5, r, r * 0.92, 0, 0, Math.PI * 2);
      ctx.fillStyle = owned ? hexA(team(t.owner).light, 0.16) : 'rgba(255,255,255,0.14)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = owned ? hexA(team(t.owner).light, 0.9) : 'rgba(255,255,255,0.75)';
      ctx.stroke();
    }
  }

  private drawLinks(world: World): void {
    const { ctx } = this;
    for (const l of world.links) {
      const a = world.towers[l.from];
      const b = world.towers[l.to];
      const c = team(l.owner);
      const ay = a.y + GROUND * 0.6;
      const by = b.y + GROUND * 0.6;
      const d = Math.hypot(b.x - a.x, by - ay);
      const ux = (b.x - a.x) / d;
      const uy = (by - ay) / d;
      const nx = -uy;
      const ny = ux;
      const W = 17;
      // Road band
      ctx.beginPath();
      ctx.moveTo(a.x + nx * W, ay + ny * W);
      ctx.lineTo(b.x + nx * W, by + ny * W);
      ctx.lineTo(b.x - nx * W, by - ny * W);
      ctx.lineTo(a.x - nx * W, ay - ny * W);
      ctx.closePath();
      ctx.fillStyle = hexA(c.main, 0.42);
      ctx.fill();
      // Edges
      ctx.strokeStyle = hexA(c.light, 0.85);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x + nx * W, ay + ny * W);
      ctx.lineTo(b.x + nx * W, by + ny * W);
      ctx.moveTo(a.x - nx * W, ay - ny * W);
      ctx.lineTo(b.x - nx * W, by - ny * W);
      ctx.stroke();
      // Flowing dots show direction.
      ctx.fillStyle = hexA(c.dark, 0.55);
      const spacing = 26;
      const off = (this.clock * 40) % spacing;
      for (let s = off; s < d; s += spacing) {
        ctx.beginPath();
        ctx.arc(a.x + ux * s, ay + uy * s, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawUnits(world: World): void {
    const units = [...world.units].sort((p, q) => p.y - q.y);
    for (const u of units) this.drawPerson(u, team(u.owner));
  }

  /** A tiny cartoon person walking along a link. */
  private drawPerson(u: Unit, c: TeamColors): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(u.x, u.y + GROUND * 0.6);
    ctx.scale(PERSON_SCALE, PERSON_SCALE);
    const x = 0;
    const y = 0;
    const phase = this.clock * 14 + u.id;
    const step = Math.sin(phase) * 4;
    const bob = Math.abs(Math.cos(phase)) * 2;
    ctx.fillStyle = 'rgba(20,50,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // legs
    ctx.strokeStyle = '#2d2f3a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 8);
    ctx.lineTo(x - 3 + step, y);
    ctx.moveTo(x + 3, y - 8);
    ctx.lineTo(x + 3 - step, y);
    ctx.stroke();
    // body
    ctx.fillStyle = c.main;
    roundRect(ctx, x - 7, y - 21 - bob, 14, 15, 5);
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // head + helmet
    ctx.fillStyle = SCENE.skin;
    ctx.beginPath();
    ctx.arc(x, y - 26 - bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SCENE.hair;
    ctx.beginPath();
    ctx.arc(x, y - 27 - bob, 6.5, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawArrows(world: World): void {
    const { ctx } = this;
    const byId = new Map(world.units.map((u) => [u.id, u]));
    ctx.lineCap = 'round';
    for (const a of world.arrows) {
      const u = byId.get(a.targetId);
      if (!u) continue;
      // Arrows start high at the watchtower cabin and drop onto the target.
      const tx = u.x;
      const ty = u.y + GROUND * 0.6 - 18;
      const d = Math.hypot(tx - a.x, ty - a.y) || 1;
      const x = a.x;
      const y = a.y - Math.min(90, d * 0.4);
      const ux = (tx - x) / (Math.hypot(tx - x, ty - y) || 1);
      const uy = (ty - y) / (Math.hypot(tx - x, ty - y) || 1);
      ctx.strokeStyle = '#6b4a2b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - ux * 20, y - uy * 20);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = team(a.owner).main;
      ctx.beginPath();
      ctx.moveTo(x + ux * 6, y + uy * 6);
      ctx.lineTo(x - uy * 4, y + ux * 4);
      ctx.lineTo(x + uy * 4, y - ux * 4);
      ctx.fill();
    }
  }

  private drawGroundMarker(t: Tower, o: Overlay): void {
    const { ctx } = this;
    // Contact shadow
    ctx.fillStyle = 'rgba(20,50,10,0.28)';
    ctx.beginPath();
    ctx.ellipse(t.x + 10, t.y + GROUND + 2, TOWER_RADIUS + 6, (TOWER_RADIUS + 6) * TILT, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.dragFrom === t.id || o.hoverTarget === t.id) {
      const pulse = Math.sin(this.clock * 8) * 3;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + GROUND, TOWER_RADIUS + 16 + pulse, (TOWER_RADIUS + 16 + pulse) * TILT, 0, 0, Math.PI * 2);
      ctx.strokeStyle = o.dragFrom === t.id || o.dragValid ? '#ffffff' : '#ff6b6b';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }

  /** Octagonal prism: top face at `top`, walls hanging `h` below it. */
  private prism(cx: number, top: number, r: number, h: number, roof: string, wall: string, wallDark: string) {
    const { ctx } = this;
    const pts = (y: number) => {
      const out: Vec[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        out.push({ x: cx + Math.cos(a) * r, y: y + Math.sin(a) * r * TILT });
      }
      return out;
    };
    const T = pts(top);
    const B = pts(top + h);
    // Walls: the front half of the octagon extruded down. Indices 7,0..3 run right->front->left.
    const front = [7, 0, 1, 2, 3, 4];
    const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    g.addColorStop(0, wall);
    g.addColorStop(1, wallDark);
    ctx.beginPath();
    front.forEach((i, k) => (k === 0 ? ctx.moveTo(T[i].x, T[i].y) : ctx.lineTo(T[i].x, T[i].y)));
    for (let k = front.length - 1; k >= 0; k--) ctx.lineTo(B[front[k]].x, B[front[k]].y);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // Top face
    ctx.beginPath();
    T.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = roof;
    ctx.fill();
  }

  /** Stacked building: one more storey per tower level, like the people inside. */
  private drawBuilding(world: World, t: Tower): void {
    const c = team(t.owner);
    const tiers = towerLevel(t.count) + 1;
    const ground = t.y + GROUND;
    let r = BODY_R;
    let base = ground;
    for (let i = 0; i < tiers; i++) {
      const top = base - TIER_H;
      // Storey walls in team colour with a pale ledge on top.
      this.prism(t.x, top, r, TIER_H, c.light, c.main, c.dark);
      this.windowBand(t.x, top, r, i === 0);
      this.prism(t.x, top - 5, r + 3, 5, SCENE.wallLedge, '#e2ddd3', '#c9c3b7');
      base = top - 5;
      r -= 4;
    }
    // Roof cap
    const roofTop = base - 12;
    this.prism(t.x, roofTop, r + 4, 12, c.light, c.main, c.dark);
    // Slot dots sit on the roof face; the count floats just above it.
    this.drawSlots(world, t, roofTop);
    this.drawLabel(world, t, roofTop);
  }

  private windowBand(cx: number, top: number, r: number, door: boolean) {
    const { ctx } = this;
    const front = top + r * TILT; // front-most point of the top face
    if (door) {
      ctx.fillStyle = SCENE.window;
      roundRect(ctx, cx - 9, front + TIER_H - 18, 18, 18, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = SCENE.window;
      roundRect(ctx, cx - r * 0.55, front + 7, r * 1.1, 6, 3);
      ctx.fill();
    }
  }

  /** Archer tower: wooden-legged watchtower with a team-coloured roof. */
  private drawWatchtower(world: World, t: Tower): void {
    const { ctx } = this;
    const c = team(t.owner);
    const ground = t.y + GROUND;
    const deck = ground - 62;
    const k = 1.3; // drawn larger than the base design
    ctx.save();
    ctx.translate(t.x, ground);
    ctx.scale(k, k);
    ctx.translate(-t.x, -ground);
    // Legs and bracing
    ctx.strokeStyle = '#d9dce1';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const dx of [-26, 26]) {
      ctx.moveTo(t.x + dx, ground);
      ctx.lineTo(t.x + dx * 0.75, deck);
    }
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#b8bcc4';
    ctx.beginPath();
    ctx.moveTo(t.x - 25, ground - 8);
    ctx.lineTo(t.x + 20, deck + 8);
    ctx.moveTo(t.x + 25, ground - 8);
    ctx.lineTo(t.x - 20, deck + 8);
    ctx.stroke();
    // Deck and cabin
    this.prism(t.x, deck - 6, 30, 8, '#eef0f3', '#cfd3da', '#aeb3bc');
    ctx.fillStyle = '#e6e8ec';
    ctx.fillRect(t.x - 22, deck - 30, 44, 26);
    ctx.fillStyle = SCENE.window;
    ctx.fillRect(t.x - 15, deck - 16, 30, 7);
    // Pyramid roof
    const eave = deck - 30;
    const peak = eave - 36;
    ctx.beginPath();
    ctx.moveTo(t.x - 36, eave);
    ctx.lineTo(t.x, peak);
    ctx.lineTo(t.x + 36, eave);
    ctx.lineTo(t.x, eave + 10);
    ctx.closePath();
    ctx.fillStyle = c.main;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(t.x, peak);
    ctx.lineTo(t.x + 36, eave);
    ctx.lineTo(t.x, eave + 10);
    ctx.closePath();
    ctx.fillStyle = c.dark;
    ctx.fill();
    this.drawSlots(world, t, deck - 24);
    ctx.restore();
    this.drawLabel(world, t, ground + (peak + 4 - ground) * k);
  }

  /** People count above the roof; gold when the tower is at its growth cap. */
  private drawLabel(world: World, t: Tower, top: number): void {
    const { ctx } = this;
    const label = String(Math.max(0, Math.floor(t.count)));
    const atCap = t.owner !== NEUTRAL && t.count >= world.cap;
    ctx.font = FONT.replace('{s}', '38');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(25,30,45,0.9)';
    ctx.strokeText(label, t.x, top - 8);
    ctx.fillStyle = atCap ? '#ffe17a' : '#ffffff';
    ctx.fillText(label, t.x, top - 8);
  }

  /** Link slots: white dot = a connection is available, dim = in use. */
  private drawSlots(world: World, t: Tower, roofTop: number): void {
    const { ctx } = this;
    const slots = maxLinks(t.count);
    const used = t.owner === NEUTRAL ? 0 : world.linksFrom(t.id).length;
    for (let i = 0; i < slots; i++) {
      const px = t.x + (i - (slots - 1) / 2) * 18;
      ctx.beginPath();
      ctx.arc(px, roofTop + 2, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = i < slots - used ? '#ffffff' : 'rgba(30,35,50,0.35)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(30,35,50,0.35)';
      ctx.stroke();
    }
  }

  private drawDragLine(world: World, o: Overlay): void {
    if (o.dragFrom === null || !o.dragTo) return;
    const { ctx } = this;
    const a = world.towers[o.dragFrom];
    const target = o.hoverTarget !== null ? world.towers[o.hoverTarget] : null;
    const ex = target ? target.x : o.dragTo.x;
    const ey = target ? target.y + GROUND * 0.6 : o.dragTo.y;
    ctx.setLineDash([22, 14]);
    ctx.lineDashOffset = -this.clock * 60;
    ctx.lineCap = 'round';
    ctx.strokeStyle = target ? (o.dragValid ? '#ffffff' : '#ff6b6b') : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + GROUND * 0.6);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawCutTrail(o: Overlay): void {
    if (o.cutTrail.length < 2) return;
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(o.cutTrail[0].x, o.cutTrail[0].y);
    for (const p of o.cutTrail) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  private drawFx(dt: number): void {
    const { ctx } = this;
    this.fx = this.fx.filter((f) => (f.t += dt) < f.life);
    for (const f of this.fx) {
      const k = f.t / f.life;
      ctx.globalAlpha = 1 - k;
      if (f.kind === 'ring') {
        const r = TOWER_RADIUS + 10 + k * 70;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, r, r * TILT, 0, 0, Math.PI * 2);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 10 * (1 - k) + 2;
        ctx.stroke();
      } else if (f.kind === 'puff') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 6 + k * 16, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (f.text) {
        ctx.font = FONT.replace('{s}', '28');
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.fillStyle = f.color;
        ctx.strokeStyle = 'rgba(25,30,45,0.85)';
        ctx.lineWidth = 6;
        ctx.strokeText(f.text, f.x, f.y - k * 30);
        ctx.fillText(f.text, f.x, f.y - k * 30);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
