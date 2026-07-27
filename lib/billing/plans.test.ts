// npx tsx lib/billing/plans.test.ts
import { PLANS, TRIAL_DAYS, normalizePlan, planLimit, canAddProperty, planForCount, annualPerMonth } from './plans';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

ok(normalizePlan('owner') === 'owner', 'normalize owner');
ok(normalizePlan('agency') === 'agency', 'normalize agency');
ok(normalizePlan('junk') === 'free', 'normalize junk → free');
ok(normalizePlan(null) === 'free', 'normalize null → free');

ok(planLimit('free') === 1, 'free limit 1');
ok(planLimit('owner') === 3, 'owner limit 3');
ok(planLimit('agency') === 15, 'agency limit 15');

ok(canAddProperty('free', 0) === true, 'free can add first');
ok(canAddProperty('free', 1) === false, 'free blocked at 1');
ok(canAddProperty('owner', 2) === true, 'owner can add 3rd');
ok(canAddProperty('owner', 3) === false, 'owner blocked at 3');
ok(canAddProperty('agency', 14) === true, 'agency can add 15th');
ok(canAddProperty('agency', 15) === false, 'agency blocked at 15');

ok(planForCount(1) === 'free', 'count 1 → free');
ok(planForCount(2) === 'owner', 'count 2 → owner');
ok(planForCount(3) === 'owner', 'count 3 → owner');
ok(planForCount(4) === 'agency', 'count 4 → agency');

ok(annualPerMonth('owner') < PLANS.owner.priceMonthly, 'annual cheaper per month than monthly');
ok(PLANS.owner.priceMonthly === 9.9 && PLANS.owner.priceAnnual === 99, 'owner prices');
ok(PLANS.agency.priceMonthly === 24.9 && PLANS.agency.priceAnnual === 249, 'agency prices');
// Η δωρεάν δοκιμή ισχύει στα πληρωμένα πλάνα, όχι στο δωρεάν.
ok(TRIAL_DAYS === 30, 'trial 30 ημέρες');
ok(PLANS.free.trialDays === 0, 'δωρεάν πλάνο χωρίς δοκιμή');
ok(PLANS.owner.trialDays === TRIAL_DAYS && PLANS.agency.trialDays === TRIAL_DAYS, 'πληρωμένα πλάνα με δοκιμή');
// Το ετήσιο πρέπει να συμφέρει σε κάθε πληρωμένο πλάνο.
ok(annualPerMonth('agency') < PLANS.agency.priceMonthly, 'ετήσιο agency φθηνότερο ανά μήνα');

console.log(`\nbilling/plans.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
