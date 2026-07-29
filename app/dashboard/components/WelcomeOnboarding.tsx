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
import { T } from '@/components/Theme';
import { defaultBookkeeping, type LegalForm, type BookKeeping } from '@/lib/accounting/dossier';

interface Props {
  userId: string;
  onAddProperty: () => void;                 // άνοιγμα wizard προσθήκης
  onScanCreate: () => void;                  // δημιουργία + άνοιγμα σάρωσης εγγράφου
  onDemoReady: (propertyId: string) => void; // μετά το seed, πήγαινε στο ακίνητο
  onProfile?: (v: 'individual' | 'professional') => void; // επιλογή τύπου προφίλ
  onClose: () => void;                       // «αργότερα» / κλείσιμο
}

const SLIDES = [
  {
    icon: 'M3 9.5 12 3l9 6.5|M5 10v10h14V10',
    title: 'Καλωσόρισες στο Property OS',
    body: 'Όλη η διαχείριση των ακινήτων σου σε ένα σημείο: έσοδα, δαπάνες, λογαριασμοί, ενοικιαστές και επισκέπτες — και τη Νόα δίπλα σου, να απαντάει για τα δικά σου νούμερα.',
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

export default function WelcomeOnboarding({ userId, onAddProperty, onScanCreate, onDemoReady, onProfile, onClose }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<'individual' | 'professional'>('individual');
  const chooseProfile = (v: 'individual' | 'professional') => {
    setProfile(v); onProfile?.(v);
    supabase.from('billing_profiles').upsert({ user_id: userId, profile_type: v }, { onConflict: 'user_id' }).then(() => {});
  };

  // ── Νομική μορφή ─────────────────────────────────────────────────────────
  // ΓΙΑΤΙ ΡΩΤΑΜΕ. Από αυτό κρίνεται αν ο χρήστης θα δει ποτέ ΕΦΚΑ, Ε3, απόσβεση
  // κτιρίου και τη λέξη «ισολογισμός». Δεν συμπεραίνεται από τον τύπο προφίλ: ένας
  // επαγγελματίας διαχειριστής δεν είναι απαραίτητα επιχείρηση, και ένας «ιδιώτης»
  // μπορεί να έχει ατομική. Λάθος μαντεψιά είτε κρύβει υποχρεωτικές καταστάσεις
  // από μια ΙΚΕ, είτε τρομάζει κάποιον με ένα κληρονομικό διαμέρισμα.
  //
  // ΓΙΑΤΙ ΣΤΑΔΙΑΚΑ. Πρώτα ένα ναι/όχι. Ο 25χρονος που κληρονόμησε πατά «Φυσικό
  // πρόσωπο» και δεν βλέπει ΠΟΤΕ τις λέξεις «απλογραφικά» και «διπλογραφικά» —
  // αυτές εμφανίζονται μόνο σε όποιον δήλωσε ότι έχει επιχείρηση.
  const [hasBiz, setHasBiz] = useState<boolean | null>(null);
  const [legalForm, setLegalForm] = useState<LegalForm>('individual');
  const [books, setBooks] = useState<BookKeeping>('none');

  const saveLegal = (form: LegalForm, bk: BookKeeping) => {
    setLegalForm(form); setBooks(bk);
    supabase.from('billing_profiles').upsert({ user_id: userId, legal_form: form, bookkeeping: bk }, { onConflict: 'user_id' }).then(() => {});
  };
  // Η μορφή προτείνει βιβλία (ΙΚΕ → διπλογραφικά, ατομική/ΟΕ → απλογραφικά) αλλά
  // ο χρήστης έχει τον τελευταίο λόγο: μια Ο.Ε. μπορεί κάλλιστα να είναι διπλογραφικά.
  const chooseForm = (form: LegalForm) => saveLegal(form, defaultBookkeeping(form));
  const chooseBiz = (v: boolean) => {
    setHasBiz(v);
    if (v) chooseForm('sole_trader'); else saveLegal('individual', 'none');
  };

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
        user_id: userId, name: 'Demo: Διαμέρισμα, Κουκάκι', prop_type: 'apartment', status_detail: 'seasonal',
        address: 'Δείγμα, Αθήνα', postal_code: '11742', sqm: 62, value: 195000, target_rent: 850, year_built: 2006, bedrooms: 1,
      }).select('id').single();
      if (pe || !prop) throw new Error(pe?.message || 'demo property');
      const pid = prop.id as string;

      const { data: cl } = await supabase.from('clients').insert({
        user_id: userId, type: 'client', full_name: 'Demo: Επισκέπτης', stage: 'closed', notes: 'Δείγμα για επίδειξη.',
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

  // Premium κουμπιά (κεντραρισμένα, καθαρά, με hover) — χωρίς το γενικό Btn.
  const primaryBtn: React.CSSProperties = {
    width: '100%', height: 50, borderRadius: 10, border: 'none', cursor: busy ? 'default' : 'pointer',
    background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, fontFamily: T.font.sans,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '-0.01em',
    boxShadow: '0 8px 20px -8px color-mix(in srgb, var(--accent) 65%, transparent)',
    transition: 'filter 0.15s ease, transform 0.08s ease', opacity: busy ? 0.7 : 1,
  };
  const secondaryBtn: React.CSSProperties = {
    width: '100%', height: 48, borderRadius: 10, cursor: busy ? 'default' : 'pointer',
    background: 'var(--surface-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-default)',
    fontSize: 14, fontWeight: 600, fontFamily: T.font.sans, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'var(--highlight-inset), var(--elev-1)', transition: 'background 0.15s ease, transform 0.08s ease',
  };
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.font.sans,
    padding: '8px 6px', width: '100%', textAlign: 'center',
  };
  // Μία ετικέτα ενότητας και δύο σχήματα επιλογής για ΟΛΕΣ τις ερωτήσεις αυτής
  // της οθόνης: κάρτα για τη βασική επιλογή, pill για τη λεπτομέρεια. Χωρίς αυτά
  // η ίδια επιλογή γραφόταν τρεις φορές με τρεις μικροδιαφορές.
  const capLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 10,
  };
  const choice = (on: boolean): React.CSSProperties => ({
    textAlign: 'center', cursor: 'pointer', borderRadius: 10, padding: '11px 8px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
    background: on ? 'var(--accent-soft)' : 'var(--surface-raised)',
    boxShadow: on ? '0 0 0 3px var(--accent-dim)' : 'none',
    transition: 'all 0.15s', fontFamily: T.font.sans,
  });
  const pill = (on: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 88, cursor: 'pointer', borderRadius: 100, padding: '7px 12px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
    background: on ? 'var(--accent-soft)' : 'var(--surface-raised)',
    color: on ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, transition: 'all 0.15s',
  });

  const press = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.985)'; };
  const release = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'none'; };
  const brighten = (e: React.MouseEvent<HTMLButtonElement>) => { if (!busy) e.currentTarget.style.filter = 'brightness(1.06)'; };
  const unbrighten = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.filter = 'none'; };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 16 }}>
      <style>{`@keyframes welcomeIn{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:none}}`}</style>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(440px, 100%)', overflow: 'hidden', boxShadow: 'var(--elev-3)', fontFamily: T.font.sans, animation: 'welcomeIn 0.3s cubic-bezier(0.2,0,0,1)' }}>
        {/* Κεφαλίδα: παράλειψη */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>
          <button onClick={later} style={{ ...linkBtn, width: 'auto', color: 'var(--text-tertiary)', fontSize: 12, padding: 6 }}>Παράλειψη</button>
        </div>

        {/* Οπτικό + κείμενο */}
        <div style={{ padding: '4px 36px 4px', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: 'linear-gradient(150deg, var(--accent-soft), color-mix(in srgb, var(--accent) 8%, transparent))', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>{ic(s.icon)}</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.25, marginBottom: 12 }}>{s.title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)', minHeight: 92, maxWidth: 340, margin: '0 auto' }}>{s.body}</div>
        </div>

        {/* Επιλογή τύπου προφίλ (μόνο στο πρώτο slide) */}
        {step === 0 && (
          <div style={{ padding: '18px 24px 0' }}>
            <div style={capLabel}>Τι σε περιγράφει;</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([['individual', 'Ιδιώτης', 'δικά μου ακίνητα'], ['professional', 'Επαγγελματίας', 'διαχείριση πολλών']] as const).map(([v, t, sub]) => {
                const on = profile === v;
                return (
                  <button key={v} onClick={() => chooseProfile(v)} style={choice(on)}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-primary)' }}>{t}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Νομική μορφή: ένα ναι/όχι, και τα υπόλοιπα μόνο αν χρειάζονται. */}
            <div style={{ ...capLabel, marginTop: 18 }}>Φορολογικά, τι είσαι;</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([[false, 'Φυσικό πρόσωπο', 'μόνο δήλωση'], [true, 'Έχω επιχείρηση', 'ή ελεύθ. επαγγελματίας']] as const).map(([v, t, sub]) => (
                <button key={String(v)} onClick={() => chooseBiz(v)} style={choice(hasBiz === v)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: hasBiz === v ? 'var(--accent)' : 'var(--text-primary)' }}>{t}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>

            {hasBiz === true && (
              <>
                <div style={{ ...capLabel, marginTop: 14 }}>Μορφή</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([['sole_trader', 'Ατομική'], ['partnership', 'ΟΕ / ΕΕ'], ['company', 'ΑΕ / ΕΠΕ / ΙΚΕ']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => chooseForm(v)} style={pill(legalForm === v)}>{t}</button>
                  ))}
                </div>

                <div style={{ ...capLabel, marginTop: 14 }}>Βιβλία</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([['single_entry', 'Απλογραφικά'], ['double_entry', 'Διπλογραφικά']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => saveLegal(legalForm, v)} style={pill(books === v)}>{t}</button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.45 }}>
                  Δεν είσαι σίγουρος; Άσε την πρόταση όπως είναι — αλλάζει από τις Ρυθμίσεις όποτε θέλεις.
                </div>
              </>
            )}
          </div>
        )}

        {/* Δείκτες βημάτων */}
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', padding: '20px 0 22px' }}>
          {SLIDES.map((_, i) => (
            <span key={i} style={{ width: i === step ? 24 : 7, height: 7, borderRadius: 6, background: i === step ? 'var(--accent)' : 'var(--border-default)', transition: 'all 0.28s cubic-bezier(0.2,0,0,1)' }} />
          ))}
        </div>

        {/* Ενέργειες */}
        <div style={{ padding: '0 24px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!last ? (
            <button onClick={() => setStep(step + 1)} style={primaryBtn} onMouseEnter={brighten} onMouseLeave={e => { unbrighten(e); release(e); }} onMouseDown={press} onMouseUp={release}>Επόμενο</button>
          ) : (
            <>
              <button onClick={addProperty} disabled={busy} style={primaryBtn} onMouseEnter={brighten} onMouseLeave={e => { unbrighten(e); release(e); }} onMouseDown={press} onMouseUp={release}>Πρόσθεσε το πρώτο σου ακίνητο</button>
              <button onClick={startDemo} disabled={busy} style={secondaryBtn} onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--bg-elevated)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-raised)'; release(e); }} onMouseDown={press} onMouseUp={release}>{busy ? 'Προετοιμασία demo…' : 'Δες demo με έτοιμα δεδομένα'}</button>
              <button onClick={scanCreate} disabled={busy} style={{ ...linkBtn, color: 'var(--accent)' }}>ή σκάναρε λογαριασμό ή συμβόλαιο</button>
              <button onClick={later} disabled={busy} style={{ ...linkBtn, color: 'var(--text-tertiary)' }}>Θα το κάνω αργότερα</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
