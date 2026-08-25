// npx tsx lib/billing/plans.test.ts
import { PLANS, PLAN_ORDER, TRIAL_DAYS, normalizePlan, planLimit, planForCount, annualPerMonth,
  propertyAllowance } from './plans';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

ok(normalizePlan('owner') === 'owner', 'normalize owner');
ok(normalizePlan('agency') === 'agency', 'normalize agency');
ok(normalizePlan('junk') === 'free', 'normalize junk → free');
ok(normalizePlan(null) === 'free', 'normalize null → free');

ok(planLimit('free') === 1, 'free limit 1');
ok(planLimit('owner') === 3, 'owner limit 3');
ok(planLimit('agency') === 15, 'agency limit 15');

// Το canAddProperty ελέγχεται στο entitlements.test.ts — εκεί ζει η μία υλοποίηση.

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

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΟΡΙΟ ΑΚΙΝΗΤΩΝ
//
// Ο ΣΥΜΒΟΥΛΟΣ ΠΑΚΕΤΟΥ ΚΑΙ ΟΙ ΕΛΕΓΧΟΙ ΤΟΥ ΕΦΥΓΑΝ ΜΑΖΙ. Δοκίμαζαν τέσσερις
// συναρτήσεις που δεν καλούσε καμία οθόνη και που μετά την απόσυρση των
// επιπλέον ακινήτων θα έδιναν λάθος συμβουλή αν κάποτε καλούνταν (βλ.
// plans.ts). Ενας έλεγχος που φυλάει κώδικα τον οποίο κανείς δεν εκτελεί δίνει
// σιγουριά χωρίς αντίκρισμα.
//
// Μένει αυτό που ΠΡΑΓΜΑΤΙΚΑ κρίνει τι βλέπει ο χρήστης: το όριο ακινήτων, που
// το διαβάζει το entitlements.ts και το επιβάλλει η βάση.
// ═══════════════════════════════════════════════════════════════════════════
{
  ok(propertyAllowance('free') === 1, 'το δωρεάν χωράει ένα ακίνητο')
  ok(propertyAllowance('solo') === 1, 'ο Ιδιοκτήτης ένα')
  ok(propertyAllowance('owner') === 3, 'ο Ιδιοκτήτης+ τρία')
  ok(propertyAllowance('agency') === 15, 'ο Επαγγελματίας δεκαπέντε')
  ok(propertyAllowance('office') === Infinity, 'ο Επαγγελματίας+ είναι απεριόριστος')
  ok(propertyAllowance('ό,τι νά ναι') === 1, 'άγνωστο πακέτο πέφτει στο δωρεάν, όχι στο απεριόριστο')
  // Η σειρά είναι αύξουσα ΚΑΙ σε τιμή ΚΑΙ σε όριο. Πάνω σε αυτό στηρίζεται ο
  // κανόνας «το πρώτο πακέτο που χωρά είναι και το φθηνότερο», που τον λέει η
  // ίδια η τιμολόγηση στην αρχική σελίδα.
  let αύξουσα = true
  for (let i = 1; i < PLAN_ORDER.length; i++) {
    const προηγ = PLANS[PLAN_ORDER[i - 1]], τώρα = PLANS[PLAN_ORDER[i]]
    if (τώρα.priceMonthly < προηγ.priceMonthly || τώρα.maxProperties < προηγ.maxProperties) αύξουσα = false
  }
  ok(αύξουσα, 'κάθε πακέτο κοστίζει περισσότερο ΚΑΙ χωράει περισσότερα από το προηγούμενο')
}

console.log(`\nbilling/plans.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
