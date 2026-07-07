// Αυστηρά τεστ για τα στατιστικά συγκριτικών (comparableStats.ts).
// Τρέξε: npx tsx app/dashboard/components/comparableStats.test.ts
import { median, mean, saleStats } from './comparableStats';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };

// ── median ───────────────────────────────────────────────────────────────────
ok('median([]) = 0', median([]) === 0);
ok('median([100]) = 100', median([100]) === 100);
ok('median([300,100,200]) = 200 (ταξινομεί)', median([300, 100, 200]) === 200);
ok('median([100,200,300,400]) = 250 (άρτιο)', median([100, 200, 300, 400]) === 250);
ok('median([0,-5,150]) = 150 (αγνοεί <=0)', median([0, -5, 150]) === 150);

// ── mean ─────────────────────────────────────────────────────────────────────
ok('mean([]) = 0', mean([]) === 0);
ok('mean([0,0]) = 0', mean([0, 0]) === 0);
ok('mean([2000,3000,4000]) = 3000', mean([2000, 3000, 4000]) === 3000);

// ── saleStats ────────────────────────────────────────────────────────────────
{
  const s = saleStats([]);
  ok('empty count 0', s.count === 0);
  ok('empty avgPriceSqm 0', s.avgPriceSqm === 0);
  ok('empty medPriceSqm 0', s.medPriceSqm === 0);
  ok('empty min/max 0', s.minPriceSqm === 0 && s.maxPriceSqm === 0);
  ok('empty avgDom 0', s.avgDom === 0);
  ok('empty soldCount 0', s.soldCount === 0);
}
{
  const s = saleStats([
    { asking_price: 200000, price_per_sqm: 2000, days_on_market: 30, sold_price: 0 },
    { asking_price: 300000, price_per_sqm: 3000, days_on_market: 60, sold_price: 290000 },
    { asking_price: 250000, price_per_sqm: 2500, days_on_market: 45, sold_price: 0 },
  ]);
  ok('count 3', s.count === 3);
  ok('avgPrice 250000', s.avgPrice === 250000);
  ok('avgPriceSqm 2500', s.avgPriceSqm === 2500);
  ok('medPriceSqm 2500', s.medPriceSqm === 2500);
  ok('minPriceSqm 2000', s.minPriceSqm === 2000);
  ok('maxPriceSqm 3000', s.maxPriceSqm === 3000);
  ok('avgDom 45', s.avgDom === 45);
  ok('soldCount 1', s.soldCount === 1);
}
{
  // avgDom στρογγυλοποιεί: [30,45] => 37.5 => 38
  const s = saleStats([
    { asking_price: 100000, price_per_sqm: 2000, days_on_market: 30, sold_price: 0 },
    { asking_price: 120000, price_per_sqm: 2400, days_on_market: 45, sold_price: 0 },
  ]);
  ok('avgDom rounds 37.5→38', s.avgDom === 38);
}
{
  // αγνοεί μηδενικό price_per_sqm στα €/τ.μ., αλλά μετρά sold_price>0 σε όλες τις γραμμές
  const s = saleStats([
    { asking_price: 100000, price_per_sqm: 0, days_on_market: 10, sold_price: 95000 },
    { asking_price: 200000, price_per_sqm: 2000, days_on_market: 20, sold_price: 0 },
  ]);
  ok('count ignores zero €/τ.μ.', s.count === 1);
  ok('avgPriceSqm from one row', s.avgPriceSqm === 2000);
  ok('soldCount counts across all', s.soldCount === 1);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ncomparableStats.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
