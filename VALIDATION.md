# Studdy — validation

## T1: room as data + furnish loop (2026-08-31) — PASS

Acceptance criteria from `docs/BUILD_PLAN.md` §7, verified in the browser:

- **Start empty** ✓ — fresh save boots a 16×12 starter room (door + one
  window, honey parquet, cream walls) built entirely from the RoomDoc, with
  the starter kit in inventory. All style-bible conventions carry over
  (recessed door, trims segmented around openings, honey cap, outline pass,
  invisible ceiling lights, day/dusk/night + two light sliders).
- **Structural edits (free)** ✓ — width/depth steppers rebuilt the shell
  live (16×12 → 20×14), back-wall windows 1 → 2 with even re-layout, floor
  swatch honey → checker, furniture survived in place; camera refit to the
  new extent. Wall swatches and door move/wall-switch wired the same way.
- **Furnish loop** ✓ — placed round table S, 2 stools, café chair, and a
  round rug from the inventory tray via ghost placement (green/red validity,
  0.25-unit snapping); rug is no-collide under furniture.
- **Rotate** ✓ — clicked the placed chair → selection window (rotate / move
  / store / close); rotate turned it in place with validity check.
- **Capacity** ✓ — "seats: 2" with two stools anchored at the table (the
  chair sat just outside anchoring reach, correctly excluded until moved).
- **Surface placement** ✓ — mug placed ON the table top; espresso machine
  placed ON a counter; riders move/store with their surface.
- **Placed lights** ✓ — a placed floor lamp registers with the lighting rig
  (shade emissive + warm pool respond to night + the lamps slider).
- **Reload persists** ✓ — full state (room shape, floor, windows, all
  placements incl. rotation) restored from localStorage.
- **Debug (`?debug`)** ✓ — grant +5 of everything, reset save.
- **Showcase regression** ✓ — the style prototype still runs at `?showcase`
  (barista, cat, profile card).

### Known deviations / deferred within T1 scope
- Window sizing is per-wall count with even auto-layout (S/M/L presets and
  drag handles deferred); door width fixed at 2.5u.
- Item color variants are picked at random on placement (variant picker UI
  deferred).
- Wall-mounted catalog items (poster, clock, mug shelf, chalkboard, fairy
  lights) deferred to T2 alongside the shop.
- L-shaped extension wing deferred (plan marks it T4 stretch).
- Seat-anchoring is distance-based (center-to-center vs surface reach), not
  seat-point precise.

