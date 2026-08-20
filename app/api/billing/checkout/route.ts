// ═══════════════════════════════════════════════════════════════════════════
// Ο ΔΡΟΜΟΣ ΠΡΟΣ ΤΟ ΤΑΜΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Ο σύνδεσμος αγοράς ΔΕΝ φτιάχνεται στον περιηγητή, και όχι από συνήθεια:
// κουβαλά το `custom_data.user_id` που λέει στον έμπορο ποιος πληρώνει. Αν τον
// έφτιαχνε ο πελάτης, οποιοσδήποτε θα μπορούσε να βάλει ξένο αναγνωριστικό και
// να πληρώσει τη συνδρομή άλλου — ή, χειρότερα, να στείλει άλλον να πληρώσει τη
// δική του. Εδώ το αναγνωριστικό έρχεται από τη ΣΥΝΕΔΡΙΑ, όχι από το αίτημα.
//
// ΚΑΙ ΤΟ ΠΑΚΕΤΟ ΕΛΕΓΧΕΤΑΙ. Ενας ιδιώτης δεν αγοράζει πακέτο επαγγελματία απλώς
// γράφοντάς το στη διεύθυνση: θα πλήρωνε για καρτέλες που το προφίλ του δεν
// ανοίγει, και το παράπονο θα ερχόταν μετά τη χρέωση.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLANS, type PlanId } from '@/lib/billing/plans';
import { isPlanAllowedForProfile, type ProfileType } from '@/lib/billing/entitlements';
import { parseCheckoutLinks, checkoutUrl } from '@/lib/billing/lemonCheckout';
import type { BillingCycle } from '@/lib/billing/lemon';
import * as billing from '@/lib/data/billing';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  const plan = (request.nextUrl.searchParams.get('plan') || '').trim();
  const cycle = (request.nextUrl.searchParams.get('cycle') || '').trim();
  if (!(plan in PLANS) || (cycle !== 'monthly' && cycle !== 'annual')) {
    return NextResponse.json({ error: 'Αγνωστο πακέτο ή κύκλος.' }, { status: 400 });
  }

  const { map, error } = parseCheckoutLinks(process.env.LEMON_CHECKOUT_LINKS);
  if (error) {
    // ΤΟ «ΓΙΑΤΙ ΟΧΙ» ΤΑΞΙΔΕΥΕΙ ΜΟΝΟ ΠΡΟΣ ΤΑ ΜΕΣΑ. Στην οθόνη πάει σκέτο
    // «δεν είναι διαθέσιμο»: ονόματα μεταβλητών δεν εκτίθενται σε κανέναν.
    console.info('[lemon] σύνδεσμοι αγοράς:', error);
    return NextResponse.json({ available: false, url: null });
  }

  const profile = await billing.profile<{ profile_type: string | null }>(supabase, user.id, 'profile_type');
  const type: ProfileType = profile?.profile_type === 'professional' ? 'professional' : 'individual';
  if (!isPlanAllowedForProfile(type, plan as PlanId)) {
    return NextResponse.json({ error: 'Το πακέτο δεν αντιστοιχεί στον τύπο του λογαριασμού.' }, { status: 403 });
  }

  const url = checkoutUrl(map, plan as PlanId, cycle as BillingCycle, { userId: user.id, email: user.email });
  return NextResponse.json({ available: !!url, url });
}
