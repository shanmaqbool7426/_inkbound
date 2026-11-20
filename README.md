# INKBOUND — Draw Your Beast

A 60-second survival game where **you draw the hero**. One continuous stroke
becomes a polygon; the polygon's geometry becomes the beast's RPG stats. Fat and
round tanks hits, thin and spiky is a glass cannon, big is slow.

No assets, no sprites, no audio files — every visual and sound is generated at
runtime, so the whole game ships in **~22 kB gzipped**.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle in dist/
npm run preview  # serve the built bundle
```

## How a drawing becomes stats

The stroke is simplified (Ramer–Douglas–Peucker), resampled to 24 vertices by
arc length, closed, and normalised to its own centroid. From that outline:

| Stat | Derived from |
| --- | --- |
| Health | thickness (area / perimeter), 60 → 320 |
| Attack | spikiness (perimeter vs. convex hull), 8 → 56 |
| Defense | thickness, reduced by spikiness |
| Speed | inverse of mass, reduced by spikiness |
| Dash cooldown | inverse of mass, 1.6 s → 1.0 s |
| Trait | dominant shape family (BULWARK / BLADE / DRIFTER / HEAVY / …) |

Stats are recomputed identically from a saved outline, so a shared beast record
is just the outline plus a score.

## Run structure

Nine waves over 60 seconds (0, 7, 14, 21, 28, 35, 42, 48, 54 s) plus a final
surge in the last ten seconds. Four enemy kinds, introduced in this order:

- **Seeker** — fodder, chases (waves 1-2).
- **Splitter** — slower chase, splits into two seekers on death (waves 3-4).
- **Lancer** — telegraphed wind-up, then a locked-direction charge (waves 5-6).
- **Bloomer** — slow radial hazard that fires eight projectiles at once (waves 7-9).

Score is 100 × chain multiplier per kill; the multiplier rises 0.5 per kill up
to x5 and resets when you get hit. Surviving adds a capped leftover-HP bonus.
Grades: S = survive with 20k+, A = survive, B = 9k+, C = below.

The seed comes from the UTC date in **Daily Challenge** (everybody plays the same
run) or from a random label in **Free Play**. The spawn schedule is a pure
function of that seed, so a run can be reproduced from its seed string.

Collision uses the drawn outline's convex hull rather than a circle, so the
silhouette really is the hitbox in every direction.

## Arenas

| Arena | Unlock | HP / DMG / Speed / Score |
| --- | --- | --- |
| Ink Meadow | start | 1.0 / 1.0 / 1.0 / 1.0 |
| Ember Citadel | 3 stars | 1.25 / 1.2 / 1.1 / 1.4 |
| Frost Hollow | 7 stars | 1.5 / 1.4 / 1.2 / 1.9 |
| Void Spire | 12 stars | 1.8 / 1.7 / 1.35 / 2.5 |

Stars come from the grade of a cleared run; progress, best score, mute state and
the last eight drawn beasts live in `localStorage` (`inkbound.save.v2`).

## Controls

Pointer/touch only: drag anywhere on the left half for the floating joystick,
tap the `>>` button (or right-click / `Space`) to dash. Dash deals damage and
gives brief invulnerability, so it doubles as the attack.

## Deploy

`npm run build` produces two shapes:

- **`dist/inkbound.html`** — one self-contained file (**~70 KB**, everything
  inlined: markup, CSS, JS, audio is synthesised, the only image is an inline
  `data:` SVG favicon). Double-click it, drop it on any host, or ship it as the
  zip payload for a portal that wants a single entry point.
- **`dist/index.html` + `dist/assets/*`** — the normal hashed build if you'd
  rather host it as three files (`npm run build:multi` builds only this).

```bash
npm run build      # typecheck -> dist/inkbound.html + dist/index.html + assets
npx vercel deploy --prod dist
```

`base` is `./` in `vite.config.ts`, so the multi-file build also runs from a
subdirectory.

## Shipping to YouTube Playables

The public Playables programme is invite-only, but the bundle already meets the
technical bar: no external requests, no fonts or audio downloads, no persistent
storage dependency (save data is best-effort), pointer-first input, and it runs
inside a cross-origin iframe. Submit through the Playables interest form with a
playable URL; keep the game under the size limit by not adding image assets.
