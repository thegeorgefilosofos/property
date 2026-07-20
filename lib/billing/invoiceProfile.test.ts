import { requiredInvoiceFields, missingInvoiceFields, isInvoiceProfileComplete, isReverseCharge, isEuCountry, type InvoiceProfile } from './invoiceProfile';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error('✗ ' + m); } };

const base: InvoiceProfile = {
  doc_type: 'receipt', full_name: '', company_name: '', afm: '', doy: '', profession: '',
  address: '', city: '', postal_code: '', country: 'GR', vat_number: '', phone: '',
};

// Απόδειξη: όνομα + χώρα
ok(requiredInvoiceFields({ doc_type: 'receipt', country: 'GR' }).length === 2, 'receipt requires 2 fields');
ok(isInvoiceProfileComplete({ ...base, full_name: 'Γιώργος', country: 'GR' }), 'receipt complete with name+country');
ok(!isInvoiceProfileComplete({ ...base, full_name: '' }), 'receipt incomplete without name');

// Τιμολόγιο Ελλάδα: ΑΦΜ + ΔΟΥ
const grInvoiceReq = requiredInvoiceFields({ doc_type: 'invoice', country: 'GR' }).map(f => f.key);
ok(grInvoiceReq.includes('afm') && grInvoiceReq.includes('doy'), 'GR invoice requires afm+doy');
ok(!grInvoiceReq.includes('vat_number'), 'GR invoice does not require VIES');

const grFull: InvoiceProfile = { ...base, doc_type: 'invoice', company_name: 'Α ΕΕ', profession: 'Υπηρεσίες', address: 'Οδός 1', city: 'Αθήνα', postal_code: '11527', country: 'GR', afm: '123456789', doy: 'Α Αθηνών' };
ok(isInvoiceProfileComplete(grFull), 'GR invoice complete');
ok(!isInvoiceProfileComplete({ ...grFull, afm: '' }), 'GR invoice incomplete without afm');

// Τιμολόγιο ΕΕ (Γερμανία): VAT (VIES), όχι ΑΦΜ/ΔΟΥ, reverse charge
const deReq = requiredInvoiceFields({ doc_type: 'invoice', country: 'DE' }).map(f => f.key);
ok(deReq.includes('vat_number') && !deReq.includes('afm'), 'DE invoice requires VIES, not afm');
ok(isReverseCharge({ doc_type: 'invoice', country: 'DE' }), 'DE invoice is reverse charge');
ok(!isReverseCharge({ doc_type: 'invoice', country: 'GR' }), 'GR invoice not reverse charge');
ok(!isReverseCharge({ doc_type: 'receipt', country: 'DE' }), 'DE receipt not reverse charge');

const deFull: InvoiceProfile = { ...base, doc_type: 'invoice', company_name: 'B GmbH', profession: 'Services', address: 'Str 1', city: 'Berlin', postal_code: '10115', country: 'DE', vat_number: 'DE123456789' };
ok(isInvoiceProfileComplete(deFull), 'DE invoice complete with VIES');
ok(missingInvoiceFields({ ...deFull, vat_number: '' }).some(f => f.key === 'vat_number'), 'DE invoice missing VIES flagged');

// Εκτός ΕΕ (ΗΠΑ): μητρώο, όχι reverse charge, όχι VIES-EU
ok(!isEuCountry('US'), 'US not EU');
ok(!isReverseCharge({ doc_type: 'invoice', country: 'US' }), 'US invoice not reverse charge');
ok(requiredInvoiceFields({ doc_type: 'invoice', country: 'US' }).some(f => f.key === 'vat_number'), 'US invoice requires tax id');

console.log(`invoiceProfile: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
