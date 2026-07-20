'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Billing, συνδρομή & στοιχεία τιμολόγησης. ΟΛΑ τα πεδία είναι έτοιμα ώστε,
// όταν προστεθεί ο Stripe, η πληρωμή να «κουμπώσει» χωρίς αλλαγή UI. Προς το
// παρόν αποθηκεύουμε μόνο τα στοιχεία (billing_profiles), καμία χρέωση.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TextInput, CustomSelect } from './UIComponents';
import { T, Btn, InfoBanner, Spinner, Card, SecHdr } from '@/components/Theme';
import { isPlanAllowedForProfile, type ProfileType } from '@/lib/billing/entitlements';
import { type PlanId } from '@/lib/billing/plans';

interface BillingData {
  doc_type: string; full_name: string; company_name: string; afm: string; doy: string;
  profession: string; address: string; city: string; postal_code: string; country: string;
  phone: string; plan: string; billing_cycle: string;
}
const INIT: BillingData = {
  doc_type: 'receipt', full_name: '', company_name: '', afm: '', doy: '', profession: '',
  address: '', city: '', postal_code: '', country: 'GR', phone: '', plan: 'free', billing_cycle: 'monthly',
};

const PLANS = [
  { id: 'free',   name: 'Δωρεάν',        price: '0 €',    per: 'για πάντα', note: '1 ακίνητο, όλες οι βασικές δυνατότητες', cycle: 'monthly' },
  { id: 'owner',  name: 'Ιδιοκτήτης',    price: '5,90 €', per: 'ανά μήνα',  note: 'Έως 6 ακίνητα (ή 49 € τον χρόνο, έκπτωση 31%)', cycle: 'monthly' },
  { id: 'agency', name: 'Επαγγελματίας', price: '18,90 €', per: 'ανά μήνα',  note: 'Απεριόριστα ακίνητα και ομαδική διαχείριση (ή 149 € τον χρόνο, έκπτωση 34%)', cycle: 'monthly' },
];

