'use client';

// ═══════════════════════════════════════════════════════════════════════════
// WelcomeOnboarding — η πρώτη είσοδος, σε τέσσερις κάρτες
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ. Οι τρεις παλιές διαφάνειες περιέγραφαν την εφαρμογή με
// επίθετα («όλη η διαχείριση σε ένα σημείο», «βγάλε τα περισσότερα από κάθε
// νύχτα»). Κάθε προϊόν λέει τα ίδια. Οι τέσσερις κάρτες λένε τέσσερα πράγματα
// με την ίδια σειρά: πού βρίσκεσαι στην εφαρμογή, τι είναι αυτό, γιατί αξίζει,
// και η ΑΠΟΔΕΙΞΗ σε αριθμούς.
//
// ΟΙ ΑΡΙΘΜΟΙ ΤΩΝ ΚΑΡΤΩΝ ΔΕΝ ΕΙΝΑΙ ΓΡΑΜΜΕΝΟΙ ΕΔΩ. Βγαίνουν από το
// lib/demo/sample.ts και από το πραγματικό φορολογικό ημερολόγιο. Ένας αριθμός
// γραμμένος στο χέρι σε οθόνη υποδοχής γερνά σιωπηλά: την επόμενη χρονιά
// υπόσχεται προθεσμία που πέρασε, ή φόρο με κλίμακα που καταργήθηκε.
//
// ΟΙ ΕΡΩΤΗΣΕΙΣ ΕΙΝΑΙ ΣΤΗΝ ΤΕΛΕΥΤΑΙΑ ΚΑΡΤΑ, ΟΧΙ ΣΤΗΝ ΠΡΩΤΗ. Πριν δει τι αγοράζει,
// ο χρήστης δεν έχει λόγο να δηλώσει νομική μορφή· στο σημείο που πατά «Ας
// ξεκινήσουμε», έχει.
//
// ═══ ΓΙΑΤΙ ΑΥΤΟ ΔΕΝ ΕΓΙΝΕ Modal ═══════════════════════════════════════════
// 1. ΔΕΝ ΚΛΕΙΝΕΙ ΜΕ Escape ΟΥΤΕ ΜΕ ΚΛΙΚ ΣΤΟ ΦΟΝΤΟ, ΕΠΙΤΗΔΕΣ. Ο μόνος δρόμος
//    εξόδου είναι το «Αργότερα», που πρώτα γράφει `welcomed: true` στο
//    onboarding_progress και ΜΕΤΑ κλείνει. Με Modal, ένα Escape θα καλούσε
//    κατευθείαν το onClose του γονέα (σκέτο `setShowWelcome(false)`): η υποδοχή
//    θα «έκλεινε» χωρίς να καταγραφεί και θα ξαναέσκαγε στην επόμενη φόρτωση.
// 2. ΔΕΝ ΕΙΝΑΙ ΤΙΤΛΟΣ + ΣΩΜΑ + ΕΝΕΡΓΕΙΕΣ, είναι κάρτα με δεδομένα και δείκτες
//    βημάτων. Η κεφαλίδα του Modal θα πρόσθετε δεύτερο τρόπο κλεισίματος δίπλα
//    στο «Αργότερα» — δηλαδή θα έλεγε το ίδιο πράγμα δύο φορές.
// 3. ΖΕΙ ΠΑΝΩ ΑΠΟ ΤΑ ΠΑΡΑΘΥΡΑ (z-index 3000): από εδώ ανοίγει ο οδηγός
//    προσθήκης ακινήτου, δεν ανοίγει από πάνω του.
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, TT, fe } from '@/components/Theme';
import { isoDate } from '@/lib/core/time';
import { saved } from '@/components/dbWrite';
import * as billing from '@/lib/data/billing';
import { defaultBookkeeping, type LegalForm, type BookKeeping } from '@/lib/accounting/dossier';
import { demoSummary, demoLedger, demoExpenses } from '@/lib/demo/sample';
import { expenseAccount } from '@/lib/accounting/journal';
import { categoryLabel } from '@/lib/expenses/taxonomy';
import { taxObligationsHorizon } from '@/lib/tax/greekTaxCalendar';

interface Props {
  userId: string;
  onAddProperty: () => void;                 // άνοιγμα οδηγού προσθήκης
  onScanCreate: () => void;                  // δημιουργία + άνοιγμα σάρωσης εγγράφου
  onProfile?: (v: 'individual' | 'professional') => void;
  onClose: () => void;                       // «Αργότερα» / κλείσιμο
}

interface CardRow { left: string; right: string }
interface WelcomeCard { label: string; title: string; copy: string; rows: [CardRow, CardRow] }

