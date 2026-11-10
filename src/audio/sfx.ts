/**
 * Tiny synthesized sound effects (WebAudio, no asset files). The context is
 * created lazily on the first user gesture, which iOS Safari requires.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  enabled = true;
  private last = new Map<string, number>();

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
  }

  private tone(name: string, freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, minGap = 0.05) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < minGap) return;
    this.last.set(name, now);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  link() { this.tone('link', 520, 0.12, 'triangle', 0.12, 260); }
  cut() { this.tone('cut', 380, 0.1, 'sawtooth', 0.06, -200); }
  error() { this.tone('error', 160, 0.15, 'square', 0.05); }
  capture(mine: boolean) { this.tone('capture', mine ? 660 : 300, 0.25, 'sine', 0.14, mine ? 330 : -120, 0.08); }
  hit() { this.tone('hit', 900, 0.04, 'square', 0.015, -400, 0.07); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone('win' + i, f, 0.25, 'triangle', 0.14), i * 110)); }
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone('lose' + i, f, 0.3, 'sine', 0.12), i * 160)); }
}
