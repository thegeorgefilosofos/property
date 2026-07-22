// ─────────────────────────────────────────────────────────────────────────────
// Email cadence policy — the anti-spam / send-time orchestration layer.
//
// The catalog (emailCopy.ts) says WHAT each email says. This module says WHEN it
// is allowed to reach the recipient, so we never bombard: a user must not get ten
// emails at 08:00 on the 1st of the month. Every copy_id is assigned a priority
// tier, a category, a preferred time-of-day slot, and (for obligations) a digest
// group. `planDeliveries()` is a pure function that takes everything queued for
// one recipient on one day and returns a measured, staggered, deduplicated plan:
// consolidate same-day obligations into a single digest, cap opportunities and
// lifecycle to one each, spread them across morning/midday/evening, keep quiet
// hours, and defer the overflow to later days.
//
// Pure and deterministic (the only "randomness" is a stable hash of the email),
// so it is unit-testable and the edge scheduler can trust it. See
// docs/marketing/cadence.md for the full strategy and verify-policy.ts for the
// scenario tests (incl. the "ten emails on the 1st" case).
// ─────────────────────────────────────────────────────────────────────────────

export type Priority = 1 | 2 | 3 | 4 | 5;
export type Category = 'transactional' | 'obligation' | 'opportunity' | 'lifecycle' | 'soft';
export type Slot = 'immediate' | 'morning' | 'midday' | 'evening' | 'late';

export interface Policy {
  priority: Priority;
  category: Category;
  slot: Slot;
  digestGroup?: string;   // same-day items in the same group merge into one email
  standalone?: boolean;   // never merged into a digest (e.g. final dunning)
}

// Clock for each slot (local time, 24h). Quiet hours are outside [08:00, 21:00].
export const SLOT_TIME: Record<Exclude<Slot, 'immediate'>, string> = {
  morning: '08:30',
  midday:  '12:30',
  evening: '18:30',
  late:    '19:45',
};
export const QUIET_START = 21; // no non-transactional sends at/after 21:00
export const QUIET_END = 8;    //  or before 08:00 → deferred to next morning

// Per-recipient daily & weekly ceilings for non-transactional email.
export const CAPS = {
  opportunityPerDay: 1,   // P3
  lifecyclePerDay: 1,     // P4
  softPerDay: 1,          // P5 (and only when nothing heavier went out)
  nonTxPerDay: 3,         // hard ceiling across P2 digest + P3 + P4/P5
  nonTxPerWeek: 5,        // rolling 7-day ceiling across P3+P4+P5
};

// ── Tier assignment ─────────────────────────────────────────────────────────
// Explicit per copy_id so intent is auditable. Anything unlisted falls back to a
// safe P4 lifecycle default (see policyFor).

const P1_TRANSACTIONAL = [
  'welcome_free', 'welcome_individual', 'welcome_professional', 'verify_email',
  'first_property_success', 'trial_started',
  'subscription_receipt', 'plan_changed', 'payment_failed', 'security_login', 'password_reset', 'reply_ack',
  'tenant_rent_receipt', 'payout_received', 'maintenance_completed',
  'referral_reward', 'referral_friend_activated',
];

// Wake-worthy transactional: security-critical events that may legitimately buzz a
// phone at night. Everything else transactional (receipts, payout) is night-holdable
// — the dispatcher may hold its lock-screen buzz to civil hours (content still sends).
const WAKE_WORTHY = new Set(['security_login', 'password_reset', 'payment_failed']);
export const isWakeWorthy = (copyId: string) => WAKE_WORTHY.has(copyId);

// Time-critical obligations. Same-day ones consolidate into one digest, except
// the ones flagged standalone below.
const P2_OBLIGATION = [
  'rent_pending', 'dunning_1', 'dunning_2', 'dunning_final',
  'tax_e2', 'tax_enfia', 'tax_installment',
  'lease_ending', 'lease_renewal_prompt', 'deposit_reminder',
  'insurance_expiring', 'certificate_expiring', 'inspection_due',
  'utility_bill_due', 'appointment_reminder', 'appointment_missed', 'maintenance_scheduled', 'maintenance_requested',
  'lease_declaration_reminder', 'str_registration_reminder', 'str_stay_tax', 'takk_seasonal_rate_switch',
  'enfia_installment_reminder', 'card_expiring', 'data_retention_notice',
  'checkin_today', 'checkout_today', 'cleaning_scheduled',
];

