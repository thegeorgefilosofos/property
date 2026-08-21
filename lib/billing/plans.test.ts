// npx tsx lib/billing/plans.test.ts
import { PLANS, TRIAL_DAYS, normalizePlan, planLimit, planForCount, annualPerMonth,
  propertyAllowance, monthlyPrice, cheapestFor, planAdvice,
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
// ΤΟ ΟΡΙΟ ΑΚΙΝΗΤΩΝ ΚΑΙ Ο ΣΥΜΒΟΥΛΟΣ ΠΛΑΝΟΥ
//
// ΓΙΑΤΙ ΑΥΤΑ ΤΑ ΤΕΣΤ: η τιμολόγηση είναι ταυτόχρονα υπόσχεση προς τον χρήστη και
// έσοδα. Ενα λάθος εδώ δεν σκάει — απλώς κάποιος πληρώνει λάθος ποσό για μήνες.
//
// ΤΑ ΕΠΙΠΛΕΟΝ ΑΚΙΝΗΤΑ ΤΩΝ 2,00 € ΕΦΥΓΑΝ, ΚΑΙ ΜΑΖΙ ΤΟΥΣ ΟΛΟΣ Ο ΠΑΛΙΟΣ ΕΛΕΓΧΟΣ.
// Δοκίμαζε τα σημεία ισοδυναμίας (11 και 43 ακίνητα) και τη μονοτονία της
// καμπύλης κόστους — και τα δύο υπήρχαν μόνο επειδή το κόστος συντιθόταν από
// πακέτο συν πρόσθετα. Χωρίς πρόσθετα, το κόστος είναι σκέτη η τιμή του
// πακέτου και τα σημεία ισοδυναμίας ταυτίζονται με τα όρια.
//
// ΚΑΙ ΤΟ ΣΚΑΛΟΠΑΤΙ 3→4 ΞΑΝΑΓΥΡΙΣΕ. Το τέταρτο ακίνητο κοστίζει πάλι 9,90 € →
// 24,90 €. Ηταν συνειδητή απόφαση προϊόντος να φύγει η πρόταση των 2,00 €
// επειδή δεν αγοραζόταν από πουθενά· ο έλεγχος παρακάτω το ΓΡΑΦΕΙ αντί να το
// κρύψει, ώστε να μη θεωρηθεί ποτέ ότι λύθηκε.
// ═══════════════════════════════════════════════════════════════════════════
{
  // ── Το φθηνότερο πακέτο είναι το πρώτο που χωρά ─────────────────────────
  {
    ok(cheapestFor(1).plan === 'free', 'ένα ακίνητο χωρά στο δωρεάν')
    ok(cheapestFor(2).plan === 'owner', 'δύο ακίνητα ζητούν Ιδιοκτήτη+')
    ok(cheapestFor(3).plan === 'owner', 'τρία ακίνητα ακόμη στον Ιδιοκτήτη+')
    ok(cheapestFor(4).plan === 'agency', 'τέσσερα ακίνητα ζητούν Επαγγελματία')
    ok(cheapestFor(15).plan === 'agency', 'δεκαπέντε ακίνητα ακόμη στον Επαγγελματία')
    ok(cheapestFor(16).plan === 'office', 'δεκαέξι ακίνητα ζητούν Επαγγελματία+')
    ok(cheapestFor(500).plan === 'office', 'πεντακόσια ακίνητα, το ίδιο πακέτο')
  }

  // ── Η καμπύλη κόστους δεν πέφτει ποτέ ───────────────────────────────────
  // Αν σε κάποιο σημείο το φθηνότερο κόστος έπεφτε προσθέτοντας ακίνητο, θα
  // υπήρχε παγίδα: ο χρήστης θα πλήρωνε λιγότερα με ΠΕΡΙΣΣΟΤΕΡΑ ακίνητα.
  {
    let μονότονη = true
    let προηγ = cheapestFor(1).monthly
    for (let n = 2; n <= 60; n++) {
      const τώρα = cheapestFor(n).monthly
      if (τώρα < προηγ) μονότονη = false
      προηγ = τώρα
    }
    ok(μονότονη, 'το φθηνότερο κόστος δεν πέφτει ποτέ όσο μεγαλώνει το χαρτοφυλάκιο')
  }

  // ── ΤΟ ΣΚΑΛΟΠΑΤΙ ΠΟΥ ΞΑΝΑΓΥΡΙΣΕ, ΓΡΑΜΜΕΝΟ ΩΣ ΓΕΓΟΝΟΣ ────────────────────
  // Δεν είναι επιθυμητό· είναι το τίμημα του να μη διαφημίζεται πρόταση που
  // δεν αγοράζεται. Οταν φτιαχτεί διαδρομή αγοράς για επιπλέον ακίνητα, ή
  // αλλάξουν τα όρια, αυτός ο έλεγχος πέφτει και το μαθαίνουμε εδώ.
  {
    const step = (from: number, to: number) =>
      Math.round((cheapestFor(to).monthly - cheapestFor(from).monthly) * 100) / 100
    ok(step(3, 4) === 15, 'το τέταρτο ακίνητο κοστίζει 15,00 € παραπάνω, γιατί αλλάζει πακέτο')
    ok(step(15, 16) === 55, 'το δέκατο έκτο κοστίζει 55,00 € παραπάνω, για τον ίδιο λόγο')
  }

  // ── Ο σύμβουλος μιλά μόνο όταν υπάρχει πραγματικό όφελος ────────────────
  {
    ok(planAdvice('owner', 3) === null, 'με 3 ακίνητα στον Ιδιοκτήτη+ δεν προτείνει τίποτα')
    ok(planAdvice('free', 1) === null, 'ο δωρεάν χρήστης δεν δέχεται «οικονομική» συμβουλή')
    const a = planAdvice('office', 2)
    ok(a?.plan === 'owner', 'όποιος πληρώνει Επαγγελματία+ για δύο ακίνητα ακούει το φθηνότερο')
    ok((a?.saves ?? 0) === 70, 'και μαθαίνει πόσα γλιτώνει')
    // ΚΡΙΣΙΜΟ: ποτέ πρόταση που ΑΝΕΒΑΖΕΙ το κόστος.
    let ποτέΑκριβότερο = true
    for (let n = 1; n <= 60; n++) {
      for (const plan of (['owner', 'agency', 'office'] as PlanId[])) {
        const adv = planAdvice(plan, n)
        if (adv && adv.monthly >= monthlyPrice(plan)) ποτέΑκριβότερο = false
      }
    }
    ok(ποτέΑκριβότερο, 'ο σύμβουλος ΠΟΤΕ δεν προτείνει ακριβότερο πλάνο')
  }

  // ── Το όριο και η ετικέτα ───────────────────────────────────────────────
  {
    ok(propertyAllowance('owner') === 3, 'ο Ιδιοκτήτης+ χωράει τρία ακίνητα')
    ok(propertyAllowance('agency') === 15, 'ο Επαγγελματίας δεκαπέντε')
    ok(propertyAllowance('office') === Infinity, 'ο Επαγγελματίας+ είναι απεριόριστος')
    ok(propertyAllowance('free') === 1, 'το δωρεάν ένα')
    ok(!/Infinity/.test(propertyLimitLabel('office')), 'η ετικέτα του απεριόριστου δεν γράφει «Infinity»')
    ok(propertyLimitLabel('owner') === '3 ακίνητα', 'η ετικέτα λέει σκέτο το όριο')
    ok(propertyLimitLabel('solo') === '1 ακίνητο', 'και στον ενικό όταν είναι ένα')
  }
}

console.log(`\nbilling/plans.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
