# Tower Tide

A mobile-first browser strategy game in the tower-war genre. Link your towers, send your people and conquer the map against bot rivals. It runs in Safari on iPhone and Chrome on Android, and can be installed to the home screen (PWA, works offline).

- **10 levels** with tutorials and a difficulty ramp, plus **random skirmishes** (random bots and towers)
- Neutral towers with capture costs, tower growth, link slots that unlock at 10 and 20 people (max 30), swipe-to-cut, clashing streams and **archer towers** whose range grows with their garrison
- Bots in three difficulties

See **[docs/PLAN.md](docs/PLAN.md)** for the rules, the architecture, the tech decisions and the roadmap.

## Run it

```bash
npm install
npm run dev        # open the printed Network URL on your phone (same Wi-Fi)
npm test           # rules, level validation and headless balance tests
npm run balance    # win-rate report per level
npm run build      # static build in dist/ (host anywhere)
```

## Play on your phone

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(enable it under *Settings → Pages → Source: GitHub Actions*). Open the URL on
your phone, then use *Share → Add to Home Screen* (iOS) or *Install app* (Android).

## Controls

- **Drag** from your blue tower to another tower to create a link.
- **Swipe** across your link to cut it. Drag the opposite way to reverse it.
- ❚❚ pauses the game; **1×/2×** changes the speed.

## Adding levels

Levels are plain data in `src/levels/levels.ts`. See [docs/PLAN.md §5](docs/PLAN.md#5-adding-a-level).
