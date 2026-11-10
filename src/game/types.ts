export type OwnerId = number; // 0 = neutral, 1 = human player, 2+ = bots
export type TowerKind = 'normal' | 'archer';
export type Difficulty = 'easy' | 'normal' | 'hard';

/* ----------------------------- Level data ----------------------------- */

/** A tower as authored in a level file. Coordinates are normalised 0..1. */
export interface TowerDef {
  x: number;
  y: number;
  /** 0 = neutral, 1 = player, 2+ = bot. */
  owner: OwnerId;
  /** Starting people. For neutral towers this is the capture cost. */
  count: number;
  kind?: TowerKind;
}

export interface BotDef {
  owner: OwnerId;
  difficulty: Difficulty;
}

export interface LevelDef {
  id: string;
  name: string;
  /** Short tutorial text shown at the start of the level. */
  hint?: string;
  bots: BotDef[];
  towers: TowerDef[];
  /** Seconds to finish for three stars (two stars at 2x). */
  parTime: number;
}

/* ---------------------------- Runtime state ---------------------------- */

export interface Tower {
  id: number;
  x: number;
  y: number;
  owner: OwnerId;
  count: number;
  kind: TowerKind;
  growAcc: number;
  fireAcc: number;
}

export interface Link {
  id: number;
  owner: OwnerId;
  from: number;
  to: number;
  sendAcc: number;
  createdAt: number;
}

export interface Unit {
  id: number;
  owner: OwnerId;
  from: number;
  to: number;
  /** Distance travelled from the centre of `from`. */
  s: number;
  /** Centre-to-centre distance. */
  d: number;
  x: number;
  y: number;
}

export interface Arrow {
  id: number;
  owner: OwnerId;
  x: number;
  y: number;
  targetId: number;
}

export type GameEvent =
  | { type: 'capture'; tower: number; owner: OwnerId; prev: OwnerId }
  | { type: 'unitKilled'; x: number; y: number; owner: OwnerId }
  | { type: 'linkAdded'; link: Link }
  | { type: 'linkRemoved'; link: Link }
  | { type: 'eliminated'; owner: OwnerId };

export type GameStatus = 'playing' | 'won' | 'lost';

export type LinkError =
  | 'not-owner'
  | 'same-tower'
  | 'duplicate'
  | 'no-slots'
  | 'bad-tower';
