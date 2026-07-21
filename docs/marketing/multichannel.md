# Multichannel messaging (Viber · WhatsApp · Push)

Email is the home of everything the system says. A phone message is for the one
thing that matters right now. This layer (`_shared/messaging.ts`) adds short,
glanceable variants of the urgent events and — the part that protects the user —
decides **one channel per delivery**, with the daily caps spanning every channel.

## The rule that makes it not-spam

- **One dispatch seam.** Every send — including immediate transactional (receipts,
  security, payment failed) — must pass through the single outbox where the cadence
  plan already collapsed the event to one delivery, and `pickChannel()` is the last
  hop that assigns the medium. A webhook must never email a receipt *and* fire a
  push directly; it enqueues, and the pipeline decides the one channel. This is the
  invariant that makes the guarantee real rather than aspirational.
- **One delivery, one channel.** We never send the same thing on email *and* push
  *and* Viber. `pickChannel()` returns exactly one.
- **Caps span channels.** A Viber message counts against the same daily/weekly
  ceilings as an email (`emailPolicy`). Adding channels never adds volume; it only
  changes the medium.
- **Messaging is for the urgent and glanceable only.** Transactional (receipts,
  security, payment failed) and obligations (dunning, expiries, digests, check-ins)
  can go to a messaging channel. Everything richer — statements, campaigns, value,
  onboarding — stays on email, where it reads properly.

## Channel selection

```
pickChannel(copyId, prefs)
  no short variant for copyId        → email
  category not transactional/oblig.  → email
  viber opted-in                     → viber
  whatsapp opted-in                  → whatsapp
  push opted-in                      → push
  otherwise                          → email
```

Opt-in is per channel and per user. With no opt-in, everything is email — the
messaging channels are strictly additive to the user's stated preference.

## The message catalog

`MSG` holds ~23 short variants (title + body + CTA), Greek, no dashes, gender-
neutral, with safe fallbacks. Adapters format them per channel:

- **Push** — title ≤ 48 chars, body ≤ 140; the whole thing taps into the app.
- **Viber** — title + body + a link button (rich message).
- **WhatsApp** — bold title + body + link. WhatsApp Business **templates must be
  pre-approved** by Meta before sending; each MSG entry maps to one template.

`verify-messaging.ts` renders every variant in a rich and a bare context and
checks the limits and the selection logic.

## How it plugs into the pipeline

The scheduler already decides *what* and *when* per recipient
(`scheduleBatch` → outbox rows). A channel dispatcher sits at send time: for each
due row, `pickChannel(copy_id, userPrefs)` chooses the medium; email rows go to
`send-lifecycle-email`, messaging rows go to the relevant provider adapter with
`renderPush/Viber/WhatsApp`. Because selection happens after the cadence plan, the
caps and digests already applied — the channel is just the last hop.

## What is needed to go live (beyond a sending domain)

- **Viber** — a Viber Business / partner account + auth token, and message-type
  approval. Add `VIBER_TOKEN`.
- **WhatsApp** — a Meta WhatsApp Business API number and **pre-approved templates**
  for each MSG key. Add `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`.
- **Push** — a web/mobile push provider (e.g. FCM) + stored device tokens. The DB
  already has a `wants_mobile` flag (referral/entitlements migration); add per-
  channel opt-in columns (`wants_push`, `wants_viber`, `wants_whatsapp`) and a
  device-token table.
- A thin `dispatch-message` edge function that reads a due row, calls
  `pickChannel`, and hands off to the right provider. The message catalog,
  adapters and selection are already done and tested; only the provider calls and
  the opt-in columns remain.
