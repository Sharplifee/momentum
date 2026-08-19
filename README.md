# Momentum Landscaping

One codebase for the public site surface, customer portal, and operations CRM for
Momentum Landscaping (northern Utah County), plus Nora — the single AI agent that
handles lead conversations, scheduling, and operations over SMS.

## Stack
- Next.js 14 (App Router, TypeScript, Tailwind)
- Supabase (Postgres + RLS, project `izthjluendxpthmcndlv`)
- Anthropic Claude (Nora agent)
- Pingram (interim SMS provider — architecture is provider-agnostic; swapping to
  Twilio changes only `PINGRAM_*` env vars and the inbound webhook URL)
- Meta Pixel + Conversions API (event_id-deduped)

## Layout
- `app/(marketing)` — quote form; domain root is served by the separate Claude
  Design project (`momentum-site`), never this repo
- `app/legal/*` — 8 compliance pages
- `app/api/*` — leads intake, SMS in/out, Nora, CAPI, crons, flow tester, health
- `lib/` — supabase clients, sms (single outbound door), meta CAPI, nora agent,
  availability, automation audit logging

## Env
See `.env.example`. All secrets live in the Corpus HQ credentials registry.

## Rules encoded here
- Every automated action writes to `automation_runs`
- All outbound SMS goes through `lib/sms.ts` (opt-out + quiet hours enforced once)
- Nora never invents prices/dates; bookings only via `book_job`
- Test rows are `source='test'` and excluded from nudges/stats

## Two repos, not one

The customer app was split out on 2026-08-13 to **Sharplifee/momentum-app**.
It owns the public site, the app at `/app`, and the seventeen endpoints the app
calls. This repo is the CRM only.

They talk through the shared Supabase database — a job booked here appears in a
customer's schedule because both read the same tables, not because one calls the
other. The two deliberate exceptions are the quote form, which posts to
`/api/leads` here, and Nora, who lives here and is reached over HTTP.
