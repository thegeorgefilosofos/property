// ─────────────────────────────────────────────────────────────────────────────
// messaging — channel-agnostic short messages for Viber / WhatsApp / iMessage / push.
//
// Email says everything; a phone message says the one thing that matters, now. The
// message must earn its buzz: same warm, human Property OS voice as the email, only
// compressed to what fits on a lock screen. This module holds those short variants,
// per-channel adapters (length + format), and — crucially for the no-spam promise —
// channel SELECTION: one delivery goes out on exactly ONE channel, and the daily
// caps in emailPolicy span every channel together. We never send the same thing on
// email AND push AND Viber.
//
// Messaging covers only the urgent/glanceable events (receipts, obligations, check-
// ins, security, compliance deadlines, digests). Rich value/marketing stays on
// email, where it reads properly. Gender-aware where a third person (a tenant) is
// mentioned, with a safe neutral fallback; never an amount or a private name on the
// lock screen. Pure and testable (verify-messaging.ts). Sending needs Business API
// keys (Viber/WhatsApp/iMessage) or a push provider — see docs/marketing/multichannel.md.
// ─────────────────────────────────────────────────────────────────────────────
import { policyFor } from './emailPolicy.ts';
import { gv } from './emailTemplates.ts';
import type { Personal } from './emailTemplates.ts';

export type Channel = 'email' | 'push' | 'viber' | 'whatsapp' | 'imessage';
export interface ChannelMessage { title: string; body: string; cta?: string; }

const first = (name?: string) => (name || '').trim().split(/\s+/)[0] || '';
// Third-person tenant reference, correctly gendered (owner-facing dunning etc.).
const theTenant = (c: Personal) => gv(c.tenantGender, { m: 'στον ενοικιαστή', f: 'στην ενοικιάστρια', n: 'στον μισθωτή' });

