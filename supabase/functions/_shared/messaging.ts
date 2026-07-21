// ─────────────────────────────────────────────────────────────────────────────
// messaging — channel-agnostic short messages for Viber / WhatsApp / push.
//
// Email says everything; a phone message says the one thing that matters, now.
// This module holds short, glanceable variants of the time-critical events, per-
// channel adapters (length + format), and — crucially for the no-spam promise —
// channel SELECTION: one delivery goes out on exactly ONE channel, and the daily
// caps in emailPolicy span every channel together. We never send the same thing
// on email AND push AND Viber.
//
// Messaging covers only the urgent/glanceable events (receipts, obligations,
// check-ins, security, digests). Rich marketing stays on email, where it belongs.
// Pure and testable (verify-messaging.ts). Sending needs Business API keys
// (Viber/WhatsApp) or a push provider — see docs/marketing/multichannel.md.
// ─────────────────────────────────────────────────────────────────────────────
import { policyFor } from './emailPolicy.ts';
import type { Personal } from './emailTemplates.ts';

export type Channel = 'email' | 'push' | 'viber' | 'whatsapp';
export interface ChannelMessage { title: string; body: string; cta?: string; }

const first = (name?: string) => (name || '').trim().split(/\s+/)[0] || '';
const money = (n?: number) => (typeof n === 'number' && isFinite(n)) ? `${Math.round(n).toLocaleString('el-GR')} €` : '';

// Short variants for the urgent, glanceable events only. Greek, no dashes,
// gender-neutral. Everything else stays on email.
export const MSG: Record<string, (c: Personal) => ChannelMessage> = {
  // Transactional
  subscription_receipt: (c) => ({ title: 'Η απόδειξή σου είναι έτοιμη', body: `Λάβαμε την πληρωμή σου${c.invoiceAmount ? ` (${money(c.invoiceAmount)})` : ''}. Ευχαριστούμε.`, cta: 'Δες την απόδειξη' }),
  payment_failed: (c) => ({ title: 'Η πληρωμή δεν ολοκληρώθηκε', body: 'Η χρέωση της συνδρομής απέτυχε. Ενημέρωσε τον τρόπο πληρωμής για να μη διακοπεί.', cta: 'Διόρθωσε τώρα' }),
  security_login: (c) => ({ title: 'Νέα σύνδεση στον λογαριασμό σου', body: `Είδαμε σύνδεση${c.location ? ` από ${c.location}` : ''}. Αν ήσουν εσύ, αγνόησέ το.`, cta: 'Δες τη δραστηριότητα' }),
  tenant_rent_receipt: (c) => ({ title: 'Απόδειξη ενοικίου', body: `Καταχωρήθηκε η πληρωμή${c.tenantName ? ` του/της ${first(c.tenantName)}` : ''}${c.amount ? ` (${money(c.amount)})` : ''}.`, cta: 'Δες την απόδειξη' }),
  payout_received: (c) => ({ title: 'Νέα πληρωμή στον λογαριασμό', body: `Καταχωρήθηκε είσπραξη${c.amount ? ` ${money(c.amount)}` : ''} από τις κρατήσεις σου.`, cta: 'Δες τα έσοδα' }),

  // Obligations
  dunning_1: (c) => ({ title: 'Εκκρεμεί ένα ενοίκιο', body: `${c.tenantName ? first(c.tenantName) + ': ' : ''}το ενοίκιο δεν έχει εξοφληθεί ακόμη.`, cta: 'Στείλε υπενθύμιση' }),
  dunning_2: (c) => ({ title: 'Ενοίκιο σε καθυστέρηση', body: `${c.daysOverdue ? c.daysOverdue + ' μέρες καθυστέρηση. ' : ''}Δες τι μπορείς να κάνεις.`, cta: 'Δες το ενοίκιο' }),
  dunning_final: (c) => ({ title: 'Ληξιπρόθεσμο ενοίκιο', body: 'Το ενοίκιο παραμένει ανεξόφλητο. Ίσως χρειάζεται πιο επίσημο βήμα.', cta: 'Δες τις επιλογές' }),
  tax_installment: (c) => ({ title: 'Δόση φόρου αυτόν τον μήνα', body: `Πλησιάζει η προθεσμία${c.deadlineDate ? ` (${c.deadlineDate})` : ''}. Μην την ξεχάσεις.`, cta: 'Δες την υποχρέωση' }),
  lease_ending: (c) => ({ title: 'Λήγει μια μίσθωση', body: `${c.propertyName ? c.propertyName + ': ' : ''}η μίσθωση λήγει σύντομα${c.leaseEndDate ? ` (${c.leaseEndDate})` : ''}.`, cta: 'Δες το συμβόλαιο' }),
  insurance_expiring: (c) => ({ title: 'Λήγει η ασφάλεια', body: `${c.propertyName ? c.propertyName + ': ' : ''}το ασφαλιστήριο λήγει${c.policyEndDate ? ` ${c.policyEndDate}` : ''}.`, cta: 'Δες την ασφάλεια' }),
  card_expiring: (c) => ({ title: 'Λήγει η κάρτα πληρωμής', body: `Η κάρτα${c.cardLast4 ? ` ****${c.cardLast4}` : ''} λήγει σύντομα. Ανανέωσέ την για να μη διακοπεί η συνδρομή.`, cta: 'Ενημέρωσε την κάρτα' }),
  appointment_reminder: (c) => ({ title: 'Υπενθύμιση ραντεβού', body: `${c.appointmentTitle || 'Ραντεβού'}${c.appointmentDate ? ` στις ${c.appointmentDate}` : ''}${c.appointmentTime ? ` ${c.appointmentTime}` : ''}.`, cta: 'Δες το ημερολόγιο' }),

  // Short-term ops
  checkin_today: (c) => ({ title: 'Άφιξη σήμερα', body: `${c.guestName ? first(c.guestName) : 'Επισκέπτης'}${c.propertyName ? ` στο ${c.propertyName}` : ''}. Όλα έτοιμα;`, cta: 'Δες την κράτηση' }),
  checkout_today: (c) => ({ title: 'Αναχώρηση σήμερα', body: `${c.propertyName ? c.propertyName + ': ' : ''}αναχώρηση σήμερα. Πρόγραμμα καθαρισμού;`, cta: 'Δες την ημέρα' }),
  cleaning_scheduled: (c) => ({ title: 'Καθαρισμός σήμερα', body: `${c.propertyName ? c.propertyName + ': ' : ''}προγραμματισμένος καθαρισμός${c.cleaningDate ? ` ${c.cleaningDate}` : ''}.`, cta: 'Δες το πρόγραμμα' }),

  // Digests (consolidated)
  digest_obligations: (c) => ({ title: 'Τι χρειάζεται προσοχή σήμερα', body: `${c.digestItems?.length ? c.digestItems.length + ' θέματα λήγουν σήμερα.' : 'Δες τι λήγει σήμερα.'}`, cta: 'Άνοιξε τον πίνακα' }),
  digest_tax: (c) => ({ title: 'Φορολογικές προθεσμίες', body: `${c.digestItems?.length ? c.digestItems.length + ' προθεσμίες πλησιάζουν.' : 'Δες τις προθεσμίες σου.'}`, cta: 'Δες το ημερολόγιο' }),
  digest_str_today: (c) => ({ title: 'Το πρόγραμμα της ημέρας', body: 'Αφίξεις, αναχωρήσεις και καθαρισμοί για σήμερα.', cta: 'Άνοιξε το ημερολόγιο' }),

  // Opportunity (brief nudge — the detail lives in-app/email)
  limit_reached: (c) => ({ title: 'Έφτασες το όριο του πλάνου', body: 'Αναβάθμισε για να προσθέσεις κι άλλα ακίνητα.', cta: 'Δες τα πλάνα' }),
  rate_alert: (c) => ({ title: 'Επιτόκια και δόση', body: 'Οι τραπεζικές τιμές ενημερώθηκαν. Δες τη σύγκριση για τη δόση σου.', cta: 'Δες τη σύγκριση' }),

  // Lifecycle (glanceable good news)
  monthly_statement: (c) => ({ title: 'Η μηνιαία σου κατάσταση', body: `${c.period ? c.period + ': ' : ''}${c.collected ? 'εισπράχθηκαν ' + money(c.collected) + '. ' : ''}Δες τη σύνοψη.`, cta: 'Δες την κατάσταση' }),
  referral_friend_activated: (c) => ({ title: 'Η σύστασή σου ενεργοποιήθηκε', body: `${c.friendName ? first(c.friendName) : 'Ο φίλος σου'} ξεκίνησε ενεργά.${c.rewardLabel ? ' Η ανταμοιβή σου έρχεται.' : ''}`, cta: 'Δες τις συστάσεις' }),
};

