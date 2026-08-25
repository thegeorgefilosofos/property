'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΠΥΛΗ ΛΟΓΙΣΤΗ: Η ΚΑΤΑΣΤΑΣΗ ΜΙΑΣ ΧΡΗΣΗΣ, ΜΕ ΑΡΧΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Read-only, χωρίς λογαριασμό. Διαβάζει μέσω `get_accountant_data` την εικόνα
// εσόδων και δαπανών ανά ακίνητο για μία χρήση.
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΑΛΛΑΞΑΝ ΕΔΩ, ΚΑΙ ΤΑ ΤΡΙΑ ΕΙΝΑΙ ΟΥΣΙΑ:
//
// 1. Η ΟΘΟΝΗ ΔΕΝ ΚΑΤΕΒΑΖΕ ΤΙΠΟΤΑ. Ο λογιστής διάβαζε νούμερα και τα
//    ξαναπληκτρολογούσε στο πρόγραμμά του. Τώρα φεύγει .xlsx με ζωντανά
//    αριθμητικά κελιά: γραμμή ανά ακίνητο (εκεί πάει το Ε2), αναλυτικές
//    δαπάνες, αναλυτικές διαμονές και τι λείπει. Ο υπολογισμός είναι ο ΙΔΙΟΣ
//    με της οθόνης — ζει στο app/accountant/statement.ts — ώστε να μην υπάρξει
//    ποτέ οθόνη που λέει άλλο ποσό από το αρχείο που κατεβαίνει από αυτήν.
//
// 2. Η ΟΘΟΝΗ ΕΛΕΓΕ ΤΟ ΑΝΤΙΘΕΤΟ ΑΠΟ ΟΣΑ ΕΝΝΟΟΥΣΕ. «Κανένα ακίνητο χωρίς
//    καταχωρημένη είσπραξη: Διαμέρισμα Παγκράτι, Στούντιο Κουκάκι» — δηλαδή
//    «όλα εντάξει», ακολουθούμενο από τη λίστα αυτών που δεν είναι. Οι
//    προτάσεις παράγονται πλέον σε ένα σημείο και δοκιμάζονται.
//
// 3. Ο ΦΟΡΟΣ ΚΑΤΕΒΗΚΕ ΑΠΟ ΤΗΝ ΚΟΡΥΦΗ. Ηταν σε ίδια οπτική τάξη με τα
//    πραγματικά ποσά, με έντονη γραφή, δίπλα σε δύο μετρημένα μεγέθη. Είναι
//    το μόνο νούμερο της σελίδας που μπορεί να ΜΗΝ ισχύει: η τεκμαρτή έκπτωση
//    προϋποθέτει τραπεζική είσπραξη, που από εδώ δεν φαίνεται. Μένει, γιατί
//    είναι χρήσιμη διασταύρωση, αλλά κάτω από τη γραμμή και με το όνομά του:
//    ενδεικτικός. Τον φόρο τον βγάζει ο λογιστής, όχι εμείς.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rentalIncomeTax, rentalBracketsForYear, bracketsLabelForYear } from '@/lib/billing/greekTax';
import { presumptiveDeductionRate, PRESUMPTIVE_RULE_2026 } from '@/lib/billing/consolidate';
import { T, feAuto, Card } from '@/components/Theme';
// Η ΠΥΛΗ ΤΟΥ ΛΟΓΙΣΤΗ ΕΙΝΑΙ ΔΙΚΗ ΤΗΣ ΔΙΑΔΡΟΜΗ, ΚΑΙ ΚΟΥΒΑΛΟΥΣΕ ΚΙ ΕΚΕΙΝΗ ΤΑ
// 2,5 MB: ο λογιστής ανοίγει έναν σύνδεσμο, κοιτάζει και συνήθως δεν κατεβάζει
// τίποτα. Η πρόσοψη φορτώνει τη βιβλιοθήκη με το πάτημα.
import { downloadXlsx } from '@/app/dashboard/components/sheets';
import { PortalBar, PortalTitle, portalWrap } from '../Chrome';
import {
  propertyLines, statementTotals, statementGaps, statementSheets, type PortalData,
} from '../statement';

