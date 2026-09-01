# Studdy — game spec (living document)

Seed for the full PRD. Captures everything decided through the style-prototype
phase (2026-08-31). The style prototype in this repo is the **visual bible**;
its conventions are binding (see §5).

## 1. Concept

A voxel café game that is a real digital study spot. You own and decorate a
café; real people visit and study together on one **communal room clock**
(synced sprints and breaks). Focused time is the only currency, earned on the
honor system — the game is a low-stakes tool for building habits with gentle
social pressure, never surveillance. Aesthetic: Korean Y2K online world
(Cyworld minirooms · PewDiePie's Tuber Simulator density) — voxel diorama,
fixed isometric camera, candy UI chrome, sky-blue checkerboard.

## 2. Core loop pillars (agreed in brainstorm)

- Communal synced clock per café; ruleset (25/5, 50/10, deep-work…) is the
  café's identity. Late arrivals wait in a foyer until the next block.
- Decoration/shopping is **only playable during breaks and off-hours** — the
  game refuses to become your procrastination.
- Cafés enterable 24/7; "staffed" is a warm bonus state; regulars can be
  promoted to barista (patron → regular → barista).
- Clickable profile card per patron: status one-liner, live focus timer,
  working-on napkin, headphones ON/OFF (= do-not-disturb), streak, friend
  request. Emote-only during sprints; chat at breaks; guestbook for async.
- Music: curated CC lofi + BYO Spotify (sync genre + clock, audio plays
  locally); procedural generation for ambience layers only (rain, murmur).
- Focus-time currency buys cosmetics only; nothing buys visibility or people.

## 3. Key scenarios to build (defined 2026-08-31)

### 3.1 Room setup
- **You start with an empty room.**
- A few prebuilt **"dream rooms" / model cafés** exist that anyone can visit
  and study in — they double as furnishing inspiration and day-one places to
  study while your own café is bare.
- **Structural edits are free at the start**: number of windows, window sizes,
  flooring, wall colors, room size, adding extending walls. (Structure is not
  monetized early; identity comes from furnishing.)

### 3.2 Shop / inventory
- Browsable **catalog** of furniture and objects.
- Acquire → item is **delivered** (a package arrives — a moment, not a menu).
- From **inventory**, drop items into the room; **move and rotate** them
  freely; return to inventory.

### 3.3 Take a seat (visiting)
- A visitor may sit in **any open seat**; seats + couches = the café's total
  **capacity**.
- Every seat is **anchored to a table/surface** (people study at surfaces);
  larger tables hold multiple seats. The window bar is a long shared surface.

### 3.4 Deferred (explicitly)
- A later dedicated pass upgrading all furniture/object **textures, coloring,
  and "life"/energy**.
- Two-way presence, backend persistence, avatar customizer, café-street
  discovery, guestbook UI — all previously discussed, all post-style-phase.

## 4. Engineering implications (for the plan, not yet decided)

- Room = data (grid dimensions, wall/floor styles, openings list) → the
  current hand-authored `world.ts` becomes a **renderer over a room document**.
- Furniture = catalog of parametric voxel/smooth-hybrid builders with
  footprint, seat anchors, and rotation (4 orientations).
- Seats need occupancy state + a seated-person spawner (the person builder is
  already parametric).
- Dream rooms = saved room documents shipped with the app.

## 5. Binding visual conventions (from the style prototype)

- 1 voxel = 0.0625 world units; fixed iso camera (~32°/45°), zoom 1–5× +
  drag-pan, never rotate.
- Per-vertex corner AO; NoToneMapping; high-key cream palette; low jitter;
  small shadow normalBias; no haze halos.
- Big round shapes are smooth geometry (puck/cone helpers); everything boxy
  stays voxel. Supersampled pixel ratio.
- **Ceiling lights are invisible**: an even grid of warm point lights + a
  straight-down directional "wash," strong and direct even during day. Never
  draw hanging fixtures. **Two owner light channels**: "room" (ceiling grid +
  wash) and "lamps" (furniture fixtures: floor lamp, shade glow, fairy
  lights) — independent sliders in café controls.
- **Retro outline pass**: furniture and creatures (outline layer 1) get a
  thin screen-space cocoa silhouette outline via a depth-mask post pass;
  floor, walls, rugs, and wall décor stay soft. Every new furniture builder
  must mark its meshes with the outline layer (`outlined()` / `puck`/`cone`
  do it automatically).
- Wall items must have real depth: doors recessed with proud frames, clocks
  and posters proud of the wall. Trim/rails skip openings.
- Objects on round surfaces: full extent inside the radius; handles touch
  mugs; stems touch pots.
- Characters ~2 units seated, small against the room; cat ~0.75 units; no
  emoji in UI (dingbats fine); sky-blue checker page, lavender dusk,
  periwinkle night.
- **UI is pixel-art game chrome, never smooth web gloss**: 9-slice pixel
  sprites (authored in `pixelui.ts`), hard-offset shadows only — no blur, no
  gradients, no glow; Pixelify Sans labels, DotGothic16 digits; pressed
  states are real sprite swaps; every new page/window (shop, inventory,
  directory, HUD) is built in this language.
