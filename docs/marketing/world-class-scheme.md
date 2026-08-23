# Property OS · World-class email & notification scheme

The playbook for the messaging system. **Internal — the customer never sees this;
they only ever receive the email, message, push or offer.** Benchmarked against
best-in-class lifecycle marketing (fintech, proptech, deliverability standards) and
the Greek property tax calendar. Current audit: **content + cadence 8.5/10,
notifications 6.5/10** — this scheme is how both reach 10/10.

## Philosophy
Every send is the **resolution, not homework**. We earn the lock screen the way
«Το ακίνητό σου, υπό έλεγχο» promises. The system is behaviour- and event-triggered,
arbitrated by **one global eligibility layer** that picks the channel *and* caps
total volume before anything leaves — so no well-meaning program can bombard an
owner. Transactional and obligation traffic is sacred and uncapped; promotional
volume is deliberately low and value-first. Every message carries the owner's own
data (this property, this amount, this deadline) so it reads as **service, not
marketing**. We front-run the State (AADE) on lead time and per-property detail, or
we do not send. North star = long-term trust (opt-out rate, complaint rate < 0.1%,
per-provider deliverability), never next-tap clicks.

## Lifecycle map
- **Activation** — anchor metric «first property fully modeled»; steps unlock by
  completing the prior action (no day-N timers), each reminder suppressed the instant
  its event fires. Diaspora/non-resident owners fork to English + 2× lead time.
- **Onboarding-to-value** — one email = one goal = one specific CTA, fired only if
  that value has not been reached yet (first Ε2 lease declared, first ΤΑΚΚ collected).
- **Annual state clock** (dates stored as **data**, verified each January): ΕΝΦΙΑ
  statement → T-10 → **T-2 per-property** → monthly instalment through the year;
  Ε1/Ε2/Ε3 window-open (mid-March) → mid-window (May) → T-14/T-3 before the July close.
- **Rolling monthly clock**: STR βραχυχρόνια-διαμονή declaration (12th & 18th for the
  20th); ΤΑΚΚ remittance (~25th); lease-info declaration per-event (never on a timer).
- **ΤΑΚΚ seasonal switch** — 1 April (up) / 1 November (down) so STR hosts update
  guest checkout charges.
- **Lease-declaration sub-flow** — filed → pending → tenant-acceptance / termination,
  so owners stop being taxed on phantom Ε2 income.
- **Reconciliation guardrail** — Feb–March «declared leases vs your Ε2 draft».
- **Engagement & retention** — monthly portfolio digest (numbers behind auth),
  monthly green-tariff energy pulse, savings surfacing.
- **Dunning** — 4-step tone ladder that also escalates the **medium**; cancelled
  instantly by a «paid» event.
- **Win-back & sunset** — engagement-tiered (0-90 / 90-180 / 180-365 / 365+), weighting
  clicks/replies/site-visits over MPP-inflated opens.
- **Transactional / security** — always, uncapped; only non-wake-worthy buzz is held
  to civil hours.

## Segmentation
- **Owner archetype drives the calendar**: long-term landlord · STR host (adds monthly
  βραχυχρόνια + ΤΑΚΚ + ΑΜΑ + July-Aug seasonality) · non-resident/diaspora (2× lead
  time, English, «assign my accountant» handoff).
- Two-sided: distinct tenant and co-owner tracks, gender-aware third person + neutral
  person-free fallback.
- RFM + lifecycle stage routes into flows; engagement tier sets cadence and sunset.
- Per-copyId **urgency class** (wake-worthy security vs night-holdable receipt vs
  low-urgency nudge) drives channel and buzz timing.

## Cadence rules (the anti-spam engine)
- **One global cap** governs all outbound across every channel — a push/Viber/WhatsApp/
  iMessage counts against the same daily and rolling-7-day ceiling as an email.
- Strongest-weight selection: ≤ 1 opportunity and ≤ 1 lifecycle per day; same-day
  obligations bundle into one digest (tax / obligations / str_today).
- Transactional + obligation exempt from the cap and never deferred; only their buzz
  is gated. **Quiet hours are clamped in code** (`civilClamp`), not just by slot choice.
- Send-time optimization per user from their own history; cold users fall back to
  cohort timing, never the list average.
- Deferred items age up (no starvation); Greek holidays/weekends shift non-urgent sends
  to the next business morning; loss/urgency framing is hard-capped to stay credible.
- Every journey has a goal + exit criterion — a user leaves the instant they convert,
  activate or churn.

