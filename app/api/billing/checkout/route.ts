// ═══════════════════════════════════════════════════════════════════════════
// Ο ΔΡΟΜΟΣ ΠΡΟΣ ΤΟ ΤΑΜΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΤΑΜΕΙΟ ΦΤΙΑΧΝΕΤΑΙ ΕΔΩ, ΚΑΙ ΟΧΙ ΑΠΟ ΣΥΝΗΘΕΙΑ. Κουβαλά ποιος πληρώνει, τι
// αγοράζει και — το κρισιμότερο — ΑΝ ΔΙΚΑΙΟΥΤΑΙ ΔΟΚΙΜΗ. Αν το έφτιαχνε ο
// περιηγητής, οποιοσδήποτε θα έβαζε ξένο αναγνωριστικό, άλλη παραλλαγή, ή θα
// ζητούσε δοκιμή που έχει ήδη ξοδέψει.
//
// ── ΤΕΣΣΕΡΙΣ ΕΛΕΓΧΟΙ ΠΡΙΝ ΑΝΟΙΞΕΙ ───────────────────────────────────────
// ΤΑΥΤΟΤΗΤΑ: ο χρήστης έρχεται από τη ΣΥΝΕΔΡΙΑ, όχι από το αίτημα.
// ΠΑΚΕΤΟ: ένας ιδιώτης δεν αγοράζει πακέτο επαγγελματία γράφοντάς το στη
//   διεύθυνση — θα πλήρωνε για καρτέλες που το προφίλ του δεν ανοίγει.
// ΔΟΚΙΜΑΣΤΗΣ: όποιος έχει την ιδιότητα ΔΕΝ πληρώνει ποτέ. Το ταμείο δεν
//   ανοίγει καν γι' αυτόν — δεν υπάρχει τίποτα να αγοράσει.
// ΔΟΚΙΜΗ: μία ανά ΛΟΓΑΡΙΑΣΜΟ. Δεύτερη συνδρομή στον ίδιο λογαριασμό ζητά
//   `skip_trial`, αλλιώς η ακύρωση την τρίτη ημέρα και ένα νέο πάτημα δίνουν
//   καθαρές 30 ημέρες, επ' άπειρον.
//
// ── ΚΑΙ Η ΕΡΩΤΗΣΗ ΔΕΝ ΕΙΝΑΙ ΑΓΟΡΑ ───────────────────────────────────────
// Η οθόνη ρωτά «υπάρχει ταμείο;» σε κάθε φόρτωση, για να μη δείξει κουμπί που
// δεν οδηγεί πουθενά. Με `probe=1` απαντάμε από τη ρύθμιση, ΧΩΡΙΣ να ζητήσουμε
// ταμείο από τον έμπορο: αλλιώς κάθε άνοιγμα των Ρυθμίσεων θα άφηνε από μία
// αχρησιμοποίητη συνεδρία πληρωμής στον πίνακά του.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLANS, type PlanId, type BillingCycle } from '@/lib/billing/plans';
import { isPlanAllowedForProfile, type ProfileType } from '@/lib/billing/entitlements';
import { merchant } from '@/lib/billing/merchant';
import { billingWords } from '@/lib/legal/billingWords';
import { SITE } from '@/lib/core/site';
import * as billing from '@/lib/data/billing';

/** Ο σύνδεσμος πληρωμής δεν ζει για πάντα σε ένα ιστορικό περιηγητή. */
const LINK_MINUTES = 30;

