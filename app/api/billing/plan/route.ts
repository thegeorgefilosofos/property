// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΛΛΑΓΗ ΠΑΚΕΤΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Τρεις εντελώς διαφορετικοί άνθρωποι πατούν το ίδιο κουμπί.
//
// Ο ΔΟΚΙΜΑΣΤΗΣ δεν έχει συνδρομή στον έμπορο: δεν υπάρχει τίποτα να αλλάξει
// εκεί. Το πακέτο του γράφεται κατευθείαν, όσο συχνά θέλει — αυτό ακριβώς
// ζητήθηκε: «δωρεάν σε ολα τα πακετα, και να μπορουν να εναλλασονται». Και
// χωρίς φραγμό τύπου προφίλ: ο ιδιώτης δεν αγοράζει πακέτο επαγγελματία, αλλά
// ο δοκιμαστής δεν αγοράζει τίποτα — δοκιμάζει.
//
// Ο ΣΥΝΔΡΟΜΗΤΗΣ ΠΟΥ ΑΝΕΒΑΙΝΕΙ πληρώνει αμέσως τη διαφορά των ημερών που
// απομένουν. Την αναλογία τη λογαριάζει ο έμπορος, και τη λογαριάζει σωστά:
// πιστώνει ό,τι έχει ήδη πληρωθεί στο παλιό πακέτο.
//
// Ο ΣΥΝΔΡΟΜΗΤΗΣ ΠΟΥ ΚΑΤΕΒΑΙΝΕΙ δεν παίρνει χρήματα πίσω και δεν χάνει τίποτα
// σήμερα: κρατά ώς την ανανέωση αυτό που έχει πληρώσει. Ο έμπορος δεν ξέρει να
// αναβάλλει, οπότε την αναβολή τη γράφουμε εμείς (hold_plan / hold_until).
//
// ── ΚΑΙ Η ΚΑΤΑΣΤΑΣΗ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟΝ ΕΜΠΟΡΟ, ΟΧΙ ΑΠΟ ΕΜΑΣ ────────────────
// Το προφίλ μας γράφεται από τον webhook, δηλαδή είναι όσο φρέσκο πρόλαβε να
// γίνει. Πριν χρεώσουμε κάρτα ρωτάμε τον ίδιο τον έμπορο: ποια παραλλαγή
// τρέχει, σε ποια κατάσταση, ώς πότε. Ενα καθυστερημένο «δοκιμή» στη δική μας
// πλευρά θα σήμαινε αναβάθμιση χωρίς χρέωση σε κάποιον που ήδη πληρώνει.
//
// ── ΓΙΑΤΙ ΧΡΕΙΑΖΕΤΑΙ ΡΟΛΟΣ ΥΠΗΡΕΣΙΑΣ ────────────────────────────────────
// Οι στήλες `plan`, `billing_cycle`, `hold_plan`, `hold_until` είναι
// κλειδωμένες από τη σκανδάλη `lock_billing_plan`: ο χρήστης με το δημόσιο
// κλειδί δεν τις γράφει, αλλιώς θα αναβάθμιζε τον εαυτό του από την κονσόλα.
// Η απόφαση παίρνεται ΕΔΩ, με τα δεδομένα του εμπόρου, και μόνο μετά γράφεται.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS, PLAN_ORDER, normalizePlan, type PlanId, type BillingCycle } from '@/lib/billing/plans';
import { cycleFromParam, activeHold } from '@/lib/billing/entitlements';
import { parseVariantMap, planOfVariant } from '@/lib/billing/lemon';
import { variantFor, checkoutIsLive } from '@/lib/billing/lemonCheckout';
import { API_KEY_ENV } from '@/lib/billing/lemonApi';
import { classifyChange, planDrops, changePlan, subscriptionState } from '@/lib/billing/lemonPlanChange';
import * as billing from '@/lib/data/billing';

