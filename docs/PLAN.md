# Tower Tide: Project Plan & Architecture

A mobile-first, browser-based strategy game in the *tower-war* genre: one
human against bot opponents. You link towers to send people, capture neutral
and enemy towers, and take the map.

---

## 1. Goals

| Goal | Measure |
|---|---|
| Plays well on iPhone **and** Android with no app-store install | Loads in Safari/Chrome, touch-only controls, safe-area aware, installable to home screen (PWA), works offline |
| Fun single-player loop | 10 hand-made levels with a difficulty ramp + endless random skirmishes |
| Easy to add levels | A level is ~15 lines of data; validation + balance checks run automatically |
| Ready to grow (multiplayer, more mechanics) | Deterministic simulation separated from rendering and input |

**Out of scope for v0.1:** online multiplayer, accounts, monetisation, native store builds.

## 2. Game rules (as implemented)

- **Owners:** neutral (grey), the player (blue), bots (red / green / gold / violet).
- **Towers** start with a number of people. For **neutral** towers that number is the
  *capture cost* (e.g. 5 / 10 / 15). It drops by one for each person who arrives, and the tower flips when it reaches 0.
- **Growth:** owned towers gain +1 person per second up to the level's growth cap
  (`maxCount`, default **30**; e.g. level 1 caps at 20, level 10 at 50). A tower that drops below
  its cap starts regenerating again. Reinforcements can overfill a tower, but never past the
  absolute **HARD_CAP = 99**, so the board can never fill up with unbounded people.
- **Levels and links:** a tower holds **1** outgoing link below 10 people, **2** from 10 and **3** from 20.
  An unlocked link is only lost when the tower falls 5 below the threshold (hysteresis), so
  sending people doesn't instantly break a link you just unlocked.
- **Links** send one person every 0.5 s while the source has people. Drag the opposite way to
  reverse a link; swipe across a link to cut it (people already walking keep going).
- **Clashes:** opposing streams on the same pair of towers annihilate one-for-one where they meet.
- **Arrival:** at a friendly tower it's +1; at an enemy or neutral tower it's −1. At 0 the tower is captured, and its old outgoing links are removed.
- **Archer towers** (watchtowers) shoot enemy people within range, whether passing by or attacking.
  Range = 150 + 7 × people (max 380). Neutral archers don't shoot.
- **Win:** every bot has no towers and no people left. **Lose:** the same happens to you.
- **Stars:** 3 for finishing under par time, 2 under 2× par, 1 otherwise. Clearing a level unlocks the next one.

All numbers live in `src/game/config.ts`.

- **Visuals:** a building gains a storey at each tower level. The dots on the roof are its link
  slots: white means another connection is available, dim means in use. The count turns gold at
  the growth cap. The bar at the top shows each team's people on the board.

## 3. Technology decision

**Choice: TypeScript + HTML5 Canvas 2D + Vite, no game engine. Shipped as a PWA.**

| Option | Verdict |
|---|---|
| Unity / Godot (native) | Heavy for a 2D board of circles and lines; store builds, slow web export, big download. Not needed. |
| Phaser / PixiJS | Good engines, but we'd use ~5% of them (no physics, tilemaps or sprite atlases). Adds ~1 MB and an API to learn. Easy to adopt later if visuals demand WebGL. |
| **Plain Canvas 2D + TS** ✅ | ~13 KB gzipped total, instant load on mobile networks, full control, trivially testable. Canvas 2D easily handles hundreds of moving units at 60 fps on phones. |

Why a web game works for "mobile": iOS Safari and Android Chrome both support
Pointer Events, Canvas and WebAudio, plus "Add to Home Screen" with a fullscreen PWA
manifest. If store presence is wanted later, wrap the same build with **Capacitor**
without rewriting anything.

## 4. Architecture

