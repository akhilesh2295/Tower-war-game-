import { Sfx } from '../audio/sfx';
import { PLAYER } from '../game/config';
import { Game } from '../game/game';
import type { LevelDef } from '../game/types';
import { InputController } from '../input/input';
import { generateLevel } from '../levels/generator';
import { LEVELS } from '../levels/levels';
import { team } from '../render/palette';
import { Renderer } from '../render/renderer';
import { isUnlocked, loadProgress, saveProgress, starsFor, type Progress } from '../storage/progress';

type Screen = 'menu' | 'levels' | 'game';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

/**
 * Owns the screens (DOM) and the play session (canvas). Menus are plain HTML
 * so they are accessible, crisp and easy to restyle; the board is a canvas.
 */
export class App {
  private renderer: Renderer;
  private input: InputController;
  private sfx = new Sfx();
  private progress: Progress = loadProgress();
  private game: Game | null = null;
  private level: LevelDef | null = null;
  private levelIndex = -1; // -1 = skirmish
  private screen: Screen = 'menu';
  private paused = false;
  private speed = 1;
  private lastFrame = 0;
  /** Bots-only battle playing behind the menus. */
  private demo: Game | null = null;

  private el = {
    hud: $('#hud'),
    title: $('#hud-title'),
    bar: $('#strength'),
    timer: $('#hud-timer'),
    speed: $<HTMLButtonElement>('#btn-speed'),
    overlay: $('#overlay'),
  };

