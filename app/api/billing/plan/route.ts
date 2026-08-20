// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΛΛΑΓΗ ΠΑΚΕΤΟΥ ΤΟΥ ΔΟΚΙΜΑΣΤΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο δοκιμαστής δεν έχει συνδρομή στον έμπορο: δεν υπάρχει τίποτα να αλλάξει
// εκεί. Το πακέτο του γράφεται κατευθείαν, όσο συχνά θέλει — αυτό ακριβώς
// ζητήθηκε: «δωρεάν σε όλα τα πακέτα, και να μπορούν να εναλλάσσονται».
//
// ΚΑΙ ΧΩΡΙΣ ΦΡΑΓΜΟ ΤΥΠΟΥ ΠΡΟΦΙΛ. Ο ιδιώτης δεν αγοράζει πακέτο επαγγελματία —
// αλλά ο δοκιμαστής δεν αγοράζει τίποτα: δοκιμάζει. Το να του κλείσουμε τα
// μισά πακέτα θα ακύρωνε τον λόγο που του δώσαμε τον κωδικό.
//
// ── ΓΙΑΤΙ ΧΡΕΙΑΖΕΤΑΙ ΡΟΛΟΣ ΥΠΗΡΕΣΙΑΣ ────────────────────────────────────
// Η στήλη `plan` είναι κλειδωμένη από τη σκανδάλη `lock_billing_plan`: ο
// χρήστης με το δημόσιο κλειδί δεν τη γράφει, αλλιώς θα αναβάθμιζε τον εαυτό
// του από την κονσόλα του περιηγητή. Η απόφαση «είναι δοκιμαστής» παίρνεται
// ΕΔΩ, με τα δικά μας δεδομένα, και μόνο μετά γράφεται.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PLANS } from '@/lib/billing/plans';
import * as billing from '@/lib/data/billing';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  let body: { plan?: unknown; cycle?: unknown } = {};
  try { body = (await request.json()) as typeof body; } catch { /* άκυρο σώμα */ }
  const plan = typeof body.plan === 'string' ? body.plan.trim() : '';
  const cycle = body.cycle === 'annual' ? 'annual' : 'monthly';
  if (!(plan in PLANS)) {
    return NextResponse.json({ error: 'Αγνωστο πακέτο.' }, { status: 400 });
  }

  let db;
  try { db = createServiceClient(); } catch (e) {
    console.info('[plan] πελάτης υπηρεσίας:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 500 });
  }

  // Η ΑΝΑΓΝΩΣΗ ΔΕΝ ΣΙΩΠΑ. Μια αποτυχία εδώ διαβαζόταν ως «δεν είναι δοκιμαστής»
  // και ο δοκιμαστής θα έπαιρνε 403 στο κουμπί που του υποσχεθήκαμε.
  const { state, error: readError } = await billing.testerState(db, user.id);
  if (readError) {
    console.info('[plan] το προφίλ δεν διαβάστηκε:', readError.message);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 502 });
  }

  // ΜΟΝΟ Ο ΔΟΚΙΜΑΣΤΗΣ ΠΕΡΝΑ ΑΠΟ ΕΔΩ. Ο συνδρομητής αλλάζει πακέτο στον έμπορο,
  // με αναλογική χρέωση· μια απευθείας γραφή εδώ θα του έδινε ανώτερο πακέτο
  // χωρίς να πληρώσει, και ο επόμενος webhook θα το ξανάγραφε από κάτω του.
  if (!state.testerSince) {
    return NextResponse.json({ error: 'Η αλλαγή πακέτου γίνεται από τη διαχείριση συνδρομής.' }, { status: 403 });
  }

  const { error } = await billing.setPlan(db, user.id, plan, cycle);
  if (error) {
    console.info('[plan] η αλλαγή δεν γράφτηκε:', error.message);
    return NextResponse.json({ error: 'Η αλλαγή δεν ολοκληρώθηκε.' }, { status: 502 });
  }

  console.info(`[plan] δοκιμαστής: ${plan}/${cycle}`);
  return NextResponse.json({ ok: true, plan, cycle });
}
