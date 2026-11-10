import { NEUTRAL, TOWER_LEVELS, TOWER_RADIUS, WORLD_H, WORLD_W } from '../game/config';
import type { Vec } from '../game/geometry';
import type { GameEvent, Tower } from '../game/types';
import { archerRange, maxLinks, towerLevel, type World } from '../game/world';
import { team } from './palette';

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

/**
 * Canvas 2D renderer. Draws in world units; a single transform maps the
 * portrait world onto whatever screen we have (crisp on retina via DPR).
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private fx: Fx[] = [];
  private clock = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  /** Call when the canvas' CSS size changes. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    const pad = 6;
    this.scale = Math.min((rect.width - pad * 2) / WORLD_W, (rect.height - pad * 2) / WORLD_H);
    this.ox = (rect.width - WORLD_W * this.scale) / 2;
    this.oy = (rect.height - WORLD_H * this.scale) / 2;
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
        this.fx.push({ kind: 'ring', x: tw.x, y: tw.y, color: team(e.owner).main, t: 0, life: 0.6 });
      } else if (e.type === 'unitKilled') {
        this.fx.push({ kind: 'puff', x: e.x, y: e.y, color: team(e.owner).light, t: 0, life: 0.35 });
      }
    }
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  }

  flashText(at: Vec, text: string, color = '#ffffff'): void {
    this.fx.push({ kind: 'text', x: at.x, y: at.y - TOWER_RADIUS - 24, color, t: 0, life: 1.1, text });
  }

  draw(world: World, overlay: Overlay, dt: number): void {
    this.clock += dt;
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);

    this.drawBoard();
    this.drawArcherRanges(world);
    this.drawLinks(world);
    this.drawUnits(world);
    this.drawArrows(world);
    for (const t of world.towers) this.drawTower(world, t, overlay);
    this.drawOverlay(world, overlay);
    this.drawFx(dt);
  }

  /* ------------------------------------------------------------------ */

  private drawBoard(): void {
    const { ctx } = this;
    ctx.save();
    roundRect(ctx, 0, 0, WORLD_W, WORLD_H, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 50; x < WORLD_W; x += 100) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
    }
    for (let y = 50; y < WORLD_H; y += 100) {
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawArcherRanges(world: World): void {
    const { ctx } = this;
    for (const t of world.towers) {
      if (t.kind !== 'archer') continue;
      const c = team(t.owner);
      const r = archerRange(t.count);
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      if (t.owner === NEUTRAL) {
        ctx.setLineDash([10, 14]);
        ctx.strokeStyle = 'rgba(200,205,215,0.18)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = hexA(c.main, 0.07);
        ctx.fill();
        ctx.setLineDash([16, 10]);
        ctx.lineDashOffset = -this.clock * 20;
        ctx.strokeStyle = hexA(c.main, 0.45);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawLinks(world: World): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const l of world.links) {
      const a = world.towers[l.from];
      const b = world.towers[l.to];
      const c = team(l.owner);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / d;
      const uy = (b.y - a.y) / d;
      const sx = a.x + ux * TOWER_RADIUS;
      const sy = a.y + uy * TOWER_RADIUS;
      const ex = b.x - ux * TOWER_RADIUS;
      const ey = b.y - uy * TOWER_RADIUS;
      ctx.strokeStyle = hexA(c.main, 0.28);
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // Flowing chevrons show direction.
      ctx.strokeStyle = hexA(c.light, 0.7);
      ctx.lineWidth = 3.5;
      const len = Math.hypot(ex - sx, ey - sy);
      const spacing = 46;
      const offset = (this.clock * 70) % spacing;
      ctx.beginPath();
      for (let s = offset; s < len - 10; s += spacing) {
        const px = sx + ux * s;
        const py = sy + uy * s;
        ctx.moveTo(px - ux * 8 - uy * 7, py - uy * 8 + ux * 7);
        ctx.lineTo(px, py);
        ctx.lineTo(px - ux * 8 + uy * 7, py - uy * 8 - ux * 7);
      }
      ctx.stroke();
    }
  }

  private drawUnits(world: World): void {
    const { ctx } = this;
    for (const u of world.units) {
      const c = team(u.owner);
      ctx.beginPath();
      ctx.arc(u.x, u.y, 8.5, 0, Math.PI * 2);
      ctx.fillStyle = c.main;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = c.dark;
      ctx.stroke();
    }
  }

  private drawArrows(world: World): void {
    const { ctx } = this;
    const byId = new Map(world.units.map((u) => [u.id, u]));
    ctx.lineWidth = 3;
    for (const a of world.arrows) {
      const u = byId.get(a.targetId);
      if (!u) continue;
      const d = Math.hypot(u.x - a.x, u.y - a.y) || 1;
      const ux = (u.x - a.x) / d;
      const uy = (u.y - a.y) / d;
      ctx.strokeStyle = '#f4f1e8';
      ctx.beginPath();
      ctx.moveTo(a.x - ux * 18, a.y - uy * 18);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.fillStyle = team(a.owner).main;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTower(world: World, t: Tower, overlay: Overlay): void {
    const { ctx } = this;
    const c = team(t.owner);
    const R = TOWER_RADIUS;
    const neutral = t.owner === NEUTRAL;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + R * 0.75, R * 0.95, R * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight ring for drag source / target
    if (overlay.dragFrom === t.id || overlay.hoverTarget === t.id) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, R + 16 + Math.sin(this.clock * 8) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = overlay.dragFrom === t.id || overlay.dragValid ? 'rgba(255,255,255,0.85)' : 'rgba(255,90,90,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    if (t.kind === 'archer') {
      // Spiked crown
      const spikes = 10;
      ctx.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const ang = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? R + 13 : R + 1;
        const px = t.x + Math.cos(ang) * r;
        const py = t.y + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = c.dark;
      ctx.fill();
    }

    // Body
    const g = ctx.createRadialGradient(t.x - R * 0.35, t.y - R * 0.45, R * 0.1, t.x, t.y, R);
    g.addColorStop(0, neutral ? '#d4d9df' : c.light);
    g.addColorStop(0.55, c.main);
    g.addColorStop(1, c.dark);
    ctx.beginPath();
    ctx.arc(t.x, t.y, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = neutral ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.55)';
    ctx.stroke();

    // Level arcs (top): one segment per unlocked level, partial fill toward the next.
    if (!neutral) {
      const lvl = towerLevel(t.count);
      const segs = TOWER_LEVELS.length;
      const span = Math.PI * 0.9;
      const start = -Math.PI / 2 - span / 2;
      const gap = 0.12;
      const segLen = (span - gap * (segs - 1)) / segs;
      for (let i = 0; i < segs; i++) {
        const a0 = start + i * (segLen + gap);
        ctx.beginPath();
        ctx.arc(t.x, t.y, R + 8, a0, a0 + segLen);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 6;
        ctx.stroke();
        let fill = 0;
        if (i < lvl) fill = 1;
        else if (i === lvl) {
          const lo = TOWER_LEVELS[i].min;
          const hi = i + 1 < segs ? TOWER_LEVELS[i + 1].min : 30;
          fill = Math.max(0, Math.min(1, (t.count - lo) / (hi - lo)));
        }
        if (fill > 0) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, R + 8, a0, a0 + segLen * fill);
          ctx.strokeStyle = i < lvl ? '#ffffff' : 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 6;
          ctx.stroke();
        }
      }
      // Link slots (bottom): filled = in use.
      const slots = maxLinks(t.count);
      const used = world.linksFrom(t.id).length;
      for (let i = 0; i < slots; i++) {
        const px = t.x + (i - (slots - 1) / 2) * 16;
        const py = t.y + R + 14;
        ctx.beginPath();
        ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = i < used ? '#ffffff' : 'rgba(0,0,0,0.4)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.stroke();
      }
    }

    // Count
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${t.count >= 100 ? 28 : 34}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    const label = String(Math.max(0, Math.floor(t.count)));
    ctx.strokeText(label, t.x, t.y + 2);
    ctx.fillText(label, t.x, t.y + 2);
  }

  private drawOverlay(world: World, o: Overlay): void {
    const { ctx } = this;
    if (o.dragFrom !== null && o.dragTo) {
      const a = world.towers[o.dragFrom];
      const target = o.hoverTarget !== null ? world.towers[o.hoverTarget] : null;
      const end = target ?? o.dragTo;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -this.clock * 60;
      ctx.lineCap = 'round';
      ctx.strokeStyle = target ? (o.dragValid ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,90,0.9)') : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (o.cutTrail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(o.cutTrail[0].x, o.cutTrail[0].y);
      for (const p of o.cutTrail) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  private drawFx(dt: number): void {
    const { ctx } = this;
    this.fx = this.fx.filter((f) => (f.t += dt) < f.life);
    for (const f of this.fx) {
      const k = f.t / f.life;
      ctx.globalAlpha = 1 - k;
      if (f.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, TOWER_RADIUS + k * 60, 0, Math.PI * 2);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 8 * (1 - k) + 1;
        ctx.stroke();
      } else if (f.kind === 'puff') {
        ctx.beginPath();
        ctx.arc(f.x, f.y, 6 + k * 14, 0, Math.PI * 2);
        ctx.fillStyle = f.color;
        ctx.fill();
      } else if (f.text) {
        ctx.font = '800 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 5;
        ctx.strokeText(f.text, f.x, f.y - k * 30);
        ctx.fillText(f.text, f.x, f.y - k * 30);
      }
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
