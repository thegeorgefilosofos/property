// ═══════════════════════════════════════════════════════════════════════════
// Η ΠΥΛΗ ΔΙΑΧΕΙΡΙΣΗΣ: ΟΙ ΤΡΕΙΣ ΥΠΟΣΧΕΣΕΙΣ ΤΩΝ ΟΡΩΝ ΓΙΝΟΝΤΑΙ ΑΛΗΘΕΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Οι Οροι δεσμεύονταν σε τρία πράγματα που ο κώδικας ΔΕΝ έκανε:
//
//   «ακυρώνεις οποτεδήποτε μέσα από την εφαρμογή»  — κανένα κουμπί πουθενά.
//   «το παραστατικό θα το βρίσκεις στον Λογαριασμό σου» — καμία λίστα.
//   αλλαγή κάρτας                                   — κανένας τρόπος.
//
// Η πύλη της Stripe τα κάνει και τα τρία, στο δικό της περιβάλλον, χωρίς να
// περάσει ποτέ αριθμός κάρτας από τους δικούς μας διακομιστές. Ενας σύνδεσμος
// μιας χρήσης, που λήγει.
//
// ΔΕΝ ΔΕΧΕΤΑΙ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΠΕΛΑΤΗ ΑΠΟ ΤΟ ΑΙΤΗΜΑ. Θα ήταν εντολή «άνοιξέ μου
// τη χρέωση εκείνου»: η πύλη δείχνει παραστατικά, διεύθυνση και κάρτα. Ο
// πελάτης βρίσκεται από τη ΣΥΝΕΔΡΙΑ και μόνο.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripeClient, stripeConfigError } from '@/lib/billing/stripe';
import { SITE } from '@/lib/core/site';
import * as billing from '@/lib/data/billing';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  const reason = stripeConfigError(process.env);
  if (reason) {
    console.info('[stripe] η πύλη δεν είναι ρυθμισμένη:', reason);
    return NextResponse.json({ available: false, url: null });
  }

  const profile = await billing.profile<{ mor_customer_id: string | null }>(supabase, user.id, 'mor_customer_id');
  const customer = (profile?.mor_customer_id || '').trim();
  // ΧΩΡΙΣ ΣΥΝΔΡΟΜΗ ΔΕΝ ΥΠΑΡΧΕΙ ΠΥΛΗ, και αυτό ΔΕΝ είναι σφάλμα: είναι η
  // κατάσταση του λογαριασμού. Η οθόνη δεν δείχνει κουμπί που δεν οδηγεί.
  if (!customer) return NextResponse.json({ available: false, url: null });

  try {
    const stripe = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer,
      locale: 'el',
      return_url: `${SITE}/dashboard`,
    });
    return NextResponse.json({ available: true, url: session.url });
  } catch (e) {
    console.info('[stripe] η πύλη δεν άνοιξε:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Η διαχείριση συνδρομής δεν άνοιξε.' }, { status: 502 });
  }
}
