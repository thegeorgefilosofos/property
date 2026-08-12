// Scenario tests for the email cadence policy. Run: npx tsx verify-policy.ts
// Proves the anti-spam guarantees hold — above all the "ten emails on the 1st".
import { planDeliveries, policyFor, scheduleBatch, SLOT_TIME, QUIET_END, QUIET_START, civilClamp, isWakeWorthy } from './emailPolicy.ts';
import { DIGESTS } from './emailCopy.ts';

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

console.log('\n7) scheduleBatch maps DB rows → decisions + digest');
{
  const rows = [
    { id: 1, copyId: 'tax_e2' }, { id: 2, copyId: 'tax_enfia' }, { id: 3, copyId: 'tax_installment' },
    { id: 4, copyId: 'rate_alert' }, { id: 5, copyId: 'monthly_statement' }, { id: 6, copyId: 'feedback_lottery' },
  ];
  const { rows: decisions, digests } = scheduleBatch(rows, { recipientKey: 'x@y.gr' });
  ok(digests.length === 1 && digests[0].copyId === 'digest_tax' && digests[0].memberIds.length === 3, 'the 3 tax rows become one digest_tax with 3 members');
  ok(decisions.filter(d => d.viaDigest === 'digest_tax').length === 3, 'those rows are marked sent via the digest');
  ok(decisions.some(d => d.id === 6 && d.action === 'defer'), 'the soft feedback row is deferred');
  ok(decisions.length === rows.length, 'every row gets exactly one decision');
}

console.log('\n8) Digest templates render for real');
{
  const items = [{ title: 'Δόση φόρου', detail: 'έως 31/07' }, { title: 'ΕΝΦΙΑ Α΄ δόση', detail: 'έως 31/07' }];
  for (const key of ['digest_obligations', 'digest_tax', 'digest_str_today']) {
    const out = DIGESTS[key]({ name: 'Μαρία', digestItems: items, appUrl: 'https://propertyos.gr' });
    const bad = /—|undefined|NaN|\[object/.test(out.html) || !out.subject;
    ok(!bad && out.html.includes('Δόση φόρου'), `${key} renders cleanly with its items`);
  }
}

console.log('\n9) Weekly ceiling holds; obligations still get through');
{
  const items = ['limit_reached', 'monthly_statement', 'tax_installment'].map(copyId => ({ copyId }));
  const { deliveries, deferred } = planDeliveries(items, { recipientKey: 'w@k.gr', sentThisWeekNonTx: 5 });
  ok(deliveries.some(d => d.copyId === 'tax_installment'), 'a real obligation still reaches the user at the weekly cap');
  ok(deferred.some(d => d.copyId === 'limit_reached') && deferred.some(d => d.copyId === 'monthly_statement'), 'opportunity + lifecycle defer once the weekly cap is hit');
}

console.log('\n10) Digests classify as obligations, not lifecycle');
{
  ok(policyFor('digest_tax').priority === 2 && policyFor('digest_obligations').category === 'obligation', 'digest_* → P2 obligation');
  const { deliveries } = planDeliveries([{ copyId: 'digest_tax' }], { recipientKey: 'd@g.gr' });
  ok(deliveries.length === 1 && deliveries[0].priority === 2, 'a digest row is not re-folded and stays P2');
}

console.log('\n11) The strongest opportunity wins the day, not the first queued');
{
  const { deliveries, deferred } = planDeliveries([{ copyId: 'rate_alert' }, { copyId: 'limit_reached' }], { recipientKey: 's@g.gr' });
  ok(deliveries.some(d => d.copyId === 'limit_reached'), 'limit_reached (stronger) is chosen over rate_alert');
  ok(deferred.some(d => d.copyId === 'rate_alert'), 'the weaker opportunity defers');
}

console.log('\n12) Several morning obligations spread across distinct minutes');
{
  const { deliveries } = planDeliveries([{ copyId: 'dunning_final' }, { copyId: 'data_retention_notice' }, { copyId: 'tax_e2' }, { copyId: 'tax_enfia' }], { recipientKey: 'm@g.gr' });
  const morning = deliveries.filter(d => d.priority === 2).map(d => d.at);
  ok(new Set(morning).size === morning.length && morning.length >= 3, `morning obligations land at distinct times (${morning.join(', ')})`);
}

console.log('\n13) Quiet hours are clamped in code, not just by slot choice');
{
  ok(civilClamp('22:30') === SLOT_TIME.morning, 'a 22:30 time defers to the morning slot');
  ok(civilClamp('07:15') === SLOT_TIME.morning, 'a 07:15 time (pre-08:00) defers to the morning slot');
  ok(civilClamp('12:30') === '12:30' && civilClamp('20:59') === '20:59', 'civil-hour times pass through unchanged');
  ok(civilClamp('now') === 'now', 'immediate/now is never clamped');
  // every planned non-transactional delivery lands inside civil hours
  const { deliveries } = planDeliveries([{ copyId: 'market_digest' }, { copyId: 'product_update' }, { copyId: 'nps_survey' }], { recipientKey: 'quiet@g.gr' });
  ok(deliveries.filter(d => d.category !== 'transactional').every(d => within(d.at)), 'all non-transactional sends fall within civil hours');
}

console.log('\n14) Wake-worthy transactional classification');
{
  ok(isWakeWorthy('security_login') && isWakeWorthy('payment_failed'), 'security-critical events are wake-worthy');
  ok(!isWakeWorthy('subscription_receipt') && !isWakeWorthy('payout_received'), 'receipts/payouts are night-holdable, not wake-worthy');
  ok(policyFor('security_login').category === 'transactional', 'security_login is transactional (uncapped, immediate)');
  ok(policyFor('enfia_installment_reminder').priority === 2 && policyFor('enfia_installment_reminder').digestGroup === 'tax', 'ENFIA instalment reminder is a P2 obligation in the tax digest');
  ok(policyFor('energy_pulse').category === 'opportunity' && policyFor('portfolio_digest_nudge').category === 'soft', 'energy_pulse=opportunity, portfolio nudge=soft');
}

console.log('');
if (failed) { console.error(`✗ ${failed} assertion(s) failed`); process.exit(1); }
console.log('✓ all cadence scenarios pass');
