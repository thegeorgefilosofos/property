// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΞΑΡΓΥΡΩΣΗ ΤΟΥ ΚΩΔΙΚΟΥ ΔΟΚΙΜΑΣΤΗ
// ─────────────────────────────────────────────────────────────────────────
// ΚΑΜΙΑ ΚΑΡΤΑ, ΚΑΝΕΝΑ ΤΑΜΕΙΟ, ΚΑΜΙΑ ΣΥΝΔΡΟΜΗ ΣΤΟΝ ΕΜΠΟΡΟ. Ο δοκιμαστής κάνει
// χάρη· δεν βγάζει την κάρτα του για να την κάνει. Ο έμπορος ζητά στοιχεία
// κάρτας ακόμη και στα 0,00 €, οπότε ένας εκπτωτικός κωδικός 100% θα εμφάνιζε
// τη φόρμα αντί να τη γλιτώσει — γι' αυτό η ιδιότητα ζει εδώ.
//
// ── Ο ΚΩΔΙΚΟΣ ΔΕΝ ΦΤΑΝΕΙ ΠΟΤΕ ΣΤΟΝ ΠΕΡΙΗΓΗΤΗ ────────────────────────────
// Ζει σε μεταβλητή περιβάλλοντος χωρίς `NEXT_PUBLIC_`, άρα ο Next δεν τον
// στέλνει στη δέσμη. Η σύγκριση γίνεται εδώ, σταθερού χρόνου, και ο χρήστης
// μαθαίνει μόνο «ναι» ή «όχι».
//
// ── ΤΟ ΙΔΙΟ ΜΗΝΥΜΑ ΓΙΑ ΚΑΘΕ ΑΠΟΤΥΧΙΑ ────────────────────────────────────
// «Λάθος κωδικός» και «δεν έχει οριστεί κωδικός» απαντώνται ΙΔΙΑ. Η διαφορά
// τους θα έλεγε σε άγνωστο αν υπάρχει καν πρόγραμμα δοκιμαστών, και θα άξιζε
// τον κόπο να δοκιμάσει.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { testerCodeMatches, testerCodeIsSet, TESTER_CODE_ENV } from '@/lib/billing/testerCode';
import * as billing from '@/lib/data/billing';

const WRONG = { error: 'Ο κωδικός δεν αναγνωρίζεται.' };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  let code: unknown = null;
  try { code = ((await request.json()) as { code?: unknown })?.code; } catch { /* άκυρο σώμα */ }
  if (!testerCodeMatches(code, process.env)) {
    // ΔΥΟ ΠΟΛΥ ΔΙΑΦΟΡΕΤΙΚΕΣ ΑΙΤΙΕΣ, ΙΔΙΑ ΑΠΑΝΤΗΣΗ ΠΡΟΣ ΤΑ ΕΞΩ. Ο χρήστης
    // μαθαίνει μόνο «όχι»· ο διαχειριστής όμως πρέπει να ξεχωρίζει το «έγραψε
    // λάθος» από το «δεν έχει οριστεί κωδικός», γιατί το δεύτερο σημαίνει
    // ξεχασμένη μεταβλητή και ΚΑΝΕΝΑΣ δοκιμαστής δεν θα μπορέσει ποτέ να μπει.
    console.info(testerCodeIsSet(process.env)
      ? '[tester] κωδικός που δεν αναγνωρίζεται'
      : `[tester] δεν έχει οριστεί η ${TESTER_CODE_ENV}· καμία εξαργύρωση δεν μπορεί να πετύχει`);
    return NextResponse.json(WRONG, { status: 403 });
  }

  let db;
  try { db = createServiceClient(); } catch (e) {
    console.info('[tester] πελάτης υπηρεσίας:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Η εξαργύρωση δεν ολοκληρώθηκε.' }, { status: 500 });
  }

  // ΙΔΙΟΔΥΝΑΜΟ ΚΑΙ ΧΩΡΙΣ ΜΕΤΑΚΙΝΗΣΗ ΤΗΣ ΗΜΕΡΟΜΗΝΙΑΣ. Δεύτερη εξαργύρωση από
  // τον ίδιο δεν είναι σφάλμα — είναι κάποιος που ξαναπάτησε το κουμπί.
  //
  // ΚΑΙ Η ΑΝΑΓΝΩΣΗ ΔΕΝ ΣΙΩΠΑ: αν αποτύχει, η ημερομηνία θα ξαναγραφόταν σαν
  // να είναι πρώτη εξαργύρωση, μετακινώντας την προς τα εμπρός.
  const now = new Date().toISOString();
  const { state, error: readError } = await billing.planContext(db, user.id);
  if (readError) {
    console.info('[tester] το προφίλ δεν διαβάστηκε:', readError.message);
    return NextResponse.json({ error: 'Η εξαργύρωση δεν ολοκληρώθηκε.' }, { status: 502 });
  }
  const since = state.testerSince ?? now;

  const { error } = await billing.markTester(db, user.id, since);
  if (error) {
    console.info('[tester] η ιδιότητα δεν γράφτηκε:', error.message);
    return NextResponse.json({ error: 'Η εξαργύρωση δεν ολοκληρώθηκε.' }, { status: 502 });
  }

  console.info('[tester] η ιδιότητα δοκιμαστή δόθηκε');
  return NextResponse.json({ ok: true, since });
}
