# NO FAKE DATA

**Standing rule for the Momentum repository and database. No exceptions, no "just for now".**

Adopted 2026-10-28 after purging ~7,900 fabricated rows from production.

---

## The rule

Nothing a person could read as a fact about the business may exist unless it actually
happened. That covers every number, metric, KPI, chart, alert, notification, message,
report, status and label in the CRM, the apps, the website and the ad stack.

Never write:

- **A phone number, email or address that is not the real one.** No `555` numbers, no
  `+1000000xxx`, no `test@`, no "phone pending" dressed up as a value.
- **A price, revenue figure or lifetime value with nothing behind it.** A price exists
  only when a quote was accepted or an agreement set a rate.
- **A completed job or verified service without evidence** — an arrival time or a GPS
  site visit, not an assumption.
- **A count, rate or average computed over seeded rows.** If the rows are fake the
  metric is fake, however correct the arithmetic.
- **An alert whose precondition does not exist.** Flagging "no arrival" when no device
  reports location is not a finding, it is noise.
- **A status that asserts something unproven.** `tracking.enabled = true` with one
  device and zero pings is a false statement.
- **A health check that reports OK because a key is present.** Probe it or report unknown.

### Instead

An empty state. A blank. A `null`. The words "not set", "unknown", "never measured",
"no data yet". An empty dashboard that tells the truth is worth more than a full one
that does not, and it is the only way to know what is actually built.

Placeholder *visual content* while a screen is being designed is fine. Placeholder
**facts** in tables, metrics, alerts or reports are not, however early the build.

---

## Enforced in the database

Four triggers reject fabricated writes. Not advisory — the write fails.

| Guard | Rejects |
|---|---|
| `reject_fake_phone` | `+1xxx555xxxx` and `+1000000...` on `customers` and `leads` |
| `reject_fake_source` | `source` of test, demo, seed, sample, placeholder, legacy_import |
| `reject_unbacked_price` | a job price with no accepted quote and no priced agreement |
| `reject_unproven_completion` | status to `completed` with no `arrival_at` and no `site_visit` |

All four raise `NO-FAKE-DATA: ...`. If you hit one, supply the real value or leave it
empty. **Do not disable a guard to get a write through.** If a guard is genuinely wrong,
change it in a migration and say why in the commit.

Verified 2026-10-28 — each guard was tested with a deliberate bad write and blocked it.

Also stored in `system_config.no_fake_data_rule` so the app carries the rule itself.

---

## Writing metrics

- If the number is zero, show zero. Do not hide an empty panel behind a sample.
- If something was never measured, say so in words rather than printing `0` as if it
  were a measurement. "No lead has ever been replied to" beats "avg response: 0m".
- Label the window on every count — "next 7 days", "this week", "all time". Two tiles
  over different windows must say which, or they read as a contradiction.
- A tile and a chart on the same screen must never disagree. If they can, one is wrong.

## Writing status and checklists

- Mark an item done only after naming the command, query or call that proved it, with
  the date. A claim without a probe is not a status.
- When a note turns out wrong, rewrite it in place with the verified truth. Do not leave
  a stale warning standing — the next person inherits the fear, not the fix.

## Writing alerts

An alert must describe something a person can act on. Before adding one, ask whether its
firing condition can be told apart from the feature simply being switched off. If it
cannot, it is noise and does not get built.
