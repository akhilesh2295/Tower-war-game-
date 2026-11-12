import type { OwnerId } from '../game/types';

export interface TeamColors {
  /** Main building / unit colour. */
  main: string;
  /** Shaded walls. */
  dark: string;
  /** Lit roof tops. */
  light: string;
  name: string;
}

/** Index = owner id. 0 neutral, 1 player, 2+ bots. */
export const TEAMS: TeamColors[] = [
  { main: '#9ea4ad', dark: '#767c86', light: '#c3c8cf', name: 'Neutral' },
  { main: '#3f86f0', dark: '#2a5fc0', light: '#7fb1ff', name: 'You' },
  { main: '#ec4b4b', dark: '#b52f35', light: '#ff8a7f', name: 'Red' },
  { main: '#f6b733', dark: '#c98a12', light: '#ffd979', name: 'Yellow' },
  { main: '#9b5de5', dark: '#6f3bb5', light: '#c39bff', name: 'Purple' },
  { main: '#2fbf71', dark: '#1d8a4f', light: '#79e3a6', name: 'Green' },
];

export function team(owner: OwnerId): TeamColors {
  return TEAMS[owner] ?? TEAMS[TEAMS.length - 1];
}

/** Scenery colours. */
export const SCENE = {
  sand: '#f2d49c',
  sandDark: '#e3bd7c',
  grass: '#8fd14f',
  grassLight: '#9edb5c',
  grassEdge: '#6db23a',
  treeDark: '#2c9441',
  treeMid: '#3dae52',
  treeLight: '#5cc96a',
  trunk: '#8a5a33',
  rock: '#d77a52',
  rockDark: '#b65a3a',
  crate: '#e08a3c',
  crateDark: '#b8651f',
  barrel: '#7f8894',
  tire: '#2e3034',
  wallLedge: '#f4f1ea',
  window: '#3a3f4a',
  skin: '#f6c89c',
  hair: '#2f2a28',
};