/** Οι καταστάσεις στις οποίες μια συνδρομή δέχεται αλλαγή πακέτου. */
const CHANGEABLE = new Set(['on_trial', 'active', 'past_due']);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  let body: { plan?: unknown; cycle?: unknown } = {};
  try { body = (await request.json()) as typeof body; } catch { /* άκυρο σώμα */ }
  const plan = typeof body.plan === 'string' ? body.plan.trim() : '';
  const cycle = cycleFromParam(typeof body.cycle === 'string' ? body.cycle : null);
  if (!(plan in PLANS)) {
    return NextResponse.json({ error: 'Αγνωστο πακέτο.' }, { status: 400 });
  }
  const target = plan as PlanId;

  let db;
  try { db = createServiceClient(); } catch (e) {
    console.info('[plan] πελάτης υπηρεσίας:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 500 });
  }

  // Η ΑΝΑΓΝΩΣΗ ΔΕΝ ΣΙΩΠΑ. Μια αποτυχία εδώ διαβαζόταν ως «δεν είναι δοκιμαστής»
  // και ο δοκιμαστής θα έπαιρνε 403 στο κουμπί που του υποσχεθήκαμε.
  const { state: profile, error: readError } = await billing.planContext(db, user.id);
  if (readError) {
    console.info('[plan] το προφίλ δεν διαβάστηκε:', readError.message);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 502 });
  }

  // ── Ο ΔΟΚΙΜΑΣΤΗΣ ────────────────────────────────────────────────────────
  if (profile.testerSince) {
    const { error } = await billing.applyPlanChange(db, user.id, {
      plan: target, cycle, holdPlan: null, holdUntil: null,
    });
    if (error) {
      console.info('[plan] η αλλαγή δοκιμαστή δεν γράφτηκε:', error.message);
      return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 502 });
    }
    console.info(`[plan] δοκιμαστής: ${target}/${cycle}`);
    return NextResponse.json({ ok: true, plan: target, cycle, kind: 'tester' });
  }

  // ── ΧΩΡΙΣ ΣΥΝΔΡΟΜΗ ΔΕΝ ΥΠΑΡΧΕΙ ΤΙ ΝΑ ΑΛΛΑΞΕΙ ───────────────────────────
  // Η πρώτη αγορά γίνεται από το ταμείο, με κάρτα. Μια απευθείας γραφή εδώ θα
  // έδινε πληρωμένο πακέτο χωρίς πληρωμή, και ο επόμενος webhook θα το
  // ξανάγραφε από κάτω του.
  const subscriptionId = (profile.subscriptionId || '').trim();
  if (!subscriptionId) {
    return NextResponse.json({ error: 'Δεν υπάρχει συνδρομή για αλλαγή. Η πρώτη αγορά γίνεται από το ταμείο.' }, { status: 403 });
  }

  if (!checkoutIsLive(process.env)) {
    console.info('[plan] η χρέωση δεν είναι ρυθμισμένη');
    return NextResponse.json({ error: 'Η αλλαγή πακέτου δεν είναι διαθέσιμη αυτή τη στιγμή.' }, { status: 503 });
  }
  const apiKey = (process.env[API_KEY_ENV] || '').trim();
  const variantId = variantFor(process.env, target, cycle);
  if (!variantId) {
    console.info(`[plan] καμία παραλλαγή για «${target}:${cycle}»`);
    return NextResponse.json({ error: 'Η αλλαγή πακέτου δεν είναι διαθέσιμη αυτή τη στιγμή.' }, { status: 503 });
  }

  // ── ΠΟΥ ΒΡΙΣΚΕΤΑΙ ΤΩΡΑ Η ΣΥΝΔΡΟΜΗ, ΚΑΤΑ ΤΟΝ ΕΜΠΟΡΟ ────────────────────
  const { after: before, error: readErr } = await subscriptionState(subscriptionId, apiKey);
  if (readErr || !before) {
    console.info('[plan] η συνδρομή δεν διαβάστηκε:', readErr);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 502 });
  }
  if (!before.status || !CHANGEABLE.has(before.status)) {
    console.info(`[plan] κατάσταση «${before.status}»: δεν αλλάζει πακέτο`);
    return NextResponse.json({ error: 'Η συνδρομή δεν είναι ενεργή. Η αλλαγή γίνεται από τη διαχείριση συνδρομής.' }, { status: 409 });
  }
  if (before.variantId === variantId) {
    // Ιδιοδύναμο: δεύτερο πάτημα στο ίδιο πακέτο δεν είναι σφάλμα.
    return NextResponse.json({ ok: true, plan: target, cycle, kind: 'same' });
  }

  // ΤΟ ΣΗΜΕΙΟ ΑΦΕΤΗΡΙΑΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗΝ ΠΑΡΑΛΛΑΓΗ ΤΟΥ ΕΜΠΟΡΟΥ, με το προφίλ
  // μας ως εφεδρεία: ο χάρτης παραλλαγών μπορεί να μη γνωρίζει μια παραλλαγή
  // που δημιουργήθηκε στο κατάστημα χωρίς να μπει στη μεταβλητή.
  const { map } = parseVariantMap(process.env.LEMON_VARIANTS);
  const known = before.variantId ? planOfVariant(map, before.variantId) : null;
  const from = {
    plan: known?.plan ?? normalizePlan(profile.plan),
    cycle: (known?.cycle ?? cycleFromParam(profile.cycle)) as BillingCycle,
  };
  const to = { plan: target, cycle };

  // ── ΤΙ ΕΧΕΙ ΗΔΗ ΠΛΗΡΩΘΕΙ ΓΙΑ ΤΗΝ ΤΡΕΧΟΥΣΑ ΠΕΡΙΟΔΟ ──────────────────────
  // ΟΧΙ ΑΠΑΡΑΙΤΗΤΑ ΑΥΤΟ ΠΟΥ ΤΡΕΧΕΙ. Οποιος υποβαθμίστηκε χθες έχει `plan` το
  // χαμηλό και κράτηση στο ψηλό: η περίοδος είναι πληρωμένη στο ΨΗΛΟ. Δύο
  // λάθη γεννιούνται αν το αγνοήσουμε, και τα δύο κοστίζουν σε πραγματικά
  // χρήματα ή σε πρόσβαση:
  //
  //   • ΔΕΥΤΕΡΗ ΥΠΟΒΑΘΜΙΣΗ (Επαγγελματίας → Ιδιοκτήτης+ → Ιδιοκτήτης): η νέα
  //     κράτηση θα γραφόταν στο «Ιδιοκτήτης+» και ο πελάτης θα έχανε σήμερα
  //     τον «Επαγγελματία» που έχει πληρώσει.
  //   • ΜΕΤΑΝΙΩΜΕΝΗ ΥΠΟΒΑΘΜΙΣΗ (Επαγγελματίας → Ιδιοκτήτης, και μετά πίσω σε
  //     Ιδιοκτήτης+): θα μετρούσε ως αναβάθμιση και θα ΧΡΕΩΝΕ αναλογικά, ενώ
  //     η περίοδος είναι ήδη πληρωμένη σε ανώτερο επίπεδο.
  //
  // Και τα δύο λύνονται με μία γραμμή: συγκρίνουμε με ό,τι έχει πληρωθεί.
  //
  // ΤΟ ΟΡΙΟ ΤΟΥ ΚΑΝΟΝΑ, ΓΡΑΜΜΕΝΟ: η κράτηση κρατά ΠΑΚΕΤΟ, όχι κύκλο. Οταν μια
  // υποβάθμιση άλλαξε ΚΑΙ τον κύκλο, η σύγκριση κύκλου γίνεται με τον
  // τρέχοντα. Πρακτικά αφορά όποιον αλλάζει κύκλο δύο φορές μέσα στην ίδια
  // περίοδο, και η χειρότερη συνέπεια είναι μια αναλογική χρέωση που θα
  // μπορούσε να είχε περιμένει την ανανέωση.
  const held = activeHold({ plan: profile.plan, holdPlan: profile.holdPlan, holdUntil: profile.holdUntil });
  const paidPlan: PlanId = held && PLAN_ORDER.indexOf(held.plan) > PLAN_ORDER.indexOf(from.plan)
    ? held.plan : from.plan;
  const paid = { plan: paidPlan, cycle: from.cycle };

  const kind = classifyChange(paid, to);
  const onTrial = before.status === 'on_trial';

  const { after, error } = await changePlan(
    { subscriptionId, variantId, kind, onTrial, trialEndsAt: before.trialEndsAt },
    apiKey,
  );
  if (error || !after) {
    console.info('[plan] ο έμπορος δεν δέχτηκε την αλλαγή:', error);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 502 });
  }

  // ── Η ΚΡΑΤΗΣΗ ───────────────────────────────────────────────────────────
  // Μόνο όταν πέφτει το ΠΑΚΕΤΟ. Η αλλαγή κύκλου δεν αφαιρεί καμία δυνατότητα,
  // οπότε δεν υπάρχει τίποτα να κρατηθεί — και μια κράτηση στο ίδιο πακέτο θα
  // ήταν θόρυβος που η οθόνη θα έπρεπε μετά να εξηγήσει.
  //
  // Η ΗΜΕΡΟΜΗΝΙΑ ΕΙΝΑΙ Η ΑΝΑΝΕΩΣΗ ΟΠΩΣ ΤΗΝ ΕΙΠΕ Ο ΕΜΠΟΡΟΣ, και προτιμάται
  // εκείνη ΜΕΤΑ την αλλαγή: αν η αλλαγή μετακίνησε τον κύκλο, η παλιά θα ήταν
  // λάθος προς τη μία ή την άλλη κατεύθυνση.
  const until = (after.renewsAt || before.renewsAt || '').trim();
  const holds = planDrops(paid, to) && !!until;
  const { error: writeError } = await billing.applyPlanChange(db, user.id, {
    plan: target, cycle,
    holdPlan: holds ? paidPlan : null,
    holdUntil: holds ? until : null,
  });
  if (writeError) {
    // Ο ΕΜΠΟΡΟΣ ΑΛΛΑΞΕ, ΕΜΕΙΣ ΟΧΙ. Δεν είναι σιωπηλό: ο επόμενος webhook θα
    // γράψει το πακέτο, αλλά ΟΧΙ την κράτηση — και ο πελάτης που υποβαθμίστηκε
    // θα χάσει σήμερα ό,τι πλήρωσε για τον μήνα.
    console.info('[plan] ο έμπορος άλλαξε αλλά το προφίλ δεν γράφτηκε:', writeError.message);
    return NextResponse.json({ error: 'Η αλλαγή έγινε, αλλά δεν καταγράφηκε. Επικοινώνησε μαζί μας.' }, { status: 502 });
  }

  console.info(`[plan] ${kind}: ${from.plan}/${from.cycle} → ${target}/${cycle} (πληρωμένο ${paidPlan})${holds ? `, κράτηση ώς ${until}` : ''}${onTrial ? ', μέσα σε δοκιμή' : ''}`);
  return NextResponse.json({
    ok: true, plan: target, cycle, kind,
    holdPlan: holds ? paidPlan : null,
    holdUntil: holds ? until : null,
  });
}
