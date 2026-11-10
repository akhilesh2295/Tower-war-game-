import { PLAYER, TOWER_RADIUS } from '../game/config';
import { dist, type Vec } from '../game/geometry';
import type { LinkError } from '../game/types';
import type { World } from '../game/world';
import type { Overlay, Renderer } from '../render/renderer';

const ERROR_TEXT: Partial<Record<LinkError, string>> = {
  'no-slots': 'Need more people for another link',
  duplicate: 'Already linked',
};

/**
 * Touch / mouse controls:
 *  - press on one of your towers and drag to another tower -> create link
 *  - press on empty space and swipe across your links      -> cut them
 * Uses Pointer Events so the same code serves iOS, Android and desktop.
 */
export class InputController {
  readonly overlay: Overlay = { dragFrom: null, dragTo: null, hoverTarget: null, dragValid: false, cutTrail: [] };
  private pointerId: number | null = null;
  private mode: 'none' | 'drag' | 'cut' = 'none';
  private lastCut: Vec | null = null;
  enabled = true;
  onAction?: (kind: 'link' | 'cut' | 'error') => void;

  constructor(
    private renderer: Renderer,
    private getWorld: () => World | null,
  ) {
    const c = renderer.canvas;
    c.addEventListener('pointerdown', this.down);
    c.addEventListener('pointermove', this.move);
    c.addEventListener('pointerup', this.up);
    c.addEventListener('pointercancel', this.cancel);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private pos(e: PointerEvent): Vec {
    const r = this.renderer.canvas.getBoundingClientRect();
    return this.renderer.toWorld(e.clientX - r.left, e.clientY - r.top);
  }

  /** Finger-friendly hit test: at least ~28 CSS px around the tower. */
  private towerAt(p: Vec): number | null {
    const w = this.getWorld();
    if (!w) return null;
    const hit = Math.max(TOWER_RADIUS * 1.25, 28 * this.renderer.worldPerPx);
    let best: number | null = null;
    let bestD = Infinity;
    for (const t of w.towers) {
      const d = dist(t, p);
      if (d < hit && d < bestD) {
        best = t.id;
        bestD = d;
      }
    }
    return best;
  }

  private down = (e: PointerEvent) => {
    const w = this.getWorld();
    if (!this.enabled || !w || w.status !== 'playing' || this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.renderer.canvas.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    const id = this.towerAt(p);
    if (id !== null && w.towers[id].owner === PLAYER) {
      this.mode = 'drag';
      this.overlay.dragFrom = id;
      this.overlay.dragTo = p;
    } else {
      this.mode = 'cut';
      this.lastCut = p;
      this.overlay.cutTrail = [p];
    }
  };

  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const w = this.getWorld();
    if (!w) return;
    const p = this.pos(e);
    if (this.mode === 'drag' && this.overlay.dragFrom !== null) {
      this.overlay.dragTo = p;
      const id = this.towerAt(p);
      this.overlay.hoverTarget = id !== null && id !== this.overlay.dragFrom ? id : null;
      this.overlay.dragValid =
        this.overlay.hoverTarget !== null && w.canLink(PLAYER, this.overlay.dragFrom, this.overlay.hoverTarget) === null;
    } else if (this.mode === 'cut' && this.lastCut) {
      if (w.cutLinks(PLAYER, this.lastCut, p) > 0) this.onAction?.('cut');
      this.lastCut = p;
      this.overlay.cutTrail.push(p);
      if (this.overlay.cutTrail.length > 24) this.overlay.cutTrail.shift();
    }
  };

  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const w = this.getWorld();
    if (w && this.mode === 'drag' && this.overlay.dragFrom !== null) {
      const target = this.towerAt(this.pos(e));
      if (target !== null && target !== this.overlay.dragFrom) {
        const err = w.addLink(PLAYER, this.overlay.dragFrom, target);
        if (err) {
          const msg = ERROR_TEXT[err];
          if (msg) this.renderer.flashText(w.towers[this.overlay.dragFrom], msg, '#ffd6d6');
          this.onAction?.('error');
        } else this.onAction?.('link');
      }
    }
    this.cancel(e);
  };

  private cancel = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.mode = 'none';
    this.lastCut = null;
    this.reset();
  };

  reset(): void {
    this.overlay.dragFrom = null;
    this.overlay.dragTo = null;
    this.overlay.hoverTarget = null;
    this.overlay.dragValid = false;
    this.overlay.cutTrail = [];
  }
}