/** Η απάντηση όταν δεν υπάρχει ταμείο. Ιδια διατύπωση με τους Ορους. */
const closed = () => NextResponse.json({ available: false, url: null, note: billingWords().chargingToday });

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  const plan = (request.nextUrl.searchParams.get('plan') || '').trim();
  const cycle = (request.nextUrl.searchParams.get('cycle') || '').trim();
  const probe = request.nextUrl.searchParams.get('probe') === '1';
  if (!(plan in PLANS) || (cycle !== 'monthly' && cycle !== 'annual')) {
    return NextResponse.json({ error: 'Αγνωστο πακέτο ή κύκλος.' }, { status: 400 });
  }

  const mor = merchant();
  if (!mor.isLive(process.env)) {
    // ΤΟ «ΓΙΑΤΙ ΟΧΙ» ΤΑΞΙΔΕΥΕΙ ΜΟΝΟ ΠΡΟΣ ΤΑ ΜΕΣΑ. Ονόματα μεταβλητών δεν
    // εκτίθενται σε δημόσια διεύθυνση.
    console.info(`[${mor.id}] η χρέωση δεν είναι ρυθμισμένη`);
    return closed();
  }

  const profile = await billing.profile<{
    profile_type: string | null; trial_used_at: string | null;
    tester_since: string | null; full_name: string | null;
  }>(supabase, user.id, 'profile_type, trial_used_at, tester_since, full_name');

  // Ο ΔΟΚΙΜΑΣΤΗΣ ΔΕΝ ΕΧΕΙ ΤΙ ΝΑ ΑΓΟΡΑΣΕΙ. Δεν είναι σφάλμα, είναι η κατάστασή
  // του: το προϊόν του δίνεται ολόκληρο και χωρίς συνδρομή στον έμπορο.
  if (profile?.tester_since) {
    return NextResponse.json({ available: false, url: null, tester: true });
  }

  // ── Ο ΤΥΠΟΣ ΠΡΟΦΙΛ ΚΡΙΝΕΙ ΜΟΝΟ ΟΤΑΝ ΕΧΕΙ ΔΗΛΩΘΕΙ ───────────────────────
  // Ο έλεγχος υπάρχει ώστε να μην αγοράσει ιδιώτης πακέτο επαγγελματία
  // γράφοντάς το στη διεύθυνση: θα πλήρωνε για καρτέλες που το προφίλ του δεν
  // ανοίγει ποτέ. Ομως ο τύπος δηλώνεται στο καλωσόρισμα, δηλαδή ΜΕΤΑ την
  // εγγραφή και η παλιά γραμμή «ό,τι δεν είναι επαγγελματίας είναι ιδιώτης»
  // έκανε τον έλεγχο να απαντά 403 σε ΚΑΘΕ νέο λογαριασμό που πάτησε
  // «Επαγγελματία» στον τιμοκατάλογο: η ακριβότερη πώληση κοβόταν στην πόρτα.
  //
  // Οπου δεν υπάρχει δήλωση δεν υπάρχει και αντίφαση. Τον τύπο τον γράφει ο
  // webhook, μόλις τον αποδείξει η ίδια η αγορά.
  const declared = (profile?.profile_type || '').trim();
  const isDeclared = (v: string): v is ProfileType => v === 'individual' || v === 'professional';
  if (isDeclared(declared) && !isPlanAllowedForProfile(declared, plan as PlanId)) {
    return NextResponse.json({ error: 'Το πακέτο δεν αντιστοιχεί στον τύπο του λογαριασμού.' }, { status: 403 });
  }

  if (probe) return NextResponse.json({ available: true, url: null, note: billingWords().chargingToday });

  // Η ΔΙΑΔΡΟΜΗ ΔΕΝ ΞΕΡΕΙ ΤΙ ΕΙΝΑΙ ΠΑΡΑΛΛΑΓΗ. Ζητά «Ιδιοκτήτης+, ετήσια» και
  // παίρνει διεύθυνση: η μετάφραση στη γλώσσα του παρόχου ζει στη θύρα.
  const { url, error } = await mor.openCheckout({
    buyer: { userId: user.id, email: user.email, name: profile?.full_name },
    plan: plan as PlanId,
    cycle: cycle as BillingCycle,
    redirectUrl: `${SITE}/dashboard?checkout=ok`,
    // Η ΔΟΚΙΜΗ ΕΙΝΑΙ ΜΙΑ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ. Το πότε δόθηκε το γράφει ο webhook,
    // όταν δει την πρώτη συνδρομή σε δοκιμή — όχι εδώ: ένα ταμείο που άνοιξε
    // και εγκαταλείφθηκε δεν πρέπει να καίει τη δοκιμή κανενός.
    skipTrial: !!profile?.trial_used_at,
    expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000).toISOString(),
  }, process.env);

  if (error) {
    console.info(`[${mor.id}] το ταμείο δεν άνοιξε:`, error);
    return NextResponse.json({ error: 'Το ταμείο δεν άνοιξε.' }, { status: 502 });
  }
  return NextResponse.json({ available: !!url, url, note: billingWords().chargingToday });
}