export default function Billing({ userId }: { userId: string }) {
  const supabase = createClient();
  const [d, setD] = useState<BillingData>(INIT);
  const [profileType, setProfileType] = useState<ProfileType>('individual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof BillingData, v: string) => setD(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('billing_profiles').select('*').eq('user_id', userId).maybeSingle();
      const { data: u } = await supabase.auth.getUser();
      const meta = (u.user?.user_metadata as any) || {};
      if (data) setD({ ...INIT, ...data });
      else setD(p => ({ ...p, full_name: meta.full_name || '' }));
      setProfileType((data as { profile_type?: string } | null)?.profile_type === 'professional' ? 'professional' : 'individual');
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const save = async () => {
    setSaving(true); setSaved(false);
    // Το plan/billing_cycle ορίζονται ΜΟΝΟ από τη χρέωση (Stripe), όχι από τον client·
    // δεν τα στέλνουμε ώστε η αποθήκευση στοιχείων να μη φαίνεται ότι αλλάζει πλάνο.
    const payload: Record<string, unknown> = { ...d, user_id: userId, updated_at: new Date().toISOString() };
    delete payload.plan; delete payload.billing_cycle;
    const { error } = await supabase.from('billing_profiles').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else alert('Σφάλμα αποθήκευσης: ' + error.message);
  };

  if (loading) return <Spinner label="Φόρτωση…" />;
  const isInvoice = d.doc_type === 'invoice';

  return (
    <div>
      {/* Plans */}
      <Card>
        <SecHdr label="Πλάνο συνδρομής" />
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginBottom: 14 }}>
          {profileType === 'professional'
            ? 'Στον τρόπο «Επαγγελματίας» διαθέσιμο είναι το πλάνο Επαγγελματίας. Για Δωρεάν ή Ιδιοκτήτη, γύρνα στον τρόπο «Ιδιώτης» από τη σελίδα Λογαριασμός.'
            : 'Στον τρόπο «Ιδιώτης» διαλέγεις ανάμεσα σε Δωρεάν και Ιδιοκτήτη. Το πλάνο Επαγγελματίας ενεργοποιείται στον τρόπο «Επαγγελματίας».'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          {PLANS.map(p => {
            const active = d.plan === p.id;
            const allowed = isPlanAllowedForProfile(profileType, p.id as PlanId);
            const locked = !allowed;
            const hint = profileType === 'professional' ? 'Διαθέσιμο στον τρόπο «Ιδιώτης»' : 'Διαθέσιμο στον τρόπο «Επαγγελματίας»';
            return (
              <button key={p.id} disabled={locked} title={locked ? hint : undefined} className={locked ? undefined : 'acc-choice'}
                onClick={() => { if (locked) return; setD(prev => ({ ...prev, plan: p.id, billing_cycle: p.cycle })); }}
                style={{ textAlign: 'left', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.55 : 1, background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{p.name}</span>
                  {active
                    ? <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>
                    : locked && <span aria-hidden style={{ color: 'var(--text-tertiary)', display: 'inline-flex' }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num }}>{p.price}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{p.per}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans, lineHeight: 1.4 }}>{p.note}</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Invoice details */}
      <Card>
        <SecHdr label="Στοιχεία τιμολόγησης" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
          <CustomSelect label="Τύπος παραστατικού" value={d.doc_type} onChange={v => set('doc_type', v)}
            options={[{ value: 'receipt', label: 'Απόδειξη (ιδιώτης)' }, { value: 'invoice', label: 'Τιμολόγιο (επιχείρηση)' }]} />
          <TextInput label="Ονοματεπώνυμο" value={d.full_name} onChange={v => set('full_name', v)} placeholder="Γιώργος Παπαδόπουλος" />
          {isInvoice && <TextInput label="Επωνυμία εταιρείας" value={d.company_name} onChange={v => set('company_name', v)} placeholder="Παράδειγμα Ε.Ε." />}
          {isInvoice && <TextInput label="ΑΦΜ" value={d.afm} onChange={v => set('afm', v)} placeholder="123456789" />}
          {isInvoice && <TextInput label="ΔΟΥ" value={d.doy} onChange={v => set('doy', v)} placeholder="ΔΟΥ Α' Αθηνών" />}
          {isInvoice && <TextInput label="Δραστηριότητα" value={d.profession} onChange={v => set('profession', v)} placeholder="Διαχείριση ακινήτων" />}
          <TextInput label="Διεύθυνση" value={d.address} onChange={v => set('address', v)} placeholder="Οδός & αριθμός" />
          <TextInput label="Πόλη" value={d.city} onChange={v => set('city', v)} placeholder="Αθήνα" />
          <TextInput label="Ταχ. Κώδικας" value={d.postal_code} onChange={v => set('postal_code', v)} placeholder="11527" />
          <TextInput label="Τηλέφωνο" value={d.phone} onChange={v => set('phone', v)} placeholder="69XXXXXXXX" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση στοιχείων'}</Btn>
          {saved && <span style={{ fontSize: 12, color: 'var(--positive)', fontFamily: T.font.sans, fontWeight: 600 }}>Αποθηκεύτηκε ✓</span>}
        </div>
      </Card>

      {/* Payment (pre-Stripe) */}
      <Card>
        <SecHdr label="Πληρωμή" />
        <InfoBanner tone="info">
          Το πρώτο σου ακίνητο είναι <strong>δωρεάν για πάντα</strong>. Η πληρωμή με κάρτα για 2+ ακίνητα ενεργοποιείται πολύ σύντομα (Stripe). Συμπλήρωσε από τώρα τα στοιχεία τιμολόγησης ώστε η ενεργοποίηση να γίνει με ένα κλικ.
        </InfoBanner>
        <div style={{ marginTop: 4 }}>
          <button disabled title="Σύντομα με Stripe"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--bg-overlay)', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, cursor: 'not-allowed' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Πληρωμή με κάρτα, σύντομα
          </button>
        </div>
      </Card>
    </div>
  );
}