// ── Per-channel adapters ─────────────────────────────────────────────────────
// Push is the tightest; Viber/WhatsApp allow a title + body + a link button.
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

export function renderPush(m: ChannelMessage): { title: string; body: string } {
  return { title: clip(m.title, 48), body: clip(m.body, 140) };
}
export function renderViber(m: ChannelMessage, url?: string): { text: string; action?: { text: string; url: string } } {
  return { text: `${m.title}\n${m.body}`, action: (m.cta && url) ? { text: clip(m.cta, 30), url } : undefined };
}
export function renderWhatsApp(m: ChannelMessage, url?: string): { text: string } {
  // WhatsApp business templates must be pre-approved; this is the body text.
  return { text: `*${m.title}*\n${m.body}${(m.cta && url) ? `\n${m.cta}: ${url}` : ''}` };
}

// ── Channel selection ────────────────────────────────────────────────────────
// One delivery → one channel. Urgent, glanceable events prefer a messaging
// channel the user opted into; everything richer stays on email. If the user has
// no messaging opt-in, or we have no short variant, it is email. The caps in
// emailPolicy count a message the same as an email, so channels can never stack.
export interface ChannelPrefs { push?: boolean; viber?: boolean; whatsapp?: boolean; }

export function pickChannel(copyId: string, prefs: ChannelPrefs = {}): Channel {
  if (!MSG[copyId]) return 'email';                       // no short variant → email
  const pol = policyFor(copyId);
  const glanceable = pol.category === 'transactional' || pol.category === 'obligation';
  if (!glanceable) return 'email';                        // opportunity/lifecycle/soft → email
  if (prefs.viber) return 'viber';
  if (prefs.whatsapp) return 'whatsapp';
  if (prefs.push) return 'push';
  return 'email';
}
