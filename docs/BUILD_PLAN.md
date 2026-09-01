# Studdy — prototype build plan

Turns the style prototype (the visual bible) into a playable single-player
prototype of the café game. Everything multiplayer is **simulated** in this
phase (like ISO's mocks); the backend phase comes after this prototype
validates the loop. `GAME_SPEC.md` holds product intent; on conflict, spec
wins on intent, this plan wins on scope.

---

## 1. Scope of this phase

**In:** room-as-data + structural editing, furniture catalog → order →
delivery → inventory → placement, dream rooms, visiting + take-a-seat,
communal sprint clock with a real session loop, beans economy, simulated
patrons, save/load via localStorage, `?debug` panel.

**Out (later phases):** real multiplayer/backend, accounts, friends, chat,
guestbook UI, avatar customizer, music/Spotify, barista promotion, the
furniture texture/"life" upgrade pass (deferred by Paul), mobile-touch polish
beyond basic pinch/drag.

---

## 2. Pages & modes

One three.js canvas throughout; "pages" are UI modes layered on it, all in the
Y2K window chrome. Deep modals stack as draggable windows.

| # | Mode | What's on screen |
|---|------|------------------|
| P0 | **Splash** | wordmark, "my café" / "visit a café", tiny boot beat |
| P1 | **My Café (live)** | your room, sprint pill, café.controls (day-dusk-night, lights), patrons, cat; buttons: `edit`, `shop`, `visit`, packages badge |
| P2 | **Edit · room** | structural panel: room width/depth steppers, flooring & wall style swatches, per-wall opening list (add/resize/move windows, move door), extension wing toggle; live rebuild; free (no beans) |
| P3 | **Edit · furnish** | inventory tray (bottom), ghost-placement cursor, rotate/store/pick-up actions, validity tint, undo |
| P4 | **Shop** | catalog window: category tabs, item cards (voxel thumbnail, name, footprint, seats, price), bean balance, `order` |
| P5 | **Delivery** | package at the café door with a bow; tap → unbox animation → items land in inventory |
| P6 | **Visit directory** | card list: 3 dream cafés (+ your own); each card: name, vibe line, ruleset chip, live occupancy `3/8 seats`, tiny thumbnail |
| P7 | **Visiting (patron view)** | someone else's café; open seats glow on hover; `take a seat`; no edit/shop |
| P8 | **Session HUD (seated)** | napkin intention input (optional), your timer, headphones toggle, `leave seat`; room clock runs the sprint/break |
| P9 | **Profile card** | exists; extended to all patrons incl. simulated ones |
| P10 | **Debug (`?debug`)** | grant beans, force break/sprint end, spawn/clear patrons, unlock full catalog, reset save |

Persistent overlays: sprint pill (always), café.controls (owner only, in P1),
hint line, toasts.

---

## 3. User flows

### F1 · First run
1. Splash → "my café" → **empty room** (default 16×12, plain floor, one
   window, door) + welcome toast: "your café! visit a dream café for ideas ♪".
2. Starter kit pre-delivered: one package at the door containing 2 stools,
   1 small table, 1 rug (so furnish mode can be learned immediately).
3. Hint chain: unbox → place → visit a dream café → take a seat → first
   sprint → beans arrive → shop.

### F2 · Structural edit (free)
1. P1 → `edit` → room tab.
2. Change size: width/depth steppers (10–32 × 8–24 units); furniture that no
   longer fits auto-returns to inventory with a toast.
3. Windows: per wall, list of openings; `+ window` drops one in the largest
   gap; select → drag handles for position/width/height presets (S/M/L/bar).
4. Door: one per café, slide along either wall.
5. Flooring/wall swatches apply instantly. Extension wing (L-shape): toggle
   adds a second rectangular section joined to a chosen wall (tier 4 stretch).
6. `done` → rebuild, autosave.

### F3 · Shop → order
1. P1 → `shop` (owner, off-hours/breaks only — the pillar).
2. Browse categories; card shows footprint + seats so capacity math is
   visible before buying.
3. `order` → beans deducted → toast "arriving shortly ♪" → package spawns at
   the door after a short delay (real minutes later feels alive; debug can
   force-arrive).

### F4 · Delivery → inventory
1. Package (voxel box with bow) sits by the door; badge on `edit`.
2. Tap → unbox burst → contents listed → inventory.

### F5 · Furnish (place / move / rotate / store)
1. P3: inventory tray shows owned items with counts.
2. Tap item → **ghost** follows the pointer, snapped to the floor grid
   (0.5-unit steps); green = valid, red = collision/out-of-bounds.
3. `R` / rotate button cycles 4 orientations; wall items snap to walls;
   surface items (books, mugs, plants) snap to open surface slots on tables,
   bars, counters, shelves — extent-checked against the surface (the
   round-table rule from the style phase, now enforced by code).
4. Tap = place. Tap a placed item → halo + mini menu: move / rotate / store.
5. Seats auto-register to the nearest table/surface within reach; a seat with
   no surface shows a gentle warning tint (still placeable — but it won't
   count toward capacity until anchored, per spec §3.3).
6. Capacity readout updates live: "seats: 6".

### F6 · Visit a dream café
1. P1 → `visit` → directory.
2. Pick a café → iris-wipe → P7 with that room doc + simulated patrons
   studying (typing loops, steam, headphones states).
3. Look around freely (same camera); click patrons for profile cards.

### F7 · Take a seat & study
1. In P7 (or your own café), open seats glow on hover; occupied seats don't.
2. Click seat → your avatar sits (spawned seated, facing its table) → P8 HUD.
3. Optional napkin: "what are you working on?" → shows on your table + card.
4. The **room clock** governs: joining mid-sprint = quiet join, your timer
   still counts personally; the break bell is communal — every avatar
   stretches/stands at once.
5. Each completed sprint block ⇒ **beans** (owner of the café also earns a
   hosting bean — the aligned-incentive economy, simulated for now).
6. `leave seat` (or closing the tab) frees the seat cleanly.

### F8 · Break window
1. Bell → break banner → shop/edit unlock for the break duration (owner);
   patrons wander (v1: stand + idle), cat gets pets.
2. Sprint resumes → edit/shop close automatically, ghost placement cancels.

---

## 4. Systems & data model

```ts
RoomDoc {
  w, d,                       // units
  floorStyle, wallStyle,      // swatch ids
  openings: [{ wall: 'back'|'left', kind: 'window'|'door', start, width, size }],
  wing?: { wall, offset, w, d }          // tier-4 L-extension
}
CatalogItem {
  id, name, category,         // seating | tables | surfaces | decor | wall | rugs | plants | counter
  price, footprint: [w, d],   // units
  placement: 'floor'|'wall'|'surface'|'rug',
  seats?: [{ dx, dz, facing }],          // for seating: where a person sits
  surfaceSlots?: number,                 // how many small items fit on top
  build: (variant) => THREE.Group        // voxel+smooth hybrid builder
}
PlacedItem { uid, itemId, x, z, rot: 0|1|2|3, wall?, onSurface?: uid }
SaveDoc { room: RoomDoc, placed: PlacedItem[], inventory: Record<itemId, n>,
          beans, packages: [...], settings }
CafeDoc = SaveDoc + { name, vibeLine, ruleset }   // dream rooms ship as these
Session { cafeId, seatUid, napkin?, startedAt, headphones }
SimPatron { persona, seatUid, headphones, startedAt }  // arrive/leave on timers
```

- **Store:** one Zustand-style store (`useStuddyStore` pattern from ISO):
  save state + edit state + session + patrons. Capacity/occupancy derived.
- **Clock:** per-café ruleset `{sprintMin, breakMin}`; phase computed from a
  cafe epoch so it's deterministic and shared (backend-ready).
- **Economy:** beans from completed blocks only; structural edits free;
  catalog priced 5–120 beans; debug faucet.

---

## 5. Catalog v1 (~20 items)

Seating: stool (4 pastel variants) · café chair · window-bar stool ·
armchair (1 seat) · loveseat (2 seats).
Tables: round S (r2, 2 seats, 2 slots) · round M (r3, 4 seats, 4 slots) ·
square S · window bar (len 4/6/8, N seats, N slots) · side table (1 slot).
Counter: counter segment (2 units, connectable) · espresso machine · grinder ·
cake stand · register (all surface items for counters).
Decor/wall: poster (3 art variants) · clock · corkboard · chalkboard ·
mug shelf · fairy lights (per-wall).
Rugs/plants: round rug (2 colorways) · runner · monstera · succulent · ivy
garland (window-mounted).
Other: floor lamp · cat cushion (the cat adopts the café once placed ♪).

Each is a parametric builder extracted from the current `world.ts` — the
style prototype's room is literally decomposed into this catalog, and the
showcase café becomes dream room #1 ("moon_latte's").

---

## 6. Architecture & refactor

1. **Decompose `world.ts`:** `shell.ts` (floor/walls/openings from RoomDoc —
   the door/window/trim/depth conventions live here), `items/*.ts` (catalog
   builders returning self-contained groups with footprint metadata),
   `people.ts`, `cat.ts`, `fx.ts` (rain/steam/sky per-window).
2. **Shell rebuilds wholesale** on structural edit (~1s, acceptable behind a
   250ms white-wipe). **Items are individual groups** — place/move/rotate
   never rebuilds the world.
3. **Picking:** raycast → item groups (edit) / seat anchors (visit) /
   people (cards). Ghost = builder output at 55% opacity, tinted.
4. Camera/controls/lighting/UI carry over unchanged; lighting reads window
   list from RoomDoc (glass/sky/rain per opening).
5. Persistence: `localStorage` autosave (debounced), `resetAll` in debug.
   Dream rooms = three authored `CafeDoc` JSON files.

---

## 7. Build tiers

**T1 — Room as data + furnish loop** *(the foundation; biggest tier)*
Shell renderer from RoomDoc · structural edit panel (size, flooring, walls,
windows, door) · item builders for catalog v1 · inventory tray · ghost
placement with collision/rotation/surface slots · seat anchoring + capacity
readout · save/load · debug panel v1.
✓ Accept: start empty, resize the room, add a window, place a table + 2
stools + rug from inventory, rotate a chair, capacity reads correctly,
reload persists everything.

**T2 — Shop, beans, delivery**
Catalog UI · bean balance · order → timed package → unbox to inventory ·
starter-kit first-run flow.
✓ Accept: F1 and F3–F4 run end-to-end; can't order without beans; packages
survive reload.

**T3 — Dream rooms, visiting, take a seat**
3 authored dream cafés (showcase café ported as #1) · directory · visit flow ·
seat glow/occupancy · sit/leave with spawned seated avatar · simulated
patrons with profile cards · napkin intention.
✓ Accept: F6–F7 run end-to-end; occupied seats refuse; leaving frees the
seat; patron cards open.

**T4 — Session loop + economy closure**
Real communal clock per café ruleset · break bell moment (everyone stands) ·
beans earned on completed blocks (visitor + host) · edit/shop locked to
breaks/off-hours · break banner · L-extension wing (stretch).
✓ Accept: F7 steps 4–6 and F8 verified; a full sprint earns beans that buy a
real item that gets delivered.

**T5 — Polish pass**
The deferred furniture texture/color/"life" upgrade · sounds (bell, unbox,
sparkle) · splash screen · empty-room onboarding hints · perf pass ·
VALIDATION.md against this plan.

---

## 8. Open questions (recommendations included)

1. **Currency name** — recommend **beans** (jar of beans as the wallet
   visual). Alternative: acorns (closer Cyworld homage).
2. **Room grid granularity** — recommend 0.5-unit placement grid (fine enough
   for cozy clutter, coarse enough to reason about).
3. **Sprint lengths in prototype** — recommend a debug-adjustable 2-min
   sprint / 30-s break default for demos, with real presets (25/5, 50/10)
   selectable in café.controls.

---

*Working style: tier by tier, screenshot verification per tier, VALIDATION.md
updated at the end. On approval, T1 starts with the `world.ts` decomposition.*
