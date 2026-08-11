# Momentum Landscaping — what this is

Rebuilt from the codebase and the database on 2026-08-11. Every claim names its
source. Where there is no evidence, that is said plainly rather than filled in.

## The business

Recurring weekly lawn maintenance, sold as a subscription. South Salt Lake
Valley, Utah. Three principals, all `owner` in `profiles`: Connor Sharp (ads,
tech, architecture), Kayden Zaragoza (client relations, admin), Terik Zaragoza
(field operations).

**There are no crew accounts.** All three are owners. The crew view is a UI
preview an admin switches into, not a lower account tier — `lib/crm.ts`,
`VIEW_AS_COOKIE`. Anyone reading `profiles.role` and expecting a `crew` row will
find none.

## Service area — one source of truth

`zones` in Supabase `izthjluendxpthmcndlv`. Active rows only.

Zones 6–12, all Salt Lake County: Draper, Bluffdale, Suncrest, South Jordan,
Riverton, Daybreak, Herriman, Rosecrest, Sandy, Granite, Cottonwood Heights,
West Jordan, Midvale, White City, Copperton.

Zones 1–5 were deactivated 2026-08-01 with the note *"Utah County, outside south
SL band"* — Lehi, Saratoga Springs, Eagle Mountain, American Fork, Pleasant
Grove.

Every surface derives from this through `lib/serviceArea.ts`: the public page,
site metadata, the legal footer, the SMS HELP reply and Wayne's system prompt.
Switching a zone on or off is the only action needed to change all of them.
**Do not reintroduce a hardcoded city list.** Nine surfaces used to carry one and
they disagreed; five still named the territory Momentum had left.

## Pricing — internal, never customer-facing

This needs care, because the rule is easy to overstate in both directions.

`services` carries `base_price` 45 / 55 / 89 / 15. `system_config.billing`
carries per-visit terms, net 7, and 7.25% Utah sales tax. `system_config`
pricing surcharges exist too. These are **internal invoicing defaults that stamp
`jobs.price`** — they are not published prices, and nobody should lift them into
customer copy. Equally, nobody should delete them believing they shouldn't
exist.

The customer-facing rule is absolute and lives in `lib/wayne.ts`: never state,
estimate or hint at a figure, even if pressed, even if the customer names one.
Every property is quoted in person. The CTA is always "personal quote", never
"free quote".

## Wayne

The SMS concierge. `lib/wayne.ts`. Hard rules, all enforced in the prompt:

- **Utah AI self-identification.** Asked if he is an AI, a bot, or a person, he
  answers truthfully. Never claims to be human.
- Never invents a date or availability. Days come only from `check_availability`.
- Never quotes a price.
- Never turns someone away on location. If serviceability is unclear he takes
  their details and escalates to a human rather than saying no.
- Season is 1 April – 15 November. Off-season enquiries are logged, not refused.

SMS is one door: `lib/sms.ts`, opt-out and quiet hours enforced once, centrally.
Pingram is the only working path — Twilio's A2P campaign failed with carrier
error 30034.

## GPS verification — proven, with a caveat

A crew phone reports location. When it dwells inside a property's surveyed
parcel boundary long enough, that becomes a visit.

**It works end to end.** `site_visits` holds nine rows, four with outcome
`serviced`: 9.0 min at 16.7 m closest approach, 11.4 min at 12.5 m, 6.3 min at
8.7 m with `auto_arrived` true, and a 4-hour dwell at 4.6 m.

The caveat, and it matters: those are nearly all at one address — Celine
Zarogoza, 7084 S Winter Hill Cove — which is a phone at a residence, not a crew
working a route. The mechanism is proven. A full route has never been driven.

Thresholds live in `system_config.tracking`: 10 minutes to open a visit,
8 minutes minimum to count, 10 minutes or 400 m to close it, 50 m accuracy
ceiling. These get temporarily lowered for drive tests; anything that lowers
them must schedule its own restore, and the restore must be verified rather
than assumed.

Boundaries are real surveyed parcels, not circles. A circle overshoots these
lots by 117% to 525%. Resolution runs four layers — parcel string match, Utah
Address Points, census geocode with point-in-polygon, then buffered proximity —
each against statewide, then Salt Lake LIR, then Utah LIR. 15 of 21 properties
have a real polygon. On total failure `lib/addressIntelligence.ts` reasons about
why, anchoring on the street because a wrong house number is common and a wrong
street name is rare.

**Corner lots where `parcel_address` differs from `address` are normal.**
Containment is the authoritative test. Do not add a check rejecting mismatches.

## Push

Direct to Apple, not through Expo. `lib/apns.ts` signs an ES256 token with the
`.p8`, caches it 45 minutes because Apple rate-limits minting, posts over
HTTP/2. Expo's credential wizard demands a distribution certificate and
provisioning profile that don't exist, because builds happen locally in Xcode.

The app must call `getDevicePushTokenAsync`, never `getExpoPushTokenAsync` — an
Expo token returns `BadDeviceToken`.

## What has no evidence yet

Stated so nobody quotes these as results.

`system_config.ad_rules` holds CPL and CPA targets and kill thresholds. Those
are **spending limits, not measured performance**. No campaign has run against
them.

24 of 30 customers carry placeholder phone numbers from a legacy import. Nothing
can be texted to them.

Readiness and proof-of-service SMS are built and deliberately off in
`system_config`.

Six properties still resolve to no parcel and can never be GPS-verified. Two
have ranked corrections waiting for a decision in Tracker.

## Surfaces

| What | Where | Project |
|---|---|---|
| CRM | crm.momentumlandscapingut.com | `momentum`, repo root |
| Public site | momentumlandscapingut.com | `momentum-site`, root `site/` |
| Customer web app | momentumlandscapingut.com/app | same deployment |
| Momentum Crew | iOS, wraps the CRM | `~/momentum-crew` |
| MomentumLAND | iOS, wraps `/app` | `Sharplifee/momentum-customer` |

Both iOS apps are shells around a URL. A web deploy updates both without a
rebuild or App Store review. Only GPS behaviour, permissions and the icon need
a build.

`momentum-site` must keep `rootDirectory=site`. Without it Vercel runs the Next
build and returns 404 at the root.

## Traps

- `properties` has a customer-scoped UPDATE policy, so REST writes silently
  no-op. Use SQL or the service role.
- `job_status` is `cancelled`, double L.
- pgcrypto lives in the `extensions` schema, so SECURITY DEFINER functions using
  `crypt()` or `gen_salt()` need `search_path` `'public','extensions'`.
- `cron.job` uses `jobname`, not `job_name`. Unschedule by name before
  rescheduling or duplicates accumulate silently.
- `bg-white/60 dark:bg-white/10` renders as a white block — the theme is
  CSS-variable driven and `.dark` never fires.
- Apple's API returns 403 on `POST /v1/apps`. App records must be made in the UI.
- Two sessions edit this repo. Pull before deploying. Never patch a live page by
  downloading and re-uploading it.
