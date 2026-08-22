// ═══════════════════════════════════════════════════════════════════════════
// Η ΠΟΡΤΑ ΤΟΥ ΤΑΧΥΔΡΟΜΕΙΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Εδώ φτάνει το «ήρθε μήνυμα στην ιδιωτική διεύθυνση κάποιου». Η διαδρομή
// είναι δημόσια, όπως κάθε webhook, και ο διαμεσολαβητής ΔΕΝ την προστατεύει:
// φυλάει τον εαυτό της με την υπογραφή του παρόχου.
//
// ── ΠΕΝΤΕ ΑΠΟΦΑΣΕΙΣ ──────────────────────────────────────────────────────
//
// ΤΟ ΣΩΜΑ ΔΙΑΒΑΖΕΤΑΙ ΩΜΟ, ΠΡΙΝ ΑΠΟ ΚΑΘΕ ΑΛΛΟ. Η υπογραφή υπολογίζεται πάνω στα
// ίδια ακριβώς bytes που έστειλε ο πάροχος.
//
// ΤΟ ΚΕΙΜΕΝΟ ΤΟΥ ΜΗΝΥΜΑΤΟΣ ΔΕΝ ΕΡΧΕΤΑΙ ΑΠΟ ΕΔΩ. Το γεγονός δίνει μόνο
// μεταδεδομένα· το σώμα το ζητάμε ΕΜΕΙΣ από τον πάροχο, με το κλειδί μας.
//
// Η ΑΠΑΝΤΗΣΗ ΛΕΕΙ ΤΗΝ ΑΛΗΘΕΙΑ. Γεγονός που δεν μας αφορά παίρνει 200· γεγονός
// παραλαβής που δεν διαβάστηκε παίρνει 422· αποτυχία δική μας παίρνει 5xx,
// ώστε ο πάροχος να ξαναδοκιμάσει και να φανεί στον πίνακά του. Ενα βολικό
// «200 σε όλα» σημαίνει λογαριασμοί που χάνονται χωρίς κανένα ίχνος.
//
// ΤΟ ΙΔΙΟ ΜΗΝΥΜΑ ΔΕΝ ΓΙΝΕΤΑΙ ΔΥΟ ΠΡΟΤΑΣΕΙΣ. Τα webhook επαναλαμβάνονται· το
// `unique (user_id, provider_id)` το κόβει στη βάση, όχι στην καλή μας πρόθεση.
//
// ΤΟ «ΓΙΑΤΙ ΟΧΙ» ΜΕΝΕΙ ΜΕΣΑ. Στα αρχεία καταγραφής γράφεται ονομαστικά τι
// έφταιξε· στην απάντηση πάει μόνο κωδικός. Και ΠΟΤΕ το κουπόνι: η καταγραφή
// είναι το τελευταίο μέρος όπου θέλουμε γραμμένο ένα μυστικό.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createServiceClient, serviceClientError } from '@/lib/supabase/service';
import { verifySignature, SECRET_ENV } from '@/lib/inbound/signature';
import { readReceivedEvent } from '@/lib/inbound/event';
import { tokenFromRecipients, INBOUND_DOMAIN, DOMAIN_ENV } from '@/lib/inbound/address';
import { fetchBody, KEY_ENV } from '@/lib/inbound/fetchBody';
import { parseInbound } from '@/lib/inbound/parse';
import * as inbound from '@/lib/data/inbound';
import * as hintStore from '@/lib/data/categoryHints';
import { categoryWithHints } from '@/lib/expenses/hints';
import { classifyExpense } from '@/lib/expenses/classify';

const log = (...parts: unknown[]) => console.info('[inbound]', ...parts);