### T1 feedback round (same day) — PASS
- Window layout now distributes windows across wall segments **around the
  door** (no more door/window overlap on the door's wall).
- Sky planes offset+clamped for iso parallax — no more glass sheets floating
  outside the room.
- **Surface placement raycasts the actual tabletops** (was the floor plane —
  parallax made placing on tables nearly impossible); small overhang
  tolerance added. Book placed on a table via pointer verified.
- New **carpet** floor style (seam-free sage).
- Door porthole is **see-through** (carved through, glass + sky discs).
- **Color swatches on the selection window** — every seat/rug/mug family has
  4 colorways, swappable after placement (fixed a live-item aliasing bug that
  blocked rebuilds on variant change).
- **Chair redesigned**: solid rounded back with a small heart cutout,
  narrower stance (the wide hoop back is gone).
- Placed/removed lamps now refresh the lighting rig immediately.

## T2: shop, beans, delivery (2026-08-31) — PASS

- **F1 first run** ✓ — fresh save boots the empty room with the **starter
  package waiting at the door** (box with ribbon + bow, gentle bob); clicking
  it unboxes the starter kit with a contents toast (table, 2 stools, chair,
  rug, 2 mugs, book) straight into inventory.
- **F3 shop → order** ✓ — `◍ shop` opens the pixel catalog: bean balance,
  category tabs, rows with name/footprint/seats/price, `order` buttons.
  Ordering deducts beans; orders placed close together **ship in one box**;
  ordering beyond the balance is refused with a toast ("not enough beans…").
- **F4 delivery → unbox** ✓ — packages arrive ~20s after ordering (toast
  "a package arrived at the door ♪", box spawns at the door; debug can force
  delivery). Unboxing lists contents and fills inventory; the purchased
  loveseat was placed in the café.
- **Persistence** ✓ — beans and packages (pending and arrived) live in the
  save; bean deduction and package creation are written atomically. Added a
  flush on tab-hide/unload so last-second actions aren't lost to the write
  debounce.
- **Debug** ✓ — `+100 beans`, `deliver packages now`.

### Deviations within T2 scope
- The shop is accessible at all times; the "breaks/off-hours only" gate
  arrives with the communal clock in T4.
- Shop rows are text (name/footprint/seats/price); item thumbnails are a
  polish-tier task.
- Bean earning comes from completed sprints in T4; until then the faucet is
  the debug panel.

**Next:** T3 — dream rooms, visiting, take a seat.

## T3: dream rooms, visiting, take a seat (2026-08-31) — PASS

- **F6 visit a dream café** ✓ — `✈ visit` opens the **café directory**:
  three authored rooms (moon_latte's · harbor light · petal & bean), each
  with vibe line, ruleset, and live `occupied/seats` occupancy computed from
  the same anchored-seat rule as the player's café. Visiting swaps the whole
  scene to the café's room + furniture (renderer is data-driven end to end),
  updates the marquee to the café's name, hides edit/shop (you can only edit
  your own café — enforced in `game.setMode`, not just the UI), and shows
  `⌂ go home`. All three cafés verified in the browser; going home restores
  the player's save, marquee, and edit tools.
- **Sim patrons** ✓ — each café seats its regulars (scripted personas) with
  the shared chibi builder (`people.ts`, extracted from the showcase) and the
  typing/bob/blink animator at per-person phase/speed. Clicking a patron
  opens their **profile card** with portrait recolored to their hair/sweater,
  status, working-on, headphones, streak, and a live focused timer.
- **F7 take a seat** ✓ — hovering a free seat in view mode shows a soft
  pulsing ring at seat height; clicking sits you there (heart burst + toast),
  spawning your own chibi facing the nearest table. Clicking an occupied
  seat refuses gently ("someone's already sitting there ♪"). Works in dream
  cafés and at home.
- **Session HUD** ✓ — while seated: live focused timer, **napkin** intention
  input (shows up in your own profile card as status + working-on),
  headphones toggle, `stand up`. Leaving frees the seat and hides the HUD;
  entering edit mode auto-stands-up first.
- **Packages stay home** ✓ — door packages are hidden (and arrival polling
  paused) while visiting; they're waiting when you return.

### Deviations within T3 scope
- Sim patrons are seated on load and don't come/go on a schedule yet; arrival/
  departure rhythm can ride on the T4 communal clock.
- The profile-card `+ friend` / `visit café` actions remain "coming soon ♪"
  stubs (friend systems are out of prototype scope).

**Next:** T4 — communal sprint clock, session economy, break-gated shop/edit.

## T3 feedback round (2026-09-01) — PASS

- **Seat facing fixed** — seats with backrests (chair, armchair, loveseat,
  bean bag) now seat you facing the seat's own forward, back against the
  backrest (`seatFaces: 'item'` in the catalog; sitter rotation = the placed
  item's rotation). Backless seats (stool, bench, floor cushion) still turn
  to face the nearest table. Dream-café chairs re-rotated to face their
  tables under the new rule.
- **Standing player avatar** — the player now always exists in the room as a
  standing chibi (new `stand` pose in `people.ts`: little legs + shoes,
  hanging arms, breath/sway/blink idle). You walk in at the door (collision-
  aware landing spot), sitting swaps you onto the seat, and standing up puts
  you on the floor beside the seat facing it. Clicking yourself standing
  opens your card ("just looking around ♪"). Kept inside the room when it
  shrinks in room edit.
- **14-color cozy palette** — SEAT_COLORS grew from 4 to 14 curated
  [base, deep] pairs: warm pastels (pink, peach, butter), cool pastels
  (mint, sage, sky, lavender, periwinkle), neutrals (cream, cocoa), deep
  accents (terracotta, moss, berry, graphite). All seating, rugs, mugs, and
  the new color items take the full set; runner/big-rug palettes derive from
  it (base/deep + programmatic lighten). Verified side-by-side in-scene as a
  cohesive set; selection swatches wrap cleanly (14 dots).
- **Catalog 21 → 46 items** — new: bench, floor cushion, bean bag (seating);
  long table, coffee table, writing desk (tables); pastry case (glass front +
  treats), menu board (chalk menu) (counter); jukebox, upright piano, low
  bookshelf (trailing plant), coat rack (beret), umbrella stand (decor);
  big rug (rugs); fiddle-leaf tree, cactus, bonsai, tulip vase (plants);
  table lamp (real light, drives the lamps slider), candle, book stack,
  teapot, radio, record player (record spins), fishbowl (things). All
  reviewed in-scene at close zoom; dream cafés seasoned with a few (menu
  board/fiddle tree/book stack/candle at moon_latte's; piano + cactus at
  harbor light; jukebox/coffee table/teapot/floor cushion at petal & bean).

## T3 feedback round 2 (2026-09-01) — PASS

- **Milder idle animations** — seated "working" arms slowed from speed 12 to
  3–5 with roughly half the amplitude; head bob/sway softened; the standing
  idle breath/sway/arm motion reduced likewise. Nobody flails anymore.
- **Stand-up lands on real empty floor** — standing up (and entering at the
  door) now searches the 1-unit floor-tile lattice in expanding rings for the
  nearest tile clear of all collidable furniture (`nearestFreeTile`), instead
  of probing six fixed offsets that could land inside a large seat's own
  footprint. Reproduced Paul's loveseat case: the avatar now stands on open
  floor beside the couch, facing the seat.
- **Walkability rule while editing** — placing, moving, or rotating a floor
  item is invalid (red ghost + toast "leave an empty floor tile for every
  seat ♪") if it would leave fewer empty floor tiles than there are seats in
  the room; the tile count uses exactly the same lattice and margins as the
  stand-up search, so a legal room always has somewhere to stand.
- **Room lights boot fully on** — the room slider starts at max (mult 2:
  pendants 9→18, wash 0.4→0.8 at day) and dims from there, matching how real
  lights start "on"; the lamps slider is unchanged.

## T3 feedback round 3 + T4 (2026-09-01) — PASS

### Feedback round
- **Shop previews** — every shop row shows a rendered snapshot of the item
  (new `thumbs.ts`: offscreen ortho render from the game's iso angle, cached
  data URLs; 50 thumbnails generate on first open without a hitch).
- **Bean floaters** — buying pops a red pixel "-N ◍" that rises from the
  player's head and fades (damage-indicator style, Pixelify with a hard
  shadow); earning pops the same in green.
- **Marquee → café info** — "your café · open/closed" with a pixel `+`
  button that expands an info card. At home the card edits live: open/closed
  toggle, house-rules line, description (persisted in `SaveDoc.info`).
  Visiting shows the café's own ruleset, vibe, and description read-only.
- **No overlap** — floor items now keep a 0.1-unit gap; two round tabletops
  use a true circle-vs-circle test so diagonal placements can't visually
  fuse. Seats still tuck against tables (seat↔surface pairs are exempt).
- **Bakery display** — pastry-case rebuilt at 3.2u: marble deck with boule,
  loaves, pan bread, croissants; cake shelf; glass front AND top.
- **Menu board fixed** — easel legs are now in the board's own plane with
  splayed feet; nothing floats.
- **Audio set** — small speaker (surface), big speaker tower, vinyl crate
  (leaning sleeves), acoustic guitar on a stand; record player + piano
  already existed.
- **Scale pass** — chair shrunk (footprint 2→1.6, back 54→44 vox), stool
  slimmed, armchair/loveseat backs lowered, door 102→88 vox (porthole +
  knob lowered), bookshelf 103→86, floor lamp 70→58, coat rack, piano
  trimmed. Seat heights stay ~1.9 so seated faces clear the tabletops.
- **Friends tab** — right-edge "♥ friends" tab opens the list: pixel
  portrait, name, where they are, status dot (studying/online/idle/offline,
  offline rows grayed), and a visit button that jumps to their café.
- Also fixed the circled stray rain streaks past the right wall edge (rain
  x-range now accounts for the iso parallax of the behind-wall plane).

### T4: communal clock, session economy, break gating
- **Communal sprint clock** (`clock.ts`) — 25/5 anchored to wall-clock time,
  so every café and every visitor shares the same phase; the sprint pill now
  shows the real communal countdown.
- **Session economy** — 1 bean per focused minute, credited when you stand
  up, with a green "+N ◍" floater and toast; the session HUD says so.
- **Break-gated shop/edit** — while YOU are mid-session during a sprint,
  the shop and café editing refuse with "finish the sprint first ♪"; both
  open freely on breaks and whenever you're not seated (off-hours).
- **Debug** — "⏩ skip to next phase" jumps the communal clock for demos.
  Verified end-to-end in the browser: gate refuses during sprint, skip →
  BREAK ♪ → shop opens; backdated session paid +7 ◍ on stand-up.

## T5: polish — life pass, sounds, splash, onboarding (2026-09-01) — PASS

- **Furniture "life" pass** (the deferred energy upgrade, within the style
  bible's rules): steam wisps rise from mugs, the teapot spout, and the
  espresso machine's cup (soft camera-facing puffs, looping); the candle has
  a real flickering flame (scale + warm/hot color jitter); the fishbowl's
  fish actually swims laps (orbit + bob, heading along its tangent); the
  jukebox's three arch bands glow in a chasing pulse (proud of the front
  face by 0.2 voxel — at 9.2 they were hidden inside the cabinet). The cat
  still breathes, the record still spins.
- **Sounds** (`sounds.ts`) — fully synthesized WebAudio, no assets: UI tick
  on every pixel button, sit pop, furniture set-down thunk, unbox arpeggio,
  coin pair on orders, earn pluck, and a soft communal bell when the sprint
  clock changes phase; plus a very quiet looping rain patter. A "♪ sound
  on/off" toggle lives in café controls and persists; the AudioContext
  unlocks on the first gesture (the splash click).
- **Splash** — pixel Studdy logo (5× raster) bobbing on the checkerboard
  sky, "a study spot that never closes ♪", pulsing click-to-enter; fades out
  and doubles as the audio-unlock gesture.
- **Onboarding hints** — the bottom hint line now walks a first run through
  the loop: package at the door → edit café → click a seat → earn/visit →
  the standard controls hint. Stage persists and advances off real state
  (inventory, seats placed, session started, first visit); reset save
  clears it.
- No console errors; production build passes; save reset to a clean first
  run.

### Remaining (post-prototype)
- Real multiplayer/backend (presence, shared cafés) — simulated throughout.
- Curated lofi / BYO-Spotify music (SFX only for now).
- L-shaped room extension (T4 stretch), barista/regulars ladder.

## T5 feedback round: click feel, real onboarding, café music (2026-09-01) — PASS

- **Clicky click** — the UI tick is now a dry mechanical click (a 16ms
  bandpassed noise transient + a low 230→130Hz body knock) instead of the
  squeaky square-wave beep.
- **Real onboarding wizard** — replaces the ambient-hints-only first run.
  After the splash, a 4-step pixel wizard: (1) pick your username — the
  marquee, info card, and your profile card all become "{name}'s café" /
  {name}; (2) style the room live behind the window (wall color, floor,
  width/depth — with "you can change all of this any time in ✎ edit café");
  (3) stock the café — a mini shop (thumbnails, bean balance) requiring at
  least one table and one seat, orders ship to the door with spend floaters;
  (4) "you're open ♪" recap that points at unboxing, editing, sitting,
  earning, and ✈ visiting. The starter package is now just housewarming
  decor (rug, mugs, book) so the wizard's furniture order matters. The
  bottom-line hints resume after the wizard and walk the rest of the loop.
  (Fixed mid-round: step 2's click handler was attached to the shared wizard
  body and threw on later steps — now scoped to the step's own container.)
- **Café music scenario** — decided and implemented: every café has an
  owner-picked radio **station**, and the café you're in sets the music.
  Stations: "lofi beats" (warm Cmaj7·Am7·Dm7·G7 pads at 74bpm with a dusty
  low-mix beat, mellow plucks, vinyl crackle), "rainy piano" (rain up +
  sparse soft notes), "quiet". Your station lives in the info card (persisted
  in SaveDoc.info.music); dream cafés have authored stations (moon_latte's:
  lofi · harbor light: rainy piano · petal & bean: lofi) shown read-only as
  "♪ now playing" when visiting; visiting/going home crossfades the rain bed
  and switches the scheduler. A "♪ music" volume slider joined café controls
  (persisted). Backing is fully generative WebAudio for the prototype —
  ambience-forward on purpose; the production path stays curated CC lofi
  files / bring-your-own-Spotify per the design decisions.

## Final polish round (2026-09-01) — PASS

- **Room palette expanded** — walls 3 → 11 (cream, white, pink, mint, sky,
  lavender, butter, sage, greige, cocoa, charcoal — pastels, neutrals, and
  darks, each with matched wainscot/groove tones); floors 4 → 15 (4 woods:
  honey, pale, walnut, white-wash · 4 checkers: rose, mint, sky, ink · 7
  carpet colors: sage, rose, butter, sky, lavender, cream, graphite). The
  shell resolves styles from data catalogs with a safe fallback, and both
  the room editor and the onboarding wizard generate their swatch grids from
  the same exported catalogs (wrapping into rows).
- **Wood & shade variants** — all tables (round S/M, square, long, coffee,
  side, desk), both counters, and both bookshelves take 4 wood tones (honey,
  walnut, pale, white); floor and table lamps take 6 shade colors whose
  emissive glow is driven by the lighting rig through a shared shade-material
  registry. Selection swatch dots resolve colors across every variant family.
- **Line-up furniture** — new square table (full-bleed flat top) and long
  counter; flat-topped surfaces may now sit flush against each other (the
  visible-gap rule exempts box-top ↔ box-top pairs), so a row of square
  tables reads as one continuous long table. Verified in-scene: 3 walnut
  square tables and a pale counter run join seamlessly.
- **Minimizable UI** — every pixel window (café controls, debug, room,
  furnish, shop, directory, friends, session HUD, café info) has a titlebar
  "–" that collapses it to just the bar and "+" to restore.
- **Brighter lights** — the room slider now spans 0–3× (was 0–2×): the old
  maximum sits at the ⅔ mark as "moderate", and the default boots at the
  new, brighter max.
- **Clock font** — the sprint countdown digits switched from DotGothic16 to
  Pixelify Sans to match the rest of the chrome.

## Guestbook & feel round (2026-09-01) — PASS

- **Unhurried arrival** — clicking the splash now holds on "opening the
  café ♪" for a beat, then fades over ~0.9s instead of cutting straight in.
- **Deliveries queue** — a pixel window under the sprint clock lists every
  incoming package ("2 items · ~1 min", rounded to the nearest minute — no
  ticking seconds) and flips to "at your door ♪" on arrival; hides when
  there's nothing in transit.
- **Sprint clock gated** — the communal clock is hidden until you finish
  onboarding and actually open the café; it appears the moment the wizard's
  "let's go" lands.
- **Guided tour** — after the wizard, a pixel callout bubble with a pulsing
  ring walks the real UI: ✎ edit café (and how a chair + table makes a
  seat), ◍ shop, ✈ visit, the communal clock, café controls, your café
  card, and the friends tab. Skippable; runs once.
- **Guestbook** — every café starts with a guestbook by the door (open book
  on a podium with a floating sparkle so it reads interactable; new catalog
  item, also placed in all three dream cafés). Onboarding asks whether to
  allow visitor notes; the toggle lives in your café's + card. Clicking it
  while visiting opens a draw pad — an actual canvas you draw on with the
  mouse (5 pens, ruled paper, clear/leave-note) — and at home it opens your
  gallery of received notes. Two hand-drawn housewarming notes from the
  regulars seed the book. Notes persist in the save (capped at 40).
- **Hover glow on people** — pointing at any character (sims, the player)
  warms their materials with a soft emissive glow, so it's obvious they're
  clickable; clears on leave.
- **Click-to-walk** — clicking open floor in view mode walks your avatar
  there (little hops, faces the direction of travel, blocked spots resolve
  to the nearest free tile; clicking furniture doesn't trigger it).
  Verified: walked (2.5, 3.5) → exactly (11, 8).

## Interaction & identity round (2026-09-01) — PASS

- **Blinking white outlines** — hovering anything interactable (people,
  packages, the guestbook, salon mirrors, free seats, the door) now shows a
  thin white outline that blinks (inverted-hull shell hugging the object;
  the door gets a white frame). The old soft-white fill and the seat ring
  are gone — the ring survives only as the drag-drop tile marker.
- **Door is a real exit** — clicking any café's door goes home; clicking
  your own door opens the café directory. Ray distances are respected, so
  furniture in front of the door wins the click (fixed mid-round: the first
  version let the ray tunnel through a mirror into the door box).
- **Door customization** — 8 slab colors + two constructions (classic
  porthole / full glass with sky behind it) in the room editor; both shops
  on the high street wear glass doors.
- **Drag your character** — click-to-walk is gone; you now pick your avatar
  up (camera pan suppressed), carry them (they dangle), and drop them —
  snapping to the tile under the cursor, mint/pink tile marker for
  free/blocked, blocked drops resolve to the nearest free tile. A no-move
  tap still opens your profile card.
- **Character customization + the high street** — avatar (skin tone, hair
  color, hair length short/long, sweater color, glasses) lives in the save
  and rebuilds the live chibi instantly. Two new visitable venues in the
  directory: "snip snip ✂" (barbershop: 5 skin tones, 10 hair colors,
  length) and "thread & thimble" (boutique: 14 sweater colors, glasses),
  each with clickable sparkle mirrors that open the styling panel with a
  live pixel-portrait preview. A purchasable salon mirror at home opens the
  full panel.
- **Chat** — a right-edge ✉ chat tab opens the café chat: your messages
  appear in the log and as a pixel speech bubble over your head (temporary —
  the napkin status stays the permanent line); the regulars chatter every
  so often with bubbles over their heads; a mute button in the titlebar
  silences them (persisted).
- **Notification badges** — iPhone-style red counters whose number centers
  on the button corner: unseen "new" items on ✎ edit café (each new item
  also wears a red "new" pill in the tray until clicked), friend updates on
  the ♥ friends tab (clears on open, updates listed in the window), unread
  chat lines on the ✉ chat tab.
- **Overlap fixes** — petal & bean's floor lamp and side table no longer
  clip the loveseat; the armchair throw pillow sits on the cushion against
  the backrest instead of floating.

## Turn / note times / comic tails (2026-09-01) — PASS

- **Turn while standing** — press R (when not placing furniture) to quarter-
  turn your standing avatar, or tap yourself and use the new "↻ turn around"
  button on your own profile card (which replaces the +friend/visit actions
  there). Verified: π/2 → π via R, → 3π/2 via the button.
- **Guestbook note times + new** — every note in the gallery shows a
  relative timestamp ("4m ago", "3h ago", "yesterday") and notes newer than
  your last gallery visit wear the red "new" pill; opening the gallery marks
  them seen (pills gone on the second open; `guestbookSeenAt` persisted).
- **Comic speech-bubble tails** — chat bubbles now have a proper tail
  pointing at the speaker: an 8px ink triangle with a paper fill inside,
  stemming from the bubble's bottom edge toward the head it belongs to.

## HUD & levels round (2026-09-01) — PASS

- **Travel closes your windows** — visiting anywhere (or going home) closes
  the open guestbook, styling panel, and profile card. Verified: gallery
  open → visit → gone.
- **Info-card tidy-up** — the guestbook toggle is now a compact "on ♪ / off"
  button, and the music stations render as three short one-row buttons
  (lofi · rain · quiet) instead of the awkward wrapped labels.
- **Player pill (the MMO corner)** — a top-center pixel pill shows your
  username, level, a mint XP bar, and your live bean balance. XP comes from
  playing: 10/focused-minute, +5 unboxing, +5 leaving a note, +3 visiting,
  +2 placing furniture. Level cost grows 100, 150, 200… Level-ups toast
  ("level up! you're lv 3 ♪") with the earn chime. Verified: 95/150 bar at
  63%, +3 xp on visit, a backdated 6-minute session paid +6 ◍ / +60 xp and
  tipped level 2 → 3 with the toast.

### HUD polish (2026-09-01)
- The player strip lost its window box: name, level, xp bar, and beans now
  float top-center as bold pixel text with the cream hard shadow.
- Beans got a real pixel-art coffee-bean sprite (authored like the other
  pixelui sprites, data-URL, pixelated) — used in the strip, the shop's
  balance row, shop prices, and the onboarding mini-shop, replacing the ◍
  glyph in those spots.
- Delivery rows render on one line ("4 items · at your door ♪"), window
  widened to fit.

## Window discipline round (2026-09-01) — PASS

- **One window per side** — the right edge now has three stacked tabs
  (✦ café · ♥ friends · ✉ chat) that all open their window in the SAME
  bottom-right slot; opening one closes the others (café controls is no
  longer always-on-screen). The left side (room / furnish / shop /
  directory / café info) also shows one window at a time — opening any
  closes the rest, and mode changes slot in their own panel.
- **Shop closes with ×** — the shop window has a close button in its
  titlebar instead of the minimize.
- Tour step retargeted to the new ✦ café tab. Verified the full exclusivity
  matrix in-browser (café→friends→chat swaps; shop→info→directory swaps;
  tab stack order 348/394/440px).

## Night mode & hover round (2026-09-01) — PASS

- **Tabs & windows** — the three right-edge tabs moved up (16% + stacked)
  so the slot window never covers them; the clicked tab turns pink while its
  window is open (friends is no longer always-pink); café controls gained a
  titlebar ×; the friends window lost its minimize (its tab closes it).
- **Night mode UI** — switching the café to night now darkens the whole
  chrome: night variants of the panel/button/track 9-slice sprites (dark
  plum faces, near-black outlines) plus themed CSS vars for ink, faces,
  paper, and hard shadows. Pink titlebars/highlights stay pink. Day/dusk
  revert instantly.
- **Hover outline FIXED** — the inverted-hull shell was being overdrawn by
  the floor because its material didn't write depth (opaque + depthWrite
  false + front-to-back sorting = later, farther floor painted over it).
  With depth writes on, the thin white outline now really shows, thicker
  (0.13u expansion) and blinking slowly (~85% duty at 0.38Hz).
- **Hover action labels** — a floating pixel label bobs and blinks above
  whatever you point at: "sit down ♪" (free seat), "go home ♪"/"café
  directory" (door), "open the package ♪", "your guestbook ♪"/"sign the
  guestbook ♪", "change your look ♪" (mirror), "say hi ♪" (patrons), and
  "this is you — drag to move ♪".
- **HUD layout** — the player strip (name·lv·xp·beans) moved to the right,
  under the sprint clock; deliveries sit below it. The bean sprite was
  redrawn bigger and bolder with a near-black outline.

## Right-column & settings round (2026-09-01) — PASS

- **BREAK label** lifted 3px to sit optically centered in the clock pill.
- **Friends window** — wider (344px), scrolls vertically only, rows read
  "name / @ café · task / time" with the time on its own line, and the
  status dot + visit button stack neatly on the right. Verified no
  horizontal overflow.
- **Digits 2 & 5** — Pixelify's odd 2/5 are now served by a 'Studdy
  Digits' FontFace built from DotGothic16 restricted to U+0032/U+0035,
  placed first in every pixel font stack — only those two glyphs change.
- **Right column order** — sprint clock (26px) → name/level/beans strip
  (94px) → deliveries (130px) → ✦ café / ♥ friends / ✉ chat tabs (252/298/
  344px) → open space below for the slot window. Measured: zero overlaps.
- **Settings** — a ⚙ button beside ✈ visit opens a centered settings modal
  (sound toggle, music volume, reset save) over a dimmed backdrop that
  blocks every other control until the × closes it. Verified the backdrop
  intercepts clicks (elementFromPoint over the shop button = backdrop).

## Wizard modal & custom digits round (2026-09-01) — PASS

- **Onboarding is modal** — a backdrop now sits under the welcome wizard,
  blocking every other control until "let's go ♪" (verified: clicks over
  the shop button land on the backdrop).
- **Custom 2 & 5 glyphs** — the DotGothic substitution jittered (advance 50
  vs Pixelify's 60.3, cap 83 vs 64 — no uniform scale fixes both), so
  scripts/gen-digits.mjs (opentype.js) now generates public/studdy-digits.otf:
  hand-drawn chunky pixel 2 and 5 on Pixelify's EXACT metrics (advance 603,
  cap 638, 5×7 cells). Measured in-browser: '2' and '5' now render at
  60.29px @100px — identical to every other digit, zero box resizing.
- **Smaller controls** — the ± steppers and mini buttons slimmed (7px
  chrome, 13px labels); the door-type button says just "glass"/"classic"
  and fits inside the room panel.
- **Glass doors reach the frame** — the pane now runs from the kick panel
  to the top rail (carve to top−3, pane 75 voxels tall).
- **Tabs on-screen** — café/friends/chat tabs moved in from the bleed
  (right: 10px; measured right edge 1910/1920).
- **Strip above clock** — name·level·beans now sits at the very top right
  (28px) with the sprint clock below it (58px); deliveries and tabs follow.

### Outline latency fix (2026-09-01)
- The hover outline was a static snapshot: moving/dragging the character
  left a white silhouette at the old spot until the next hover recompute.
  Now grabbing the character clears the outline immediately, and any live
  outline copies its source's position/rotation every frame (and removes
  itself if the outlined object despawns) — no ghost flashes.

## Phase 0 + Phase 1 (2026-09-01)

- Floaters say "-12 beans" / "+6 beans" (plain text, no glyph).
- **Phase 0 — shipped**: git repo `pjeon18/studdy`, GitHub Pages workflow
  (BASE_PATH=/studdy/, SPA 404 copy, optional Supabase secrets injected at
  build), Pages enabled in workflow mode. Live at
  https://pjeon18.github.io/studdy/.
- **Phase 1 — accounts + cloud saves (code complete)**: `src/cloud.ts` on
  Supabase — anonymous sign-in on boot (guests get cloud saves instantly),
  magic-link email upgrades the same account (`auth.updateUser` keeps the
  anonymous user's save), debounced upsert of the whole SaveDoc into a
  `saves` table (RLS: own row only, schema in `supabase/schema.sql`),
  pull-on-boot adopts the remote save when it's newer (timestamp compare
  via 'studdy-saved-at'). Settings window gained an account section
  (guest/email state, magic-link input, sign out). Without env vars the
  whole layer no-ops — verified the settings row reads "local only" and
  nothing breaks. To activate: create a Supabase project, run the schema,
  enable anonymous sign-ins (+ email), set VITE_SUPABASE_URL/ANON_KEY in
  .env locally and as repo secrets for the deploy.

## Security audit & hardening (2026-09-01)

Audited ahead of real accounts; findings fixed:
- **XSS (fixed)** — user-controlled strings were reaching innerHTML in the
  chat log, the marquee (café name), the guestbook signature, and the
  onboarding recap. All now escaped via a shared esc() helper; guestbook
  images are only rendered when they're genuine `data:image/*` payloads
  (assigned via the DOM property, never interpolated).
- **RLS tightened** — policies scoped `to authenticated`, explicit
  `revoke ... from anon`, no delete path (rows die with the account via
  cascade), and a 2MB check constraint on the save document.
  Discovered live: new Supabase projects don't auto-grant table privileges,
  so explicit `grant select, insert, update ... to authenticated` was added
  (verified beforehand that BOTH roles got 42501 — locked-by-default).
- **Abuse limits** — client won't sync pre-onboarding saves, caps uploads at
  1.5MB, and validates the shape of any pulled document before adopting it;
  anonymous sessions persist per browser (one MAU per device, not per
  visit). Captcha (Turnstile) recommended before a viral push.
- **Secrets** — only the publishable key ships (public by design); it's held
  in .env (gitignored) and encrypted GitHub Actions secrets (set via the
  sealed-box API). No service-role key exists anywhere in the project.
- **Privacy** — display name + optional auth email are the only personal
  data; email lives solely in Supabase Auth. No analytics or third-party
  scripts. README gained a security-posture section.
- Verified live against the real project: anonymous sign-in succeeds
  ("guest · cloud save on ♪"); reads/writes correctly denied until the
  grants patch (supabase/harden.sql) is run.

### Post-launch polish (2026-09-01)
- Turnstile confirmed end-to-end in a real browser (incognito → "guest ·
  cloud save on ♪"); captcha now protects all sign-ins.
- Window count rows renamed to "windows left / windows right" (matching
  what you see on screen).
- Room/furnish panels pinned between the logo and the edit bar (top 220px,
  max-height with internal scroll) — can't overlap either or crop off-screen
  at any viewport height.
- True white options: "snow" wall (#FFFFFF), "snow" white-plank floor, and
  a flat "carpet-snow" pure-white floor.

### Phase 2 — realtime presence (2026-09-01)
- **Salon/avatar fixes** — the crown highlight is now derived from the
  chosen hair color (fixed brown read as a bald spot on dyed hair); the
  thread & thimble / snip snip window widened to 352px, swatch rows wrap
  inside it, glasses/length option buttons compact. Verified in the live
  dev pane (temporary pink dye, then reverted).
- **presence.ts** — Supabase Realtime, no tables. One channel per café
  (`studdy:cafe:{id}`, `studdy:home:{uid}`) carries presence (who's here,
  what seat, napkin, headphones, avatar) + café chat broadcasts; a global
  `studdy:lobby` channel carries only "who is at which café" for the
  directory. Presence key is uid+tab-nonce (two tabs = two visible people,
  which is honest and testable).
- **Trust boundary** — every network field re-validated: names/napkins
  length-capped, colors must match #rrggbb before touching the scene,
  chat lines trimmed to 80 chars and rendered through esc(). Outbound chat
  is rate-capped (1 per 1.2s).
- **Seat conflicts** — earliest `since` claim wins; sims always yield their
  seat to a real person; if a remote claimed your seat first you hop up
  with a toast (focused minutes still pay out via the normal leaveSeat).
- **Directory live counts** — green "n here right now ♪" per café row,
  driven by the lobby channel.
- Verified end-to-end with two live tabs: remote sitter appears at home,
  chat broadcast arrives (log line + head bubble + unread badge), standing
  up / leaving removes the sitter, moon latte showed "1 here right now ♪",
  and the remote rendered seated among the sims inside moon latte.

### Phase 3 — the real social loop (2026-09-01)
- **New schema** (`supabase/phase3.sql`, must be run in the SQL editor):
  profiles (unique handle + display name + portrait avatar), cafes (the
  publishable room doc, 512KB cap), friends (pending/accepted, one row per
  pair), guest_notes (PNG data-URL notes, 80KB cap), blocks. RLS on all
  five, `to authenticated`, anon revoked, explicit grants; friends UPDATE
  is column-scoped to `status` only (an unscoped grant would let an
  accepter rewrite `requester`); guest-note inserts require the target
  café to be open with its guestbook on, the author unblocked, the signed
  name to match their profile, and a 5-minute per-book cooldown.
- **social.ts** — publishes {room, placed, info} (never inventory/beans/
  xp/notes) debounced on change; claims a handle from the name slug with
  salted collision retries; fetched café docs are fully re-sanitized
  (unknown furniture dropped, coords clamped, colors #rrggbb, strings
  capped) before the renderer sees them; friends + requests + notes +
  blocks APIs all no-op politely when the schema is missing (verified:
  one console warning, zero crashes, game fully playable).
- **Visiting real cafés** — real cafés arrive as DreamCafe objects with
  id `user:{ownerId}` and no sims (real presence peoples them); presence
  routes `user:` places onto the owner's home channel so owner + visitors
  share a room; lobby tokens unify homes as `user:{uid}` for live counts.
  Verified with a synthetic user café: renders, marquee swaps, go home.
- **Share links** — `?cafe=<handle>` walks you to that café after splash
  (and after onboarding+tour for brand-new visitors), waiting for the
  async cloud sign-in; "café link · copy" row in settings.
- **Friends UI** — ♥ tab badge = real pending requests (60s poll);
  window shows requests (♥ yes / no) and friends (live whereabouts from
  the lobby, visit button) above "the regulars ♪" sims; profile cards of
  real people gained working + friend / visit café actions.
- **Guestbook** — notes left at real cafés insert into the owner's book;
  the gallery merges cloud notes with local seeds and gives each cloud
  note remove + block (block also sweeps their notes + any friendship).
- Cross-user end-to-end needs two real accounts (captcha blocks creating
  a second automated one): verify in a normal + incognito window once
  phase3.sql is run.

### Phase 3 verified live (2026-09-01)
- phase3.sql applied (reordered: blocks created before the policies that
  reference it; idempotent `drop policy if exists` guards).
- Full RLS matrix via REST probes against the live project: owner reads
  200 on all five tables; signed-out denied (401/42501) everywhere; every
  forgery rejected 403 — fake profile, fake café row, forged friend
  requester, pre-accepted friend insert, note on your own book, forged
  note author, `javascript:` art payload, forged block. Café rows can't
  be deleted through the API (open=false is the off switch).
- Positive path: the client claimed handle `ghuh`, published the café
  row, and `?cafe=ghuh` fetched, sanitized, and rendered it from the real
  database. Self-guard: your own link (or tapping your own presence) now
  keeps you home instead of read-only visiting yourself.
- Still pending: two-account cross-user E2E (friend request → accept,
  guest note → gallery → remove/block) — needs a second real browser
  profile; captcha prevents scripting a second account.

### Big feature round (2026-09-01): gestures · goals · leaderboard · host economy
- **Edit gestures** — move-ghost now starts ON the piece and holds until the
  pointer drags 1.1u away (verified: ghost sat on the stool's own tile);
  double-click furniture picks it up, a quick third click rotates in place
  (verified rot 0→1, same tile), press-and-hold (550ms) tucks it into
  inventory; double-tapping yourself turns you; camera double-click zoom
  reset now yields to gestures.
- **Goals window** (✔ tab, top of the right stack): 9 built-in missions
  (friend tiers 100/250/500◍ — sharing is the growth loop — visits, salon,
  guestbook, chat, focus minutes) reading live counters + the friend list;
  self-set daily/weekly goals with picked bean rewards (5–50◍), honor
  system, claimable only the NEXT calendar day (verified: "did it ♪" →
  "claim tomorrow ♪"). Clubs tab present but locked (level 10, later).
- **Level economy** — beans/min = 1 + 0.1·(level−1), capped at 2.5; HUD
  shows the live rate (verified "earning 1.1 ◍" at lv 2). Lifetime beans
  tracked; self card shows level + lifetime (verified 11,131 ◍).
- **Name tags** show "lv N" beside real players' names (presence carries
  level, clamped 1–999 inbound).
- **Chat anti-spam** — 80-char cap; 3 quick messages fine, then 5s gap
  (verified: 5 rapid sends → 3 delivered).
- **phase4.sql** (TO RUN): profiles.xp (leaderboard), cafes.study_minutes
  (star ratings ★–★★★★★ at 100/500/1500/4000 hosted minutes), study_log
  (visitors log sessions; owners earn 1◍ per 10 hosted minutes, collected
  on boot; append-only, 1 row / 8 min / visitor), gifts (1 bean each, 3 a
  day, 1 per person per day, block-aware — first tap on someone each day
  gifts automatically, +5xp to the giver). Directory gains "top studiers ♪"
  (xp leaderboard with visit buttons) + star ratings on real cafés — all
  quietly dormant until the migration runs.

### Two-player field-test fixes (2026-09-01)
- Onboarding soft-lock: the stock-the-café step tops your beans up to the
  cheapest missing requirement (table 15 / stool 8) so you can never strand
  yourself mid-wizard.
- Same room everywhere: sims now take free seats in authored order (the
  per-client shuffle made two visitors see different rooms).
- "She couldn't see me": standing visitors are now rendered — presence
  carries x/z (clamped inbound), remote wanderers render as standing
  chibis at their true tile, clickable with cards/tags/bubbles.
- THE deafness bug (reproduced, fixed, verified): rejoining a previously
  used channel topic (home → café → home) raced the old channel's async
  teardown and could server-close the OTHER client's channel; channels now
  await teardown before rejoining AND self-heal on CLOSED/CHANNEL_ERROR/
  TIMED_OUT (2s rejoin). Verified: after a café round-trip both tabs stay
  subscribed and mutually visible.
- Visitors can't touch the room mood: café controls (day/dusk/night +
  light sliders) grey out while visiting ("the owner sets the mood here ♪");
  music volume + sound stay local.
- Layout: right tabs ride directly under the sprint clock (goals first,
  locked clubs last); rslot windows open BESIDE the tab column (right:
  118px) so buttons never cover accept/claim buttons; deliveries window
  moved top-center.
- Directory: ✈ visit button now renders the live sections too (only the
  door path did); "owner is in ♪" pill + online-first sort for real cafés.
- Verified live post-phase4.sql: real cafés (@caroline, @paul, star
  ratings), top-studiers leaderboard (ghuh 196xp · caroline 99xp · paul),
  phase-4 RLS matrix green (signed-out denied; self-log, forged visitor,
  oversize minutes, self-gift, forged sender, 99-bean gifts, gift deletion
  all rejected).

### Share card (2026-09-02) — next-phase start
- settings → "share card · make one ♪" draws a 1080×1350 pixel-art PNG on
  canvas (logo, framed portrait, café name/@handle, star rating, level +
  hosted minutes, 25/5 pitch, the ?cafe= link as a pink button) and
  downloads it — sized for TikTok/IG posts. Canvas fonts lead with Studdy
  Digits so 2/5 render correctly. Verified rendered in the pane.

### Goals v2 + even lighting (2026-09-02)
- Custom goals: reward picked with a slider, capped at 10◍ (daily) / 30◍
  (weekly); at most three of each cadence at a time (store-enforced, with
  a polite refusal).
- Missions are CHAINS: one tier visible at a time — claiming reveals the
  next stage, with stage stars (★☆☆ → ★★☆ → ★★★) on multi-tier chains
  (friends 3/10/15 · visits 5/15/40 · focus 60/300/1000 · chat 5/25/100;
  salon + guestbook stay single). Verified live: claiming "visit 5 cafés"
  advanced the row to "visit 15 cafés ★★☆". Legacy claimed ids carry over.
- The ✔ goals tab wears a red badge counting rewards ready to collect
  (ready mission tiers + next-day custom goals); refreshes on store
  changes + a slow friend-count poll. Verified showing 2.
- Next-day claim gate verified across a real date boundary (yesterday's
  goal offered "claim 15◍" today).
- Even room lighting: the ceiling grid now reaches toward the walls
  (nx=w/7 with margins), point falloff softened (distance 26, decay 1.05),
  total brightness normalized by light count, plus a small room-scaled
  ambient — corners now match the room center (first pass was washed out;
  re-tuned norm 2/count + ambient 0.07·pend).

### Lighting re-tune (2026-09-02)
- Room slider max lowered to ×2.1 (the old 70% is the new 100%).
- Dusk/night interiors actually dim now: under the even rig the per-mode
  pendant values (old 30/40, tuned for steep falloff) read as bright as
  day — rebalanced to day 9 / dusk 8 / night 5.5 with mode-scaled ambient
  (1 / 0.42 / 0.3) and softer washes. Verified all three modes: day =
  the approved warm look, dusk peachy and softer, night dim and cozy —
  all corner-to-corner even.

### Lamp glow fix (2026-09-02)
- Colored lamp shades emitted their own hue, so a blue shade at night read
  as "off" beside a cream one — shades now glow lamplight-warm (their
  color lerped 0.6 toward #FFD9A0) whatever the variant.
- The hot "circle on the wall" from a near-wall lamp: point-light decay
  softened (1.7 → 1.4), reach extended (16 → 18 floor / 9 → 11 table),
  and dusk/night lamp intensities rebalanced (13→9 / 22→14) — lamps now
  cast soft all-around pools. Verified at night with one cream + two sky
  floor lamps: all three visibly lit, no wall disc.

### Economy + furniture round (2026-09-02)
- Mid-room lamps: the point light moved down the pole (38 vox) so a lamp
  away from any wall clearly pools on the floor around itself; day
  lampIntensity raised 1.6 → 4 so max lamps read by day.
- Structural edits now cost beans, escalating per click and tracked
  separately: width 10/20/30…, depth 10/20/30…, windows 15/30/45…
  (charged only when the click actually changes something; verified live:
  10 then 20 deducted, counter advanced).
- Tour completion pays a one-time +150 bean housewarming gift.
- Eleven new items: kitchen (fridge, stove & oven, kitchen sink with
  faucet + basin, kettle w/ steam, toaster w/ toast), library (book cart
  on wheels, globe), plants (palm, flower trio, ivy pot), and a fairy
  garland whose bulbs plug into the lighting rig's twinkle drive (BuiltItem
  gains fairyMats; game syncs them into the live registry). All verified
  placed in-room or via shop thumbnails; placement refusals during testing
  were the seats-need-floor-tiles rule, not item bugs.

### Treatment D in the game (2026-09-02)
- The whole game now shades through one shared 4-band hue-shifted toon
  ramp (build.ts toonRamp, FloatType colored texels): shadows shift toward
  blue-violet and saturate, highlights lift toward warm yellow — chosen in
  the room lab over grain textures (which muddied color). Materials
  converted at the source: voxel default, smoothMat, lamp shades, fairy
  wire; Basic mats (eyes, glass, shines) untouched; the ?showcase scene
  keeps its historical materials.
- The lighting rig lerps ramp values per mode (day painterly / dusk peachy
  / night cool-dim) inside the same crossfade that drives everything else.
- "look" row in settings: crisp (supersampled) vs retro ♪ (renders at
  1/1.5 scale, nearest-upscaled = Paul's chosen pixelation level);
  persisted per browser; UI stays crisp in both.
- Verified live: day/night ramps render, retro pixelates the scene only,
  outline pass shows no band-edge artifacts, thumbnails inherit the look.

### Light tuning + bulb temperature (2026-09-02)
- Day max dimmed (pendants 9→7, wash 0.4→0.34, ambient share 1→0.9,
  ramp highlight 1.32→1.16) and dusk max softened (pendants 8→6.3, wash
  0.32→0.27, highlight 1.34→1.2).
- Café controls gain "✦ bulbs · warm / cool": switches the pendant grid,
  ceiling wash, and ambient between cozy warm (#FFDCA6) and clean cool
  (#E7F0F8) temperatures; persisted per browser, applied on boot, sits in
  the owner-only section so visitors can't change a café's bulbs.

### Mobile pass + PWA (2026-09-02)
- Installable: public/manifest.webmanifest + icons (192/512 app, 180 apple-
  touch, rendered from the game's own logo on a checkerboard tile),
  theme-color, description, and OG tags (og:image = the 512 icon) in
  index.html; viewport-fit=cover.
- Responsive layout (@media max-width 720px): brand/clock/pill shrink to
  the corners, the right tab column tightens under the clock, rslot windows
  open full-width beside the tabs (right:76px, own scroll), editor/
  deliveries/settings sheets fit the viewport. Verified at 375×812: room
  frames large, goals window fully usable, tabs reachable.
- Portrait camera fit: aspect < 0.72 zooms in 1.5× (halfH ×0.66) so the
  room fills the screen instead of sitting tiny; drag-to-pan covers the
  slight horizontal crop.
- Perf: coarse-pointer devices skip the 1.5× supersampling (native dpr
  only) in crisp mode.

### Retention round (2026-09-02) — Build Plan 2 · T3
- Daily streak: real sessions (5+ focused minutes) advance it; one rest
  day PAUSES it (count kept), two or more starts over — kindness by
  design. Streak bonus beans min(20, 3 + 2·count); best tracked. Shown on
  the player pill (N★) and the self profile card (real data replaces the
  fake '1 day ★').
- Daily check-in: the first session of any day pays +5◍ ("first study of
  the day — welcome back ♪"). Verified live: stand-up paid +6 (1 focused
  + 5 check-in) with the toast sequence.
- "Happening now" banner: when a friend is live somewhere, a pink pill
  under the clock says "♥ {name} is studying at {place} — join ♪" — one
  tap travels there; × snoozes it for 30 minutes. Refreshes every 60s
  from the presence lobby. Verified rendering + placement (mock data).
- Weekly recap card: settings → "week recap · make one ♪" draws a
  lavender share PNG — hours focused this week (new wk:{stamp}:min
  counter), streak + best, level, lifetime beans, café link. Verified
  rendered.
- Copy: joining mid-sprint now says "joined mid-sprint — chat opens at
  break ♪".

### Mobile / PWA pass (2026-09-02) — Build Plan 2 · T2
- One merged ≤720px layer (the two earlier partial blocks were unified):
  windows become bottom sheets (left/right 8px, max-height 46–56vh, own
  scroll, safe-area-inset-bottom respected), the right tab column tucks
  under the clock at 42px pitch, deliveries sit below the café card.
- Brand fix: the pixel wordmark renders at its native 1× (119px) on
  phones — any non-integer scale garbled the pixel art. The player-pill
  name ellipsizes at 88px so long handles can't reach the logo.
- Splash logo clamped to min(595px, 88vw); tour bubble measures its real
  offsetHeight before clamping (the desktop 120px guess let wrapped text
  land on the edit bar).
- Touch: 34px min targets on coarse pointers (buttons, close/min,
  swatches); canvas gets touch-action:none so the browser never fights
  the drag/pinch gestures.
- Wake lock: screen stays on while seated in a session; released on
  stand-up; re-acquired on tab return (visibilitychange).
- Service worker (public/sw.js, PROD only): network-first GET cache,
  same-origin only — enables Android install prompt + light offline.
  manifest.webmanifest + icons already in place from Phase 0.
- Low power: crisp mode caps pixelRatio at 2 on coarse-pointer devices
  (no 1.5× supersample); the watchdog skips ticks while document.hidden.
- Verified at 375×812 (emulated Android): full onboarding wizard →
  guestbook → open café → tour; goals/friends/chat/café-controls/shop/
  directory/settings/room/furnish sheets all inside the viewport (max
  bottom 805 of 812). Desktop re-verified unchanged after the pass.

### Server-authoritative economy (2026-09-03) — Build Plan 2 · T1
- supabase/phase5.sql (NOT YET RUN — paste it in the SQL editor):
  sessions table + session_begin/session_beat/session_end RPCs
  (security definer). Focus xp is granted by the SERVER from witnessed
  heartbeats: a beat is worth the real wall-clock gap capped at 90s,
  beats <20s apart earn nothing, one session tops out at 6 verified
  hours, one rolling day at 16. xp rate matches the client (10/min).
- Host credit moves server-side: session_end (and session_begin's sweep
  of sessions left open by closed tabs) writes study_log with VERIFIED
  minutes and increments cafes.study_minutes. Direct study_log inserts
  are revoked.
- Column-scoped grants: profiles.xp and cafes.study_minutes become
  server-written only (client keeps handle/name/avatar and open/doc).
- Client (social.ts focusSessionStart/Stop, wired in main.ts onSession):
  begins a session on sit (passing the real café owner when visiting),
  beats every 60s, settles on stand. Generation counter guards the
  quick sit-stand race (an orphaned begin is settled immediately).
- Compatibility, both directions: pre-migration the RPCs 404 silently
  and the legacy client xp push still works; post-migration the legacy
  push and direct study_log inserts are DENIED silently and the RPCs
  take over. No client redeploy needed around the SQL run.
- Beans stay client-side by design: private convenience currency, never
  ranked. The trust boundary is what other people SEE — leaderboard xp
  and café stars.
- Verified in the pane (signed-out path): sit → focusSessionStart no-ops
  cleanly, stand → focusSessionStop no-ops, zero console errors.
  Signed-in accrual needs the SQL run first — after running it: sit for
  2+ minutes and watch the directory leaderboard xp rise; a devtools
  `supa.from('profiles').update({ xp: 999999 })` must come back
  permission-denied.