  constructor() {
    this.renderer = new Renderer($<HTMLCanvasElement>('#board'));
    this.input = new InputController(this.renderer, () => this.game?.world ?? null);
    this.input.onAction = (k) => (k === 'link' ? this.sfx.link() : k === 'cut' ? this.sfx.cut() : this.sfx.error());
    this.sfx.enabled = this.progress.settings.sound;

    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });

    $('#btn-pause').addEventListener('click', () => this.pause());
    this.el.speed.addEventListener('click', () => this.toggleSpeed());

    const onResize = () => this.renderer.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
    new ResizeObserver(onResize).observe(this.renderer.canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'game' && this.game?.world.status === 'playing') this.pause();
    });

    this.showMenu();
    requestAnimationFrame(this.frame);
  }

  /* ------------------------------ screens ------------------------------ */

  private setScreen(s: Screen) {
    this.screen = s;
    document.body.dataset.screen = s;
  }

  private modal(html: string) {
    this.el.overlay.innerHTML = `<div class="panel">${html}</div>`;
    this.el.overlay.hidden = false;
  }

  private closeModal() {
    this.el.overlay.hidden = true;
    this.el.overlay.innerHTML = '';
  }

  private bind(id: string, fn: () => void) {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', fn);
  }

  private ensureDemo() {
    if (this.demo && this.demo.world.status === 'playing') return;
    const seed = Math.floor(Math.random() * 100000) + 1;
    this.demo = new Game(generateLevel({ seed, bots: 3, difficulty: 'normal' }), seed, 'normal');
    this.renderer.resize();
  }

  showMenu() {
    this.setScreen('menu');
    this.game = null;
    this.ensureDemo();
    const cleared = LEVELS.filter((l) => this.progress.stars[l.id]).length;
    this.modal(`
      <div class="logo" aria-hidden="true">
        <span style="--c:${team(1).main}"></span><span style="--c:${team(2).main}"></span><span style="--c:${team(3).main}"></span>
      </div>
      <h1>Tower Tide</h1>
      <p class="sub">Link your towers. Send your people. Take the map.</p>
      <button class="btn primary" id="m-play">Play <small>${cleared}/${LEVELS.length}</small></button>
      <button class="btn" id="m-skirmish">Random Skirmish</button>
      <button class="btn" id="m-how">How to Play</button>
      <button class="btn ghost" id="m-sound">Sound: ${this.progress.settings.sound ? 'On' : 'Off'}</button>
    `);
    this.bind('m-play', () => this.showLevels());
    this.bind('m-skirmish', () => this.startSkirmish());
    this.bind('m-how', () => this.showHowTo());
    this.bind('m-sound', () => {
      this.progress.settings.sound = !this.progress.settings.sound;
      this.sfx.enabled = this.progress.settings.sound;
      saveProgress(this.progress);
      this.showMenu();
    });
  }

  showHowTo() {
    this.modal(`
      <h2>How to Play</h2>
      <ul class="how">
        <li><b>Drag</b> from your <span class="dot" style="--c:${team(1).main}"></span> tower to any tower to send people along a link.</li>
        <li><b>Grey</b> towers are neutral: the number is how many people it takes to capture them.</li>
        <li>Your towers <b>grow</b> over time. At <b>10</b> they unlock a 2nd link, at <b>20</b> a 3rd (max 30).</li>
        <li><b>Swipe</b> across your link to cut it. Drag the other way to reverse it.</li>
        <li>Opposing streams on the same link <b>cancel out</b>.</li>
        <li><b>Archer</b> towers (spiked) shoot enemies in range. More people = longer range.</li>
        <li>Take every rival tower to win!</li>
      </ul>
      <button class="btn primary" id="h-back">Got it</button>
    `);
    this.bind('h-back', () => this.showMenu());
  }

  showLevels() {
    this.setScreen('levels');
    this.game = null;
    this.ensureDemo();
    const ids = LEVELS.map((l) => l.id);
    const cells = LEVELS.map((l, i) => {
      const open = isUnlocked(this.progress, ids, i);
      const s = this.progress.stars[l.id] ?? 0;
      return `<button class="lvl ${open ? '' : 'locked'}" data-i="${i}" ${open ? '' : 'disabled'} aria-label="Level ${i + 1} ${l.name}">
        <span class="n">${open ? i + 1 : '🔒'}</span>
        <span class="stars">${stars(s)}</span>
        <span class="nm">${l.name}</span>
      </button>`;
    }).join('');
    this.modal(`
      <h2>Levels</h2>
      <div class="grid">${cells}</div>
      <button class="btn ghost" id="l-back">Back</button>
    `);
    this.el.overlay.querySelectorAll<HTMLButtonElement>('.lvl').forEach((b) =>
      b.addEventListener('click', () => this.startLevel(Number(b.dataset.i))),
    );
    this.bind('l-back', () => this.showMenu());
  }

  /* ------------------------------ sessions ----------------------------- */

  startLevel(index: number) {
    this.levelIndex = index;
    this.begin(LEVELS[index], index + 1);
  }

  startSkirmish(seed = (Date.now() % 1_000_000) + 1) {
    this.levelIndex = -1;
    this.begin(generateLevel({ seed }), seed);
  }

  private begin(level: LevelDef, seed: number) {
    this.closeModal();
    this.setScreen('game');
    this.level = level;
    this.game = new Game(level, seed);
    this.paused = false;
    this.input.reset();
    this.input.enabled = true;
    const label = this.levelIndex >= 0 ? `${this.levelIndex + 1}. ${level.name}` : level.name;
    this.el.title.textContent = label;
    this.renderer.resize();
    this.updateHud();
    this.showIntro(level, label);
  }

  /** Level card: name, bot count and tutorial hint. The game waits behind it. */
  private showIntro(level: LevelDef, label: string) {
    this.paused = true;
    this.input.enabled = false;
    const rivals = level.bots
      .map((b) => `<span class="rival"><span class="dot" style="--c:${team(b.owner).main}"></span>${b.difficulty}</span>`)
      .join('');
    this.modal(`
      <h2>${label}</h2>
      <div class="rivals">${rivals}</div>
      ${level.hint ? `<p class="hint">${level.hint}</p>` : ''}
      ${this.levelIndex >= 0 ? `<p class="sub">★★★ under ${fmtTime(level.parTime)}</p>` : ''}
      <button class="btn primary" id="i-start">Start</button>
    `);
    this.bind('i-start', () => this.resume());
  }

  private toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : 1;
    this.el.speed.textContent = `${this.speed}×`;
  }

  pause() {
    if (!this.game || this.game.world.status !== 'playing' || this.paused) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.reset();
    this.modal(`
      <h2>Paused</h2>
      <button class="btn primary" id="p-resume">Resume</button>
      <button class="btn" id="p-restart">Restart</button>
      <button class="btn ghost" id="p-quit">${this.levelIndex >= 0 ? 'Level Select' : 'Main Menu'}</button>
    `);
    this.bind('p-resume', () => this.resume());
    this.bind('p-restart', () => this.restart());
    this.bind('p-quit', () => (this.levelIndex >= 0 ? this.showLevels() : this.showMenu()));
  }

  private resume() {
    this.closeModal();
    this.paused = false;
    this.input.enabled = true;
    this.lastFrame = performance.now();
  }

  private restart() {
    if (this.levelIndex >= 0) this.startLevel(this.levelIndex);
    else if (this.level) this.begin(this.level, Number(this.level.id.replace('gen-', '')) || 1);
  }

  private finish() {
    const w = this.game!.world;
    const won = w.status === 'won';
    this.input.enabled = false;
    this.input.reset();
    won ? this.sfx.win() : this.sfx.lose();
    let earned = 0;
    let next = '';
    if (won && this.level && this.levelIndex >= 0) {
      earned = starsFor(w.time, this.level.parTime);
      const id = this.level.id;
      this.progress.stars[id] = Math.max(this.progress.stars[id] ?? 0, earned);
      this.progress.best[id] = Math.min(this.progress.best[id] ?? Infinity, Math.round(w.time));
      saveProgress(this.progress);
      if (this.levelIndex + 1 < LEVELS.length) next = `<button class="btn primary" id="r-next">Next Level</button>`;
    }
    if (won && this.levelIndex < 0) next = `<button class="btn primary" id="r-new">New Skirmish</button>`;
    setTimeout(() => {
      this.modal(`
        <h2 class="${won ? 'win' : 'lose'}">${won ? 'Victory!' : 'Defeated'}</h2>
        ${earned ? `<div class="big-stars">${stars(earned)}</div>` : ''}
        <p class="sub">${won ? `Cleared in ${fmtTime(w.time)}` : 'Your towers have fallen.'}</p>
        ${next}
        <button class="btn ${won ? '' : 'primary'}" id="r-retry">${won ? 'Replay' : 'Try Again'}</button>
        <button class="btn ghost" id="r-quit">${this.levelIndex >= 0 ? 'Level Select' : 'Main Menu'}</button>
      `);
      this.bind('r-next', () => this.startLevel(this.levelIndex + 1));
      this.bind('r-new', () => this.startSkirmish());
      this.bind('r-retry', () => this.restart());
      this.bind('r-quit', () => (this.levelIndex >= 0 ? this.showLevels() : this.showMenu()));
    }, 700);
  }

  /* ------------------------------- loop -------------------------------- */

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const g = this.game;
    if (g && this.screen === 'game') {
      if (!this.paused && g.world.status === 'playing') {
        g.advance(dt * this.speed);
        const events = g.world.drainEvents();
        this.renderer.pushEvents(g.world, events);
        for (const e of events) {
          if (e.type === 'capture' && (e.owner === PLAYER || e.prev === PLAYER)) this.sfx.capture(e.owner === PLAYER);
          else if (e.type === 'unitKilled') this.sfx.hit();
        }
        if (g.world.status !== 'playing') this.finish();
      }
      this.renderer.draw(g.world, this.input.overlay, this.paused ? 0 : dt);
      this.updateHud();
    } else if (this.screen !== 'game') {
      this.ensureDemo();
      const d = this.demo!;
      d.advance(dt);
      this.renderer.pushEvents(d.world, d.world.drainEvents());
      this.renderer.draw(d.world, IDLE_OVERLAY, dt);
    }
    requestAnimationFrame(this.frame);
  };

  private hudKey = '';
  private updateHud() {
    const w = this.game?.world;
    if (!w) return;
    const parts = w.owners.map((o) => ({ o, n: w.strength(o) }));
    const key = parts.map((p) => p.n).join(',') + '|' + Math.floor(w.time);
    if (key === this.hudKey) return;
    this.hudKey = key;
    const total = parts.reduce((s, p) => s + p.n, 0) || 1;
    this.el.bar.innerHTML = parts
      .filter((p) => p.n > 0)
      .map((p) => `<span style="flex:${p.n / total};background:${team(p.o).main}" title="${team(p.o).name}: ${p.n}"></span>`)
      .join('');
    this.el.timer.textContent = fmtTime(w.time);
  }
}

const IDLE_OVERLAY = { dragFrom: null, dragTo: null, hoverTarget: null, dragValid: false, cutTrail: [] };

function stars(n: number): string {
  return [1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('');
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