export async function POST(request: Request) {
  const raw = await request.text();

  if (!verifySignature(raw, request.headers, process.env[SECRET_ENV])) {
    // ΔΕΝ ΛΕΕΙ ΑΝ ΕΦΤΑΙΓΕ Η ΥΠΟΓΡΑΦΗ Ή ΤΟ ΜΥΣΤΙΚΟ. Η διαφορά των δύο
    // μηνυμάτων θα έλεγε σε άγνωστο αν έχουμε ρυθμιστεί.
    log('υπογραφή που δεν επαληθεύεται');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch {
    log('σώμα που δεν είναι JSON');
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const read = readReceivedEvent(payload);
  if (!read.ok) {
    log('γεγονός που δεν εφαρμόστηκε:', read.reason);
    return NextResponse.json({ ok: !read.ours }, { status: read.ours ? 422 : 200 });
  }
  const event = read.event;

  if (!INBOUND_DOMAIN) {
    // ΧΩΡΙΣ ΤΟΜΕΑ ΔΕΝ ΞΕΡΟΥΜΕ ΠΟΙΑ ΔΙΕΥΘΥΝΣΗ ΕΙΝΑΙ ΔΙΚΗ ΜΑΣ. Το 500 είναι
    // σωστό: κάτι δικό μας λείπει, και πρέπει να φαίνεται μέχρι να μπει.
    log(`λείπει το ${DOMAIN_ENV}`);
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const token = tokenFromRecipients(event.recipients, INBOUND_DOMAIN);
  if (!token) {
    // Μήνυμα σε διεύθυνση που δεν είναι κουπόνι (π.χ. σε ανθρώπινη διεύθυνση
    // του ίδιου τομέα), ή σε δύο κουπόνια μαζί. Δεν είναι σφάλμα του παρόχου
    // και δεν διορθώνεται με επανάληψη.
    log('κανένας δικός μας παραλήπτης');
    return NextResponse.json({ ok: true, stored: false });
  }

  const missing = serviceClientError(process.env);
  if (missing) {
    log('ο πελάτης υπηρεσίας δεν δημιουργήθηκε:', missing);
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }
  const db = createServiceClient();

  const { row: box, error: boxError } = await inbound.mailboxOfToken(db, token);
  if (boxError) {
    log('η αναζήτηση της διεύθυνσης απέτυχε:', boxError.message);
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }
  if (!box || !box.active) {
    // Κουπόνι που δεν υπάρχει ή που περιστράφηκε. Η σιωπή είναι σκόπιμη: μια
    // διαφορετική απάντηση θα έλεγε σε άγνωστο ποια κουπόνια είναι ζωντανά.
    log('διεύθυνση που δεν παραλαμβάνει');
    return NextResponse.json({ ok: true, stored: false });
  }

  const body = await fetchBody(event.emailId, process.env[KEY_ENV]);
  if (!body.ok) {
    // 502 ΚΑΙ ΟΧΙ 200: χωρίς κείμενο δεν υπάρχει πρόταση δαπάνης. Ο πάροχος
    // ξαναδοκιμάζει, και η αποτυχία φαίνεται στον πίνακά του.
    log('το σώμα δεν ήρθε:', body.reason);
    return NextResponse.json({ error: 'body_unavailable' }, { status: 502 });
  }

  const parsed = parseInbound({
    from: event.from, subject: event.subject,
    text: body.body.text, html: body.body.html,
  });

  // Ο ΚΑΝΟΝΑΣ ΤΟΥ ΙΔΙΟΚΤΗΤΗ ΝΙΚΑ ΤΗΝ ΤΑΞΙΝΟΜΙΑ. Οποιος διόρθωσε μία φορά την
  // κατηγορία αυτού του παρόχου δεν τη διορθώνει ξανά: το λεξικό είναι καλό και
  // δεν μπορεί να ξέρει ότι ο «Ζαχαρόπουλος» είναι υδραυλικός.
  //
  // Η ΑΠΟΤΥΧΙΑ ΤΗΣ ΑΝΑΓΝΩΣΗΣ ΔΕΝ ΡΙΧΝΕΙ ΤΟ ΜΗΝΥΜΑ. Χωρίς κανόνες μένει η
  // πρόταση της ταξινομίας, που είναι ό,τι ίσχυε ούτως ή άλλως πριν.
  const { rows: hints, error: hintError } = await hintStore.forUser(db, box.user_id);
  if (hintError) log('οι κανόνες κατηγοριών δεν διαβάστηκαν:', hintError.message);
  const chosen = categoryWithHints(hintStore.asHints(hints), parsed.vendor, parsed.category);
  // ΟΜΑΔΑ ΚΑΙ ΕΚΠΕΣΙΜΟΤΗΤΑ ΑΚΟΛΟΥΘΟΥΝ ΤΗΝ ΚΑΤΗΓΟΡΙΑ, ΠΑΝΤΑ. Μια κατηγορία που
  // αλλάζει χωρίς την ομάδα της δίνει δαπάνη που φαίνεται εκπεστέα σε μία οθόνη
  // και μη εκπεστέα στην άλλη.
  const cls = chosen.learned ? classifyExpense(chosen.category) : parsed;

  const { error } = await inbound.record(db, {
    userId: box.user_id,
    providerId: event.emailId,
    from: event.from,
    subject: event.subject,
    vendor: parsed.vendor,
    amount: parsed.amount,
    dueDate: parsed.dueDate,
    issueDate: parsed.issueDate,
    category: cls.category,
    expenseGroup: cls.group,
    attachments: event.attachments,
  });

  if (error) {
    // ΤΟ ΔΙΠΛΟ ΔΕΝ ΕΙΝΑΙ ΑΠΟΤΥΧΙΑ. Το ίδιο μήνυμα ξαναήρθε· η πρόταση υπάρχει
    // ήδη και ο πάροχος δεν έχει τίποτα να ξανακάνει.
    if (inbound.isDuplicate(error)) {
      log('το ίδιο μήνυμα ξαναήρθε, η πρόταση υπάρχει');
      return NextResponse.json({ ok: true, stored: false });
    }
    log('η εγγραφή του εισερχομένου απέτυχε:', error.message);
    return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  log(`νέα πρόταση δαπάνης: ${cls.category}${chosen.learned ? ' (κανόνας του ιδιοκτήτη)' : ''}${parsed.amount === null ? ', χωρίς ποσό' : ''}${parsed.missing.length ? `, λείπουν ${parsed.missing.join(' και ')}` : ''}`);
  return NextResponse.json({ ok: true, stored: true });
}
