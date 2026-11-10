import type { OwnerId } from '../game/types';

export interface TeamColors {
  main: string;
  dark: string;
  light: string;
  name: string;
}

/** Index = owner id. 0 neutral, 1 player, 2+ bots. */
export const TEAMS: TeamColors[] = [
  { main: '#9aa3ae', dark: '#5f6873', light: '#c9cfd6', name: 'Neutral' },
  { main: '#3d8bff', dark: '#1f56b8', light: '#9cc4ff', name: 'You' },
  { main: '#ff5a5a', dark: '#b52a2a', light: '#ffb0b0', name: 'Red' },
  { main: '#3fcf6b', dark: '#1f8a42', light: '#a5ecbb', name: 'Green' },
  { main: '#ffbe3d', dark: '#b37d10', light: '#ffe2a3', name: 'Gold' },
  { main: '#b46cff', dark: '#7234c2', light: '#dcbcff', name: 'Violet' },
];

export function team(owner: OwnerId): TeamColors {
  return TEAMS[owner] ?? TEAMS[TEAMS.length - 1];
}