// P3 — personalized opportunity / value. One per day, midday.
const P3_OPPORTUNITY = [
  'energy_savings', 'insurance_enfia', 'loan_costs', 'rate_alert', 'document_pack',
  'free_month_upgrade', 'upsell_to_individual', 'upsell_to_professional',
  'limit_reached', 'value_left', 'annual_discount', 'trial_ending',
  'roi_proof', 'plan_comparison', 'rent_benchmark_alert', 'market_digest',
  'occupancy_gap', 'reactivation_offer', 'winback_offer', 'winback_downgrade',
  'news_rate_move', 'news_insurance_risk', 'news_utility_prices',   // topical value hooks
  'energy_pulse',   // monthly green-tariff savings pulse
];

// P5 — soft / optional. Only when nothing heavier is going out; first to defer.
const P5_SOFT = [
  'roadmap_preview', 'nps_survey', 'feedback_lottery', 'best_practice_tip',
  'webinar_invite', 'assistant_showcase', 'social_proof', 'churn_survey',
  'tip_assistant', 'voice_entry', 'tip_reports', 'feedback_week1', 'recap_week2',
  'yield_boost', 'portfolio_digest_nudge',
];

// Everything else (onboarding drip steps, monthly statement, product & seasonal
// news, referral invites, relationship, winback nudges…) is P4 lifecycle.

// Obligations that must never be folded into a shared digest.
const STANDALONE = new Set(['dunning_final', 'payment_failed', 'data_retention_notice']);

// Which digest a same-day obligation joins.
function digestGroupFor(copyId: string): string {
  if (['checkin_today', 'checkout_today', 'cleaning_scheduled'].includes(copyId)) return 'str_today';
  if (['tax_e2', 'tax_enfia', 'tax_installment', 'enfia_installment_reminder'].includes(copyId)) return 'tax';
  return 'obligations';
}

const SET1 = new Set(P1_TRANSACTIONAL);
const SET2 = new Set(P2_OBLIGATION);
const SET3 = new Set(P3_OPPORTUNITY);
const SET5 = new Set(P5_SOFT);

export function policyFor(copyId: string): Policy {
  // A digest is itself a consolidated obligation — P2, morning, never re-folded.
  if (copyId.startsWith('digest_')) return { priority: 2, category: 'obligation', slot: 'morning', standalone: true };
  if (SET1.has(copyId)) return { priority: 1, category: 'transactional', slot: 'immediate' };
  if (SET2.has(copyId)) return {
    priority: 2, category: 'obligation', slot: 'morning',
    digestGroup: STANDALONE.has(copyId) ? undefined : digestGroupFor(copyId),
    standalone: STANDALONE.has(copyId) || undefined,
  };
  if (SET3.has(copyId)) return { priority: 3, category: 'opportunity', slot: 'midday' };
  if (SET5.has(copyId)) return { priority: 5, category: 'soft', slot: 'late' };
  return { priority: 4, category: 'lifecycle', slot: 'evening' }; // default
}

// ── Deterministic per-recipient minute offset (spreads the fleet, not robotic) ─
export function offsetMinutes(recipientKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < recipientKey.length; i++) { h ^= recipientKey.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % 22; // 0..21 minutes added on top of the slot
}

