import { determineVat, vatTreatmentLabel } from './invoicing';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error('✗ ' + m); } };

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

console.log(`invoicing: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
