'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Billing — συνδρομή & στοιχεία τιμολόγησης. ΟΛΑ τα πεδία είναι έτοιμα ώστε,
// όταν προστεθεί ο Stripe, η πληρωμή να «κουμπώσει» χωρίς αλλαγή UI. Προς το
// παρόν αποθηκεύουμε μόνο τα στοιχεία (billing_profiles) — καμία χρέωση.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TextInput, CustomSelect } from './UIComponents';
import { T, Btn, InfoBanner, Spinner } from '@/components/Theme';

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
  { id: 'free',    name: 'Δωρεάν',       price: '0 €',       per: 'για πάντα', note: '1 ακίνητο, όλες οι δυνατότητες', cycle: 'monthly' },
  { id: 'monthly', name: 'Pro Μηνιαίο',  price: '2,99 €',    per: 'ανά μήνα',  note: 'Από 2 έως 15 ακίνητα, χωρίς δέσμευση', cycle: 'monthly' },
  { id: 'annual',  name: 'Pro Ετήσιο',   price: '29,90 €',   per: 'ανά έτος',  note: '2 μήνες δώρο, από 2 έως 15 ακίνητα', cycle: 'annual' },
];

export default function Billing({ userId }: { userId: string }) {
  const supabase = createClient();
  const [d, setD] = useState<BillingData>(INIT);
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
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const save = async () => {
    setSaving(true); setSaved(false);
    const { error } = await supabase.from('billing_profiles').upsert(
      { ...d, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }
    );
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else alert('Σφάλμα αποθήκευσης: ' + error.message);
  };

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const secHdr = (t: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
      <div style={{ fontFamily: T.font.sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 700 }}>{t}</div>
    </div>
  );

  if (loading) return <Spinner label="Φόρτωση…" />;
  const isInvoice = d.doc_type === 'invoice';

  return (
    <div>
      {/* Plans */}
      <div style={card}>
        {secHdr('Πλάνο συνδρομής')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          {PLANS.map(p => {
            const active = d.plan === p.id;
            return (
              <button key={p.id} onClick={() => setD(prev => ({ ...prev, plan: p.id, billing_cycle: p.cycle }))}
                style={{ textAlign: 'left', cursor: 'pointer', background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '16px 18px', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{p.name}</span>
                  {active && <span style={{ color: 'var(--accent)', fontSize: 16 }}>✓</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num }}>{p.price}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{p.per}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans, lineHeight: 1.4 }}>{p.note}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Invoice details */}
      <div style={card}>
        {secHdr('Στοιχεία τιμολόγησης')}
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
      </div>

      {/* Payment (pre-Stripe) */}
      <div style={card}>
        {secHdr('Πληρωμή')}
        <InfoBanner tone="info">
          Το πρώτο σου ακίνητο είναι <strong>δωρεάν για πάντα</strong>. Η πληρωμή με κάρτα για 2+ ακίνητα ενεργοποιείται πολύ σύντομα (Stripe). Συμπλήρωσε από τώρα τα στοιχεία τιμολόγησης ώστε η ενεργοποίηση να γίνει με ένα κλικ.
        </InfoBanner>
        <div style={{ marginTop: 4 }}>
          <button disabled title="Σύντομα με Stripe"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 42, padding: '0 22px', borderRadius: T.radius.pill, border: 'none', background: 'var(--bg-overlay)', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, cursor: 'not-allowed' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            Πληρωμή με κάρτα — σύντομα
          </button>
        </div>
      </div>
    </div>
  );
}