## Channel strategy
- One delivery = one channel, chosen **after** the cap has counted the row.
- Waterfall keyed to opt-in and engagement, reachability verified at opt-in.
- Per-copyId urgency hint: security → fastest/most reliable; obligations → most-read
  channel; low-urgency → cheapest.
- Dunning escalates the medium (email → push → most-read); «paid» cancels the queue.
- **Every channel carries a tappable action** — push opens the app, iMessage inlines
  the URL, WhatsApp puts it in the template param, **Viber uses an open-url keyboard
  button (never drop `v.action`)**.
- Two-way channels (WhatsApp/iMessage) get an inbound handler; live states (payout in
  transit, maintenance today) reserved for persistent surfaces, not disposable pushes.

## Deliverability
Full auth stack (SPF + aligned Return-Path, DKIM 2048, DMARC at enforcement, MTA-STS/
TLS-RPT/BIMI). **Stream separation** — distinct subdomains/pools for transactional vs
marketing. Meet the 2024/2025 bulk-sender rules (RFC 8058 one-click unsubscribe honored
≤ 2 days, PTR, TLS, ARC, Postmaster spam rate < 0.1%). Engagement-based sending +
documented **sunset** before addresses become spam traps. Monitor per-provider (Google
Postmaster, Microsoft SNDS/JMRP, Yahoo CFL), not just aggregate. Multipart HTML + plain
text, dark-mode, aligned tracking domain (never bit.ly).

## Anti-spam guarantees
1. A single global cap sits above all campaigns and channels.
2. Channel is chosen downstream of the cap — multichannel never adds volume.
3. We never duplicate an AADE push with less info: we win on lead time + per-property
   euro attribution + a one-tap action, or we do not send.
4. No euro amount and no private name ever reaches a lock screen.
5. Granular preference center (per-category + «send me less»), not all-or-nothing.
6. RFC 8058 one-click unsubscribe honored same-day; legal entity + address in every
   marketing footer.
7. Sunset suppresses (not deletes) dormant addresses to protect base reputation.
8. Transactional/obligation never suppressed by marketing opt-out or sunset.

## Measurement (north-star guardrails)
Spam-complaint < 0.1% · unsubscribe rate · per-provider inbox-placement · activation %
within 7 days (target 35-40%) · obligation-acted-before-deadline % + front-run lead-time
vs AADE · per-trigger holdout on incremental engagement **and** downstream opt-out/mute
(kill triggers that win the tap but lose the user) · channel delivery/read + WhatsApp
quality rating · 30/90-day retention by archetype · continuous A/B graduating to bandits.

---

## Current state (this round)
- **Catalog: 115 emails · 34 phone messages**, gender-aware, value-first, disclaimered.
- Added this round: `enfia_installment_reminder` (per-property, euro-attributed, front-runs
  AADE), `energy_pulse` (monthly green-tariff), `portfolio_digest_nudge` (numbers behind
  auth), `maintenance_requested`, `takk_seasonal_rate_switch`, `password_reset`; improved
  gender-safe `deposit_reminder`; ΕΝΦΙΑ / maintenance / ΤΑΚΚ phone variants.
- Notification-scheme fixes: **quiet-hours clamped in code** + test; **wake-worthy vs
  night-holdable** transactional classification.

> Το στρώμα πολλαπλών καναλιών (Viber, WhatsApp, iMessage) διαγράφηκε στις 23
> Αυγούστου 2026. Καμία γραμμή δεν το καλούσε, ο πίνακας προτιμήσεών του ήταν
> πάντα κενός, και κάθε κανάλι απαιτεί εμπορική σύμβαση με πάροχο. Ό,τι
> ακολουθεί και το αναφέρει είναι ιστορικό.

## Backlog to 10/10 (prioritized — needs live DB / providers / domain)
**High** · engagement-based throttling + sunset + per-user send-time · lease-declaration
tenant-acceptance/termination sub-flow · preference center (per-category opt-out) ·
delivery-receipt failover + provider idempotency.
**Medium** · cross-channel dunning escalation with paid-event cancel · behavioural
triggers (saved-search, browse-abandon, price-drop) · timezone + Greek holiday awareness
+ diaspora profile · reconciliation guardrail (declared leases vs Ε2) · inbound reply
handler · stale push-token pruning.
**Low** · WhatsApp template category discipline · dark-mode + plain-text multipart ·
wider per-slot jitter · missing informational disclaimers sweep.
