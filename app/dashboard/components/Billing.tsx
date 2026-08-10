'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Billing, συνδρομή & στοιχεία τιμολόγησης. ΟΛΑ τα πεδία είναι έτοιμα ώστε,
// όταν προστεθεί ο Stripe, η πληρωμή να «κουμπώσει» χωρίς αλλαγή UI. Προς το
// παρόν αποθηκεύουμε μόνο τα στοιχεία (billing_profiles), καμία χρέωση.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import { TextInput, CustomSelect } from './UIComponents';
import { T, Btn, InfoBanner, Spinner, Card, SecHdr, formGrid } from '@/components/Theme';
import { ALL_COUNTRIES, isEuCountry, isReverseCharge, missingInvoiceFields, type InvoiceProfile } from '@/lib/billing/invoiceProfile';
import { determineVat, vatTreatmentLabel } from '@/lib/billing/invoicing';

interface BillingData {
  doc_type: string; full_name: string; company_name: string; afm: string; doy: string;
  profession: string; address: string; city: string; postal_code: string; country: string;
  vat_number: string; phone: string; plan: string; billing_cycle: string;
}
const INIT: BillingData = {
  doc_type: 'receipt', full_name: '', company_name: '', afm: '', doy: '', profession: '',
  address: '', city: '', postal_code: '', country: 'GR', vat_number: '', phone: '', plan: 'free', billing_cycle: 'monthly',
};

