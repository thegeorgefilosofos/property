// Τεστ για την κανονική επίλυση οικονομικών (lib/billing/propertyFacts.ts).
// Τρέξε: npx tsx lib/billing/propertyFacts.test.ts
import {
  resolveRent, resolveValue, resolveEnfia, resolveInsurance, computeYields, fmtYield,
  rentalModeFromAirbnb, propertyDetailsComplete,
} from './propertyFacts';

let passed = 0, failed = 0;
const fails: string[] = [];
const eq = <T>(name: string, a: T, b: T) => {
  if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; if (fails.length < 50) fails.push(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }
};
const near = (name: string, a: number, b: number) => { if (Math.abs(a - b) < 0.05) passed++; else { failed++; fails.push(`${name} (got ${a}, want ${b})`); } };

// ── resolveRent: προτεραιότητα tenant > actual > target ──────────────────────
eq('rent tenant wins', resolveRent({ tenantRent: 600, actualRent: 500, targetRent: 400 }), { value: 600, source: 'tenant' });
eq('rent actual next', resolveRent({ tenantRent: 0, actualRent: 500, targetRent: 400 }), { value: 500, source: 'actual' });
eq('rent target last', resolveRent({ tenantRent: null, actualRent: null, targetRent: 400 }), { value: 400, source: 'target' });
eq('rent none', resolveRent({}), { value: 0, source: 'none' });
eq('rent ignores negative', resolveRent({ tenantRent: -5, targetRent: 300 }), { value: 300, source: 'target' });
eq('rent ignores zero', resolveRent({ tenantRent: 0, actualRent: 0, targetRent: 0 }), { value: 0, source: 'none' });

// ── resolveValue ─────────────────────────────────────────────────────────────
eq('value commercial wins', resolveValue(200000, 120000), { value: 200000, source: 'property' });
eq('value falls to objective', resolveValue(0, 120000), { value: 120000, source: 'property' });
eq('value none', resolveValue(null, null), { value: 0, source: 'none' });

// ── resolveEnfia: property > servicesAnnual > servicesMonthly*12 ─────────────
eq('enfia property wins', resolveEnfia({ propertyEnfia: 500, servicesAnnual: 600 }), { annual: 500, source: 'property' });
eq('enfia annual next', resolveEnfia({ servicesAnnual: 600 }), { annual: 600, source: 'services' });
eq('enfia monthly x12', resolveEnfia({ servicesMonthly: 50 }), { annual: 600, source: 'services' });
eq('enfia none', resolveEnfia({}), { annual: 0, source: 'none' });

// ── resolveInsurance: settings > property, amount property > bills ───────────
eq('insurance settings company/expiry',
  resolveInsurance({ settingsCompany: 'Interamerican', settingsExpiry: '2027-01-01', propertyCompany: 'ΕΘΝΙΚΗ', propertyExpiry: '2026-01-01', propertyAmount: 240 }),
  { company: 'Interamerican', expiry: '2027-01-01', policy: null, amount: 240 });
eq('insurance falls to property when settings empty',
  resolveInsurance({ propertyCompany: 'ΕΘΝΙΚΗ', propertyExpiry: '2026-05-05', billsAmount: 180 }),
  { company: 'ΕΘΝΙΚΗ', expiry: '2026-05-05', policy: null, amount: 180 });
eq('insurance amount property over bills',
  resolveInsurance({ propertyAmount: 300, billsAmount: 180 }).amount, 300);
eq('insurance empty', resolveInsurance({}), { company: null, expiry: null, policy: null, amount: null });
eq('insurance blank strings ignored', resolveInsurance({ settingsCompany: '  ', propertyCompany: 'ERGO' }).company, 'ERGO');

// ── computeYields: ΕΝΑΣ τρόπος, χωρίς NaN/Infinity ──────────────────────────
{
  const y = computeYields(600, 200000, 3000);
  near('gross yield', y.grossYield, 3.6);         // 7200/200000
  near('net yield', y.netYield, 2.1);             // (7200-3000)/200000
  eq('annual rent', y.annualRent, 7200);
}
eq('yields zero value → 0 (not Infinity)', computeYields(600, 0, 1000).grossYield, 0);
eq('yields zero value net → 0', computeYields(600, 0, 1000).netYield, 0);
eq('yields no rent', computeYields(0, 200000, 0).grossYield, 0);
// Απόδοση ΙΔΙΑ ανεξάρτητα από ποιος καλεί (ντετερμινισμός) — 500 τυχαία ζεύγη
for (let i = 0; i < 500; i++) {
  const rent = (i * 7) % 3000, val = 50000 + (i * 137) % 500000, exp = (i * 13) % 8000;
  const a = computeYields(rent, val, exp), b = computeYields(rent, val, exp);
  eq(`deterministic ${i}`, a, b);
  if (val > 0) { if (!isFinite(a.grossYield) || !isFinite(a.netYield)) { failed++; fails.push(`non-finite ${i}`); } else passed++; }
  else passed++;
}
eq('fmtYield 1 decimal', fmtYield(3.666), '3.7%');
eq('fmtYield handles NaN', fmtYield(NaN), '0.0%');

// ── rentalModeFromAirbnb & propertyDetailsComplete ──────────────────────────
eq('airbnb → short_term', rentalModeFromAirbnb(true), 'short_term');
eq('not airbnb → long_term', rentalModeFromAirbnb(false), 'long_term');
eq('details value+rent complete', propertyDetailsComplete({ value: 150000, target_rent: 800 }, false), true);
eq('details obj_value + tenant complete', propertyDetailsComplete({ value: null, obj_value: 120000, target_rent: null }, true), true);
eq('details missing value', propertyDetailsComplete({ value: null, obj_value: null, target_rent: 800 }, false), false);
eq('details missing rent & tenant', propertyDetailsComplete({ value: 150000, target_rent: null }, false), false);
eq('details zeros do not count', propertyDetailsComplete({ value: 0, obj_value: 0, target_rent: 0 }, false), false);
// regression: αντικειμενική τροφοδοτεί το KPI αξίας όταν λείπει η εμπορική
eq('resolveValue obj feeds KPI', resolveValue(null, 120000).value, 120000);
near('yield from obj_value ≈ 8%', computeYields(800, resolveValue(null, 120000).value, 0).grossYield, 8.0);

console.log(`\npropertyFacts.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
