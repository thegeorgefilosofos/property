// ═══════════════════════════════════════════════════════════════════════════
// Η ΠΥΛΗ ΔΙΑΧΕΙΡΙΣΗΣ: ΟΙ ΤΡΕΙΣ ΥΠΟΣΧΕΣΕΙΣ ΤΩΝ ΟΡΩΝ ΓΙΝΟΝΤΑΙ ΑΛΗΘΕΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Οι Οροι δεσμεύονταν σε τρία πράγματα που ο κώδικας ΔΕΝ έκανε:
//
//   «ακυρώνεις οποτεδήποτε μέσα από την εφαρμογή»  — κανένα κουμπί πουθενά.
//   «το παραστατικό θα το βρίσκεις στον Λογαριασμό σου» — καμία λίστα.
//   αλλαγή κάρτας                                   — κανένας τρόπος.
//
// Η πύλη του εμπόρου τα κάνει και τα τρία, στο δικό του περιβάλλον, χωρίς να
// περάσει ποτέ αριθμός κάρτας από τους δικούς μας διακομιστές.
//
// ── Ο ΣΥΝΔΕΣΜΟΣ ΖΗΤΕΙΤΑΙ ΤΗ ΣΤΙΓΜΗ ΤΟΥ ΠΑΤΗΜΑΤΟΣ, ΔΕΝ ΑΠΟΘΗΚΕΥΕΤΑΙ ────────
// Οι σύνδεσμοι της πύλης είναι ΥΠΟΓΕΓΡΑΜΜΕΝΟΙ ΚΑΙ ΛΗΓΟΥΝ. Κρατημένος στη βάση
// από το τελευταίο γεγονός του webhook, ένας τέτοιος σύνδεσμος θα ήταν
// άχρηστος ακριβώς τη μέρα που ο πελάτης θέλει να ακυρώσει — δηλαδή θα έσπαγε
// στη χειρότερη δυνατή στιγμή και σιωπηλά. Ζητείται φρέσκος, κάθε φορά.
//
// ΔΕΝ ΔΕΧΕΤΑΙ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΣΥΝΔΡΟΜΗΣ ΑΠΟ ΤΟ ΑΙΤΗΜΑ. Θα ήταν εντολή «άνοιξέ
// μου τη χρέωση εκείνου»: η πύλη δείχνει παραστατικά, διεύθυνση και κάρτα. Η
// συνδρομή βρίσκεται από τη ΣΥΝΕΔΡΙΑ και μόνο.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { merchant } from '@/lib/billing/merchant';
import * as billing from '@/lib/data/billing';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  const mor = merchant();
  if (!mor.canTalk(process.env)) {
    console.info(`[${mor.id}] η πύλη δεν είναι ρυθμισμένη:`, mor.configError(process.env));
    return NextResponse.json({ available: false, url: null });
  }

  const profile = await billing.profile<{ mor_subscription_id: string | null }>(supabase, user.id, 'mor_subscription_id');
  const subscriptionId = (profile?.mor_subscription_id || '').trim();
  // ΧΩΡΙΣ ΣΥΝΔΡΟΜΗ ΔΕΝ ΥΠΑΡΧΕΙ ΠΥΛΗ και αυτό ΔΕΝ είναι σφάλμα: είναι η
  // κατάσταση του λογαριασμού. Η οθόνη δεν δείχνει κουμπί που δεν οδηγεί.
  if (!subscriptionId) return NextResponse.json({ available: false, url: null });

  const { url, error } = await mor.portalUrl(subscriptionId, process.env);
  if (error) {
    console.info(`[${mor.id}] η πύλη δεν άνοιξε:`, error);
    return NextResponse.json({ error: 'Η διαχείριση συνδρομής δεν άνοιξε.' }, { status: 502 });
  }
  return NextResponse.json({ available: !!url, url });
}