// Short variants for the urgent, glanceable events only. Greek, warm but tight, no
// dashes. Everything richer stays on email.
export const MSG: Record<string, (c: Personal) => ChannelMessage> = {
  // ── Transactional ──────────────────────────────────────────────────────────
  // No amounts/names in the body (lock-screen privacy); the detail lives in-app
  // behind the tap.
  subscription_receipt: (c) => ({ title: 'Η απόδειξή σου είναι έτοιμη', body: 'Λάβαμε την πληρωμή της συνδρομής σου. Ευχαριστούμε που είσαι μαζί μας.', cta: 'Δες την απόδειξη' }),
  payment_failed: (c) => ({ title: 'Η πληρωμή δεν ολοκληρώθηκε', body: 'Η χρέωση της συνδρομής απέτυχε, συνήθως φταίει μια κάρτα που έληξε. Ενημέρωσέ την για να μη διακοπεί τίποτα.', cta: 'Διόρθωσε τώρα' }),
  security_login: (c) => ({ title: 'Νέα σύνδεση στον λογαριασμό σου', body: `Είδαμε μια σύνδεση${c.location ? ` από ${c.location}` : ''}. Αν ήσουν εσύ, όλα εντάξει, αγνόησέ το.`, cta: 'Έλεγξε τη δραστηριότητα' }),
  tenant_rent_receipt: (c) => ({ title: 'Καταχωρήθηκε πληρωμή ενοικίου', body: 'Μια πληρωμή ενοικίου μόλις καταγράφηκε. Η απόδειξη είναι έτοιμη στην εφαρμογή.', cta: 'Δες την απόδειξη' }),
  payout_received: (c) => ({ title: 'Μπήκε μια είσπραξη', body: 'Καταγράφηκε μια πληρωμή από τις κρατήσεις σου. Τα έσοδά σου ενημερώθηκαν.', cta: 'Δες τα έσοδα' }),
  maintenance_completed: (c) => ({ title: 'Ολοκληρώθηκε η συντήρηση', body: `${c.propertyName ? c.propertyName + ': η' : 'Η'} εργασία ολοκληρώθηκε και καταγράφηκε στο ιστορικό του ακινήτου.`, cta: 'Δες το ιστορικό' }),

  // ── Obligations ────────────────────────────────────────────────────────────
  dunning_1: (c) => ({ title: 'Εκκρεμεί ένα ενοίκιο', body: `Ένα ενοίκιο δεν έχει εξοφληθεί ακόμη. Αν θες, στείλε μια ευγενική υπενθύμιση ${theTenant(c)}.`, cta: 'Δες το ενοίκιο' }),
  dunning_2: (c) => ({ title: 'Ενοίκιο σε καθυστέρηση', body: `${c.daysOverdue ? c.daysOverdue + ' μέρες καθυστέρηση. ' : ''}Ίσως ήρθε η ώρα για μια πιο άμεση, πάντα ευγενική, υπενθύμιση.`, cta: 'Δες τις επιλογές' }),
  dunning_final: (c) => ({ title: 'Ληξιπρόθεσμο ενοίκιο', body: 'Ένα ενοίκιο παραμένει ανεξόφλητο για καιρό. Δες τα επόμενα βήματα που έχεις στη διάθεσή σου.', cta: 'Δες τη δόση' }),
  tax_installment: (c) => ({ title: 'Δόση φόρου αυτόν τον μήνα', body: `Πλησιάζει η προθεσμία${c.deadlineDate ? ` στις ${c.deadlineDate}` : ''}. Μια ματιά τώρα σε γλιτώνει από τρέξιμο μετά.`, cta: 'Δες την υποχρέωση' }),
  lease_ending: (c) => ({ title: 'Λήγει μια μίσθωση', body: `${c.propertyName ? c.propertyName + ': η' : 'Μια'} μίσθωση λήγει σύντομα${c.leaseEndDate ? ` στις ${c.leaseEndDate}` : ''}. Καλή στιγμή να αποφασίσεις ανανέωση ή αλλαγή.`, cta: 'Δες το συμβόλαιο' }),
  insurance_expiring: (c) => ({ title: 'Λήγει η ασφάλεια του ακινήτου', body: `${c.propertyName ? c.propertyName + ': το' : 'Το'} ασφαλιστήριο λήγει σύντομα${c.policyEndDate ? ` στις ${c.policyEndDate}` : ''}. Μην αφήσεις κενό στην κάλυψη.`, cta: 'Δες την ασφάλεια' }),
  certificate_expiring: (c) => ({ title: `Λήγει ${c.certificateName ? 'το ' + c.certificateName : 'ένα πιστοποιητικό'}`, body: `${c.propertyName ? c.propertyName + ': καλό' : 'Καλό'} είναι να το ανανεώσεις εγκαίρως${c.certificateEndDate ? ` (λήξη ${c.certificateEndDate})` : ''}, για να μη σε καθυστερήσει σε μίσθωση ή πώληση.`, cta: 'Δες το ακίνητο' }),
  card_expiring: (c) => ({ title: 'Λήγει η κάρτα πληρωμής', body: 'Η κάρτα της συνδρομής λήγει σύντομα. Μια γρήγορη ανανέωση αποτρέπει τη διακοπή.', cta: 'Ενημέρωσε την κάρτα' }),
  appointment_reminder: (c) => ({ title: 'Υπενθύμιση ραντεβού', body: `${c.appointmentTitle || 'Έχεις ραντεβού'}${c.appointmentDate ? ` στις ${c.appointmentDate}` : ''}${c.appointmentTime ? ` ${c.appointmentTime}` : ''}. Το κρατάμε στο ημερολόγιό σου.`, cta: 'Δες το ημερολόγιο' }),
  maintenance_scheduled: (c) => ({ title: 'Προγραμματισμένη συντήρηση', body: `${c.maintenanceTitle ? c.maintenanceTitle : 'Μια εργασία'}${c.propertyName ? ` στο ${c.propertyName}` : ''}${c.maintenanceDate ? ` στις ${c.maintenanceDate}` : ''}. Θα σου θυμίσουμε λίγο πριν.`, cta: 'Δες τη συντήρηση' }),
  lease_declaration_reminder: (c) => ({ title: 'Δήλωση μίσθωσης στο myAADE', body: `Μια μίσθωση${c.propertyName ? ` (${c.propertyName})` : ''} θέλει δήλωση στο myAADE${c.deadlineDate ? ` έως ${c.deadlineDate}` : ''}. Τα στοιχεία είναι έτοιμα.`, cta: 'Δες τα στοιχεία' }),
  str_registration_reminder: (c) => ({ title: 'Ανάρτηση Αριθμού Μητρώου Ακινήτου', body: `${c.propertyName ? c.propertyName + ': ο' : 'Ο'} ΑΜΑ πρέπει να φαίνεται σε κάθε αγγελία σε Airbnb και Booking. Δες αν είναι όλα σε τάξη.`, cta: 'Δες το ακίνητο' }),
  str_stay_tax: (c) => ({ title: 'Απόδοση τέλους ανθεκτικότητας', body: 'Το τέλος ανθεκτικότητας στην κλιματική κρίση για τις βραχυχρόνιες θέλει απόδοση. Δες τι αναλογεί ανά κράτηση.', cta: 'Δες τα ποσά' }),
  data_retention_notice: (c) => ({ title: 'Κράτησε τον λογαριασμό σου ενεργό', body: `Έχεις καιρό να συνδεθείς. Μια σύνδεση${c.deadlineDate ? ` έως ${c.deadlineDate}` : ''} κρατά ζωντανά τα δεδομένα σου.`, cta: 'Μπες τώρα' }),

  // ── Short-term ops ─────────────────────────────────────────────────────────
  checkin_today: (c) => ({ title: 'Άφιξη σήμερα', body: `${first(c.guestName) || 'Επισκέπτης'}${c.propertyName ? ` στο ${c.propertyName}` : ''}. Κλειδιά, κωδικός και οδηγίες έτοιμα;`, cta: 'Δες την κράτηση' }),
  checkout_today: (c) => ({ title: 'Αναχώρηση σήμερα', body: `${c.propertyName ? c.propertyName + ': αναχώρηση' : 'Αναχώρηση'} σήμερα. Καλή στιγμή για καθαρισμό και έναν γρήγορο έλεγχο.`, cta: 'Δες την ημέρα' }),
  cleaning_scheduled: (c) => ({ title: 'Καθαρισμός σήμερα', body: `${c.propertyName ? c.propertyName + ': υπάρχει' : 'Υπάρχει'} προγραμματισμένος καθαρισμός, ώστε το ακίνητο να είναι έτοιμο για την επόμενη άφιξη.`, cta: 'Δες το πρόγραμμα' }),

  // ── Digests (consolidated) ─────────────────────────────────────────────────
  digest_obligations: (c) => ({ title: 'Τι χρειάζεται προσοχή σήμερα', body: `${c.digestItems?.length ? c.digestItems.length + ' θέματα λήγουν σήμερα, μαζεμένα σε ένα μήνυμα.' : 'Δες συγκεντρωμένα ό,τι λήγει σήμερα.'}`, cta: 'Άνοιξε τον πίνακα' }),
  digest_tax: (c) => ({ title: 'Φορολογικές προθεσμίες', body: `${c.digestItems?.length ? c.digestItems.length + ' προθεσμίες πλησιάζουν, όλες σε ένα σημείο.' : 'Δες συγκεντρωμένες τις προθεσμίες σου.'}`, cta: 'Δες το ημερολόγιο' }),
  digest_str_today: (c) => ({ title: 'Το πρόγραμμα της ημέρας', body: 'Αφίξεις, αναχωρήσεις και καθαρισμοί για σήμερα, σε ένα μήνυμα.', cta: 'Άνοιξε το ημερολόγιο' }),

  // ── Opportunity (brief nudge — the rich version lives in-app/email) ─────────
  limit_reached: (c) => ({ title: 'Έφτασες το όριο του πλάνου', body: 'Το χρησιμοποιείς σοβαρά, καλό σημάδι. Μια αναβάθμιση ανοίγει τον δρόμο για κι άλλα ακίνητα.', cta: 'Δες τα πλάνα' }),
  rate_alert: (c) => ({ title: 'Κινήθηκαν τα επιτόκια', body: 'Οι τραπεζικές τιμές ενημερώθηκαν. Δες τη νέα δόση και αν συμφέρει μια αναχρηματοδότηση.', cta: 'Δες τη σύγκριση' }),

  // ── Lifecycle (glanceable good news) ───────────────────────────────────────
  monthly_statement: (c) => ({ title: 'Η μηνιαία σου κατάσταση', body: `${c.period ? c.period + ': η' : 'Η'} σύνοψη του μήνα είναι έτοιμη, τακτοποιημένη ανά ακίνητο.`, cta: 'Δες την κατάσταση' }),
  referral_friend_activated: (c) => ({ title: 'Η σύστασή σου ενεργοποιήθηκε', body: `${first(c.friendName) || 'Ο φίλος σου'} ξεκίνησε ενεργά με το Property OS χάρη σε σένα.${c.rewardLabel ? ' Η ανταμοιβή σου έρχεται.' : ''}`, cta: 'Δες τις συστάσεις' }),
};

