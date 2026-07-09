// npx tsx lib/expenses/sharing.test.ts
import { ownerShareAmount, isShared, SHARED_SCOPES, DEFAULT_SHARE_PERCENT } from './sharing';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}

// Μη μοιρασμένες — όλο το ποσό βαραίνει τον ιδιοκτήτη
eq('owner → full', ownerShareAmount({ amount: 100, paid_by: 'owner' }), 100);
eq('null paid_by → full', ownerShareAmount({ amount: 100, paid_by: null }), 100);
eq('company → full', ownerShareAmount({ amount: 100, paid_by: 'company' }), 100);

// Ενοικιαστής — μηδέν για τον ιδιοκτήτη
eq('tenant → 0', ownerShareAmount({ amount: 100, paid_by: 'tenant' }), 0);

// Μοιρασμένες — προεπιλογή 50% όταν λείπει το ποσοστό
eq('co_owner default 50%', ownerShareAmount({ amount: 100, paid_by: 'co_owner' }), 50);
eq('family default 50%', ownerShareAmount({ amount: 80, paid_by: 'family' }), 40);
eq('parents default 50%', ownerShareAmount({ amount: 200, paid_by: 'parents' }), 100);
eq('split default 50%', ownerShareAmount({ amount: 100, paid_by: 'split' }), 50);

// Μοιρασμένες — ρητό ποσοστό
eq('co_owner 30%', ownerShareAmount({ amount: 100, paid_by: 'co_owner', share_percent: 30 }), 30);
eq('family 70%', ownerShareAmount({ amount: 100, paid_by: 'family', share_percent: 70 }), 70);
eq('split 25% of 240', ownerShareAmount({ amount: 240, paid_by: 'split', share_percent: 25 }), 60);

// Ακραίες τιμές — clamp 0–100
eq('over 100 → clamp', ownerShareAmount({ amount: 100, paid_by: 'co_owner', share_percent: 150 }), 100);
eq('negative → clamp 0', ownerShareAmount({ amount: 100, paid_by: 'co_owner', share_percent: -20 }), 0);
eq('0% → 0', ownerShareAmount({ amount: 100, paid_by: 'co_owner', share_percent: 0 }), 0);

// Μηδενικό/άκυρο ποσό
eq('amount 0', ownerShareAmount({ amount: 0, paid_by: 'co_owner', share_percent: 50 }), 0);

// isShared
eq('isShared co_owner', isShared('co_owner'), true);
eq('isShared owner', isShared('owner'), false);
eq('isShared tenant', isShared('tenant'), false);
eq('isShared null', isShared(null), false);

// Σταθερές
eq('default percent', DEFAULT_SHARE_PERCENT, 50);
eq('scopes size', SHARED_SCOPES.size, 4);

console.log(`\nsharing: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