const dateEl = (d: Date) => d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function AccountantPortal() {
  const params = useParams();
  const token = String(params?.token || '');
  const supabase = useMemo(() => createClient(), []);

  // Ο λογιστής δουλεύει σχεδόν πάντα την προηγούμενη χρήση.
  const [year, setYear] = useState(() => new Date().getFullYear() - 1);
  // Η ΑΠΑΝΤΗΣΗ ΚΡΑΤΑΕΙ ΤΗ ΧΡΗΣΗ ΤΗΣ. Χωρίς αυτό χρειαζόταν ένα `setState('loading')`
  // μέσα στο effect — δηλαδή δεύτερη απόδοση σε κάθε αλλαγή έτους — και υπήρχε
  // στιγμή όπου η οθόνη έδειχνε τα ποσά της ΠΡΟΗΓΟΥΜΕΝΗΣ χρήσης κάτω από τον
  // τίτλο της νέας. Σε έγγραφο που διαβάζει λογιστής, αυτό δεν είναι τρεμόπαιγμα.
  const [result, setResult] = useState<{ year: number; data: PortalData | null; failed: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_accountant_data', { p_token: token, p_year: year }).then(({ data: d, error }) => {
      if (!alive) return;
      // ΤΟ ΣΦΑΛΜΑ ΔΕΝ ΕΙΝΑΙ «ΑΚΥΡΟΣ ΣΥΝΔΕΣΜΟΣ». Και τα δύο κατέληγαν στην ίδια
      // κάρτα: μια στιγμή χωρίς δίκτυο ή μια βάση που δεν απάντησε έλεγε στον
      // λογιστή ότι ο σύνδεσμος ανακλήθηκε. Εκείνος τηλεφωνούσε στον ιδιοκτήτη,
      // ο ιδιοκτήτης περιέστρεφε τον σύνδεσμο και ο παλιός πέθαινε στ' αλήθεια.
      setResult({ year, data: error ? null : ((d as PortalData) ?? null), failed: !!error });
    });
    return () => { alive = false; };
  }, [supabase, token, year]);

  // ── ΠΟΥ ΓΥΡΝΑΕΙ Ο ΑΝΘΡΩΠΟΣ ΑΠΟ ΕΔΩ ──────────────────────────────────────
  // Η οθόνη δεν είχε ΚΑΜΙΑ έξοδο. Ο λογιστής που ερχόταν από τη λίστα των
  // πελατών του έμενε εδώ, με μόνο δρόμο το βελάκι του περιηγητή· ο ιδιοκτήτης
  // που άνοιγε τον δικό του σύνδεσμο για να δει τι θα δει ο λογιστής, το ίδιο.
  // Δύο διαφορετικοί άνθρωποι, δύο διαφορετικά «πίσω».
  const [back, setBack] = useState<{ href: string; label: string } | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u, error: authFailed } = await supabase.auth.getUser();
      if (!alive) return;
      // ΑΓΝΩΣΤΟΣ ΕΠΙΣΚΕΠΤΗΣ ΔΕΝ ΕΧΕΙ ΠΟΥ ΝΑ ΓΥΡΙΣΕΙ, ΚΑΙ ΔΕΝ ΤΟΥ ΤΟ ΛΕΜΕ. Ο
      // λογιστής που άνοιξε τον σύνδεσμο χωρίς λογαριασμό είναι η συνηθισμένη
      // περίπτωση: μια έξοδος προς οθόνη σύνδεσης θα ήταν πόρτα, όχι έξοδος.
      if (authFailed || !u.user) { setBack(undefined); return; }
      // Ο ΙΔΙΟΚΤΗΤΗΣ ΠΡΟΕΠΙΣΚΟΠΕΙ ΤΟΝ ΔΙΚΟ ΤΟΥ ΣΥΝΔΕΣΜΟ. Η RLS του πίνακα τον
      // αφήνει να διαβάσει μόνο τη δική του γραμμή, οπότε η σύγκριση αρκεί.
      const { data: mine, error } = await supabase
        .from('accountant_links').select('token').eq('user_id', u.user.id).maybeSingle();
      if (!alive) return;
      // ΑΝ Η ΑΝΑΓΝΩΣΗ ΔΕΝ ΑΠΑΝΤΗΣΕ, Η ΕΞΟΔΟΣ ΜΕΝΕΙ Η ΓΕΝΙΚΗ. Το κενό εδώ θα
      // σήμαινε «δεν είσαι ο ιδιοκτήτης» με βεβαιότητα που δεν έχουμε· ο χώρος
      // των πελατών είναι σωστός προορισμός και για τους δύο ανθρώπους.
      const isOwner = !error && (mine as { token?: string } | null)?.token === token;
      setBack(isOwner
        ? { href: '/dashboard?tab=accounting', label: 'Η Λογιστική σου' }
        : { href: '/accountant/workspace', label: 'Οι πελάτες σου' });
    })();
    return () => { alive = false; };
  }, [supabase, token]);

  const fresh = result && result.year === year ? result : null;
  const state: 'loading' | 'ok' | 'notfound' | 'failed' =
    !fresh ? 'loading' : fresh.failed ? 'failed' : fresh.data ? 'ok' : 'notfound';
  const data = fresh?.data ?? null;

  const props = useMemo(() => data?.properties || [], [data]);
  const lines = useMemo(() => propertyLines(props), [props]);
  const totals = useMemo(() => statementTotals(lines), [lines]);
  const gaps = useMemo(() => statementGaps(lines), [lines]);

  // Η ΕΚΠΤΩΣΗ ΤΟΥ ΑΡΘΡΟΥ 39 §4 ΚΦΕ ΕΦΑΡΜΟΖΕΤΑΙ ΚΑΙ ΔΗΛΩΝΕΤΑΙ. Η προϋπόθεσή της
  // είναι τραπεζική είσπραξη (ν.5246/2025), που από αυτόν τον σύνδεσμο δεν
  // φαίνεται: γι' αυτό ο αριθμός λέγεται ενδεικτικός και όχι φόρος.
  const estTax = rentalIncomeTax(totals.income * (1 - presumptiveDeductionRate(true)), rentalBracketsForYear(year));

  const owner = data?.owner || 'Ιδιοκτήτης';
  const issued = dateEl(new Date());

  const download = () => {
    downloadXlsx(`Κατάσταση χρήσης ${year} ${owner}`,
      statementSheets({ owner, year, issued, lines }));
  };

  // ── Κοινά σχήματα της σελίδας ────────────────────────────────────────────
  const meta: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.7, fontFamily: T.font.sans };
  const over: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0, fontFamily: T.font.sans };

  const row = (k: string, v: string, strong?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: strong ? 700 : 600, color: 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' }}>{v}</span>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: T.font.sans, paddingBottom: 48 }}>
      {/* Το έγγραφο τυπώνεται. Η μπάρα, ο επιλογέας και το κουμπί λήψης δεν
          έχουν νόημα σε χαρτί· τα υπόλοιπα μένουν ακριβώς όπως στην οθόνη. */}
      <style>{`
        @media print {
          .portal-noprint { display: none; }
          body { background: white; }
        }
      `}</style>

      <div className="portal-noprint">
        <PortalBar year={state === 'ok' ? year : undefined} onYear={setYear} back={back} />
      </div>

      <div style={portalWrap}>
        {state === 'loading' && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 72, fontSize: 13 }}>Φόρτωση…</div>
        )}

        {/* ΔΥΟ ΑΣΤΟΧΙΕΣ, ΔΥΟ ΜΗΝΥΜΑΤΑ. «Δεν βρέθηκε» σημαίνει ότι ο σύνδεσμος
            όντως τελείωσε. «Δεν απάντησε» σημαίνει ότι φταίει η στιγμή και η
            σωστή κίνηση είναι μια ανανέωση, όχι ένα τηλεφώνημα που θα σκοτώσει
            έναν σύνδεσμο που ζούσε. */}
        {state === 'failed' && (
          <Card style={{ marginTop: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Η κατάσταση δεν φόρτωσε</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>
              Κάτι δεν απάντησε τώρα. Ο σύνδεσμος δεν έχει πρόβλημα: ανανέωσε τη σελίδα σε λίγο.
            </div>
          </Card>
        )}

        {state === 'notfound' && (
          <Card style={{ marginTop: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Ο σύνδεσμος δεν είναι έγκυρος</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>
              Έχει ανακληθεί ή έχει λήξει. Ένας ενημερωμένος σύνδεσμος βγαίνει από τη Λογιστική του ιδιοκτήτη.
            </div>
          </Card>
        )}

        {state === 'ok' && data && (
          <>
            <PortalTitle
              over="Οικονομική εικόνα ακινήτων"
              title={owner}
              meta={`Χρήση 01/01/${year} έως 31/12/${year} · ${props.length === 1 ? '1 ακίνητο' : `${props.length} ακίνητα`} · Ημερομηνία έκδοσης ${issued}`}
              right={props.length > 0 ? (
                /* ΤΟ ΑΡΧΕΙΟ ΕΙΝΑΙ ΤΟ ΠΑΡΑΔΟΤΕΟ, ΑΡΑ ΚΑΘΕΤΑΙ ΣΤΗΝ ΤΑΥΤΟΤΗΤΑ ΤΟΥ
                   ΕΓΓΡΑΦΟΥ. Δίπλα στο ποιος και για πότε, όχι στο τέλος της
                   σελίδας όπου θα το έβρισκε μόνο όποιος κύλησε ως κάτω. */
                <button type="button" onClick={download} className="portal-noprint"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: 44, padding: '0 18px',
                    borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)',
                    fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>
                  <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
                  </svg>
                  Λήψη κατάστασης
                </button>
              ) : undefined}
            />

            {/* ΤΙ ΛΕΙΠΕΙ, ΠΡΙΝ ΑΠΟ ΚΑΘΕ ΑΡΙΘΜΟ. Είναι η πρώτη ερώτηση του
                λογιστή και μέχρι πρόσφατα την απαντούσε μόνος του κατεβαίνοντας
                τις κάρτες. Οσα εμποδίζουν το κλείσιμο γράφονται πρώτα. */}
            {gaps.length > 0 && (
              <Card>
                <p style={over}>Τι λείπει από αυτή τη χρήση</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 1 }}>
                  {gaps.map(g => (
                    <li key={g.key} style={{
                      fontSize: 13, padding: '9px 0', borderTop: '1px solid var(--border-subtle)', lineHeight: 1.55,
                      color: g.blocking ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: g.blocking ? 600 : 400,
                    }}>{g.text}</li>
                  ))}
                </ul>
                <p style={{ ...meta, margin: '12px 0 0' }}>
                  Σημαίνει ότι δεν καταχωρήθηκε, όχι ότι δεν υπάρχει.
                </p>
              </Card>
            )}

            {props.length > 0 && (
            <Card>
              <p style={over}>Σύνοψη χρήσης {year}</p>
              {totals.hasEntries ? (
                <div style={{ marginTop: 10 }}>
                  {row('Έσοδα από ενοίκια και βραχυχρόνια', feAuto(totals.income))}
                  {row('Καταγεγραμμένες δαπάνες', feAuto(totals.expenses))}
                  {/* Ο ΕΝΔΕΙΚΤΙΚΟΣ ΦΟΡΟΣ ΔΕΝ ΕΙΝΑΙ ΜΕΤΡΗΜΕΝΟ ΜΕΓΕΘΟΣ, ΑΡΑ ΔΕΝ
                      ΚΑΘΕΤΑΙ ΣΤΗΝ ΙΔΙΑ ΤΑΞΗ ΜΕ ΤΑ ΔΥΟ ΑΠΟ ΠΑΝΩ. */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingTop: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Ενδεικτικός φόρος εισοδήματος</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' }}>{feAuto(estTax)}</span>
                  </div>
                  <p style={{ ...meta, margin: '10px 0 0' }}>
                    Εισπράξεις της χρήσης, όχι συμβατικό μίσθωμα επί δώδεκα. {bracketsLabelForYear(year)}, με τεκμαρτή έκπτωση {Math.round(presumptiveDeductionRate(true) * 100)}%. {PRESUMPTIVE_RULE_2026}
                  </p>
                </div>
              ) : (
                /* ΚΑΜΙΑ ΚΑΤΑΧΩΡΗΣΗ ΣΗΜΑΙΝΕΙ ΚΑΜΙΑ ΚΑΤΑΧΩΡΗΣΗ. Τρία μηδενικά και
                   ένας «φόρος 0,00 €» είναι υπολογισμός πάνω στο τίποτα, με το
                   κύρος του αριθμού. */
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 0', lineHeight: 1.7 }}>
                  Καμία καταχώρηση εσόδου ή δαπάνης για τη χρήση {year}, άρα κανένας υπολογισμός.
                  Αν περίμενες κινήσεις, η χρονιά αλλάζει από πάνω.
                </p>
              )}
            </Card>
            )}

            {lines.map(x => {
              const quiet = x.income === 0 && x.expenses === 0;
              const byCategory = Object.entries((x.p.expenses || []).reduce<Record<string, number>>((m, e) => {
                const k = e.category || 'Χωρίς κατηγορία';
                m[k] = (m[k] || 0) + (e.amount || 0); return m;
              }, {})).sort((a, b) => b[1] - a[1]);
              // Η ΤΑΥΤΟΤΗΤΑ ΤΗΣ ΓΡΑΜΜΗΣ ΤΟΥ ΕΝΤΥΠΟΥ, ΣΕ ΜΙΑ ΣΕΙΡΑ. Το ποσοστό
              // γράφεται μόνο όταν ΔΕΝ είναι ολόκληρο: το «100%» δίπλα σε κάθε
              // ακίνητο είναι θόρυβος, το «50%» είναι μισή δήλωση.
              const ident = [
                x.p.address,
                x.p.atak ? `ΑΤΑΚ ${x.p.atak}` : null,
                Number(x.p.sqm) > 0 ? `${x.p.sqm} τ.μ.` : null,
                Number(x.p.ownership) > 0 && Number(x.p.ownership) < 100 ? `συνιδιοκτησία ${x.p.ownership}%` : null,
              ].filter(Boolean).join(' · ');

              return (
                <Card key={x.p.name}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{x.p.name}</div>
                  {ident && (
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3, fontFamily: T.font.sans }}>{ident}</div>
                  )}

                  {quiet ? (
                    /* ΤΟ ΜΗΔΕΝ ΛΕΓΕΤΑΙ, ΔΕΝ ΤΥΠΩΝΕΤΑΙ. Μια σειρά «Δαπάνες έτους
                       0,00 €» μοιάζει με αποτέλεσμα υπολογισμού· εδώ δεν έγινε
                       κανένας υπολογισμός, γιατί δεν υπήρξε καμία καταχώρηση. */
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 0', lineHeight: 1.7 }}>
                      Καμία κίνηση στη χρήση {year}.
                      {x.p.rent_monthly ? ` Σήμερα νοικιάζεται ${feAuto(x.p.rent_monthly)} τον μήνα.` : ''}
                    </p>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      {x.rentAnnual > 0 && row(`Ενοίκια ${year} · ${x.rentMonths} ${x.rentMonths === 1 ? 'καταχωρημένη περίοδος' : 'καταχωρημένες περίοδοι'}`, feAuto(x.rentAnnual))}
                      {x.income === 0 && x.p.rent_monthly ? (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', lineHeight: 1.6 }}>
                          Σήμερα νοικιάζεται {feAuto(x.p.rent_monthly)} τον μήνα, χωρίς καταχωρημένη είσπραξη στη χρήση {year}.
                        </div>
                      ) : null}
                      {x.shortGross > 0 && row('Βραχυχρόνια, δηλωτέο ακαθάριστο', feAuto(x.shortGross))}
                      {x.staysUnresolved > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)', lineHeight: 1.6 }}>
                          {x.staysUnresolved === 1
                            ? 'Μία διαμονή δεν δηλώνει αν το ποσό της είναι ακαθάριστο ή καθαρή είσπραξη. Μπαίνει όπως καταχωρήθηκε.'
                            : `${x.staysUnresolved} διαμονές δεν δηλώνουν αν το ποσό τους είναι ακαθάριστο ή καθαρή είσπραξη. Μπαίνουν όπως καταχωρήθηκαν.`}
                        </div>
                      )}
                      {x.expenses > 0 && row('Δαπάνες χρήσης', feAuto(x.expenses))}
                      {byCategory.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ ...over, marginBottom: 8 }}>Δαπάνες ανά κατηγορία</div>
                          {byCategory.map(([cat, amt]) => (
                            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 12 }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{cat}</span>
                              <span style={{ fontFamily: T.font.mono, color: 'var(--text-primary)' }}>{feAuto(amt)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}

            {props.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '26px 20px', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Κανένα ακίνητο για τη χρήση {year}</div>
                Η χρονιά αλλάζει από πάνω.
              </div>
            )}

            {/* ΤΙ ΔΕΝ ΠΕΡΝΑΕΙ ΑΠΟ ΕΔΩ, ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ ΚΑΙ ΚΑΘΑΡΑ. Ο ιδιοκτήτης
                διαβάζει «ο λογιστής δεν βλέπει πελατολόγιο ούτε στοιχεία τρίτων»
                τη στιγμή που βγάζει τον σύνδεσμο· ο λογιστής πρέπει να ξέρει την
                ίδια συμφωνία από την άλλη πλευρά, για να μη νομίζει ότι κάτι
                χάθηκε. */}
            {props.length > 0 && (
              <p style={{ ...meta, margin: '18px 0 0' }}>
                Ο σύνδεσμος μεταφέρει ποσά και στοιχεία ακινήτων, καμία ταυτότητα τρίτου: ούτε μισθωτή, ούτε επισκέπτη, ούτε προμηθευτή.
                Το ΑΦΜ του μισθωτή, που ζητά το Ε2, το έχει ο ιδιοκτήτης.
              </p>
            )}

            {/* Ο ΛΟΓΙΣΤΗΣ ΜΕ ΠΟΛΛΟΥΣ ΠΕΛΑΤΕΣ ΤΟ ΜΑΘΑΙΝΕΙ ΕΔΩ, ΟΧΙ ΑΠΟ ΔΙΑΦΗΜΙΣΗ:
                τη στιγμή που κρατά τον έναν σύνδεσμο και σκέφτεται τους άλλους
                εβδομήντα εννιά. Και μαθαίνει ΚΑΙ ότι θέλει λογαριασμό, γιατί
                αλλιώς το κλικ τον βγάζει σε τοίχο σύνδεσης χωρίς εξήγηση. */}
            <div className="portal-noprint" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 26, lineHeight: 1.8 }}>
              Έχεις κι άλλους πελάτες με PROPERWISE;{' '}
              <Link href="/accountant/workspace" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Δες τους όλους μαζί</Link>, με ό,τι λείπει από τον καθένα.
              <div style={{ ...meta, marginTop: 4 }}>Χρειάζεται δικός σου λογαριασμός, μία φορά.</div>
            </div>

            <div style={{ ...meta, textAlign: 'center', marginTop: 16 }}>
              Powered by PROPERWISE · μόνο για ανάγνωση · <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)' }}>Απόρρητο</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