const pad = (n: number) => String(n).padStart(2, '0');
// Pull any 'HH:MM' that lands outside civil hours [QUIET_END, QUIET_START) back to
// the morning slot — the hard guarantee that nothing non-transactional ever buzzes
// at night, enforced in code, not merely by slot choice. See verify-policy.
export function civilClamp(clock: string): string {
  if (clock === 'now') return clock;
  const h = Number(clock.split(':')[0]);
  return (h >= QUIET_START || h < QUIET_END) ? SLOT_TIME.morning : clock;
}
function slotClock(slot: Slot, recipientKey: string): string {
  if (slot === 'immediate') return 'now';
  const [hh, mm] = SLOT_TIME[slot].split(':').map(Number);
  const total = hh * 60 + mm + offsetMinutes(recipientKey);
  return civilClamp(`${pad(Math.floor(total / 60))}:${pad(total % 60)}`);
}
// Add minutes to an 'HH:MM' clock (used to spread several morning obligations).
function addMinutes(clock: string, m: number): string {
  if (clock === 'now') return clock;
  const [h, mm] = clock.split(':').map(Number);
  const t = h * 60 + mm + m;
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
}
// Sub-tier strength, so "one opportunity/lifecycle" picks the strongest, not the
// oldest-queued. Higher wins. Unlisted → 1.
const WEIGHT: Record<string, number> = {
  winback_downgrade: 9, limit_reached: 9, reactivation_offer: 8, winback_offer: 8, trial_ending: 8,
  value_left: 8, annual_discount: 7, upsell_to_professional: 7, upsell_to_individual: 7,
  free_month_upgrade: 6, document_pack: 6, energy_savings: 6, insurance_enfia: 6, roi_proof: 6, occupancy_gap: 6,
  news_utility_prices: 6, news_insurance_risk: 6, news_rate_move: 5, energy_pulse: 6,
  loan_costs: 5, plan_comparison: 5, rent_benchmark_alert: 5, rate_alert: 4, market_digest: 3,
};
// Note: loan_first_scenario is an event-triggered educational follow-up and falls
// through to the P4 lifecycle default (evening, one/day) — intentional, not upsell.
const weightOf = (id: string) => WEIGHT[id] ?? 1;

// ── The planner ──────────────────────────────────────────────────────────────

export interface QueuedItem { copyId: string; params?: Record<string, unknown>; }

export interface Delivery {
  kind: 'send' | 'digest';
  copyId: string;              // synthetic 'digest_<group>' for a digest
  at: string;                  // clock time or 'now'
  priority: Priority;
  category: Category;
  bundles?: string[];          // for a digest: the copy_ids folded in
}
export interface Deferred { copyId: string; reason: string; }
export interface Plan { deliveries: Delivery[]; deferred: Deferred[]; }

export interface PlanContext {
  recipientKey: string;                 // stable per recipient (email/id) for staggering
  sentTodayNonTx?: number;              // non-transactional already sent today
  sentThisWeekNonTx?: number;           // rolling 7-day non-transactional count
  isAnniversary?: boolean;              // birthday/anniversary → keep the day calm
}

/**
 * Turn everything queued for one recipient on one day into a measured plan.
 * Transactional always passes. Obligations consolidate + lead the morning.
 * At most one opportunity and one lifecycle go out, spread across the day; soft
 * only if room remains. Everything over the caps is deferred, not dropped.
 */
