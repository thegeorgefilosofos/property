// ═══════════════════════════════════════════════════════════════════════════
// Η ΠΡΩΙΝΗ ΔΙΑΔΡΟΜΗ: ΠΟΙΟΣ ΠΡΕΠΕΙ ΝΑ ΞΕΡΕΙ ΚΑΤΙ ΣΗΜΕΡΑ, ΚΑΙ ΤΟ ΜΑΘΑΙΝΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Καλείται ΜΙΑ φορά την ημέρα από το χρονοδιάγραμμα της βάσης, με το ίδιο
// κοινό μυστικό που χρησιμοποιούν ήδη οι υπόλοιπες εργασίες. Κανένας άνθρωπος
// δεν είναι μπροστά, άρα καμία συνεδρία δεν υπάρχει να ελεγχθεί.
//
// ── ΤΕΣΣΕΡΙΣ ΑΠΟΦΑΣΕΙΣ ───────────────────────────────────────────────────
//
// ΣΙΩΠΗ ΟΤΑΝ ΔΕΝ ΥΠΑΡΧΕΙ ΛΟΓΟΣ. Η `dailyPush` επιστρέφει `null` όταν δεν λήγει
// τίποτα και τότε η συσκευή δεν χτυπά. Μια «καλημέρα, όλα καλά» κάθε πρωί
// είναι ο πιο σίγουρος τρόπος να κλείσει ο χρήστης τις ειδοποιήσεις πριν έρθει
// εκείνη που μετράει.
//
// ΚΑΘΕ ΧΡΗΣΤΗΣ ΔΙΑΒΑΖΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΟΧΙ ΜΙΑ ΑΝΑ ΣΥΣΚΕΥΗ. Κινητό, tablet και
// υπολογιστής του ίδιου ανθρώπου δίνουν τρεις γραμμές και ΕΝΑ μήνυμα.
//
// Η ΝΕΚΡΗ ΣΥΝΔΡΟΜΗ ΦΕΥΓΕΙ, Η ΑΠΟΤΥΧΗΜΕΝΗ ΜΕΝΕΙ. 404 και 410 σημαίνουν «αυτή η
// διεύθυνση δεν υπάρχει πια»· οτιδήποτε άλλο σημαίνει «όχι τώρα».
//
// ΜΙΑ ΑΠΟΤΥΧΙΑ ΕΝΟΣ ΔΕΝ ΣΤΑΜΑΤΑ ΤΟΥΣ ΥΠΟΛΟΙΠΟΥΣ. Η εργασία τρέχει μέχρι το
// τέλος και απαντά με τον απολογισμό της· τα σφάλματα ζουν στα αρχεία
// καταγραφής, όχι σε μια πρόωρη έξοδο.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { createServiceClient, serviceClientError, SERVICE_CLIENT_LOG } from '@/lib/supabase/service';
import { cronSecretOk, CRON_SECRET_ENV } from '@/lib/api/cronSecret';
import * as devices from '@/lib/data/pushSubscriptions';
import * as properties from '@/lib/data/properties';
import * as calendar from '@/lib/data/calendar';
import * as checklist from '@/lib/data/checklist';
import * as bills from '@/lib/data/bills';
import * as rent from '@/lib/data/rent';
import {
  deadlineItems, type DeadlineProperty, type DeadlineEvent, type DeadlineTask,
  type DeadlineBill, type DeadlineRent,
} from '@/lib/calendar/deadlines';
import { dailyPush, alreadySentToday, HORIZON_DAYS } from '@/lib/push/message';
import { sendPush, vapidKeys } from '@/lib/push/send';
import { endpointHost } from '@/lib/push/subscription';
import { athensToday, athensDatePlus } from '@/lib/core/time';

/**
 * Πόσο πίσω κοιτά η ειδοποίηση.
 *
 * Το εκπρόθεσμο δεν παύει να είναι εκπρόθεσμο την επόμενη μέρα, αλλά μετά από
 * έναν μήνα δεν είναι υπενθύμιση: είναι ιστορία και η ίδια ειδοποίηση κάθε
 * πρωί για πάντα εκπαιδεύει τον χρήστη να την αγνοεί.
 */
const DAYS_BACK = 30;

