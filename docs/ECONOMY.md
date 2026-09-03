# The Studdy economy

One page, so every future price lands on the same curve. Written 2026-09-03,
when our first max-level player (lv 21, 1800 banked beans, all goals done)
ran out of things to want.

## The anchor

**One focused minute = one bean, scaled gently by level.**

- `focusRate = 1 + 0.1·(level−1)` up to **2.5 at level 16**, then
  `+0.05/level` up to a hard cap of **3.0 at level 26**.
- An hour of study earns 60–180◍ depending on level. Everything else is
  priced against that hour.

Everything else that pays is social glue, not income: check-in +5/day,
streak bonus ≤20/day, gifts ≤3/day, hosting ≈1◍/10min. A heavy day tops
out around 400◍; a casual session nets 50–150◍. Beans are deliberately
client-side (never ranked, never shown to others except gifts) — the
verified currencies are xp and café stars.

## Price bands (hours of study, mid-level)

| band                | price    | ≈ study time | examples                              |
|---------------------|----------|--------------|---------------------------------------|
| impulse             | 8–45     | minutes      | everyday furniture, plants, mugs      |
| session             | 45–150   | ~1 hour      | themes, statement furniture, flair    |
| commitment          | 150–400  | a day or two | wardrobe (hats), tag charms, big rugs |
| atelier             | 250–800  | up to a week | animated showpieces (cat, fireplace)  |
| social (unbounded)  | any      | —            | club treasury donations               |

Rules of thumb:
- Nothing purchasable affects earning or ranking. **Sinks are expression.**
- Every band needs something ANIMATED or PERSONAL at its top — the reason
  to save is "everyone in the room sees it," not stats.
- The atelier is the endgame shelf: pieces a finished café still wants.
- Wardrobe follows you between cafés (it's on your body), so it prices
  above furniture of the same visual weight.

## Decisions of record

- **Structural edits (room size, windows, door) are free.** Charging after
  a free start read as bait-and-switch; identity-level choices stay free
  (also: skin tones, base hair colors, hair length — never priced).
- **Level curve stays** (`levelCost(n) = 100 + 50(n−1)`): our first
  dedicated player hit lv 21 in ~19 focused hours — right pace for a
  study tool.
- **xp keeps meaning after 16** via the focusRate soft tail to lv 26.
- One-time income events (tour +150, missions) are onboarding fuel, fine.
- Custom goals are honor-system by design; caps (10/day · 30/week) keep
  them a nudge, not a faucet.

## Next sinks, when these run dry

Window views (the scene outside the glass, ~150–250), pet accessories for
the café cat, seasonal atelier rotations, L-wing room extension as the one
big structural purchase (500+) — it adds space, not power.
