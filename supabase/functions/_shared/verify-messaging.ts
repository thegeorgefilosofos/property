// Tests for the multichannel messaging layer. Run: npx tsx verify-messaging.ts
import { MSG, renderPush, renderViber, renderWhatsApp, pickChannel } from './messaging.ts';
import type { Personal } from './emailTemplates.ts';

let failed = 0;
const ok = (c: boolean, m: string) => { if (!c) { failed++; console.error('  ✗ ' + m); } else console.log('  ✓ ' + m); };

const rich: Personal = {
  name: 'Μαρία Παπαδοπούλου', invoiceAmount: 12, amount: 480, tenantName: 'Γιώργος Ν.', daysOverdue: 7,
  propertyName: 'Διαμέρισμα Κολωνάκι', deadlineDate: '31/07', location: 'Αθήνα', cardLast4: '4242',
  period: 'Ιούλιος 2026', collected: 4200, friendName: 'Ελένη', rewardLabel: '1 μήνας', digestItems: [{ title: 'Δόση φόρου' }, { title: 'ΕΝΦΙΑ' }],
  guestName: 'John Smith', appUrl: 'https://propertyos.gr',
};

console.log('\n1) Every short message renders clean, in both a rich and a bare context');
for (const key of Object.keys(MSG)) {
  for (const ctx of [rich, { appUrl: 'https://propertyos.gr' } as Personal]) {
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
  const v = renderViber(m, 'https://propertyos.gr/dashboard');
  ok(v.text.includes('\n') && v.action?.url === 'https://propertyos.gr/dashboard', 'viber carries title+body and a link action');
  const w = renderWhatsApp(m, 'https://propertyos.gr/dashboard');
  ok(w.text.startsWith('*') && w.text.includes('propertyos.gr'), 'whatsapp bolds the title and includes the link');
}

console.log('\n3) Channel selection never stacks — one delivery, one channel');
{
  ok(pickChannel('subscription_receipt', {}) === 'email', 'no opt-in → email even for urgent');
  ok(pickChannel('subscription_receipt', { viber: true }) === 'viber', 'urgent + viber opt-in → viber');
  ok(pickChannel('dunning_final', { push: true }) === 'push', 'obligation + push opt-in → push');
  ok(pickChannel('monthly_statement', { viber: true }) === 'email', 'lifecycle stays on email even with opt-in');
  ok(pickChannel('rate_alert', { viber: true }) === 'email', 'opportunity stays on email');
  ok(pickChannel('some_unknown_key', { viber: true }) === 'email', 'no short variant → email');
  ok(pickChannel('checkin_today', { whatsapp: true }) === 'whatsapp', 'STR check-in + whatsapp → whatsapp');
}

console.log('');
if (failed) { console.error(`✗ ${failed} assertion(s) failed`); process.exit(1); }
console.log(`✓ all messaging checks pass (${Object.keys(MSG).length} short messages)`);