```
src/
  game/            ← pure, deterministic, no DOM: the "rules engine"
    config.ts        balance constants
    types.ts         level data + runtime state types
    world.ts         World: towers, links, units, arrows; step(dt); commands
    ai.ts            BotBrain: bots use the same addLink/removeLink commands as the player
    game.ts          World + bots, fixed 60 Hz timestep
    rng.ts, geometry.ts
  levels/
    levels.ts        the 10 hand-made levels (pure data)
    schema.ts        t(x,y,owner,count,kind) helper + validateLevel()
    generator.ts     seeded random skirmish levels (random bots/towers)
  render/            Canvas renderer (world units → screen, DPR-aware), palette
  input/             Pointer Events: drag-to-link, swipe-to-cut, finger-sized hit areas
  ui/app.ts          DOM screens (menu, levels, intro, pause, results), HUD, game loop
  audio/sfx.ts       synthesized WebAudio sounds (no asset files)
  storage/           localStorage progress (stars, best times, settings)
public/              PWA manifest, service worker, icons
tests/               Vitest: rules unit tests, level validation, headless balance
scripts/             balance report, icon generator
```

Key principles:

1. **Simulation ≠ presentation.** `World` knows nothing about canvas or DOM, which means:
   - headless tests can play whole games in milliseconds;
   - a future **multiplayer** server can run the same `World` authoritatively, with clients
     sending the same `addLink` / `cutLinks` commands the input layer uses today.
2. **Fixed timestep** (1/60 s) gives the same results regardless of frame rate. The 2× speed button just feeds in more time.
3. **Bots can't cheat.** They only use the public commands.
4. **Levels are data.** A normalised portrait board (0..1) fits any screen.

## 5. Adding a level

1. Append an object to `LEVELS` in `src/levels/levels.ts`:
   ```ts
   {
     id: 'l11', name: 'My Level', parTime: 150,
     hint: 'Optional tutorial text',
     bots: [{ owner: 2, difficulty: 'normal' }],
     towers: [
       t(0.5, 0.88, 1, 15),            // player
       t(0.5, 0.5, 0, 10, 'archer'),   // neutral archer, costs 10
       t(0.5, 0.12, 2, 15),            // bot 2
     ],
   }
   ```
2. `npm test` validates it (bounds, overlaps, owners) and checks that a strong AI standing in for the player can win it.
3. `npm run balance` prints win rates for easy / normal / hard stand-ins so you can see where it sits on the difficulty curve.

## 6. Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Plan, architecture, tooling (Vite, TS, Vitest) | ✅ |
| M1 | Core simulation: growth, links, levels, capture, clashes, archers, win/lose | ✅ |
| M2 | Bot AI (easy / normal / hard) | ✅ |
| M3 | Renderer + touch input (drag to link, swipe to cut) | ✅ |
| M4 | Screens: menu, level select, intro, pause, results; HUD; stars & progress | ✅ |
| M5 | 10 levels + random skirmish generator + automated balance tests | ✅ |
| M6 | PWA (offline, installable), sound, GitHub Pages deploy | ✅ |
| M7 | Playtest on real devices → tune `config.ts` and level pars | ⏭ next |
| M8 | Content: levels 11–30, new tower types (see backlog) | backlog |
| M9 | Online multiplayer (authoritative server running `World`) | backlog |

## 7. Backlog / ideas

- More tower types: *shield* (takes 2 hits per person), *barracks* (faster growth), *speed* (faster sending).
- Obstacles that links can't cross; maximum link length per level.
- An in-game level editor (export JSON) and a daily seeded skirmish.
- Haptics (`navigator.vibrate` on Android), music, particle polish, colour-blind palette.
- Multiplayer: WebSocket server running `World`, lockstep or snapshot sync; bots fill empty seats.
- Capacitor wrapper for App Store / Play Store.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Balance feels off on real devices | All tuning in one file; headless balance report; par times per level |
| iOS PWA quirks (audio unlock, safe areas, rubber-band scroll) | Audio unlocked on first touch; `viewport-fit=cover` + safe-area insets; `touch-action:none`, `overscroll-behavior:none` |
| Small screens and fat fingers | Hit area of at least 28 CSS px; portrait board scales to fit |
