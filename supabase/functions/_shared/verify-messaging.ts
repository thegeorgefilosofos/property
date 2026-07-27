// Tests for the multichannel messaging layer. Run: npx tsx verify-messaging.ts
import { MSG, renderPush, renderViber, renderIMessage, renderWhatsApp, pickChannel } from './messaging.ts';
import type { Personal } from './emailTemplates.ts';

let failed = 0;
const ok = (c: boolean, m: string) => { if (!c) { failed++; console.error('  ✗ ' + m); } else console.log('  ✓ ' + m); };

const rich: Personal = {
  name: 'Μαρία Παπαδοπούλου', invoiceAmount: 12, amount: 480, tenantName: 'Γιώργος Ν.', daysOverdue: 7,
  propertyName: 'Διαμέρισμα Κολωνάκι', deadlineDate: '31/07', location: 'Αθήνα', cardLast4: '4242',
  period: 'Ιούλιος 2026', collected: 4200, friendName: 'Ελένη', rewardLabel: '1 μήνας', digestItems: [{ title: 'Δόση φόρου' }, { title: 'ΕΝΦΙΑ' }],
  guestName: 'John Smith', appUrl: 'https://property-os.gr',
};

console.log('\n1) Every short message renders clean, in both a rich and a bare context');
for (const key of Object.keys(MSG)) {
  for (const ctx of [rich, { appUrl: 'https://property-os.gr' } as Personal]) {
    const m = MSG[key](ctx);
    const blob = `${m.title} ${m.body} ${m.cta || ''}`;
    const bad = /—|undefined|NaN|\[object|:\s*€|\(\s*\)/.test(blob) || !m.title || !m.body;
    if (bad) ok(false, `${key} clean (${blob})`);
  }
}
ok(failed === 0, `all ${Object.keys(MSG).length} messages render clean in both contexts`);

console.log('\n2) Adapters respect channel limits');
{
  const m = MSG.digest_obligations(rich);
  const push = renderPush({ title: 'x'.repeat(80), body: 'y'.repeat(300), cta: 'ok' });
  ok(push.title.length <= 48 && push.body.length <= 140, 'push truncates title ≤48 and body ≤140');
  const v = renderViber(m, 'https://property-os.gr/dashboard');
  ok(v.text.includes('\n') && v.action?.url === 'https://property-os.gr/dashboard', 'viber carries title+body and a link action');
  const im = renderIMessage(m, 'https://property-os.gr/dashboard');
  ok(im.text.includes('\n') && im.text.includes('property-os.gr') && im.action?.url === 'https://property-os.gr/dashboard', 'imessage carries title+body, an inline link for the preview card, and a link action');
  const w = renderWhatsApp(m, 'digest_obligations', 'https://property-os.gr/dashboard');
  const param = w.template.components[0].parameters[0].text;
  ok(w.template.name === 'po_digest_obligations' && w.template.language.code === 'el', 'whatsapp emits a named el template');
  ok(!/\n/.test(param) && param.includes('property-os.gr'), 'whatsapp body param has no newlines and includes the link');
  const wDirty = renderWhatsApp({ title: 'a*b_c', body: 'x~y`z' }, 'x');
  ok(!/[*_~`]/.test(wDirty.template.components[0].parameters[0].text), 'whatsapp strips markdown control chars from user data');
}

console.log('\n2b) Privacy — no euro amounts or tenant/guest names in glanceable bodies');
{
  for (const key of ['subscription_receipt', 'tenant_rent_receipt', 'payout_received', 'monthly_statement']) {
    const b = MSG[key](rich).body;
    ok(!/€|\bΓιώργος\b|\b480\b|\b4\.?200\b/.test(b), `${key} body exposes no amount or tenant name (${b})`);
  }
  // checkin_today is glanceable (obligation) → the guest name must stay behind the
  // tap, never on the lock screen.
  ok(!/John|Smith|Γιώργος/.test(MSG.checkin_today(rich).body), 'checkin_today body exposes no guest name');
  ok(!/Ελένη|Νίκος|John/.test(MSG.referral_friend_activated(rich).body), 'referral_friend_activated body exposes no friend name');
  // dunning_1 references the tenant only via a gendered role noun; with no gender
  // data it names no one (genuinely neutral, not defaulted-masculine).
  ok(!/μισθωτή/.test(MSG.dunning_1(rich).body) && !/\s\./.test(MSG.dunning_1(rich).body), 'dunning_1 neutral fallback names no gendered person and leaves no dangling space');
  // whitespace-only names must not leak dangling articles or spaces
  const wsp = { ...rich, guestName: '   ', tenantName: '  ', friendName: ' ' } as Personal;
  ok(!/^\s/.test(MSG.checkin_today(wsp).body), 'whitespace guestName does not leave a leading space');
}

console.log('\n2c) Count agreement — singular renders grammatically');
{
  const one = { ...rich, daysOverdue: 1, digestItems: [{ title: 'Δόση φόρου' }] } as Personal;
  ok(!/1 (μέρες|ημέρες)/.test(MSG.dunning_2(one).body), 'dunning_2 with 1 day does not print "1 μέρες"');
  ok(/Ένα θέμα λήγει/.test(MSG.digest_obligations(one).body), 'digest_obligations singular → "Ένα θέμα λήγει"');
  ok(/Μία προθεσμία πλησιάζει/.test(MSG.digest_tax(one).body), 'digest_tax singular → "Μία προθεσμία πλησιάζει"');
}

console.log('\n3) Channel selection never stacks — one delivery, one channel');
{
  ok(pickChannel('subscription_receipt', {}) === 'email', 'no opt-in → email even for urgent');
  ok(pickChannel('subscription_receipt', { viber: true }) === 'viber', 'urgent + viber opt-in → viber');
  ok(pickChannel('dunning_final', { push: true }) === 'push', 'obligation + push opt-in → push');
  ok(pickChannel('str_stay_tax', { imessage: true }) === 'imessage', 'compliance obligation + imessage opt-in → imessage');
  ok(pickChannel('lease_declaration_reminder', { imessage: true, push: true }) === 'imessage', 'imessage wins over push when both opted in');
  ok(pickChannel('checkin_today', { viber: true, imessage: true }) === 'viber', 'viber wins the tie-break over imessage');
  ok(pickChannel('monthly_statement', { viber: true }) === 'email', 'lifecycle stays on email even with opt-in');
  ok(pickChannel('rate_alert', { viber: true }) === 'email', 'opportunity stays on email');
  ok(pickChannel('some_unknown_key', { viber: true }) === 'email', 'no short variant → email');
  ok(pickChannel('checkin_today', { whatsapp: true }) === 'whatsapp', 'STR check-in + whatsapp → whatsapp');
}

console.log('');
if (failed) { console.error(`✗ ${failed} assertion(s) failed`); process.exit(1); }
console.log(`✓ all messaging checks pass (${Object.keys(MSG).length} short messages)`);
