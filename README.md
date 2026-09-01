# Studdy ♪

A voxel café that's a real digital study spot. Own and decorate a tiny café,
sit down with real people (simulated in the demo) on one **communal sprint
clock**, and turn focused time into the beans that furnish your room. Cozy
Korean-Y2K pixel aesthetic, everything hand-built: voxel furniture, pixel UI
chrome, synthesized sounds and café radio.

**Play it:** https://pjeon18.github.io/studdy/

## The loop

1. Open your café (name it, style the room, order your first table & seat).
2. Sit anywhere and study — everyone shares the same 25/5 sprint clock, and
   every focused minute pays 1 bean (+10 xp).
3. Spend beans in the shop; packages land at your door.
4. Visit friends' cafés, sign guestbooks with hand-drawn notes, restyle
   yourself at the barbershop & boutique on the high street.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5230  (append ?debug for demo controls)
npm run build      # production build → dist/
```

- `?debug` — demo panel (grant items/beans, force deliveries, skip the
  communal clock to the next phase, reset the save).
- `?showcase` — the original visual style prototype scene.
- `node scripts/gen-digits.mjs` — regenerates `public/studdy-digits.otf`
  (the custom 2/5 glyphs on Pixelify Sans metrics).

## Cloud saves & accounts (optional)

The game runs fully offline (localStorage). To turn on accounts + cloud
saves, create a free [Supabase](https://supabase.com) project and:

1. Run `supabase/schema.sql` in the project's SQL editor.
2. In Authentication → Providers, enable **Anonymous sign-ins** (guests get
   cloud saves instantly) and optionally **Email** (magic links).
3. Copy `.env.example` → `.env` and fill in the project URL + anon key.
   For the deployed site, add the same two values as repo secrets
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — the Pages workflow
   picks them up automatically.

Without the env vars the cloud layer silently stays off — nothing breaks.

## Security posture

- **Row-level security everywhere**: the only table (`saves`) is readable and
  writable strictly by its owner (`auth.uid() = user_id`), policies are
  scoped to the `authenticated` role, signed-out access is explicitly
  revoked, and rows can't be deleted through the API at all (they only go
  away with the account). See `supabase/schema.sql` / `harden.sql`.
- **The publishable key is public by design** — it grants nothing that RLS
  doesn't allow. There are no service-role keys anywhere in this repo or
  bundle.
- **Data minimization**: the only personal data is a chosen display name and
  (optionally) the sign-in email, which lives in Supabase Auth, never in
  game tables. No analytics, no trackers, no third-party scripts.
- **Abuse limits**: saves are size-capped at the database (2MB constraint)
  and client (1.5MB); pre-onboarding saves never sync; anonymous sign-in
  reuses the stored session so one browser = one account, and Supabase's
  built-in per-IP rate limits apply. Enable captcha (Attack Protection →
  Turnstile) before any viral push for extra MAU protection.
- **XSS-hardened rendering**: every user-controlled string (names, chat,
  guestbook signatures) is escaped before rendering, and guestbook images
  are only accepted as `data:image/*` payloads.

## Docs

- `docs/GAME_SPEC.md` — the design: scenarios, principles, aesthetic bible.
- `docs/BUILD_PLAN.md` — the tiered build plan this was built from.
- `VALIDATION.md` — every tier's acceptance criteria + the polish rounds.