/** Ημέρα και μήνας μιας προθεσμίας, όπως γράφεται σε ημερολόγιο. */
const dayMonth = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Οι τέσσερις κάρτες, με τα δεδομένα τους.
 *
 * ΤΑ ΛΕΚΤΙΚΑ ΕΙΝΑΙ ΟΝΟΜΑΤΙΚΕΣ ΦΡΑΣΕΙΣ, ΟΧΙ ΠΡΟΣΤΑΚΤΙΚΗ. «Ο φάκελος του
 * λογιστή», όχι «Ετοίμασε τον φάκελο». Η προστακτική ανήκει στα κουμπιά.
 * Τα τέσσερα κείμενα γράφτηκαν να έχουν σχεδόν ίδιο μήκος ώστε να ξεκινούν και
 * να τελειώνουν μαζί μέσα στην κάρτα.
 */
function buildCards(today: string): WelcomeCard[] {
  const s = demoSummary(today);
  const ledger = demoLedger(s.year);
  const power = demoExpenses(s.year).find(e => e.category === 'electricity')!;
  const deadlines = taxObligationsHorizon(today, 'long_term').slice(0, 2);
  const monthlyTax = s.statement.incomeTax / 12;

  return [
    {
      label: 'ΛΟΓΙΣΤΙΚΗ',
      title: 'Ο φάκελος του λογιστή',
      copy: 'Ένα ενημερωμένο αρχείο με όσα ζητά ο λογιστής και μια σελίδα με τις ελλείψεις.',
      rows: [
        { left: `Κατάσταση αποτελεσμάτων ${s.year}`, right: fe(s.collected) },
        { left: 'Δαπάνες σε λογαριασμούς ΕΛΠ', right: `${ledger.length} κατηγορίες` },
      ],
    },
    {
      label: 'ΔΑΠΑΝΕΣ',
      title: 'Αναγνώριση παραστατικών',
      copy: 'Από τη σάρωση προκύπτουν η κατηγορία, το ΑΦΜ και ο λογαριασμός.',
      rows: [
        { left: power.description, right: fe(power.amount) },
        { left: categoryLabel(power.category), right: `λογαριασμός ${expenseAccount(power.category).code}` },
      ],
    },
    {
      label: 'ΥΠΟΧΡΕΩΣΕΙΣ',
      title: 'Το ημερολόγιο προθεσμιών',
      copy: 'Κάθε δήλωση και κάθε δόση με την επίσημη καταληκτική ημερομηνία.',
      rows: [
        { left: deadlines[0]?.title ?? '', right: deadlines[0] ? dayMonth(deadlines[0].date) : '' },
        { left: deadlines[1]?.title ?? '', right: deadlines[1] ? dayMonth(deadlines[1].date) : '' },
      ],
    },
    {
      label: 'ΒΟΗΘΟΣ',
      title: 'Νόα, δίπλα σου',
      copy: 'Απαντά στα ελληνικά, με βάση τα δικά σου δεδομένα και στοιχεία.',
      rows: [
        { left: 'Πόσο φόρο θα πληρώσω φέτος;', right: fe(s.statement.incomeTax) },
        { left: 'Στο παράδειγμα της χρονιάς', right: `${fe(monthlyTax)} τον μήνα` },
      ],
    },
  ];
}

