'use client';

// ═══════════════════════════════════════════════════════════════════════════
// WelcomeOnboarding — καλωσόρισμα πρώτης χρήσης (guided first-run). Τρεις οθόνες
// (τι κάνει το app, τι θα δεις, πώς ξεκινάς) και επιλογές: προσθήκη πρώτου
// ακινήτου, demo (με δείγμα δεδομένων ώστε να λάμψουν τιμολόγηση/φόρος), ή
// «αργότερα». Η πρόοδος αποθηκεύεται στη βάση (onboarding_progress) ώστε να μη
// ξαναεμφανίζεται. Σχεδίαση: premium, minimal, Google αισθητική, near-monochrome.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn } from '@/components/Theme';

interface Props {
  userId: string;
  onAddProperty: () => void;                 // άνοιγμα wizard προσθήκης
  onScanCreate: () => void;                  // δημιουργία + άνοιγμα σάρωσης εγγράφου
  onDemoReady: (propertyId: string) => void; // μετά το seed, πήγαινε στο ακίνητο
  onClose: () => void;                       // «αργότερα» / κλείσιμο
}

const SLIDES = [
  {
    icon: 'M3 9.5 12 3l9 6.5|M5 10v10h14V10',
    title: 'Καλωσόρισες στο Property OS',
    body: 'Όλη η διαχείριση των ακινήτων σου σε ένα σημείο: έσοδα, δαπάνες, λογαριασμοί, ενοικιαστές και επισκέπτες, με έναν βοηθό τεχνητής νοημοσύνης δίπλα σου.',
  },
  {
    icon: 'M20 12V7H4v10h10|M4 11h16|M16 19l2 2 4-4',
    title: 'Βγάλε τα περισσότερα από κάθε νύχτα',
    body: 'Δυναμική τιμολόγηση με βάση την ελληνική εποχικότητα και τη ζήτηση, φορολογική εικόνα βραχυχρόνιας μίσθωσης, και αυτόματος συγχρονισμός κρατήσεων από Airbnb και Booking.',
  },
  {
    icon: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    title: 'Ας ξεκινήσουμε',
    body: 'Πρόσθεσε το πρώτο σου ακίνητο σε ένα λεπτό και θα δεις αμέσως τι αξίζει. Θέλεις να ρίξεις μια ματιά πρώτα; Δοκίμασε το demo με έτοιμα δείγματα.',
  },
];

const ic = (d: string) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>;

export default function WelcomeOnboarding({ userId, onAddProperty, onScanCreate, onDemoReady, onClose }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const mark = async (patch: Record<string, boolean>) => {
    try { await supabase.from('onboarding_progress').upsert({ user_id: userId, welcomed: true, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); } catch {}
  };

  const addProperty = async () => { await mark({}); onAddProperty(); };
  const scanCreate = async () => { await mark({}); onScanCreate(); };
  const later = async () => { await mark({}); onClose(); };

  // Demo: δημιουργεί ένα δείγμα ακινήτου με διαμονές ώστε να λάμψουν τα εργαλεία.
  const startDemo = async () => {
    setBusy(true);
    try {
      const { data: prop, error: pe } = await supabase.from('user_properties').insert({
        user_id: userId, name: 'Demo — Διαμέρισμα, Κουκάκι', prop_type: 'apartment', status_detail: 'seasonal',
        address: 'Δείγμα, Αθήνα', postal_code: '11742', sqm: 62, value: 195000, target_rent: 850, year_built: 2006, bedrooms: 1,
      }).select('id').single();
      if (pe || !prop) throw new Error(pe?.message || 'demo property');
      const pid = prop.id as string;

      const { data: cl } = await supabase.from('clients').insert({
        user_id: userId, type: 'client', full_name: 'Demo — Επισκέπτης', stage: 'closed', notes: 'Δείγμα για επίδειξη.',
      }).select('id').single();
      const clientId = cl?.id as string | undefined;

      if (clientId) {
        const iso = (dt: Date) => dt.toISOString().slice(0, 10);
        const mk = (offsetDays: number, nights: number, rate: number, channel: string) => {
          const ci = new Date(); ci.setDate(ci.getDate() + offsetDays);
          const co = new Date(ci); co.setDate(co.getDate() + nights);
          return { user_id: userId, client_id: clientId, property_id: pid, check_in: iso(ci), check_out: iso(co), nights, nightly_rate: rate, total: nights * rate, channel };
        };
        await supabase.from('client_stays').insert([
          mk(-45, 4, 95, 'airbnb'), mk(-20, 3, 110, 'booking'), mk(8, 5, 120, 'airbnb'), mk(30, 2, 130, 'airbnb'),
        ]);
      }
      await supabase.from('pricing_settings').upsert({ user_id: userId, property_id: pid, base: 100, min_price: 60, max_price: 220, weekend_premium: 0.18, min_stay: 2, updated_at: new Date().toISOString() }, { onConflict: 'user_id,property_id' });

      await mark({ demo_seen: true, first_property: true });
      onDemoReady(pid);
    } catch {
      // Αν αποτύχει το demo, απλώς προχώρα στην κανονική προσθήκη.
      await mark({});
      onAddProperty();
    } finally { setBusy(false); }
  };

  const s = SLIDES[step];
  const last = step === SLIDES.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 22, width: 'min(460px, 100%)', overflow: 'hidden', boxShadow: 'var(--elev-3)', fontFamily: T.font.sans }}>
        {/* Κεφαλίδα: παράλειψη */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px 0' }}>
          <button onClick={later} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, padding: 6 }}>Παράλειψη</button>
        </div>

        {/* Οπτικό + κείμενο */}
        <div style={{ padding: '8px 32px 4px', textAlign: 'center' }}>
          <div style={{ width: 68, height: 68, borderRadius: 18, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>{ic(s.icon)}</div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 10 }}>{s.title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', minHeight: 88 }}>{s.body}</div>
        </div>

        {/* Δείκτες βημάτων */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '18px 0 20px' }}>
          {SLIDES.map((_, i) => (
            <span key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 4, background: i === step ? 'var(--accent)' : 'var(--border-default)', transition: 'all 0.25s ease' }} />
          ))}
        </div>

        {/* Ενέργειες */}
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!last ? (
            <Btn variant="primary" onClick={() => setStep(step + 1)}>Επόμενο</Btn>
          ) : (
            <>
              <Btn variant="primary" onClick={addProperty} disabled={busy}>Πρόσθεσε το πρώτο ακίνητο</Btn>
              <Btn variant="secondary" onClick={startDemo} disabled={busy}>{busy ? 'Προετοιμασία demo…' : 'Δες demo με έτοιμα δεδομένα'}</Btn>
              <button onClick={scanCreate} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, padding: 6 }}>ή σκάναρε λογαριασμό/συμβόλαιο για γρήγορη προσθήκη</button>
              <button onClick={later} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, padding: 6 }}>Θα το κάνω αργότερα</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
