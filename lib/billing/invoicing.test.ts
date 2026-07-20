import { determineVat, vatTreatmentLabel, vatFromNet, vatFromGross, invoiceSeries, formatInvoiceNumber } from './invoicing';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error('✗ ' + m); } };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

// Καθεστώς ΦΠΑ
ok(determineVat({ doc_type: 'receipt', country: 'GR' }).treatment === 'domestic', 'GR → domestic');
ok(determineVat({ doc_type: 'receipt', country: 'GR' }).ratePct === 24, 'GR rate 24');
ok(determineVat({ doc_type: 'receipt', country: 'DE' }).treatment === 'oss_b2c', 'DE consumer → OSS');
ok(determineVat({ doc_type: 'receipt', country: 'DE' }).ratePct === 19, 'DE OSS rate 19');
ok(determineVat({ doc_type: 'invoice', country: 'DE', vat_number: 'DE123' }).treatment === 'reverse_charge', 'DE business+VIES → reverse charge');
ok(determineVat({ doc_type: 'invoice', country: 'DE', vat_number: '' }).treatment === 'oss_b2c', 'DE business no VIES → OSS');
ok(determineVat({ doc_type: 'invoice', country: 'US', vat_number: '' }).treatment === 'outside_eu', 'US → outside EU');
ok(determineVat({ doc_type: 'invoice', country: 'US' }).ratePct === 0, 'US rate 0');

// Ετικέτες
ok(vatTreatmentLabel(determineVat({ doc_type: 'receipt', country: 'GR' })) === 'ΦΠΑ Ελλάδας 24%', 'label domestic');
ok(vatTreatmentLabel(determineVat({ doc_type: 'invoice', country: 'FR', vat_number: 'FR1' })).includes('Αντιστροφή'), 'label reverse charge');

// Ανάλυση από net
const b = vatFromNet(100, 24);
ok(b.vat === 24 && b.gross === 124, 'net 100 @24% → vat 24, gross 124');
const b0 = vatFromNet(50, 0);
ok(b0.vat === 0 && b0.gross === 50, 'net 50 @0% → gross 50');

// Ανάλυση από gross (αντίστροφα)
const g = vatFromGross(124, 24);
ok(near(g.net, 100) && near(g.vat, 24), 'gross 124 @24% → net 100, vat 24');
const g0 = vatFromGross(50, 0);
ok(g0.net === 50 && g0.vat === 0, 'gross 50 @0% → net 50');

// Αρίθμηση
ok(invoiceSeries('invoice') === 'ΤΠΥ', 'invoice series ΤΠΥ');
ok(invoiceSeries('receipt') === 'ΑΠΥ', 'receipt series ΑΠΥ');
ok(formatInvoiceNumber('ΤΠΥ', 2026, 123) === 'ΤΠΥ-2026-000123', 'number format padded');
ok(formatInvoiceNumber('ΑΠΥ', 2026, 1) === 'ΑΠΥ-2026-000001', 'number format seq 1');

console.log(`invoicing: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