export function planDeliveries(items: QueuedItem[], ctx: PlanContext): Plan {
  const rk = ctx.recipientKey;
  const deliveries: Delivery[] = [];
  const deferred: Deferred[] = [];
  // Both counters start from what already went out (or is already scheduled) and
  // grow together, so a day can never push the rolling week past its ceiling.
  let usedNonTx = ctx.sentTodayNonTx ?? 0;
  let weekNonTx = ctx.sentThisWeekNonTx ?? 0;
  const bump = () => { usedNonTx++; weekNonTx++; };
  const roomToday = () => usedNonTx < CAPS.nonTxPerDay && weekNonTx < CAPS.nonTxPerWeek;

  const withPol = items.map(it => ({ it, pol: policyFor(it.copyId) }));

  // 1) Transactional — always, immediately, uncapped.
  for (const { it, pol } of withPol.filter(x => x.pol.priority === 1)) {
    deliveries.push({ kind: 'send', copyId: it.copyId, at: 'now', priority: 1, category: pol.category });
  }

  // 2) Obligations — consolidate same-day per digest group; standalone stay whole.
  //    Several obligations are spread a few minutes apart, not stacked on one minute.
  const obligs = withPol.filter(x => x.pol.priority === 2);
  let mIdx = 0;
  const morningAt = () => addMinutes(slotClock('morning', rk), (mIdx++) * 6);
  const groups = new Map<string, string[]>();
  for (const { it, pol } of obligs) {
    if (pol.standalone) {
      deliveries.push({ kind: 'send', copyId: it.copyId, at: morningAt(), priority: 2, category: 'obligation' });
      bump();
      continue;
    }
    const g = pol.digestGroup || 'obligations';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it.copyId);
  }
  for (const [g, keys] of groups) {
    if (keys.length === 1) deliveries.push({ kind: 'send', copyId: keys[0], at: morningAt(), priority: 2, category: 'obligation' });
    else deliveries.push({ kind: 'digest', copyId: `digest_${g}`, at: morningAt(), priority: 2, category: 'obligation', bundles: keys });
    bump();
  }

  // 3) Opportunity — at most one, the STRONGEST, at midday.
  const opps = withPol.filter(x => x.pol.priority === 3).sort((a, b) => weightOf(b.it.copyId) - weightOf(a.it.copyId));
  if (opps.length && !ctx.isAnniversary && roomToday()) {
    deliveries.push({ kind: 'send', copyId: opps[0].it.copyId, at: slotClock('midday', rk), priority: 3, category: 'opportunity' });
    bump();
    for (const o of opps.slice(1)) deferred.push({ copyId: o.it.copyId, reason: 'opportunity_cap' });
  } else {
    for (const o of opps) deferred.push({ copyId: o.it.copyId, reason: ctx.isAnniversary ? 'anniversary_quiet' : 'opportunity_cap' });
  }

  // 4) Lifecycle — at most one, in the evening. Anniversary wins the slot, else strongest.
  const life = withPol.filter(x => x.pol.priority === 4);
  const anniv = life.find(x => x.it.copyId === 'anniversary');
  const lifeOrdered = anniv ? [anniv, ...life.filter(x => x !== anniv)] : [...life].sort((a, b) => weightOf(b.it.copyId) - weightOf(a.it.copyId));
  if (lifeOrdered.length && roomToday()) {
    deliveries.push({ kind: 'send', copyId: lifeOrdered[0].it.copyId, at: slotClock('evening', rk), priority: 4, category: 'lifecycle' });
    bump();
    for (const l of lifeOrdered.slice(1)) deferred.push({ copyId: l.it.copyId, reason: 'lifecycle_cap' });
  } else {
    for (const l of lifeOrdered) deferred.push({ copyId: l.it.copyId, reason: 'lifecycle_cap' });
  }

  // 5) Soft — only if NOTHING else went out today (this run or earlier) and no anniversary.
  const soft = withPol.filter(x => x.pol.priority === 5);
  const dayHadAnything = usedNonTx > 0; // includes prior sends today + this run's obligations/opp/lifecycle
  if (soft.length && !ctx.isAnniversary && !dayHadAnything && roomToday()) {
    deliveries.push({ kind: 'send', copyId: soft[0].it.copyId, at: slotClock('late', rk), priority: 5, category: 'soft' });
    bump();
    for (const s of soft.slice(1)) deferred.push({ copyId: s.it.copyId, reason: 'soft_cap' });
  } else {
    for (const s of soft) deferred.push({ copyId: s.it.copyId, reason: ctx.isAnniversary ? 'anniversary_quiet' : 'soft_cap' });
  }

  return { deliveries, deferred };
}

// ── DB bridge — map outbox rows through the planner to row-level decisions ────
// The edge scheduler (schedule-email-outbox) hands one recipient's pending rows
// for a day; this returns what to do with each row (send at a time, or defer)
// plus any digest to insert. Pure, so it is testable without a database.

export interface OutboxRow { id: number | string; copyId: string; }
export interface RowDecision { id: number | string; action: 'send' | 'defer'; at: string; viaDigest?: string; }
export interface DigestSpec { copyId: string; at: string; memberIds: Array<number | string>; }
export interface BatchResult { rows: RowDecision[]; digests: DigestSpec[]; }

export function scheduleBatch(rows: OutboxRow[], ctx: PlanContext): BatchResult {
  const { deliveries, deferred } = planDeliveries(rows.map(r => ({ copyId: r.copyId })), ctx);
  const pool = rows.map(r => ({ ...r, used: false }));
  const take = (copyId: string) => { const r = pool.find(x => x.copyId === copyId && !x.used); if (r) r.used = true; return r; };

  const out: RowDecision[] = [];
  const digests: DigestSpec[] = [];
  for (const d of deliveries) {
    if (d.kind === 'digest') {
      const memberIds: Array<number | string> = [];
      for (const cid of d.bundles || []) { const r = take(cid); if (r) { memberIds.push(r.id); out.push({ id: r.id, action: 'send', at: d.at, viaDigest: d.copyId }); } }
      digests.push({ copyId: d.copyId, at: d.at, memberIds });
    } else {
      const r = take(d.copyId); if (r) out.push({ id: r.id, action: 'send', at: d.at });
    }
  }
  for (const df of deferred) { const r = take(df.copyId); if (r) out.push({ id: r.id, action: 'defer', at: SLOT_TIME.morning }); }
  return { rows: out, digests };
}
