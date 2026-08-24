// npx tsx lib/inbound/event.test.ts
import { readReceivedEvent, EVENT_TYPE } from './event';

let p = 0, f = 0;
const ok = (c: boolean, m: string) => { if (c) p++; else { f++; console.error('✗', m); } };

// Το σχήμα είναι του παρόχου, αντιγραμμένο από τους τύπους του SDK του:
// email_id, created_at, from, to[], bcc[], cc[], received_for[], message_id,
// subject, attachments[].
const EVENT = {
  type: 'email.received',
  created_at: '2026-08-21T09:12:00.000Z',
  data: {
    email_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    created_at: '2026-08-21T09:12:00.000Z',
    from: 'ΔΕΗ <no-reply@example.com>',
    to: ['a3f19c7d0b2e4681@properwise.gr'],
    bcc: [],
    cc: [],
    received_for: ['a3f19c7d0b2e4681@properwise.gr'],
    message_id: '<abc@mail>',
    subject: 'Ο λογαριασμός σας',
    attachments: [{ id: 'att_1', filename: 'bill.pdf', content_type: 'application/pdf', content_disposition: 'attachment', content_id: null }],
  },
};

ok(EVENT_TYPE === 'email.received', 'ο τύπος γεγονότος είναι αυτός του παρόχου');

const r = readReceivedEvent(EVENT);
ok(r.ok === true, 'το γνήσιο γεγονός διαβάζεται');
if (r.ok) {
  ok(r.event.emailId === EVENT.data.email_id, 'κρατά το email_id για το σώμα και για την ιδιοδυναμία');
  ok(r.event.from === 'ΔΕΗ <no-reply@example.com>', 'κρατά τον αποστολέα όπως ήρθε');
  ok(r.event.subject === 'Ο λογαριασμός σας', 'κρατά το θέμα');
  ok(r.event.attachments === 1, 'μετρά τα συνημμένα');
  ok(r.event.recipients.length === 1, 'ΤΟ ΙΔΙΟ ΣΕ to ΚΑΙ ΣΕ received_for ΕΙΝΑΙ ΕΝΑΣ ΠΑΡΑΛΗΠΤΗΣ');
}

// ── Και οι τρεις λίστες παραληπτών ─────────────────────────────────────────
const three = readReceivedEvent({ ...EVENT, data: { ...EVENT.data, to: ['a@x.gr'], cc: ['b@x.gr'], received_for: ['c@x.gr'] } });
ok(three.ok && three.event.recipients.join(',') === 'a@x.gr,b@x.gr,c@x.gr', 'to, cc και received_for μετράνε και τα τρία');
const fwd = readReceivedEvent({ ...EVENT, data: { ...EVENT.data, to: ['o-idioktitis@gmail.com'], received_for: ['a3f19c7d0b2e4681@properwise.gr'] } });
ok(fwd.ok && fwd.event.recipients.includes('a3f19c7d0b2e4681@properwise.gr'), 'ΠΡΟΩΘΗΜΕΝΟ ΜΗΝΥΜΑ: η διεύθυνσή μας ζει στο received_for');

// ── Γεγονότα που δεν μας αφορούν: 200, χωρίς θόρυβο ────────────────────────
for (const t of ['email.delivered', 'email.bounced', 'contact.created', 'domain.updated']) {
  const x = readReceivedEvent({ ...EVENT, type: t });
  ok(!x.ok && x.ours === false, `«${t}» δεν μας αφορά και δεν ζητά επανάληψη`);
}
const noType = readReceivedEvent({ data: EVENT.data });
ok(!noType.ok && noType.ours === false, 'χωρίς τύπο, δεν μας αφορά');

// ── Γεγονός ΠΑΡΑΛΑΒΗΣ που δεν διαβάστηκε: πρέπει να φανεί ──────────────────
const noId = readReceivedEvent({ ...EVENT, data: { ...EVENT.data, email_id: '' } });
ok(!noId.ok && noId.ours === true, 'ΧΩΡΙΣ email_id ΔΕΝ ΥΠΑΡΧΕΙ ΣΩΜΑ ΝΑ ΖΗΤΗΘΕΙ — και το λέμε στον πάροχο');
const noTo = readReceivedEvent({ ...EVENT, data: { ...EVENT.data, to: [], cc: [], received_for: [] } });
ok(!noTo.ok && noTo.ours === true, 'χωρίς κανέναν παραλήπτη δεν ξέρουμε σε ποιον ανήκει');
const noData = readReceivedEvent({ type: 'email.received' });
ok(!noData.ok && noData.ours === true, 'γεγονός παραλαβής χωρίς δεδομένα');

// ── Σκουπίδια ──────────────────────────────────────────────────────────────
for (const junk of [null, undefined, 'κείμενο', 42, [], { type: 'email.received', data: 'όχι αντικείμενο' }]) {
  ok(readReceivedEvent(junk).ok === false, `σκουπίδι «${String(junk)}» δεν γίνεται γεγονός`);
}
const weird = readReceivedEvent({ ...EVENT, data: { ...EVENT.data, to: [null, 5, ' a@x.gr '], cc: null, received_for: 'όχι λίστα', attachments: 'όχι λίστα' } });
ok(weird.ok && weird.event.recipients.join(',') === 'a@x.gr', 'μη κείμενα μέσα στους παραλήπτες αγνοούνται');
ok(weird.ok && weird.event.attachments === 0, 'συνημμένα που δεν είναι λίστα μετρούν μηδέν');

console.log(`\ninbound/event.ts — ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
console.log('όλα πέρασαν');