export default function Billing({ userId }: { userId: string }) {
  const supabase = createClient();
  const [d, setD] = useState<BillingData>(INIT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const set = (k: keyof BillingData, v: string) => setD(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const [data, { data: u }] = await Promise.all([
        billing.profile<Partial<BillingData>>(supabase, userId, '*'),
        supabase.auth.getUser(),
      ]);
      const meta = (u.user?.user_metadata as Record<string, string> | undefined) || {};
      const base: BillingData = { ...INIT, ...(data || {}) };

      // Έξυπνη προσυμπλήρωση: αντλούμε ό,τι ήδη ξέρουμε από το ακίνητο και τις
      // ρυθμίσεις του, ώστε ο χρήστης να μη βρίσκει άδεια φόρμα (αλλιώς δεν τη
      // συμπληρώνει ποτέ). Γεμίζουμε ΜΟΝΟ τα κενά· δεν πατάμε ό,τι υπάρχει ήδη.
      let did = false;
      const fill = (k: keyof BillingData, v?: string | null) => {
        if (!String(base[k] || '').trim() && v && String(v).trim()) { base[k] = String(v).trim(); did = true; }
      };
      try {
        const prop = (await properties.list<{ id: string; address: string | null; postal_code: string | null }>(
          supabase, userId, { columns: 'id, address, postal_code', orderBy: 'created_at' }))[0] || null;
        let ps: { owner_name?: string; owner_afm?: string; owner_phone?: string } | null = null;
        if (prop?.id) {
          const { data: s } = await supabase
            .from('property_settings').select('owner_name, owner_afm, owner_phone')
            .eq('property_id', prop.id).maybeSingle();
          ps = s;
        }
        fill('full_name', meta.full_name || ps?.owner_name);
        fill('afm', ps?.owner_afm);
        fill('phone', ps?.owner_phone);
        fill('address', prop?.address);
        fill('postal_code', prop?.postal_code);
      } catch { /* σιωπηλά: η προσυμπλήρωση είναι bonus, δεν μπλοκάρει */ }
      fill('full_name', meta.full_name);

      setD(base);
      setPrefilled(did);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const save = async () => {
    setSaving(true); setSaved(false); setSaveErr(false);
    // Το πλάνο και ο κύκλος χρέωσης ορίζονται ΜΟΝΟ από τη χρέωση, όχι από τον
    // πελάτη· το στρώμα τα αφαιρεί από κάθε εγγραφή, για όλες τις οθόνες.
    const { error } = await billing.save(supabase, userId, d as billing.BillingPatch);
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else setSaveErr(true);
  };

  if (loading) return <Spinner label="Φόρτωση…" />;
  const isInvoice = d.doc_type === 'invoice';
  const country = (d.country || 'GR').toUpperCase();
  const isGr = country === 'GR';
  const reverseCharge = isReverseCharge(d);
  const missing = missingInvoiceFields(d as InvoiceProfile);
  const vatLabel = isEuCountry(country) ? 'VAT (VIES)' : 'Φορολογικό μητρώο';
  const vatSummary = vatTreatmentLabel(determineVat(d));

  return (
    <div>
      <Card>
        <SecHdr label="Στοιχεία τιμολόγησης" />
        {prefilled && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: -6, marginBottom: 14 }}>
            Προσυμπληρώσαμε ό,τι ήδη ξέραμε από το ακίνητό σου. Έλεγξέ τα και αποθήκευσε.
          </div>
        )}
        <div style={{ ...formGrid(220, 297), gap: 14 }}>
          <CustomSelect label="Τύπος παραστατικού" value={d.doc_type} onChange={v => set('doc_type', v)}
            options={[{ value: 'receipt', label: 'Απόδειξη (ιδιώτης)' }, { value: 'invoice', label: 'Τιμολόγιο (επιχείρηση)' }]} />
          <CustomSelect label="Χώρα" value={country} onChange={v => set('country', v)}
            options={ALL_COUNTRIES.map(c => ({ value: c.code, label: c.name }))} />
          <TextInput label="Ονοματεπώνυμο" value={d.full_name} onChange={v => set('full_name', v)} placeholder="Γιώργος Παπαδόπουλος" />
          {isInvoice && <TextInput label="Επωνυμία εταιρείας" value={d.company_name} onChange={v => set('company_name', v)} placeholder="Παράδειγμα Ε.Ε." />}
          {isInvoice && <TextInput label="Δραστηριότητα" value={d.profession} onChange={v => set('profession', v)} placeholder="Διαχείριση ακινήτων" />}
          {/* Φορολογικό αναγνωριστικό: ΑΦΜ/ΔΟΥ για Ελλάδα, κοινοτικό VAT (VIES) για ΕΕ, μητρώο για εκτός ΕΕ */}
          {isInvoice && isGr && <TextInput label="ΑΦΜ" value={d.afm} onChange={v => set('afm', v)} placeholder="123456789" />}
          {isInvoice && isGr && <TextInput label="ΔΟΥ" value={d.doy} onChange={v => set('doy', v)} placeholder="ΔΟΥ Α΄ Αθηνών" />}
          {isInvoice && !isGr && <TextInput label={vatLabel} value={d.vat_number} onChange={v => set('vat_number', v)} placeholder={isEuCountry(country) ? `${country}XXXXXXXXX` : 'Αριθμός μητρώου'} />}
          <TextInput label="Διεύθυνση" value={d.address} onChange={v => set('address', v)} placeholder="Οδός και αριθμός" />
          <TextInput label="Πόλη" value={d.city} onChange={v => set('city', v)} placeholder="Αθήνα" />
          <TextInput label="Ταχ. Κώδικας" value={d.postal_code} onChange={v => set('postal_code', v)} placeholder="11527" />
          <TextInput label="Τηλέφωνο" value={d.phone} onChange={v => set('phone', v)} placeholder="69XXXXXXXX" />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Καθεστώς ΦΠΑ</span>
          <span>{vatSummary}{reverseCharge ? '. Χρειάζεται έγκυρος κοινοτικός VAT (VIES).' : ''}</span>
        </div>
        {isInvoice && missing.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 10 }}>
            Για σωστό τιμολόγιο, συμπλήρωσε ακόμη: {missing.map(f => f.label).join(', ')}.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση στοιχείων'}</Btn>
          {saved && <span style={{ fontSize: 12, color: 'var(--positive)', fontFamily: T.font.sans, fontWeight: 600 }}>Αποθηκεύτηκε ✓</span>}
          {saveErr && <span style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>Δεν αποθηκεύτηκε. Δοκίμασε ξανά.</span>}
        </div>
      </Card>

      {/* Πληρωμή (πριν το Stripe): τίμια, χωρίς απενεργοποιημένα «κουμπιά-φαντάσματα» */}
      <Card>
        <SecHdr label="Πληρωμή" />
        <InfoBanner tone="info">
          Το πρώτο σου ακίνητο είναι <strong>δωρεάν για πάντα</strong>. Για 2+ ακίνητα, η πληρωμή με κάρτα ενεργοποιείται πολύ σύντομα. Συμπλήρωσε από τώρα τα στοιχεία τιμολόγησης, ώστε η ενεργοποίηση να γίνει με ένα κλικ.
        </InfoBanner>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 14 }}>
          Η ακύρωση θα είναι τόσο απλή όσο και η εγγραφή: αλλάζεις, υποβαθμίζεις ή σταματάς όποτε θες, με ένα κλικ και χωρίς ερωτήσεις.
        </div>
      </Card>
    </div>
  );
}
