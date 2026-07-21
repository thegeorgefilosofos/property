// Scenario tests for the email cadence policy. Run: npx tsx verify-policy.ts
// Proves the anti-spam guarantees hold — above all the "ten emails on the 1st".
import { planDeliveries, policyFor, SLOT_TIME, QUIET_END, QUIET_START } from './emailPolicy.ts';

let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { failed++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };
const hourOf = (t: string) => Number(t.split(':')[0]);
const within = (t: string) => t === 'now' || (hourOf(t) >= QUIET_END && hourOf(t) < QUIET_START);

console.log('\n1) The 1st-of-month bomb — ten emails queued at 08:00');
{
  const items = [
    'monthly_statement', 'tax_e2', 'tax_enfia', 'tax_installment', 'free_month_upgrade',
    'feedback_lottery', 'product_update', 'rate_alert', 'referral_reminder', 'best_practice_tip',
  ].map(copyId => ({ copyId }));
  const { deliveries, deferred } = planDeliveries(items, { recipientKey: 'user@example.com' });
  const sent = deliveries.length;
  ok(sent <= 3, `at most 3 emails reach the user that day (got ${sent})`);
  ok(deliveries.filter(d => d.priority === 2).length === 1, 'the three tax obligations collapse into ONE morning digest');
  ok(deliveries.some(d => d.kind === 'digest' && d.bundles?.length === 3), 'digest bundles all 3 tax items');
  ok(deliveries.filter(d => d.priority === 3).length === 1, 'exactly one opportunity goes out (midday)');
  ok(deliveries.filter(d => d.priority === 4).length === 1, 'exactly one lifecycle goes out (evening)');
  ok(deliveries.filter(d => d.priority === 5).length === 0, 'nothing soft goes out on a busy day');
  const deliveredItems = deliveries.reduce((n, d) => n + (d.bundles?.length || 1), 0);
  ok(deliveredItems + deferred.length === items.length, `nothing dropped: ${deliveredItems} delivered + ${deferred.length} deferred = ${items.length}`);
  ok(deliveries.every(d => within(d.at)), 'every send lands inside quiet hours [08:00,21:00)');
  const times = deliveries.filter(d => d.at !== 'now').map(d => d.at).sort();
  ok(new Set(times.map(hourOf)).size === times.length, `sends are spread across the day, not all at once (${times.join(', ')})`);
}

console.log('\n2) Transactional always passes, immediately');
{
  const { deliveries } = planDeliveries([{ copyId: 'subscription_receipt' }, { copyId: 'security_login' }], { recipientKey: 'a@b.gr' });
  ok(deliveries.length === 2 && deliveries.every(d => d.at === 'now' && d.priority === 1), 'receipt + security login both send now, uncapped');
}

console.log('\n3) Same-day obligations consolidate; final dunning stays standalone');
{
  const p = planDeliveries([{ copyId: 'dunning_1' }, { copyId: 'insurance_expiring' }, { copyId: 'lease_ending' }], { recipientKey: 'c@d.gr' });
  ok(p.deliveries.length === 1 && p.deliveries[0].kind === 'digest' && p.deliveries[0].bundles?.length === 3, 'three obligations → one digest');
  const p2 = planDeliveries([{ copyId: 'dunning_final' }, { copyId: 'insurance_expiring' }], { recipientKey: 'c@d.gr' });
  ok(p2.deliveries.some(d => d.copyId === 'dunning_final' && d.kind === 'send'), 'final dunning is never folded into a digest');
}

console.log('\n4) Anniversary stays calm');
{
  const items = ['anniversary', 'energy_savings', 'best_practice_tip', 'tax_installment'].map(copyId => ({ copyId }));
  const { deliveries } = planDeliveries(items, { recipientKey: 'e@f.gr', isAnniversary: true });
  ok(deliveries.some(d => d.copyId === 'anniversary'), 'the anniversary email goes out');
  ok(!deliveries.some(d => d.priority === 3 || d.priority === 5), 'no opportunity/soft email intrudes on the anniversary');
  ok(deliveries.some(d => d.copyId === 'tax_installment'), 'a real obligation still gets through');
}

console.log('\n5) Slots respect quiet hours and order morning < midday < evening');
{
  ok(hourOf(SLOT_TIME.morning) < hourOf(SLOT_TIME.midday) && hourOf(SLOT_TIME.midday) < hourOf(SLOT_TIME.evening), 'morning < midday < evening');
  ok([SLOT_TIME.morning, SLOT_TIME.midday, SLOT_TIME.evening, SLOT_TIME.late].every(within), 'all slots inside quiet hours');
}

console.log('\n6) Policy sanity — every catalog key classifies');
{
  const some = ['welcome_free', 'dunning_final', 'energy_savings', 'monthly_statement', 'feedback_lottery'];
  ok(some.every(k => [1, 2, 3, 4, 5].includes(policyFor(k).priority)), 'known keys map to a tier');
  ok(policyFor('some_unlisted_key').priority === 4, 'unknown keys default to safe P4 lifecycle');
}

console.log('');
if (failed) { console.error(`✗ ${failed} assertion(s) failed`); process.exit(1); }
console.log('✓ all cadence scenarios pass');
