import { WORLD_H, WORLD_W } from '../game/config';
import { dist, type Vec } from '../game/geometry';
import { Rng } from '../game/rng';
import { SCENE } from './palette';

/**
 * Static backdrop: sandy surroundings, a grass field with hedges of trees and
 * a few props. It never changes during a level, so it is painted once into an
 * offscreen canvas and blitted every frame.
 */

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Prop =
  | { kind: 'tree'; x: number; y: number; s: number }
  | { kind: 'rock'; x: number; y: number; s: number }
  | { kind: 'crate'; x: number; y: number; s: number }
  | { kind: 'barrel'; x: number; y: number; s: number }
  | { kind: 'tires'; x: number; y: number; s: number };

const GRASS_TOP = -40;
const GRASS_BOTTOM = WORLD_H + 40;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function edgeY(x: number, top: boolean): number {
  const wave = Math.sin(x / 90) * 10 + Math.sin(x / 37 + 1.3) * 5;
  return top ? GRASS_TOP + wave : GRASS_BOTTOM + wave;
}

/** Deterministic props for a level, avoiding towers. */
export function planScenery(levelId: string, towers: Vec[]): Prop[] {
  const rng = new Rng(hash(levelId));
  const props: Prop[] = [];
  const clearOfTowers = (p: Vec, r: number) => towers.every((t) => dist(p, t) > r);
  const clearOfProps = (p: Vec, r: number) => props.every((q) => dist(p, q) > r);

  // Hedges: short rows of trees on the grass, kept away from towers.
  const hedges = rng.int(5, 8);
  for (let h = 0, tries = 0; h < hedges && tries < 200; tries++) {
    const start = { x: rng.range(40, WORLD_W - 40), y: rng.range(80, WORLD_H - 60) };
    const ang = rng.chance(0.6) ? 0 : rng.range(-0.6, 0.6) + (rng.chance(0.5) ? Math.PI / 2 : 0);
    const n = rng.int(3, 6);
    const row: Prop[] = [];
    for (let i = 0; i < n; i++) {
      const p = { x: start.x + Math.cos(ang) * i * 34, y: start.y + Math.sin(ang) * i * 34 };
      if (p.x < 20 || p.x > WORLD_W - 20 || p.y < 30 || p.y > WORLD_H - 20) break;
      if (!clearOfTowers(p, 105) || !clearOfProps(p, 26)) break;
      row.push({ kind: 'tree', x: p.x, y: p.y, s: rng.range(0.8, 1.1) });
    }
    if (row.length >= 3) {
      props.push(...row);
      h++;
    }
  }
  // A few loose trees.
  for (let i = 0, tries = 0; i < 8 && tries < 200; tries++) {
    const p = { x: rng.range(30, WORLD_W - 30), y: rng.range(40, WORLD_H - 30) };
    if (!clearOfTowers(p, 110) || !clearOfProps(p, 60)) continue;
    props.push({ kind: 'tree', x: p.x, y: p.y, s: rng.range(0.85, 1.15) });
    i++;
  }

  // Sand decorations above and below the field (and to the sides on wide screens).
  const sandSpots = 70;
  for (let i = 0, tries = 0; i < sandSpots && tries < 2000; tries++) {
    const p = { x: rng.range(-900, WORLD_W + 900), y: rng.range(-700, WORLD_H + 700) };
    const onGrass = p.y > GRASS_TOP - 30 && p.y < GRASS_BOTTOM + 45 && p.x > -60 && p.x < WORLD_W + 60;
    if (onGrass || !clearOfProps(p, 70)) continue;
    const r = rng.next();
    const kind: Prop['kind'] = r < 0.35 ? 'tree' : r < 0.6 ? 'rock' : r < 0.8 ? 'crate' : r < 0.92 ? 'barrel' : 'tires';
    props.push({ kind, x: p.x, y: p.y, s: rng.range(0.8, 1.25) });
    i++;
  }
  return props.sort((a, b) => a.y - b.y);
}

