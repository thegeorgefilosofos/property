// ═══════════════════════════════════════════════════════════════════════════
// Ο ΔΡΟΜΟΣ ΠΡΟΣ ΤΟ ΤΑΜΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Η ΣΥΝΕΔΡΙΑ ΦΤΙΑΧΝΕΤΑΙ ΣΤΟΝ ΔΙΑΚΟΜΙΣΤΗ, ΚΑΙ ΟΧΙ ΑΠΟ ΣΥΝΗΘΕΙΑ. Κουβαλά ποιος
// πληρώνει και τι αγοράζει· αν την έφτιαχνε ο περιηγητής, οποιοσδήποτε θα
// έβαζε ξένο αναγνωριστικό ή άλλη τιμή.
//
// ── ΤΡΕΙΣ ΕΛΕΓΧΟΙ ΠΡΙΝ ΑΝΟΙΞΕΙ ΤΟ ΤΑΜΕΙΟ ────────────────────────────────
// ΤΑΥΤΟΤΗΤΑ: ο χρήστης έρχεται από τη ΣΥΝΕΔΡΙΑ, όχι από το αίτημα.
// ΠΑΚΕΤΟ: ένας ιδιώτης δεν αγοράζει πακέτο επαγγελματία γράφοντάς το στη
//   διεύθυνση — θα πλήρωνε για καρτέλες που το προφίλ του δεν ανοίγει.
// ΤΙΜΗ: δεν έρχεται από τον πελάτη ΠΟΤΕ. Βρίσκεται στο κατάστημα, από τα
//   `metadata` της ίδιας της τιμής. Ενα `price_id` που θα έστελνε ο περιηγητής
//   θα ήταν εντολή «χρέωσέ με όσο θέλω εγώ».
//
// ── ΚΑΙ ΕΝΑΣ ΠΕΛΑΤΗΣ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ ─────────────────────────────────────
// Χωρίς αυτό, κάθε αγορά γεννά νέο `Customer`: ο ίδιος άνθρωπος αποκτά τρεις
// καρτέλες στη Stripe, το ιστορικό του σπάει σε κομμάτια, και η πύλη
// διαχείρισης δείχνει μόνο ένα από αυτά.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { isPlanAllowedForProfile, type ProfileType } from '@/lib/billing/entitlements';
import { stripeClient, stripeConfigError, taxIsActive } from '@/lib/billing/stripe';
import { catalogue, priceFor, catalogueGaps, trialEndFor, CYCLES, type BillingCycle } from '@/lib/billing/stripePlans';
import { billingWords } from '@/lib/legal/billingWords';
import { SITE } from '@/lib/core/site';
import * as billing from '@/lib/data/billing';

