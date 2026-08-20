// ═══════════════════════════════════════════════════════════════════════════
// Ο WEBHOOK ΤΟΥ ΕΜΠΟΡΟΥ: ΕΔΩ ΓΙΝΕΤΑΙ ΠΡΑΓΜΑΤΙΚΗ Η ΠΛΗΡΩΜΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο πελάτης πληρώνει στη Lemon Squeezy. Η εφαρμογή το μαθαίνει ΜΟΝΟ από εδώ.
// Αν αυτή η διαδρομή αποτύχει σιωπηλά, ο άνθρωπος έχει χρεωθεί και δεν έχει
// πάρει τίποτα — το χειρότερο σφάλμα που μπορεί να έχει ένα προϊόν.
//
// ── ΤΕΣΣΕΡΙΣ ΑΠΟΦΑΣΕΙΣ ───────────────────────────────────────────────────
//
// ΤΟ ΣΩΜΑ ΔΙΑΒΑΖΕΤΑΙ ΩΜΟ, ΠΡΙΝ ΑΠΟ ΚΑΘΕ ΑΛΛΟ. Η υπογραφή υπολογίζεται πάνω στα
// ίδια ακριβώς bytes που έστειλε ο έμπορος. Ενα `request.json()` πρώτα και
// `JSON.stringify` μετά αλλάζει κενά, και κάθε γνήσιο γεγονός θα απορριπτόταν.
//
// Η ΑΠΑΝΤΗΣΗ ΛΕΕΙ ΤΗΝ ΑΛΗΘΕΙΑ ΣΤΟΝ ΕΜΠΟΡΟ. Ενα βολικό «200 σε όλα» κρύβει τις
// αποτυχίες από τον πίνακα της Lemon Squeezy — που είναι το μόνο μέρος όπου θα
// τις δει ποτέ κανείς. Γεγονός που δεν μας αφορά παίρνει 200· γεγονός που δεν
// καταλάβαμε ή δεν γράφτηκε παίρνει σφάλμα, ώστε να ξαναδοκιμαστεί και να
// φανεί.
//
// ΤΟ «ΓΙΑΤΙ ΟΧΙ» ΜΕΝΕΙ ΜΕΣΑ. Στα αρχεία καταγραφής γράφεται ονομαστικά τι
// έφταιξε· στην απάντηση πάει μόνο κωδικός. Ονόματα μεταβλητών και δομή της
// βάσης δεν εκτίθενται σε δημόσια διεύθυνση.
//
// ΤΑ ΚΑΘΥΣΤΕΡΗΜΕΝΑ ΓΕΓΟΝΟΤΑ ΔΕΝ ΓΡΑΦΟΥΝ ΠΑΝΩ ΑΠΟ ΤΑ ΝΕΟΤΕΡΑ. Τα webhook δεν
// φτάνουν με σειρά. Οταν ο έμπορος στέλνει ώρα τελευταίας μεταβολής, κρατιέται
// και συγκρίνεται· όταν δεν τη στέλνει, το γεγονός εφαρμόζεται — δεν
// εφευρίσκουμε ώρα για να δικαιολογήσουμε απόρριψη.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifySignature, SIGNATURE_HEADER, SECRET_ENV } from '@/lib/billing/lemonSignature';
import { readSubscriptionEvent, parseVariantMap, planOfVariant, isEntitled } from '@/lib/billing/lemon';

/** Ο πίνακας που κρατά το πακέτο του κάθε λογαριασμού. */
const TABLE = 'billing_profiles';

const log = (...parts: unknown[]) => console.info('[lemon]', ...parts);

