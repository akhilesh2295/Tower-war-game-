const KEY = 'tower-tide/progress/v1';

export interface Progress {
  /** Best star rating (1..3) per level id. */
  stars: Record<string, number>;
  /** Best completion time (s) per level id. */
  best: Record<string, number>;
  settings: { sound: boolean };
}

const empty = (): Progress => ({ stars: {}, best: {}, settings: { sound: true } });

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<Progress>;
    return { ...empty(), ...p, settings: { ...empty().settings, ...p.settings } };
  } catch {
    return empty();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode / storage full: progress just isn't persisted */
  }
}

export function starsFor(time: number, par: number): number {
  if (time <= par) return 3;
  if (time <= par * 2) return 2;
  return 1;
}

/** A level is unlocked when it's the first one or the previous one is cleared. */
export function isUnlocked(p: Progress, ids: string[], index: number): boolean {
  return index === 0 || (p.stars[ids[index - 1]] ?? 0) > 0;
}
