// npx tsx lib/billing/plans.test.ts
import { PLANS, normalizePlan, planLimit, canAddProperty, planForCount, annualPerMonth } from './plans';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

ok(normalizePlan('owner') === 'owner', 'normalize owner');
ok(normalizePlan('agency') === 'agency', 'normalize agency');
ok(normalizePlan('junk') === 'free', 'normalize junk → free');
ok(normalizePlan(null) === 'free', 'normalize null → free');

ok(planLimit('free') === 1, 'free limit 1');
ok(planLimit('owner') === 15, 'owner limit 15');
ok(planLimit('agency') === Infinity, 'agency unlimited');

ok(canAddProperty('free', 0) === true, 'free can add first');
ok(canAddProperty('free', 1) === false, 'free blocked at 1');
ok(canAddProperty('owner', 14) === true, 'owner can add 15th');
ok(canAddProperty('owner', 15) === false, 'owner blocked at 15');
ok(canAddProperty('agency', 999) === true, 'agency never blocked');

ok(planForCount(1) === 'free', 'count 1 → free');
ok(planForCount(2) === 'owner', 'count 2 → owner');
ok(planForCount(15) === 'owner', 'count 15 → owner');
ok(planForCount(16) === 'agency', 'count 16 → agency');

ok(annualPerMonth('owner') < PLANS.owner.priceMonthly, 'annual cheaper per month than monthly');
ok(PLANS.owner.priceMonthly === 6.9 && PLANS.owner.priceAnnual === 59, 'owner prices');
ok(PLANS.agency.priceMonthly === 19, 'agency price');

console.log(`\nbilling/plans.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