// ── Per-channel adapters ─────────────────────────────────────────────────────
// Push is the tightest; Viber / iMessage / WhatsApp allow a title + body + a link.
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export function renderPush(m: ChannelMessage): { title: string; body: string } {
  return { title: clip(m.title, 48), body: clip(m.body, 140) };
}

// Viber rich message: title + body on two lines, plus a link button (CTA).
export function renderViber(m: ChannelMessage, url?: string): { text: string; action?: { text: string; url: string } } {
  return { text: `${m.title}\n${m.body}`, action: (m.cta && url) ? { text: clip(m.cta, 30), url } : undefined };
}

// iMessage (Apple Messages for Business): plain text bubble that auto-renders a rich
// link preview for the URL, plus a reply/CTA action. Same shape as Viber for the
// dispatcher, but keeps the link in the text so the Apple preview card appears.
export function renderIMessage(m: ChannelMessage, url?: string): { text: string; action?: { text: string; url: string } } {
  const text = url ? `${m.title}\n${m.body}\n${url}` : `${m.title}\n${m.body}`;
  return { text, action: (m.cta && url) ? { text: clip(m.cta, 30), url } : undefined };
}

// Guard against WhatsApp/markdown control chars in interpolated user data.
const waSafe = (s: string) => s.replace(/[*_~`]/g, '').replace(/\s{4,}/g, ' ').replace(/\n+/g, ' ').trim();
// WhatsApp business-initiated sends require a PRE-APPROVED template, not free text.
// Each MSG key maps to one template name; the body is a single positional param
// ({{1}}) with newlines/runs-of-spaces stripped (templates forbid them). We also
// return `preview` for the console/tests. `waTemplate` is the template registered
// in Meta (name = 'po_' + copyId by convention).
export function renderWhatsApp(m: ChannelMessage, copyId: string, url?: string): {
  template: { name: string; language: { code: string }; components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> };
  preview: string;
} {
  const bodyText = waSafe(`${m.title}. ${m.body}${(m.cta && url) ? ` ${m.cta}: ${url}` : ''}`);
  return {
    template: {
      name: `po_${copyId}`, language: { code: 'el' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: bodyText }] }],
    },
    preview: `*${waSafe(m.title)}*\n${waSafe(m.body)}`,
  };
}

// ── Channel selection ────────────────────────────────────────────────────────
// One delivery → one channel. Urgent, glanceable events prefer a messaging channel
// the user opted into; everything richer stays on email. If the user has no
// messaging opt-in, or we have no short variant, it is email. The caps in
// emailPolicy count a message the same as an email, so channels can never stack.
// Tie-break order when a user opted into several: Viber, WhatsApp, iMessage, push
// (the messaging apps dominant in Greece first). Any single delivery still goes to
// exactly one of them.
export interface ChannelPrefs { push?: boolean; viber?: boolean; whatsapp?: boolean; imessage?: boolean; }

export function pickChannel(copyId: string, prefs: ChannelPrefs = {}): Channel {
  if (!MSG[copyId]) return 'email';                       // no short variant → email
  const pol = policyFor(copyId);
  const glanceable = pol.category === 'transactional' || pol.category === 'obligation';
  if (!glanceable) return 'email';                        // opportunity/lifecycle/soft → email
  if (prefs.viber) return 'viber';
  if (prefs.whatsapp) return 'whatsapp';
  if (prefs.imessage) return 'imessage';
  if (prefs.push) return 'push';
  return 'email';
}