/** Μετά από τόσες συνεχόμενες αποτυχίες, η γραμμή δεν αξίζει άλλη προσπάθεια. */
const MAX_FAILURES = 5;

const log = (...parts: unknown[]) => console.info('[push]', ...parts);

export async function POST(request: Request) {
  if (!cronSecretOk(request.headers, process.env[CRON_SECRET_ENV])) {
    // ΔΕΝ ΛΕΕΙ ΑΝ ΕΦΤΑΙΓΕ ΤΟ ΜΥΣΤΙΚΟ Η Η ΑΠΟΥΣΙΑ ΤΟΥ. Η διαφορά θα έλεγε σε
    // άγνωστο αν η εγκατάσταση είναι ρυθμισμένη.
    log('κλήση χωρίς το μυστικό του χρονοδιαγράμματος');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const keys = vapidKeys(process.env);
  if ('missing' in keys) {
    log(`λείπει το ${keys.missing}`);
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const missing = serviceClientError(process.env);
  if (missing) {
    log(SERVICE_CLIENT_LOG, missing);
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const db = createServiceClient();

  const { rows, error } = await devices.all(db);
  if (error) {
    log('οι συνδρομές δεν διαβάστηκαν:', error.message);
    return NextResponse.json({ error: 'read_failed' }, { status: 502 });
  }

  const today = athensToday();
  const from = athensDatePlus(-DAYS_BACK);
  const to = athensDatePlus(HORIZON_DAYS);

  // Μία ανάγνωση ανά ΑΝΘΡΩΠΟ, όσες συσκευές κι αν έχει.
  const byUser = new Map<string, devices.SendRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row); else byUser.set(row.user_id, [row]);
  }

  let sent = 0, quiet = 0, dropped = 0, failed = 0, skipped = 0;

  for (const [userId, subs] of byUser) {
    const due = subs.filter(s => !alreadySentToday(s.last_sent_at, today, athensToday));
    skipped += subs.length - due.length;
    if (!due.length) continue;

    const [props, events, tasks, unpaidBills, dues] = await Promise.all([
      properties.list<DeadlineProperty>(db, userId, { columns: 'id,name' }),
      calendar.ofUserInRange<DeadlineEvent>(db, userId, from, to, 'id,property_id,title,event_date,amount,notes,status'),
      checklist.openOfUser<DeadlineTask>(db, userId, 'id,property_id,description,due_date,note'),
      bills.ofUser<DeadlineBill>(db, userId, 'id,property_id,name,type,amount,due_date,paid',
        { unpaid: true, dueFrom: from, dueTo: to }),
      rent.ofUser<DeadlineRent>(db, userId, 'id,property_id,amount,due_date,paid,period_year,period_month',
        { unpaid: true, dueFrom: from, dueTo: to }),
    ]);

    const msg = dailyPush(
      deadlineItems({ properties: props, events, tasks, bills: unpaidBills, rent: dues, from, to }),
      today,
    );
    if (!msg) { quiet += due.length; continue; }

    for (const sub of due) {
      const outcome = await sendPush(sub, msg, keys);
      if (outcome.sent) { sent++; await devices.markSent(db, sub.id); continue; }
      // ΤΟ ΑΡΧΕΙΟ ΚΑΤΑΓΡΑΦΗΣ ΔΕΝ ΠΑΙΡΝΕΙ ΠΟΤΕ ΟΛΟΚΛΗΡΗ ΤΗ ΔΙΕΥΘΥΝΣΗ: όποιος τη
      // διαβάσει μπορεί να στέλνει ο ίδιος σε εκείνο το τηλέφωνο.
      log(`${endpointHost(sub.endpoint)}: ${outcome.status || 'χωρίς κωδικό'} ${outcome.reason}`);
      if (outcome.gone || sub.failures + 1 >= MAX_FAILURES) {
        dropped++; await devices.drop(db, sub.id);
      } else {
        failed++; await devices.markFailure(db, sub.id, sub.failures);
      }
    }
  }

  log(`${byUser.size} χρήστες · ${sent} στάλθηκαν · ${quiet} χωρίς λόγο · ${dropped} σβήστηκαν · ${failed} απέτυχαν · ${skipped} είχαν ήδη πάρει`);
  return NextResponse.json({ users: byUser.size, sent, quiet, dropped, failed, skipped });
}
