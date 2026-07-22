# Multichannel messaging (Viber · WhatsApp · iMessage · Push)

Email is the home of everything the system says. A phone message is for the one
thing that matters right now. This layer (`_shared/messaging.ts`) adds short,
glanceable variants of the urgent events — written in the same warm Property OS
voice as the emails, only compressed to a lock screen — and, the part that
protects the user, decides **one channel per delivery**, with the daily caps
spanning every channel. Messages are gender-aware where a third person (a tenant)
is named, with a safe neutral fallback, and never expose an amount or a private
name on the lock screen.

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
  imessage opted-in                  → imessage
  push opted-in                      → push
  otherwise                          → email
```

The tie-break order (Viber → WhatsApp → iMessage → push) only matters when a user
opted into several; the messaging apps most common in Greece come first. Any single
delivery still goes to exactly one channel.

Opt-in is per channel and per user. With no opt-in, everything is email — the
messaging channels are strictly additive to the user's stated preference.

## The message catalog

`MSG` holds ~30 short variants (title + body + CTA), Greek, no dashes, gender-aware
where a tenant is named (else neutral), with safe fallbacks. Coverage spans every
glanceable event: transactional (receipts, security, payment failed, maintenance
done), obligations (dunning, tax/utility/insurance/certificate deadlines, lease &
compliance reminders — myAADE lease declaration, ΑΜΑ, τέλος ανθεκτικότητας — card
expiry, data-retention), short-term ops (check-in/out, cleaning), the three
digests, and a couple of lifecycle/opportunity nudges. Adapters format them per
channel:

- **Push** — title ≤ 48 chars, body ≤ 140; the whole thing taps into the app.
- **Viber** — title + body + a link button (rich message).
- **iMessage** (Apple Messages for Business) — title + body + the URL inline so
  Apple renders a rich link-preview card, plus a CTA action.
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
## What is now built

- **`messaging_prefs`** (per-user opt-in: email/push/viber/whatsapp + `phone_e164`)
  and **`push_devices`** tables, RLS-owned by the user — migration
  `20260722100000_messaging_channels.sql`. Email on by default; the rest opt-in,
  so a user with no row is email-only.
- **`dispatch-message`** edge function — the single seam: reads a delivery, looks
  up the recipient's opt-ins, calls `pickChannel`, and routes to email
  (send-lifecycle-email), Viber, WhatsApp (template payload) or push (FCM). If a
  provider key or the phone/device is missing, it falls back to email — never a
  double-send, never a lost message.
- The scheduler is single-flight (advisory lock) so overlapping cron runs can't
  double-plan.

## To go live (only provider credentials remain)

- Set `VIBER_TOKEN`, `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` (with Meta-approved
  templates named `po_<copyId>`), `IMESSAGE_API_URL` + `IMESSAGE_TOKEN` (Apple
  Messages for Business, via an MSP such as Sunshine Conversations), and a push key
  (`FCM_SERVER_KEY`). Each is independent — any absent channel simply falls back to
  email, never a double-send.
- Point the drain at `dispatch-message` instead of `send-lifecycle-email` so every
  delivery passes through the one channel seam.
- Collect opt-ins + phone/device tokens in-app (write to `messaging_prefs`, incl.
  `wants_imessage` from migration `20260722140000_imessage_channel.sql`, and
  `push_devices`). Until then everything is email, exactly as today.
