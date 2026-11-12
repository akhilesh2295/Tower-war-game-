/**
 * All gameplay balance numbers live here so tuning never requires touching
 * simulation code. Distances are in world units (the world is WORLD_W x WORLD_H),
 * times are in seconds.
 */
export const WORLD_W = 1000;
export const WORLD_H = 1500;

export const TOWER_RADIUS = 44;

/** People walk along links at this speed. */
export const UNIT_SPEED = 150;
/** Each active link sends one person every SEND_INTERVAL seconds. */
export const SEND_INTERVAL = 0.5;
/** Owned towers gain one person every GROW_INTERVAL seconds... */
export const GROW_INTERVAL = 1.0;
/**
 * ...until they reach the level's growth cap (LevelDef.maxCount, default
 * TOWER_CAP). A tower below its cap starts regenerating again.
 */
export const TOWER_CAP = 30;
/**
 * Absolute ceiling for any tower. Reinforcements may overfill a tower past
 * its growth cap up to this number; extra arrivals are lost. This keeps
 * the number of people on the board bounded.
 */
export const HARD_CAP = 99;

/**
 * Tower levels. A tower with at least `min` people is at that level and may
 * hold `links` outgoing connections. Level 3 is reached at 20 and maxes at 30.
 */
export const TOWER_LEVELS = [
  { min: 0, links: 1 },
  { min: 10, links: 2 },
  { min: 20, links: 3 },
] as const;

/**
 * Hysteresis: a tower only loses an unlocked link once it falls this many
 * people below that level's threshold, so sending people doesn't instantly
 * break the link you just unlocked.
 */
export const LINK_DROP_MARGIN = 5;

export const ARCHER = {
  /** Range when the tower holds 0 people. */
  baseRange: 150,
  /** Extra range per person in the tower. */
  rangePerPerson: 7,
  maxRange: 380,
  fireInterval: 0.75,
  arrowSpeed: 650,
};

export const SIM_DT = 1 / 60;

export const PLAYER = 1;
export const NEUTRAL = 0;
