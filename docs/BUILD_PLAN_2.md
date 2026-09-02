# Studdy — Build Plan 2: from live demo to real game

The original five-tier plan (docs/BUILD_PLAN.md) is complete, plus phases 0–4
of the "make it real" arc: deployed on Pages, Supabase accounts + cloud saves,
realtime presence, the social loop (handles, visiting, friends, cross-user
guestbook), leaderboard, host economy, gifts, goals/missions, share cards.
This plan is about **retention, trust, and polish** — what makes people come
back tomorrow and bring a friend.

Principles carried forward: focused time is the only currency · real people
are the content · one confident pixel-Y2K look · monetize nothing that gates
studying.

---

## T1 — Trust the numbers (server-authoritative economy)
The economy is client-side today; fine for friends, not for a leaderboard
people care about.
- Move focus-earning server-side: client posts session receipts
  (start/stop heartbeats) to an edge function; beans/xp granted there.
  Heartbeats must overlap presence records to count (anti-idle, anti-forge).
- `profiles.xp` becomes server-written only (revoke client update on xp).
- Mission claims validated server-side against the same receipts.
- Keep localStorage as cache, not source of truth, for beans/xp.
- Acceptance: devtools user cannot mint beans/xp that the leaderboard sees.

## T2 — Mobile & feel
Most TikTok clicks are phones.
- Touch pass: bigger hit targets, drag vs pan disambiguation on touch,
  pinch zoom already works — verify; right-tab column becomes a bottom bar
  under ~700px width; windows become sheets.
- PWA: manifest + icon + install prompt; wake-lock during sprints (opt-in).
- Perf tier: detect low-power → drop supersampling, cap pixel ratio,
  pause rain/steam when hidden.
- Acceptance: full loop (onboard → sit → earn → visit → chat) on an iPhone
  screen recording, 60fps-ish.

## T3 — Come back tomorrow (retention loop)
- Streaks: daily focused-minutes streak on the pill + card (floor-bounded,
  can't "break" harshly — a rest day pauses, never resets to shame).
- Daily check-in: first sit of the day → small bonus + streak tick.
- "Happening now" surface: front-door directory shows friends mid-sprint
  ("caroline is 12 min into a sprint — join her ♪") — one tap to their café.
- Sprint-synced arrivals: joining mid-sprint seats you quietly; breaks are
  when chat opens up (nudge copy).
- Weekly recap card (share-card variant): minutes, best day, cafés visited.

## T4 — Clubs (the level-10 clan system, already stubbed)
- Table: clubs (id, name, handle, room doc, treasury), club_members (≤5,
  level ≥10 to create/join), club_goals.
- One shared room per club; all members edit (op-log or last-write-wins on
  placed[] with member locks per item).
- Pooled treasury: members donate beans; room purchases draw from it.
- Club bonus: while any member is in a focus session, others earn +10%.
- Shows on profile card; club tab replaces the locked button.
- Moderation: creator can kick; blocks apply inside club chat.

## T5 — Sound & music, for real
- Curated CC/royalty-free lofi set (static files, shuffled per café seed)
  replacing the procedural placeholder; keep 'rain' and 'off'.
- Per-café "now playing" from the owner's pick stays; volume ducking when
  a chat bubble pops (subtle).
- Stretch: BYO Spotify (playlist link opens externally; in-game shows the
  vibe label only — no API entanglement).

## T6 — Content cadence
- Furniture waves monthly (theme drops: seasonal, study-core, retro-tech).
- Wall décor system (posters/shelves/windowsill items) — needs a wall-mount
  placement mode; biggest catalog unlock.
- Room shapes: L-wing extension as a big bean sink.
- Café themes: preset palettes (walls+floor+door) purchasable as a set.

## T7 — Surface & texture pass (see lab/)
Prototyped OUTSIDE the game first (texture-lab.html). Candidates, in test
order: procedural albedo grain (planks/weave/paper), quantized toon ramps,
ordered dithering in the composite pass, structured per-face value variation,
low-res nearest upscale. Only what survives the lab goes into the game, one
surface family at a time (floor → walls → wood → fabric).

## T8 — Launch hygiene
- Custom domain, OG tags + share-card image as og:image.
- Privacy-respecting counter (no third-party analytics; a tiny edge counter).
- Rate limits reviewed (chat, notes, gifts already capped; add presence join
  throttle).
- A "report" action on profile cards (writes to a reports table; you review).
- Backups: nightly pg_dump via Supabase scheduled backup (verify enabled).

---

### Suggested order
T2 (mobile) → T3 (retention) → T1 (server economy, before any big push) →
T5 (music) → T4 (clubs) → T6/T7 rolling → T8 before the TikTok post.

### Explicitly out of scope for now
Voice, video, DMs (private 1:1 chat is a moderation cliff), custom avatars
beyond the salon, mobile apps (PWA first).
