// ═══════════════════════════════════════════════════════════════════════════
// Ο WEBHOOK: ΕΔΩ ΓΙΝΕΤΑΙ ΠΡΑΓΜΑΤΙΚΗ Η ΠΛΗΡΩΜΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο πελάτης πληρώνει στη Stripe. Η εφαρμογή το μαθαίνει ΜΟΝΟ από εδώ. Αν αυτή
// η διαδρομή αποτύχει σιωπηλά, ο άνθρωπος έχει χρεωθεί και δεν έχει πάρει
// τίποτα — το χειρότερο σφάλμα που μπορεί να έχει ένα προϊόν.
//
// ── ΤΕΣΣΕΡΙΣ ΑΠΟΦΑΣΕΙΣ ───────────────────────────────────────────────────
//
// ΤΟ ΣΩΜΑ ΔΙΑΒΑΖΕΤΑΙ ΩΜΟ, ΠΡΙΝ ΑΠΟ ΚΑΘΕ ΑΛΛΟ. Η υπογραφή υπολογίζεται πάνω στα
// ίδια ακριβώς bytes που έστειλε η Stripe. Ενα `request.json()` πρώτα και
// `JSON.stringify` μετά αλλάζει κενά, και κάθε γνήσιο γεγονός θα απορριπτόταν.
//
// Η ΑΠΑΝΤΗΣΗ ΛΕΕΙ ΤΗΝ ΑΛΗΘΕΙΑ ΣΤΟΝ ΠΑΡΟΧΟ. Ενα βολικό «200 σε όλα» κρύβει τις
// αποτυχίες από τον πίνακα της Stripe — το μόνο μέρος όπου θα τις δει ποτέ
// κανείς. Γεγονός που δεν μας αφορά παίρνει 200· γεγονός που δεν γράφτηκε
// παίρνει σφάλμα, ώστε να ξαναδοκιμαστεί και να φανεί.
//
// ΤΟ ΠΑΚΕΤΟ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗΝ ΤΙΜΗ, ΟΧΙ ΑΠΟ ΤΟ ΟΝΟΜΑ ΤΟΥ ΓΕΓΟΝΟΤΟΣ. Καμία
// χειρόγραφη αντιστοίχιση: κάθε τιμή του καταστήματος φέρει `metadata.plan_id`
// και `metadata.cycle`, και ο κατάλογος διαβάζεται από τη Stripe.
//
// ΤΑ ΚΑΘΥΣΤΕΡΗΜΕΝΑ ΓΕΓΟΝΟΤΑ ΔΕΝ ΓΡΑΦΟΥΝ ΠΑΝΩ ΑΠΟ ΤΑ ΝΕΟΤΕΡΑ. Τα webhook δεν
// φτάνουν με σειρά· η ώρα του γεγονότος κρατιέται και συγκρίνεται.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripeClient, stripeConfigError, WEBHOOK_ENV } from '@/lib/billing/stripe';
import { catalogue, planOfPrice, readSubscription, isEntitled, isoFrom } from '@/lib/billing/stripePlans';

