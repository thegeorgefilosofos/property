# Cadence & anti-spam strategy

The single rule that outranks every campaign: **we never bombard.** A user must
not receive ten emails at 08:00 on the 1st of the month. Content lives in
`emailCopy.ts`; *when* it is allowed to arrive is decided here and enforced by
`emailPolicy.ts` (pure, unit-tested in `verify-policy.ts`).

## Priority tiers

Every `copy_id` is assigned a tier. Higher tiers win the day.

| Tier | Category | Examples | Rule |
|---|---|---|---|
| **P1** | Transactional | receipt, payment failed, security login, verify email, reply ack, rent receipt, payout | Always, immediately, uncapped. The user's own action triggered it — it is expected. |
| **P2** | Obligation | dunning, tax deadlines (Ε2/ΕΝΦΙΑ/δόση), lease/insurance/certificate expiry, STR registration, card expiring | Time-critical. Same-day ones **consolidate into one digest**. Lead the morning. |
| **P3** | Opportunity / value | energy savings, insurance→ΕΝΦΙΑ, loan costs, document pack, upsell on limit, ROI proof, rent benchmark, occupancy gap | **One per day**, midday. |
| **P4** | Lifecycle | monthly statement, product & seasonal news, referral invites, onboarding drip, relationship | **One per day**, evening. Weekly-capped. |
| **P5** | Soft | feedback lottery, best-practice tips, webinar, NPS, roadmap teaser, social proof | Only when the day is otherwise quiet. First to defer. |

## Global governance

- **Quiet hours** — nothing non-transactional before **08:00** or after **21:00**;
  anything scheduled outside that window is deferred to the next morning slot.
- **Daily ceiling** — at most **3** non-transactional emails reach a recipient in a
  day: one obligations lead (a digest if several are due), one opportunity, one
  lifecycle. Soft only if room remains. Transactional never counts against this.
- **Weekly ceiling** — at most **5** non-transactional in a rolling 7 days.
- **Consolidation** — multiple same-day obligations merge into a single
  "Οι υποχρεώσεις σου" email listing them. Final dunning, payment failure and data-
  retention notices are **never** folded in — they go whole.
- **Spread across the day** — the day's sends land in distinct slots
  (**08:30 / 12:30 / 18:30 / 19:45**) plus a deterministic per-recipient minute
  offset, so the whole user base is not hitting inboxes at the same instant and no
  single hour is stacked.
- **Overflow is deferred, never dropped** — an email that loses the day's slot comes
  back on a later eligible day; nothing is silently discarded.

## Calendar collisions we designed around

- **1st of the month.** The recurring monthly items (statement, tax reminders,
  upgrade nudge, feedback, product news…) would otherwise all fire at 08:00. Instead:
  the tax obligations collapse into one 08:30 digest, one value email goes at 12:30,
  the monthly statement at 18:30, and the soft items defer. **Three, spread — not ten
  at breakfast.** (Proven by scenario 1 in `verify-policy.ts`.)
- **Many deadlines same day.** Dunning + insurance expiry + lease end become one
  morning obligations digest, so a heavy day reads as one clear list, not a stack.
- **Birthday / anniversary.** The day stays calm: the warm anniversary email goes
  out, real obligations still get through, but no upsell or soft email intrudes.
- **Weekly rhythms** (e.g. a Monday market/rate digest) obey the P3 one-per-day and
  the weekly ceiling, so they can never combine with other opportunities to flood.

## How it runs

`planDeliveries(items, ctx)` takes everything queued for one recipient on one day and
returns the measured plan: which sends go out, at what time, which obligations merged
into a digest, and what deferred. The outbox scheduler calls it before draining, so
the governance is applied centrally — every trigger, cron and campaign inherits it for
free. See `emailPolicy.ts` for the tiers and `docs/marketing/automation.md` for the
outbox/cron plumbing.
