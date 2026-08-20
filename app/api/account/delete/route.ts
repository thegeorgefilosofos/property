// ═══════════════════════════════════════════════════════════════════════════
// Η ΔΙΑΓΡΑΦΗ ΛΟΓΑΡΙΑΣΜΟΥ ΣΒΗΝΕΙ ΚΑΙ ΤΗ ΣΥΝΔΡΟΜΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΣΥΝΕΒΑΙΝΕ. Η οθόνη καλούσε κατευθείαν τη `delete_my_account`, που σβήνει
// κάθε γραμμή του λογαριασμού και τον ίδιο τον χρήστη. Η συνδρομή όμως δεν ζει
// στη ΔΙΚΗ μας βάση: ζει στον έμπορο. Ο λογαριασμός εξαφανιζόταν, το προφίλ
// χρέωσης με το αναγνωριστικό της συνδρομής εξαφανιζόταν μαζί του — και η
// κάρτα συνέχιζε να χρεώνεται κάθε μήνα, χωρίς κανέναν λογαριασμό απέναντι και
// χωρίς κανένα κουμπί για να σταματήσει. Χρήματα από άνθρωπο που έφυγε.
//
// ── Η ΣΕΙΡΑ ΕΙΝΑΙ ΟΛΟΚΛΗΡΗ Η ΔΟΥΛΕΙΑ ────────────────────────────────────
// Το αναγνωριστικό της συνδρομής διαβάζεται ΠΡΩΤΑ: μετά τη διαγραφή δεν
// υπάρχει πουθενά, και καμία δεύτερη προσπάθεια δεν θα ήταν δυνατή.
//
// ── ΚΑΙ ΑΝ Ο ΕΜΠΟΡΟΣ ΔΕΝ ΑΠΑΝΤΗΣΕΙ, Η ΔΙΑΓΡΑΦΗ ΔΕΝ ΠΡΟΧΩΡΑ ──────────────
// Η απόφαση δεν είναι αυτονόητη, γιατί απέναντι στέκει το δικαίωμα διαγραφής
// (άρθρο 17 GDPR). Ομως μια διαγραφή που αφήνει πίσω της ζωντανή χρέωση δεν
// είναι διαγραφή: είναι αφαίρεση κάθε τρόπου να τη σταματήσει ο άνθρωπος. Το
// αίτημα απορρίπτεται με μήνυμα που λέει ΤΙ να κάνει και ξαναδοκιμάζεται
// αμέσως — δεν χάνεται δικαίωμα, καθυστερεί λίγα λεπτά.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkoutIsLive } from '@/lib/billing/lemonCheckout';
import { API_KEY_ENV } from '@/lib/billing/lemonApi';
import { subscriptionState, cancelSubscription, needsCancelling } from '@/lib/billing/lemonPlanChange';
import * as billing from '@/lib/data/billing';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });

  // ── ΠΡΩΤΑ Η ΣΥΝΔΡΟΜΗ, ΟΣΟ ΥΠΑΡΧΕΙ ΑΚΟΜΗ ΤΟ ΠΡΟΦΙΛ ────────────────────
  const { state, error: readError } = await billing.planContext(supabase, user.id);
  if (readError) {
    console.info('[delete] το προφίλ χρέωσης δεν διαβάστηκε:', readError.message);
    return NextResponse.json({ error: 'Η διαγραφή δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο.' }, { status: 502 });
  }

  const subscriptionId = (state.subscriptionId || '').trim();
  if (subscriptionId && checkoutIsLive(process.env)) {
    const apiKey = (process.env[API_KEY_ENV] || '').trim();
    const { after, error } = await subscriptionState(subscriptionId, apiKey);
    if (error || !after) {
      console.info('[delete] η συνδρομή δεν διαβάστηκε:', error);
      return NextResponse.json({ error: 'Δεν μπορέσαμε να ελέγξουμε τη συνδρομή σου, οπότε δεν προχωρήσαμε: δεν θέλουμε να χρεώνεται κάρτα λογαριασμού που δεν υπάρχει. Δοκίμασε ξανά σε λίγο.' }, { status: 502 });
    }
    if (needsCancelling(after.status)) {
      const out = await cancelSubscription(subscriptionId, apiKey);
      if (out.error) {
        console.info('[delete] η ακύρωση της συνδρομής απέτυχε:', out.error);
        return NextResponse.json({ error: 'Η συνδρομή σου δεν ακυρώθηκε, οπότε δεν προχωρήσαμε στη διαγραφή: δεν θέλουμε να συνεχίσει να χρεώνεται η κάρτα σου. Ακύρωσε πρώτα τη συνδρομή από τη διαχείριση συνδρομής, ή δοκίμασε ξανά σε λίγο.' }, { status: 502 });
      }
      console.info(`[delete] η συνδρομή ${subscriptionId} ακυρώθηκε πριν τη διαγραφή`);
    } else {
      console.info(`[delete] η συνδρομή ${subscriptionId} ήταν ήδη «${after.status}»`);
    }
  }

  // ── ΚΑΙ ΜΕΤΑ Ο ΛΟΓΑΡΙΑΣΜΟΣ ────────────────────────────────────────────
  // Με τη ΣΥΝΕΔΡΙΑ του χρήστη και όχι με ρόλο υπηρεσίας: η `delete_my_account`
  // διαβάζει το `auth.uid()` και σβήνει ΜΟΝΟ τον εαυτό του. Ο ρόλος υπηρεσίας
  // δεν έχει `auth.uid()`, οπότε δεν θα έσβηνε κανέναν — και θα έφτιαχνε μια
  // διαδρομή που, με λάθος αναγνωριστικό, θα έσβηνε οποιονδήποτε.
  const { data, error } = await supabase.rpc('delete_my_account');
  if (error) {
    console.info('[delete] η διαγραφή δεν ολοκληρώθηκε:', error.message);
    return NextResponse.json({ error: 'Ο λογαριασμός δεν διαγράφηκε. Δοκίμασε ξανά σε λίγο.' }, { status: 502 });
  }

  // Ο απολογισμός περνά αυτούσιος: η οθόνη λέει τι έμεινε πίσω στον
  // αποθηκευτικό χώρο, και αυτό το ξέρει μόνο η συνάρτηση της βάσης.
  return NextResponse.json(data ?? { ok: true });
}