export async function POST(request: Request) {
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get(SIGNATURE_HEADER), process.env[SECRET_ENV])) {
    // ΔΕΝ ΛΕΕΙ ΑΝ ΕΦΤΑΙΓΕ Η ΥΠΟΓΡΑΦΗ Ή ΤΟ ΜΥΣΤΙΚΟ. Η διεύθυνση είναι δημόσια·
    // η διαφορά των δύο μηνυμάτων θα έλεγε σε άγνωστο αν έχουμε ρυθμιστεί.
    log('υπογραφή που δεν επαληθεύεται');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch {
    log('σώμα που δεν είναι JSON');
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const read = readSubscriptionEvent(payload);
  if (!read.ok) {
    // ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ ΠΡΑΓΜΑΤΑ, ΔΥΟ ΑΠΑΝΤΗΣΕΙΣ. Γεγονός παραγγελίας δεν μας
    // αφορά και είναι φυσιολογικό — 200. Γεγονός συνδρομής που δεν διαβάστηκε
    // είναι πρόβλημα και πρέπει να φανεί στον πίνακα του εμπόρου.
    const ours = String((payload as { meta?: { event_name?: unknown } })?.meta?.event_name || '').startsWith('subscription_');
    log('γεγονός που δεν εφαρμόστηκε:', read.reason);
    return NextResponse.json({ ok: !ours }, { status: ours ? 422 : 200 });
  }

  const { map, error: mapError } = parseVariantMap(process.env.LEMON_VARIANTS);
  if (mapError) {
    log('ο χάρτης παραλλαγών δεν διαβάστηκε:', mapError);
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const sub = read.sub;
  const variant = planOfVariant(map, sub.variantId);
  if (!variant) {
    // ΠΑΡΑΛΛΑΓΗ ΕΚΤΟΣ ΧΑΡΤΗ ΔΕΝ ΑΝΑΒΑΘΜΙΖΕΙ ΚΑΝΕΝΑΝ, και δεν υποβαθμίζει κιόλας:
    // πιθανότερο είναι να λείπει μια εγγραφή από τη ρύθμιση παρά να πούλησε ο
    // έμπορος κάτι ανύπαρκτο. Το γεγονός μένει ακράτητο ώστε να ξαναέρθει.
    log(`παραλλαγή «${sub.variantId}» εκτός χάρτη· το γεγονός ${read.event} δεν εφαρμόστηκε`);
    return NextResponse.json({ error: 'unknown_variant' }, { status: 422 });
  }

  let db;
  try { db = createServiceClient(); } catch (e) {
    log('πελάτης υπηρεσίας:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  // ── ΠΟΙΟΝ ΑΦΟΡΑ ─────────────────────────────────────────────────────────
  // Πρώτα το `custom_data.user_id` που ταξίδεψε από το ταμείο. Οταν λείπει —
  // γεγονός που γεννήθηκε από τον πίνακα του εμπόρου, όχι από checkout — ο
  // λογαριασμός βρίσκεται από τη ΣΥΝΔΡΟΜΗ που έχει ήδη καταγραφεί. Το
  // ηλεκτρονικό ταχυδρομείο ΔΕΝ χρησιμοποιείται: ο πελάτης μπορεί να πλήρωσε με
  // άλλο από αυτό που έχει στην εφαρμογή, και μια τέτοια αντιστοίχιση θα
  // ενεργοποιούσε ξένη συνδρομή σε λάθος λογαριασμό.
  let userId = sub.userId;
  if (!userId) {
    const { data, error } = await db.from(TABLE)
      .select('user_id').eq('mor_subscription_id', sub.id).maybeSingle();
    if (error) {
      log('η αναζήτηση προφίλ απέτυχε:', error.message);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 502 });
    }
    userId = (data as { user_id?: string } | null)?.user_id ?? null;
  }
  if (!userId) {
    log(`το γεγονός ${read.event} για τη συνδρομή ${sub.id} δεν αντιστοιχεί σε λογαριασμό`);
    return NextResponse.json({ error: 'no_account' }, { status: 422 });
  }

  // ── ΤΑ ΚΑΘΥΣΤΕΡΗΜΕΝΑ ΔΕΝ ΓΡΑΦΟΥΝ ΠΑΝΩ ΑΠΟ ΤΑ ΝΕΟΤΕΡΑ ────────────────────
  const attrs = (payload as { data?: { attributes?: Record<string, unknown> } })?.data?.attributes ?? {};
  const eventAt = typeof attrs.updated_at === 'string' && attrs.updated_at.trim() ? attrs.updated_at.trim() : null;
  if (eventAt) {
    // ΚΑΙ ΑΥΤΗ Η ΑΝΑΓΝΩΣΗ ΚΟΙΤΑ ΤΟ ΣΦΑΛΜΑ ΤΗΣ. Αν αποτύχει, το `data` έρχεται
    // κενό — δηλαδή «καμία προηγούμενη ώρα», δηλαδή «εφάρμοσε το γεγονός».
    // Η κατεύθυνση είναι η ασφαλής, αλλά η αποτυχία δεν επιτρέπεται να είναι
    // αόρατη: αν το φίλτρο σειράς σταματήσει να δουλεύει, θέλουμε να το ξέρουμε
    // πριν γράψει ένα καθυστερημένο «ακυρώθηκε» πάνω από ένα «ανανεώθηκε».
    const { data, error: readError } = await db.from(TABLE)
      .select('mor_event_at').eq('user_id', userId).maybeSingle();
    if (readError) log('η ώρα του τελευταίου γεγονότος δεν διαβάστηκε:', readError.message);
    const seen = (data as { mor_event_at?: string | null } | null)?.mor_event_at;
    if (seen && new Date(eventAt) < new Date(seen)) {
      log(`γεγονός ${read.event} παλαιότερο από το καταγεγραμμένο· αγνοήθηκε`);
      return NextResponse.json({ ok: true, skipped: 'stale' });
    }
  }

  // ΤΟ ΠΑΚΕΤΟ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗΝ ΚΑΤΑΣΤΑΣΗ, ΟΧΙ ΑΠΟ ΤΟ ΟΝΟΜΑ ΤΟΥ ΓΕΓΟΝΟΤΟΣ. Οσο
  // η συνδρομή ισχύει, δίνει ό,τι αγοράστηκε· μόλις πάψει, ο λογαριασμός πέφτει
  // στο «χωρίς συνδρομή» και όχι σε κάτι ενδιάμεσο που δεν πλήρωσε κανείς.
  const entitled = isEntitled(sub, new Date().toISOString());

  const { error } = await db.from(TABLE).update({
    plan: entitled ? variant.plan : 'free',
    billing_cycle: variant.cycle === 'annual' ? 'annual' : 'monthly',
    subscription_status: sub.status,
    mor_customer_id: sub.customerId || null,
    mor_subscription_id: sub.id,
    mor_variant_id: sub.variantId,
    mor_renews_at: sub.renewsAt,
    mor_ends_at: sub.endsAt,
    mor_event_at: eventAt,
  }).eq('user_id', userId);

  if (error) {
    // 502 ΚΑΙ ΟΧΙ 200: η Lemon Squeezy ξαναδοκιμάζει τα αποτυχημένα. Ενα
    // βολικό 200 εδώ σημαίνει πληρωμένη συνδρομή που δεν ενεργοποιήθηκε ποτέ,
    // και κανένα ίχνος πουθενά.
    log('η εγγραφή του προφίλ απέτυχε:', error.message);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  log(`${read.event}: ${variant.plan}/${variant.cycle}, κατάσταση ${sub.status}, πρόσβαση ${entitled ? 'ναι' : 'όχι'}`);
  return NextResponse.json({ ok: true });
}