const TABLE = 'billing_profiles';
const log = (...parts: unknown[]) => console.info('[stripe]', ...parts);

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('stripe-signature');
  const secret = (process.env[WEBHOOK_ENV] || '').trim();

  const configError = stripeConfigError(process.env);
  if (configError || !secret) {
    log('ο webhook δεν είναι ρυθμισμένος:', configError || `λείπει η ${WEBHOOK_ENV}`);
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const stripe = stripeClient();
  let event;
  try {
    // ΧΩΡΙΣ ΥΠΟΓΡΑΦΗ ΔΕΝ ΠΕΡΝΑ ΤΙΠΟΤΑ. Η διεύθυνση είναι δημόσια: χωρίς αυτόν
    // τον έλεγχο, οποιοσδήποτε στέλνει «αναβάθμισέ με σε Επαγγελματίας+».
    event = await stripe.webhooks.constructEventAsync(raw, signature ?? '', secret);
  } catch (e) {
    // ΔΕΝ ΛΕΕΙ ΑΝ ΕΦΤΑΙΓΕ Η ΥΠΟΓΡΑΦΗ Ή ΤΟ ΜΥΣΤΙΚΟ: η διαφορά των δύο μηνυμάτων
    // θα έλεγε σε άγνωστο αν έχουμε ρυθμιστεί.
    log('υπογραφή που δεν επαληθεύεται:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // ── ΠΟΙΑ ΓΕΓΟΝΟΤΑ ΜΑΣ ΑΦΟΡΟΥΝ ─────────────────────────────────────────
  // Ολα τα `customer.subscription.*` κουβαλούν την ΤΡΕΧΟΥΣΑ κατάσταση. Το
  // `checkout.session.completed` δεν την κουβαλά — δηλώνει μόνο ότι το ταμείο
  // έκλεισε — οπότε από εκεί ζητάμε τη συνδρομή και τη διαβάζουμε ολόκληρη.
  let subscriptionRaw: unknown = null;

  if (event.type.startsWith('customer.subscription.')) {
    subscriptionRaw = event.data.object;
  } else if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { subscription?: unknown; client_reference_id?: unknown };
    const subId = typeof session.subscription === 'string' ? session.subscription : '';
    if (!subId) return NextResponse.json({ ok: true, skipped: 'no_subscription' });
    subscriptionRaw = await stripe.subscriptions.retrieve(subId);
  } else {
    return NextResponse.json({ ok: true, skipped: event.type });
  }

  const read = readSubscription(subscriptionRaw);
  if (!read.ok) {
    log('η συνδρομή δεν διαβάστηκε:', read.reason);
    return NextResponse.json({ error: 'unreadable' }, { status: 422 });
  }
  const sub = read.sub;

  let db;
  try { db = createServiceClient(); } catch (e) {
    log('πελάτης υπηρεσίας:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  // ── ΠΟΙΟΝ ΑΦΟΡΑ ───────────────────────────────────────────────────────
  // Πρώτα το `metadata.user_id` που ταξίδεψε από το ταμείο. Οταν λείπει —
  // γεγονός που γεννήθηκε από τον πίνακα της Stripe — ο λογαριασμός βρίσκεται
  // από τη ΣΥΝΔΡΟΜΗ ή τον ΠΕΛΑΤΗ που έχει ήδη καταγραφεί. Το ηλεκτρονικό
  // ταχυδρομείο ΔΕΝ χρησιμοποιείται: ο πελάτης μπορεί να πλήρωσε με άλλο από
  // αυτό που έχει στην εφαρμογή, και μια τέτοια αντιστοίχιση θα ενεργοποιούσε
  // ξένη συνδρομή σε λάθος λογαριασμό.
  let userId = sub.userId;
  if (!userId) {
    const { data, error } = await db.from(TABLE)
      .select('user_id')
      .or(`mor_subscription_id.eq.${sub.id}${sub.customerId ? `,mor_customer_id.eq.${sub.customerId}` : ''}`)
      .limit(1).maybeSingle();
    if (error) {
      log('η αναζήτηση προφίλ απέτυχε:', error.message);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 502 });
    }
    userId = (data as { user_id?: string } | null)?.user_id ?? null;
  }
  if (!userId) {
    log(`το γεγονός ${event.type} για τη συνδρομή ${sub.id} δεν αντιστοιχεί σε λογαριασμό`);
    return NextResponse.json({ error: 'no_account' }, { status: 422 });
  }

  // ── ΤΑ ΚΑΘΥΣΤΕΡΗΜΕΝΑ ΔΕΝ ΓΡΑΦΟΥΝ ΠΑΝΩ ΑΠΟ ΤΑ ΝΕΟΤΕΡΑ ──────────────────
  const eventAt = isoFrom(event.created);
  if (eventAt) {
    const { data, error: readError } = await db.from(TABLE)
      .select('mor_event_at').eq('user_id', userId).maybeSingle();
    if (readError) log('η ώρα του τελευταίου γεγονότος δεν διαβάστηκε:', readError.message);
    const seen = (data as { mor_event_at?: string | null } | null)?.mor_event_at;
    if (seen && new Date(eventAt) < new Date(seen)) {
      log(`γεγονός ${event.type} παλαιότερο από το καταγεγραμμένο· αγνοήθηκε`);
      return NextResponse.json({ ok: true, skipped: 'stale' });
    }
  }

  // ── ΤΙ ΑΓΟΡΑΣΤΗΚΕ ─────────────────────────────────────────────────────
  const prices = await stripe.prices.list({ active: true, limit: 100 });
  const bought = sub.priceId ? planOfPrice(catalogue(prices.data), sub.priceId) : null;
  if (!bought) {
    // ΤΙΜΗ ΕΚΤΟΣ ΚΑΤΑΛΟΓΟΥ ΔΕΝ ΑΝΑΒΑΘΜΙΖΕΙ ΚΑΝΕΝΑΝ, και δεν υποβαθμίζει
    // κιόλας: πιθανότερο είναι να λείπει σήμανση από την τιμή παρά να πούλησε
    // η Stripe κάτι ανύπαρκτο. Το γεγονός μένει ακράτητο ώστε να ξαναέρθει.
    log(`η τιμή «${sub.priceId}» δεν φέρει σήμανση πακέτου· το ${event.type} δεν εφαρμόστηκε`);
    return NextResponse.json({ error: 'unknown_price' }, { status: 422 });
  }

  // ΟΣΟ Η ΣΥΝΔΡΟΜΗ ΙΣΧΥΕΙ ΔΙΝΕΙ Ο,ΤΙ ΑΓΟΡΑΣΤΗΚΕ· μόλις πάψει, ο λογαριασμός
  // πέφτει στο «χωρίς συνδρομή» και όχι σε κάτι ενδιάμεσο που δεν πλήρωσε κανείς.
  const entitled = isEntitled(sub.status);

  const { error } = await db.from(TABLE).update({
    plan: entitled ? bought.plan : 'free',
    billing_cycle: bought.cycle === 'annual' ? 'annual' : 'monthly',
    subscription_status: sub.status,
    mor_customer_id: sub.customerId,
    mor_subscription_id: sub.id,
    mor_variant_id: sub.priceId,
    // Η ΑΝΑΝΕΩΣΗ ΚΑΙ Η ΛΗΞΗ ΕΙΝΑΙ Η ΙΔΙΑ ΗΜΕΡΟΜΗΝΙΑ ΜΕ ΑΛΛΟ ΝΟΗΜΑ: όταν έχει
    // ζητηθεί ακύρωση, το τέλος της περιόδου είναι λήξη· αλλιώς είναι ανανέωση.
    mor_renews_at: sub.cancelAtPeriodEnd ? null : sub.periodEnd,
    mor_ends_at: sub.cancelAtPeriodEnd ? sub.periodEnd : null,
    mor_event_at: eventAt,
  }).eq('user_id', userId);

  if (error) {
    // 502 ΚΑΙ ΟΧΙ 200: η Stripe ξαναδοκιμάζει τα αποτυχημένα. Ενα βολικό 200
    // εδώ σημαίνει πληρωμένη συνδρομή που δεν ενεργοποιήθηκε ποτέ, και κανένα
    // ίχνος πουθενά.
    log('η εγγραφή του προφίλ απέτυχε:', error.message);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  log(`${event.type}: ${bought.plan}/${bought.cycle}, κατάσταση ${sub.status}, πρόσβαση ${entitled ? 'ναι' : 'όχι'}`);
  return NextResponse.json({ ok: true });
}