export function paintScenery(ctx: CanvasRenderingContext2D, b: Bounds, props: Prop[]): void {
  // Sand everywhere.
  ctx.fillStyle = SCENE.sand;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  // Subtle sand patches.
  const rng = new Rng(7);
  ctx.fillStyle = SCENE.sandDark;
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-900, WORLD_W + 900);
    const y = rng.range(-700, WORLD_H + 700);
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(30, 90), rng.range(10, 26), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grass field with a wavy edge spanning the full visible width.
  const gx0 = Math.min(b.x0, -20) - 20;
  const gx1 = Math.max(b.x1, WORLD_W + 20) + 20;
  const field = new Path2D();
  field.moveTo(gx0, edgeY(gx0, true));
  for (let x = gx0; x <= gx1; x += 12) field.lineTo(x, edgeY(x, true));
  for (let x = gx1; x >= gx0; x -= 12) field.lineTo(x, edgeY(x, false));
  field.closePath();

  ctx.save();
  ctx.translate(0, 10);
  ctx.fillStyle = SCENE.grassEdge;
  ctx.fill(field);
  ctx.restore();
  ctx.fillStyle = SCENE.grass;
  ctx.fill(field);

  // Mowing stripes and soft light patches.
  ctx.save();
  ctx.clip(field);
  ctx.fillStyle = SCENE.grassLight;
  ctx.globalAlpha = 0.45;
  for (let y = GRASS_TOP; y < GRASS_BOTTOM; y += 180) ctx.fillRect(gx0, y, gx1 - gx0, 90);
  ctx.globalAlpha = 1;
  ctx.restore();

  for (const p of props) {
    if (p.x < b.x0 - 80 || p.x > b.x1 + 80 || p.y < b.y0 - 80 || p.y > b.y1 + 100) continue;
    drawProp(ctx, p);
  }
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(30,60,20,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.25, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawProp(ctx: CanvasRenderingContext2D, p: Prop) {
  const s = p.s;
  switch (p.kind) {
    case 'tree': {
      shadow(ctx, p.x, p.y + 4, 20 * s, 8 * s);
      ctx.fillStyle = SCENE.trunk;
      ctx.fillRect(p.x - 4 * s, p.y - 8 * s, 8 * s, 12 * s);
      const layers = [
        { w: 24, y: -6, h: 26, c: SCENE.treeDark },
        { w: 19, y: -22, h: 24, c: SCENE.treeMid },
        { w: 13, y: -37, h: 22, c: SCENE.treeLight },
      ];
      for (const l of layers) {
        ctx.fillStyle = l.c;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + (l.y - l.h) * s);
        ctx.quadraticCurveTo(p.x + l.w * 0.9 * s, p.y + (l.y - 2) * s, p.x + l.w * s, p.y + l.y * s);
        ctx.quadraticCurveTo(p.x, p.y + (l.y + 7) * s, p.x - l.w * s, p.y + l.y * s);
        ctx.quadraticCurveTo(p.x - l.w * 0.9 * s, p.y + (l.y - 2) * s, p.x, p.y + (l.y - l.h) * s);
        ctx.fill();
      }
      break;
    }
    case 'rock': {
      shadow(ctx, p.x, p.y + 8, 46 * s, 12 * s);
      ctx.fillStyle = SCENE.rockDark;
      roundRect(ctx, p.x - 44 * s, p.y - 40 * s, 88 * s, 48 * s, 16 * s);
      ctx.fill();
      ctx.fillStyle = SCENE.rock;
      roundRect(ctx, p.x - 44 * s, p.y - 44 * s, 88 * s, 26 * s, 13 * s);
      ctx.fill();
      break;
    }
    case 'crate': {
      shadow(ctx, p.x, p.y + 4, 26 * s, 8 * s);
      ctx.fillStyle = SCENE.crateDark;
      ctx.fillRect(p.x - 22 * s, p.y - 34 * s, 44 * s, 38 * s);
      ctx.fillStyle = SCENE.crate;
      ctx.fillRect(p.x - 22 * s, p.y - 44 * s, 44 * s, 18 * s);
      ctx.strokeStyle = SCENE.crateDark;
      ctx.lineWidth = 3 * s;
      ctx.strokeRect(p.x - 15 * s, p.y - 27 * s, 30 * s, 24 * s);
      break;
    }
    case 'barrel': {
      shadow(ctx, p.x, p.y + 4, 18 * s, 7 * s);
      ctx.fillStyle = '#5f6772';
      ctx.fillRect(p.x - 15 * s, p.y - 34 * s, 30 * s, 36 * s);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2 * s, 15 * s, 6 * s, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = SCENE.barrel;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 34 * s, 15 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'tires': {
      shadow(ctx, p.x, p.y + 4, 26 * s, 9 * s);
      for (let i = 0; i < 3; i++) {
        const y = p.y - i * 12 * s;
        ctx.fillStyle = SCENE.tire;
        ctx.beginPath();
        ctx.ellipse(p.x, y, 24 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4d53';
        ctx.beginPath();
        ctx.ellipse(p.x, y - 3 * s, 10 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