/** Η απάντηση όταν δεν υπάρχει ταμείο. Ιδια διατύπωση με τους Ορους. */
const closed = () => NextResponse.json({ available: false, url: null, note: billingWords().chargingToday });

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  const plan = (request.nextUrl.searchParams.get('plan') || '').trim();
  const cycle = (request.nextUrl.searchParams.get('cycle') || '').trim();
  // ── Η ΕΡΩΤΗΣΗ ΔΕΝ ΕΙΝΑΙ ΑΓΟΡΑ ────────────────────────────────────────
  // Η οθόνη ρωτά «υπάρχει ταμείο;» σε ΚΑΘΕ φόρτωση, για να μη δείξει κουμπί
  // που δεν οδηγεί πουθενά. Η πρώτη γραφή απαντούσε φτιάχνοντας ολόκληρη
  // συνεδρία πληρωμής: κάθε άνοιγμα των Ρυθμίσεων άφηνε από μία αχρησιμοποίητη
  // συνεδρία στον πίνακα της Stripe, και η αγορά έφτιαχνε ΔΕΥΤΕΡΗ.
  const probe = request.nextUrl.searchParams.get('probe') === '1';
  if (!(plan in PLANS) || !CYCLES.includes(cycle as BillingCycle)) {
    return NextResponse.json({ error: 'Αγνωστο πακέτο ή κύκλος.' }, { status: 400 });
  }

  const reason = stripeConfigError(process.env);
  if (reason) {
    // ΤΟ «ΓΙΑΤΙ ΟΧΙ» ΤΑΞΙΔΕΥΕΙ ΜΟΝΟ ΠΡΟΣ ΤΑ ΜΕΣΑ. Ονόματα μεταβλητών δεν
    // εκτίθενται σε δημόσια διεύθυνση.
    console.info('[stripe] η χρέωση δεν είναι ρυθμισμένη:', reason);
    return closed();
  }

  const profile = await billing.profile<{ profile_type: string | null }>(supabase, user.id, 'profile_type');
  const type: ProfileType = profile?.profile_type === 'professional' ? 'professional' : 'individual';
  if (!isPlanAllowedForProfile(type, plan as PlanId)) {
    return NextResponse.json({ error: 'Το πακέτο δεν αντιστοιχεί στον τύπο του λογαριασμού.' }, { status: 403 });
  }

  try {
    const stripe = stripeClient();
    const prices = await stripe.prices.list({ active: true, limit: 100 });
    const cat = catalogue(prices.data);
    const priceId = priceFor(cat, plan as PlanId, cycle as BillingCycle);
    if (!priceId) {
      console.info('[stripe]', catalogueGaps(cat));
      return closed();
    }
    if (probe) return NextResponse.json({ available: true, url: null, note: billingWords().chargingToday });

    const trialEnd = trialEndFor(user.created_at, Date.now());
    const taxOn = await taxIsActive(stripe);
    if (!taxOn) console.info('[stripe] το Stripe Tax δεν είναι ενεργό· η συνεδρία ανοίγει χωρίς αυτόματο υπολογισμό ΦΠΑ');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // ΕΝΑΣ ΠΕΛΑΤΗΣ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ, ΚΑΙ ΤΟ ΚΛΕΙΔΙ ΕΙΝΑΙ ΤΟ ΔΙΚΟ ΜΑΣ
      // ΑΝΑΓΝΩΡΙΣΤΙΚΟ, ΟΧΙ ΤΟ ΤΑΧΥΔΡΟΜΕΙΟ: ο πελάτης μπορεί να πληρώσει με
      // άλλο από αυτό που έχει στην εφαρμογή.
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      subscription_data: {
        // Η ΔΟΚΙΜΗ ΔΕΝ ΞΕΚΙΝΑ ΕΔΩ, ΣΥΝΕΧΙΖΕΤΑΙ. Μετριέται από την εγγραφή· το
        // ταμείο μόνο τη σέβεται όσο της απομένει. Κενό σημαίνει άμεση χρέωση.
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        metadata: { user_id: user.id, plan_id: plan, cycle },
      },
      metadata: { user_id: user.id, plan_id: plan, cycle },
      // Ο ΦΠΑ ΥΠΟΛΟΓΙΖΕΤΑΙ, ΔΕΝ ΥΠΟΤΙΘΕΤΑΙ. Οι τιμές αναγράφονται με ΦΠΑ για
      // καταναλωτή στην Ελλάδα· για πελάτη αλλού ο συντελεστής είναι άλλος και
      // τον βρίσκει το Stripe Tax από τη διεύθυνση που δηλώνεται στο ταμείο.
      // ΜΟΝΟ ΟΜΩΣ ΑΝ ΕΧΕΙ ΕΝΕΡΓΟΠΟΙΗΘΕΙ: αλλιώς η ίδια η δημιουργία της
      // συνεδρίας αποτυγχάνει και δεν πουλιέται τίποτα σε κανέναν.
      automatic_tax: { enabled: taxOn },
      billing_address_collection: 'required',
      // Το ΑΦΜ/VAT του επαγγελματία: χωρίς αυτό δεν βγαίνει σωστό τιμολόγιο.
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      locale: 'el',
      success_url: `${SITE}/dashboard?checkout=ok`,
      cancel_url: `${SITE}/dashboard?checkout=cancel`,
    });

    return NextResponse.json({ available: true, url: session.url, note: billingWords().chargingToday });
  } catch (e) {
    console.info('[stripe] το ταμείο δεν άνοιξε:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Το ταμείο δεν άνοιξε.' }, { status: 502 });
  }
}
