import { describe, expect, it } from 'vitest';
import { GROW_INTERVAL, SEND_INTERVAL, TOWER_CAP } from '../src/game/config';
import type { LevelDef } from '../src/game/types';
import { maxLinks, World } from '../src/game/world';
import { t } from '../src/levels/schema';

const lvl = (towers: LevelDef['towers'], bots = [{ owner: 2, difficulty: 'easy' as const }]): LevelDef => ({
  id: 'test',
  name: 'test',
  parTime: 60,
  bots,
  towers,
});

function run(w: World, seconds: number) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) w.step(dt);
}

describe('World', () => {
  it('grows owned towers up to the cap but not neutral ones', () => {
    const w = new World(lvl([t(0.2, 0.8, 1, 5), t(0.8, 0.2, 2, 29), t(0.5, 0.5, 0, 5)]));
    run(w, GROW_INTERVAL * 3 + 0.01);
    expect(w.towers[0].count).toBe(8);
    expect(w.towers[1].count).toBe(TOWER_CAP);
    expect(w.towers[2].count).toBe(5);
  });

  it('unlocks links at 10 and 20 people', () => {
    expect(maxLinks(9)).toBe(1);
    expect(maxLinks(10)).toBe(2);
    expect(maxLinks(20)).toBe(3);
    expect(maxLinks(30)).toBe(3);
  });

  it('rejects invalid links', () => {
    const w = new World(lvl([t(0.2, 0.8, 1, 5), t(0.8, 0.2, 2, 5), t(0.5, 0.5, 0, 5)]));
    expect(w.addLink(1, 1, 0)).toBe('not-owner');
    expect(w.addLink(1, 0, 0)).toBe('same-tower');
    expect(w.addLink(1, 0, 2)).toBeNull();
    expect(w.addLink(1, 0, 2)).toBe('duplicate');
    expect(w.addLink(1, 0, 1)).toBe('no-slots');
  });

  it('captures a neutral tower with exactly its cost', () => {
    const w = new World(lvl([t(0.5, 0.9, 1, 5), t(0.5, 0.6, 0, 5), t(0.5, 0.1, 2, 5)]));
    w.addLink(1, 0, 1);
    run(w, 6);
    expect(w.towers[1].owner).toBe(1);
    expect(w.events.some((e) => e.type === 'capture' && e.tower === 1)).toBe(true);
  });

  it('removes the attacker-side links of a captured tower', () => {
    const w = new World(lvl([t(0.5, 0.9, 1, 25), t(0.5, 0.6, 2, 1), t(0.5, 0.1, 2, 5)]));
    w.addLink(2, 1, 2);
    w.addLink(1, 0, 1);
    run(w, 3);
    expect(w.towers[1].owner).toBe(1);
    expect(w.links.some((l) => l.from === 1 && l.owner === 2)).toBe(false);
  });

  it('dragging the other way reverses a link', () => {
    const w = new World(lvl([t(0.5, 0.9, 1, 5), t(0.5, 0.6, 1, 5), t(0.5, 0.1, 2, 5)]));
    w.addLink(1, 0, 1);
    w.addLink(1, 1, 0);
    expect(w.links.length).toBe(1);
    expect(w.links[0].from).toBe(1);
  });

  it('cuts links crossed by a swipe', () => {
    const w = new World(lvl([t(0.5, 0.9, 1, 5), t(0.5, 0.5, 0, 5), t(0.5, 0.1, 2, 5)]));
    w.addLink(1, 0, 1);
    w.addLink(2, 2, 1);
    const n = w.cutLinks(1, { x: 0, y: 1050 }, { x: 1000, y: 1050 });
    expect(n).toBe(1);
    expect(w.links.length).toBe(1);
    expect(w.links[0].owner).toBe(2);
  });

  it('opposing streams annihilate each other', () => {
    const w = new World(lvl([t(0.5, 0.8, 1, 10), t(0.5, 0.2, 2, 10)]));
    w.addLink(1, 0, 1);
    w.addLink(2, 1, 0);
    run(w, 8);
    // Both streams sent the same number of people; they should cancel out.
    expect(w.towers[0].owner).toBe(1);
    expect(w.towers[1].owner).toBe(2);
    expect(w.events.filter((e) => e.type === 'unitKilled').length).toBeGreaterThan(2);
  });

  it('sends one person per interval per link', () => {
    const w = new World(lvl([t(0.5, 0.9, 1, 9), t(0.5, 0.1, 2, 5)]));
    w.addLink(1, 0, 1);
    run(w, SEND_INTERVAL * 4 - 0.01);
    expect(w.units.length).toBe(4);
  });

  it('owned archer towers shoot enemy people in range', () => {
    const w = new World(
      lvl([t(0.2, 0.9, 1, 20), t(0.2, 0.1, 2, 25), t(0.4, 0.5, 1, 20, 'archer'), t(0.9, 0.9, 1, 1)]),
    );
    w.addLink(2, 1, 0);
    run(w, 10);
    expect(w.events.filter((e) => e.type === 'unitKilled').length).toBeGreaterThan(0);
    // Without the archer, 20 people would have flipped tower 0 within 10s; here it holds.
    expect(w.towers[0].owner).toBe(1);
  });

  it('declares victory when every bot is eliminated', () => {
    const w = new World(lvl([t(0.5, 0.8, 1, 20), t(0.5, 0.5, 2, 1)]));
    w.addLink(1, 0, 1);
    run(w, 10);
    expect(w.status).toBe('won');
  });

  it('declares defeat when the player is eliminated', () => {
    const w = new World(lvl([t(0.5, 0.8, 1, 1), t(0.5, 0.5, 2, 25)]));
    w.addLink(2, 1, 0);
    run(w, 10);
    expect(w.status).toBe('lost');
  });
});