export default function WelcomeOnboarding({ userId, onAddProperty, onScanCreate, onProfile, onClose }: Props) {
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<'individual' | 'professional'>('individual');
  const [cards] = useState(() => buildCards(isoDate(new Date())));

  const chooseProfile = (v: 'individual' | 'professional') => {
    setProfile(v); onProfile?.(v);
    void saved('Ο τύπος προφίλ δεν αποθηκεύτηκε',
      billing.save(supabase, userId, { profile_type: v }));
  };

  // ── Νομική μορφή ─────────────────────────────────────────────────────────
  // ΓΙΑΤΙ ΡΩΤΑΜΕ. Από αυτό κρίνεται αν ο χρήστης θα δει ποτέ ΕΦΚΑ, Ε3, απόσβεση
  // κτιρίου και τη λέξη «ισολογισμός». Δεν συμπεραίνεται από τον τύπο προφίλ: ένας
  // επαγγελματίας διαχειριστής δεν είναι απαραίτητα επιχείρηση και ένας «ιδιώτης»
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
    void saved('Η νομική μορφή δεν αποθηκεύτηκε',
      billing.save(supabase, userId, { legal_form: form, bookkeeping: bk }));
  };
  // Η μορφή προτείνει βιβλία (ΙΚΕ → διπλογραφικά, ατομική/ΟΕ → απλογραφικά) αλλά
  // ο χρήστης έχει τον τελευταίο λόγο: μια Ο.Ε. μπορεί κάλλιστα να είναι διπλογραφικά.
  const chooseForm = (form: LegalForm) => saveLegal(form, defaultBookkeeping(form));
  const chooseBiz = (v: boolean) => {
    setHasBiz(v);
    if (v) chooseForm('sole_trader'); else saveLegal('individual', 'none');
  };

  const mark = async () => {
    await saved('Η πρόοδος της υποδοχής δεν αποθηκεύτηκε', supabase.from('onboarding_progress')
      .upsert({ user_id: userId, welcomed: true, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
  };

  const addProperty = async () => { await mark(); onAddProperty(); };
  const scanCreate = async () => { await mark(); onScanCreate(); };
  const later = async () => { await mark(); onClose(); };

  const c = cards[step];
  const last = step === cards.length - 1;

  // Premium κουμπιά (καθαρά, με hover) — χωρίς το γενικό Btn: εδώ τα κουμπιά
  // πιάνουν όλο το πλάτος της κάρτας και έχουν δική τους ιεραρχία βάρους.
  const primaryBtn: React.CSSProperties = {
    height: T.h.lg, borderRadius: T.radius.inner, border: 'none', cursor: 'pointer',
    background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, fontFamily: T.font.sans,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '-0.01em',
    padding: '0 22px',
    boxShadow: '0 8px 20px -8px color-mix(in srgb, var(--accent) 65%, transparent)',
    transition: `filter 0.15s ${T.ease.standard}, transform 0.15s ${T.ease.standard}`,
  };
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-base)', fontWeight: 600, fontFamily: T.font.sans,
    // Πρώτη οθόνη κάθε νέου λογαριασμού και τα δύο κουμπιά της ήταν 32ψηλά.
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: T.h.md,
    padding: '8px 12px', textAlign: 'center',
  };
  // Μία ετικέτα ενότητας και δύο σχήματα επιλογής για ΟΛΕΣ τις ερωτήσεις αυτής
  // της οθόνης: κάρτα για τη βασική επιλογή, pill για τη λεπτομέρεια. Χωρίς αυτά
  // η ίδια επιλογή γραφόταν τρεις φορές με τρεις μικροδιαφορές.
  const capLabel: React.CSSProperties = { ...TT.label, color: 'var(--text-tertiary)', marginBottom: 10 };
  const choice = (on: boolean): React.CSSProperties => ({
    textAlign: 'center', cursor: 'pointer', borderRadius: T.radius.inner, padding: '11px 8px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
    background: on ? 'var(--accent-soft)' : 'var(--surface-raised)',
    boxShadow: on ? '0 0 0 3px var(--accent-dim)' : 'none',
    transition: `background-color 0.15s ${T.ease.standard}, border-color 0.15s ${T.ease.standard}, box-shadow 0.15s ${T.ease.standard}`,
    fontFamily: T.font.sans,
  });
  const pill = (on: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 88, cursor: 'pointer', borderRadius: T.radius.pill, padding: '7px 12px',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
    background: on ? 'var(--accent-soft)' : 'var(--surface-raised)',
    color: on ? 'var(--accent)' : 'var(--text-secondary)',
    fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
    transition: `background-color 0.15s ${T.ease.standard}, border-color 0.15s ${T.ease.standard}, color 0.15s ${T.ease.standard}`,
  });

  const press = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'scale(0.985)'; };
  const release = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.transform = 'none'; };
  const brighten = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.filter = 'brightness(1.06)'; };
  const unbrighten = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.filter = 'none'; };

  return (
    <div role="dialog" aria-modal="true" aria-label="Καλωσόρισμα"
      style={{ position: 'fixed', inset: 0, background: T.scrim, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: T.sp.lg, overflowY: 'auto' }}>
      <style>{`@keyframes welcomeIn{from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:none}}`}</style>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.modal, width: 'min(460px, 100%)', boxShadow: 'var(--elev-3)', fontFamily: T.font.sans, animation: `welcomeIn 0.3s ${T.ease.standard}`, padding: '26px 26px 22px' }}>

        {/* ── Η ΚΑΡΤΑ ────────────────────────────────────────────────────────
            Ετικέτα, τίτλος, κείμενο, δεδομένα — πάντα με αυτή τη σειρά και σε
            σταθερά ύψη, ώστε καμία λέξη να μη μετακινείται από κάρτα σε κάρτα. */}
        <div style={{ ...TT.label, color: 'var(--accent)' }}>{c.label}</div>
        <div style={{ ...TT.h1, fontSize: 20, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
        <div style={{ ...TT.bodySm, fontSize: 'var(--fs-base)', lineHeight: 1.55, marginTop: 8, minHeight: 40 }}>{c.copy}</div>

        <div style={{ marginTop: 16, border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, background: 'var(--bg-elevated)', padding: '12px 14px' }}>
          {c.rows.map((r, i) => (
            <div key={r.left} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: T.sp.md, marginTop: i === 0 ? 0 : 8 }}>
              <span style={{ ...(i === 0 ? TT.bodySm : TT.caption), color: i === 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.left}</span>
              <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: i === 0 ? 13 : 11, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{r.right}</span>
            </div>
          ))}
        </div>

        {/* ── ΟΙ ΕΡΩΤΗΣΕΙΣ, ΜΟΝΟ ΣΤΗΝ ΤΕΛΕΥΤΑΙΑ ΚΑΡΤΑ ────────────────────── */}
        {last && (
          <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={capLabel}>ΤΙ ΣΕ ΠΕΡΙΓΡΑΦΕΙ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([['individual', 'Ιδιώτης', 'δικά μου ακίνητα'], ['professional', 'Επαγγελματίας', 'διαχείριση πολλών']] as const).map(([v, t, sub]) => {
                const on = profile === v;
                return (
                  <button key={v} onClick={() => chooseProfile(v)} style={choice(on)}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-primary)' }}>{t}</div>
                    <div style={{ ...TT.caption, marginTop: 2 }}>{sub}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ ...capLabel, marginTop: 18 }}>ΦΟΡΟΛΟΓΙΚΑ, ΤΙ ΕΙΣΑΙ</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([[false, 'Φυσικό πρόσωπο', 'μόνο δήλωση'], [true, 'Έχω επιχείρηση', 'ή ελεύθ. επαγγελματίας']] as const).map(([v, t, sub]) => (
                <button key={String(v)} onClick={() => chooseBiz(v)} style={choice(hasBiz === v)}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: hasBiz === v ? 'var(--accent)' : 'var(--text-primary)' }}>{t}</div>
                  <div style={{ ...TT.caption, marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>

            {hasBiz === true && (
              <>
                <div style={{ ...capLabel, marginTop: 14 }}>ΜΟΡΦΗ</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([['sole_trader', 'Ατομική'], ['partnership', 'ΟΕ / ΕΕ'], ['company', 'ΑΕ / ΕΠΕ / ΙΚΕ']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => chooseForm(v)} style={pill(legalForm === v)}>{t}</button>
                  ))}
                </div>

                <div style={{ ...capLabel, marginTop: 14 }}>ΒΙΒΛΙΑ</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([['single_entry', 'Απλογραφικά'], ['double_entry', 'Διπλογραφικά']] as const).map(([v, t]) => (
                    <button key={v} onClick={() => saveLegal(legalForm, v)} style={pill(books === v)}>{t}</button>
                  ))}
                </div>
                <div style={{ ...TT.caption, marginTop: 8 }}>
                  Η πρόταση αλλάζει από τις Ρυθμίσεις όποτε χρειαστεί.
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ΔΕΙΚΤΕΣ ΚΑΙ ΕΝΕΡΓΕΙΕΣ, ΣΤΗΝ ΙΔΙΑ ΓΡΑΜΜΗ ────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.md, marginTop: 22, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 7, flex: 1 }}>
            {cards.map((_, i) => (
              <span key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 6, background: i === step ? 'var(--accent)' : 'var(--border-default)', transition: `width 0.28s ${T.ease.standard}, background-color 0.28s ${T.ease.standard}` }} />
            ))}
          </div>
          {!last && <button onClick={later} style={{ ...linkBtn, color: 'var(--text-tertiary)' }}>Αργότερα</button>}
          {!last
            ? <button onClick={() => setStep(step + 1)} style={primaryBtn} onMouseEnter={brighten} onMouseLeave={e => { unbrighten(e); release(e); }} onMouseDown={press} onMouseUp={release}>Επόμενο</button>
            : <button onClick={addProperty} style={primaryBtn} onMouseEnter={brighten} onMouseLeave={e => { unbrighten(e); release(e); }} onMouseDown={press} onMouseUp={release}>Ας ξεκινήσουμε</button>}
        </div>

        {last && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: T.sp.md, marginTop: 6 }}>
            <button onClick={scanCreate} style={{ ...linkBtn, color: 'var(--accent)' }}>Σάρωση εγγράφου</button>
            <button onClick={later} style={{ ...linkBtn, color: 'var(--text-tertiary)' }}>Αργότερα</button>
          </div>
        )}
      </div>
    </div>
  );
}
