// npx tsx lib/billing/plans.test.ts
import { PLANS, TRIAL_DAYS, normalizePlan, planLimit, canAddProperty, planForCount, annualPerMonth,
  EXTRA_PROPERTY_PRICE, propertyAllowance, monthlyPrice, extrasNeeded, cheapestFor, planAdvice,
  propertyLimitLabel, type PlanId } from './plans';

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

// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΙΠΛΕΟΝ ΑΚΙΝΗΤΑ ΚΑΙ ΣΥΜΒΟΥΛΟΣ ΠΛΑΝΟΥ
//
// ΓΙΑΤΙ ΑΥΤΑ ΤΑ ΤΕΣΤ: η τιμολόγηση είναι ταυτόχρονα υπόσχεση προς τον χρήστη και
// έσοδα. Ένα λάθος εδώ δεν σκάει — απλώς κάποιος πληρώνει λάθος ποσό για μήνες.
// Τα σημεία ισοδυναμίας (11 και 43 ακίνητα) είναι ΣΧΕΔΙΑΣΤΙΚΗ ΑΠΟΦΑΣΗ, όχι
// σύμπτωση: επιλέχθηκαν οι τιμές 2 € και 79,90 € ΩΣΤΕ να βγαίνουν στρογγυλά και
// να λέγονται με μία πρόταση. Αν αλλάξει τιμή και μετακινηθούν, πρέπει να το
// μάθουμε εδώ και όχι από τον πρώτο χρήστη που θα πληρώσει παραπάνω.
// ═══════════════════════════════════════════════════════════════════════════
{

  // ── Ο γκρεμός των 3→4 ακινήτων έχει εξαφανιστεί ─────────────────────────
  {
    const three = monthlyPrice('owner', 0)
    const four  = monthlyPrice('owner', 1)
    ok(three === 9.9, 'τρία ακίνητα κοστίζουν 9,90 €')
    ok(Math.round((four - three) * 100) / 100 === 2, 'το τέταρτο ακίνητο κοστίζει +2 €, όχι +152%')
    ok((four - three) / three < 0.25, 'η αύξηση είναι κάτω από 25%')
    // Απόδειξη ότι ο έλεγχος πιάνει το ΠΑΛΙΟ σχήμα: εκεί το βήμα ήταν 9,90 → 24,90.
    ok((24.9 - 9.9) / 9.9 > 1.5, 'ο έλεγχος ΠΙΑΝΕΙ το παλιό άλμα')
  }

  // ── Τα σημεία ισοδυναμίας είναι ΑΚΡΙΒΩΣ στα 11 και στα 43 ────────────────
  {
    ok(cheapestFor(10).plan === 'owner', 'στα 10 ακίνητα φθηνότερος είναι ο Ιδιοκτήτης')
    ok(cheapestFor(11).plan === 'agency', 'στα 11 ακίνητα φθηνότερος γίνεται ο Επαγγελματίας')
    ok(cheapestFor(42).plan === 'agency', 'στα 42 ακίνητα φθηνότερος είναι ακόμη ο Επαγγελματίας')
    ok(cheapestFor(43).plan === 'office', 'στα 43 ακίνητα φθηνότερο γίνεται το Γραφείο')
  }

  // ── Η καμπύλη κόστους είναι ΠΑΝΤΑ αύξουσα, χωρίς σκαλοπάτι ───────────────
  // Αν σε κάποιο σημείο το φθηνότερο κόστος έπεφτε προσθέτοντας ακίνητο, θα
  // υπήρχε παγίδα· αν πηδούσε πάνω από 5 €, θα υπήρχε νέος γκρεμός.
  {
    // Ξεκινά από το 2, δηλαδή από το ΠΡΩΤΟ πληρωμένο σημείο. Το βήμα 1→2 ακίνητα
    // είναι 0 € → 9,90 €, και αυτό είναι σκόπιμο: είναι το πέρασμα από το δωρεάν
    // στη συνδρομή, όχι γκρεμός μέσα στην τιμολόγηση. Ο έλεγχος αφορά το αν
    // υπάρχει γκρεμός ΑΦΟΥ ο χρήστης έχει ήδη αποφασίσει να πληρώσει.
    let μονότονη = true, μέγιστοΆλμα = 0
    let προηγ = cheapestFor(2).monthly
    for (let n = 3; n <= 60; n++) {
      const τώρα = cheapestFor(n).monthly
      if (τώρα < προηγ) μονότονη = false
      μέγιστοΆλμα = Math.max(μέγιστοΆλμα, Math.round((τώρα - προηγ) * 100) / 100)
      προηγ = τώρα
    }
    ok(μονότονη, 'το φθηνότερο κόστος δεν πέφτει ποτέ όσο μεγαλώνει το χαρτοφυλάκιο')
    ok(μέγιστοΆλμα <= 2, 'κανένα βήμα ανάμεσα σε πληρωμένα δεν ξεπερνά τα 2 €')
    ok(cheapestFor(1).monthly === 0 && cheapestFor(2).monthly === 9.9, 'το ένα ακίνητο μένει δωρεάν, το δεύτερο ξεκινά τη συνδρομή')
  }

  // ── Ο σύμβουλος μιλά μόνο όταν υπάρχει πραγματικό όφελος ────────────────
  {
    ok(planAdvice('owner', 5, 2) === null, 'με 5 ακίνητα στον Ιδιοκτήτη δεν προτείνει τίποτα')
    const a = planAdvice('owner', 11, 8)
    ok(a?.plan === 'agency', 'με 11 ακίνητα προτείνει Επαγγελματία')
    ok((a?.saves ?? 0) === 1, 'και λέει πόσα γλιτώνει')
    const b = planAdvice('agency', 43, 28)
    ok(b?.plan === 'office', 'με 43 ακίνητα προτείνει Γραφείο')
    ok(planAdvice('free', 1, 0) === null, 'ο δωρεάν χρήστης δεν δέχεται «οικονομική» συμβουλή')
    // ΚΡΙΣΙΜΟ: ποτέ πρόταση που ΑΝΕΒΑΖΕΙ το κόστος.
    let ποτέΑκριβότερο = true
    for (let n = 1; n <= 60; n++) {
      for (const plan of (['owner', 'agency', 'office'] as PlanId[])) {
        const extras = extrasNeeded(plan, n)
        if (!Number.isFinite(extras)) continue
        const adv = planAdvice(plan, n, extras)
        if (adv && adv.monthly >= monthlyPrice(plan, extras)) ποτέΑκριβότερο = false
      }
    }
    ok(ποτέΑκριβότερο, 'ο σύμβουλος ΠΟΤΕ δεν προτείνει ακριβότερο πλάνο')
  }

  // ── Το όριο και η ετικέτα ───────────────────────────────────────────────
  {
    ok(propertyAllowance('owner', 5) === 8, 'ο Ιδιοκτήτης με 5 αγορασμένα χωράει 8 ακίνητα')
    ok(propertyAllowance('office', 0) === Infinity, 'το Γραφείο είναι απεριόριστο')
    ok(propertyAllowance('free', 99) === 1, 'το δωρεάν ΔΕΝ μεγαλώνει με «επιπλέον»')
    ok(propertyAllowance('owner', -5) === 3 && propertyAllowance('owner', NaN) === 3, 'αρνητικά/σκουπίδια δεν μεγαλώνουν το όριο')
    ok(!/Infinity/.test(propertyLimitLabel('office')), 'η ετικέτα του Γραφείου δεν γράφει «Infinity»')
    ok(propertyLimitLabel('owner').includes(String(EXTRA_PROPERTY_PRICE)), 'η ετικέτα του Ιδιοκτήτη αναφέρει την τιμή του επιπλέον')
  }
}

console.log(`\nbilling/plans.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
