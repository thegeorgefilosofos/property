'use client';
import { CustomSelect } from '@/app/dashboard/components/UIComponents';

// ═══════════════════════════════════════════════════════════════════════════
// Accountant portal, read-only πύλη λογιστή (χωρίς login). Διαβάζει μέσω
// ασφαλούς RPC (get_accountant_data) εικόνα εσόδων/δαπανών ανά ακίνητο για μια
// χρονιά. Ο φόρος υπολογίζεται ενδεικτικά με την κλίμακα ενοικίων. Theme-aware.
// ═══════════════════════════════════════════════════════════════════════════

import BrandMark from '@/components/BrandMark';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rentalIncomeTax, rentalBracketsForYear, bracketsLabelForYear } from '@/lib/billing/greekTax';
import { presumptiveDeductionRate, PRESUMPTIVE_RULE_2026 } from '@/lib/billing/consolidate';
import { T, feAuto, Card } from '@/components/Theme';

interface Expense { category: string; amount: number; date: string }
interface Stay { check_in: string | null; check_out: string | null; nights: number | null; total: number | null }
interface Prop {
  name: string; atak: string | null; address: string | null; prop_type: string | null;
  /** Εισπραχθέν ενοίκιο ΤΟΥ ΕΤΟΥΣ, από rent_payments — ίδια πηγή με το Ε2. */
  rent_collected: number | null;
  /** Σε πόσες καταχωρημένες περιόδους βασίζεται. 0 = δεν καταχωρήθηκε τίποτα. */
  rent_months: number | null;
  /** Τι νοικιάζεται ΣΗΜΕΡΑ. Συμφραζόμενο, όχι έσοδο του έτους. */
  rent_monthly: number | null;
  expenses: Expense[]; stays: Stay[];
}
interface Data { owner: string | null; year: number; properties: Prop[] }

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

export default function AccountantPortal() {
  const params = useParams();
  const token = String(params?.token || '');
  const supabase = createClient();
  const nowYear = new Date().getFullYear();

  const [year, setYear] = useState(nowYear - 1); // ο λογιστής συνήθως δουλεύει την προηγούμενη χρονιά
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  useEffect(() => {
    setState('loading');
    (async () => {
      const { data: d, error } = await supabase.rpc('get_accountant_data', { p_token: token, p_year: year });
      if (error || !d) { setState('notfound'); return; }
      setData(d as Data); setState('ok');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, year]);

  const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)' };

  // Σύνολα (ο φόρος εισοδήματος είναι προοδευτικός στο ΣΥΝΟΛΟ των ενοικίων)
  const props = data?.properties || [];
  const perProp = props.map(p => {
    // ΗΤΑΝ `(p.rent || 0) * 12`, με το `p.rent` να είναι το μίσθωμα του τελευταίου
    // μισθωτή — χωρίς φίλτρο έτους, χωρίς σχέση με τις ημερομηνίες της μίσθωσης.
    // Ο πίνακας ανοίγει στην ΠΡΟΗΓΟΥΜΕΝΗ χρονιά, οπότε μισθωτής που μπήκε φέτος
    // παρήγαγε δωδεκάμηνο εισόδημα για χρονιά που το ακίνητο απέδωσε μηδέν.
    const rentAnnual = p.rent_collected || 0;
    const rentMonths = p.rent_months || 0;
    const shortGross = sum((p.stays || []).map(s => s.total || 0));
    const income = rentAnnual + shortGross;
    const expenses = sum((p.expenses || []).map(e => e.amount || 0));
    return { p, rentAnnual, rentMonths, shortGross, income, expenses };
  });
  const totalIncome = sum(perProp.map(x => x.income));
  const totalExpenses = sum(perProp.map(x => x.expenses));
  // Η ΜΟΝΗ ΟΘΟΝΗ ΠΟΥ ΒΛΕΠΕΙ ΕΠΑΓΓΕΛΜΑΤΙΑΣ ΗΤΑΝ Η ΜΟΝΗ ΧΩΡΙΣ ΤΗΝ ΕΚΠΤΩΣΗ 5%.
  // Το `rentalIncomeTax(totalIncome)` φορολογούσε το 100% των ενοικίων, ενώ
  // κάθε άλλη διαδρομή του app εφαρμόζει την τεκμαρτή έκπτωση του άρθρου 39
  // παρ.4 ΚΦΕ. Σε 20.000 € ενοίκια η διαφορά είναι 250 € (+7%) — και ο λογιστής
  // τη διαβάζει δίπλα σε μια περιγραφή κλίμακας που δεν ίσχυσε ποτέ.
  // Η έκπτωση προϋποθέτει τραπεζική είσπραξη (ν.5246/2025)· εδώ δεν ξέρουμε τον
  // τρόπο είσπραξης, οπότε εφαρμόζεται και δηλώνεται ρητά η προϋπόθεση.
  const taxableIncome = totalIncome * (1 - presumptiveDeductionRate(true));
  // Ο λογιστής ξεκινά στην ΠΡΟΗΓΟΥΜΕΝΗ χρονιά (γρ. 29) — δηλαδή ακριβώς εκεί
  // όπου ίσχυε άλλη κλίμακα. Χωρίς αυτό, η μοναδική οθόνη που βλέπει
  // επαγγελματίας έδειχνε φόρο 2026 σε δήλωση 2025.
  const estTax = rentalIncomeTax(taxableIncome, rentalBracketsForYear(year));

  // ΤΟ ΚΕΝΟ ΕΤΟΣ ΔΕΝ ΕΙΝΑΙ ΜΗΔΕΝ. Η οθόνη έδειχνε «Εκτιμώμενος φόρος 0,00 €» σε
  // χρονιά χωρίς καμία καταχώρηση: υπολογισμό πάνω σε τίποτα, με το κύρος του
  // αριθμού. Ο λογιστής δεν μπορεί να ξεχωρίσει «δεν απέδωσε» από «δεν
  // καταχωρήθηκε», και η διαφορά είναι ολόκληρη δήλωση.
  const hasEntries = totalIncome > 0 || totalExpenses > 0;

  // ΤΙ ΛΕΙΠΕΙ, ΜΙΑ ΦΟΡΑ ΚΑΙ ΠΑΝΩ. Η ίδια πρόταση «Καμία καταχωρημένη είσπραξη»
  // επαναλαμβανόταν σε κάθε κάρτα ακινήτου. Σε πέντε ακίνητα, πέντε φορές το
  // ίδιο πράγμα, και καμία φορά η απάντηση στο «τι κάνω τώρα;».
  const silent = perProp.filter(x => x.income === 0);
  const noExpenses = perProp.filter(x => x.expenses === 0);
  const noAtak = props.filter(p => !p.atak);

  const issued = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const row = (k: string, v: string, strong?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: strong ? 700 : 600, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{v}</span>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: T.font.sans, paddingBottom: 40 }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', marginBottom: 24 }}>
        <div style={{ ...wrap, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Πύλη λογιστή</span>
          </div>
          {state === 'ok' && (
            <div style={{ minWidth: 120 }}>
              <CustomSelect value={String(year)} onChange={v => setYear(parseInt(v, 10))}
                options={[nowYear, nowYear - 1, nowYear - 2, nowYear - 3].map(y => ({ value: String(y), label: String(y) }))} />
            </div>
          )}
        </div>
      </header>

      <div style={wrap}>
        {state === 'loading' && <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>Φόρτωση…</div>}

        {state === 'notfound' && (
          <Card style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Ο σύνδεσμος δεν είναι έγκυρος</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>Ζήτησε από τον ιδιοκτήτη έναν ενημερωμένο σύνδεσμο.</div>
          </Card>
        )}

        {state === 'ok' && data && (
          <>
            {/* ΤΑΥΤΟΤΗΤΑ, ΟΧΙ ΚΑΡΤΑ. Ήταν πλαίσιο γύρω από δύο γραμμές κειμένου,
                δηλαδή ένα κουτί που δεν περιείχε τίποτα να ξεχωρίσει. Ένα
                έγγραφο που πάει σε επαγγελματία ξεκινά όπως κάθε επαγγελματικό
                έγγραφο: ποιος, για ποια περίοδο, πότε βγήκε. */}
            <div style={{ margin: '4px 0 22px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0 }}>
                Οικονομική εικόνα ακινήτων
              </p>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', margin: '6px 0 0', color: 'var(--text-primary)' }}>
                {data.owner || 'Ιδιοκτήτης'}
              </h1>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '6px 0 0', lineHeight: 1.6 }}>
                Χρήση 01/01/{year} έως 31/12/{year} · {props.length === 1 ? '1 ακίνητο' : `${props.length} ακίνητα`} · Ημερομηνία έκδοσης {issued}
              </p>
            </div>

            {/* ΤΙ ΛΕΙΠΕΙ, ΠΡΙΝ ΑΠΟ ΚΑΘΕ ΑΡΙΘΜΟ. Είναι η πρώτη ερώτηση του
                λογιστή και μέχρι τώρα δεν απαντιόταν πουθενά: κατέβαινε στις
                κάρτες και μάζευε μόνος του ποια ακίνητα ήταν άδεια. */}
            {(silent.length > 0 || noExpenses.length > 0 || noAtak.length > 0) && (
              <Card>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', margin: 0 }}>
                  Τι λείπει από αυτή τη χρήση
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 1 }}>
                  {silent.length > 0 && (
                    <li style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--border-subtle)', lineHeight: 1.5 }}>
                      <strong style={{ fontWeight: 600 }}>{silent.length === props.length ? 'Κανένα ακίνητο' : `${silent.length} από ${props.length} ακίνητα`}</strong> χωρίς καταχωρημένη είσπραξη: {silent.map(x => x.p.name).join(', ')}
                    </li>
                  )}
                  {noExpenses.length > 0 && (
                    <li style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--border-subtle)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      Καμία δαπάνη σε: {noExpenses.map(x => x.p.name).join(', ')}
                    </li>
                  )}
                  {noAtak.length > 0 && (
                    <li style={{ fontSize: 13, padding: '8px 0', borderTop: '1px solid var(--border-subtle)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      Χωρίς ΑΤΑΚ: {noAtak.map(p => p.name).join(', ')}
                    </li>
                  )}
                </ul>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', lineHeight: 1.6 }}>
                  Σημαίνει ότι δεν καταχωρήθηκε, όχι ότι δεν υπάρχει. Ζήτησέ το από τον ιδιοκτήτη πριν κλείσεις τη χρήση.
                </p>
              </Card>
            )}

            <Card>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Σύνοψη έτους</div>
              {hasEntries ? (
                <>
                  {row('Έσοδα από ενοίκια και βραχυχρόνια', feAuto(totalIncome))}
                  {row('Καταγεγραμμένες δαπάνες', feAuto(totalExpenses))}
                  {row('Εκτιμώμενος φόρος εισοδήματος', feAuto(estTax), true)}
                  {/* Η ΥΠΟΣΗΜΕΙΩΣΗ ΗΤΑΝ ΤΟΙΧΟΣ ΠΕΝΤΕ ΣΕΙΡΩΝ. Ο λογιστής ξέρει
                      την κλίμακα και την τεκμαρτή έκπτωση· δεν ξέρει ΤΙ ΑΚΡΙΒΩΣ
                      μετρήσαμε εμείς. Μένει μόνο αυτό, και η παραπομπή. */}
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12, lineHeight: 1.7 }}>
                    Εισπράξεις της χρήσης, όχι συμβατικό μίσθωμα επί δώδεκα. {bracketsLabelForYear(year)}, με τεκμαρτή έκπτωση {Math.round(presumptiveDeductionRate(true) * 100)}%. {PRESUMPTIVE_RULE_2026}
                  </p>
                </>
              ) : (
                /* ΚΑΜΙΑ ΚΑΤΑΧΩΡΗΣΗ ΣΗΜΑΙΝΕΙ ΚΑΜΙΑ ΚΑΤΑΧΩΡΗΣΗ. Τρία μηδενικά και
                   ένας «εκτιμώμενος φόρος 0,00 €» είναι υπολογισμός πάνω στο
                   τίποτα, με το κύρος του αριθμού. */
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
                  Δεν υπάρχει καμία καταχώρηση εσόδου ή δαπάνης για τη χρήση {year}. Δεν υπολογίζεται φόρος πάνω σε κενή χρήση. Αν περίμενες κινήσεις, διάλεξε άλλη χρονιά από πάνω ή ζήτησε από τον ιδιοκτήτη να τις καταχωρήσει.
                </p>
              )}
            </Card>

            {perProp.map((x, i) => (
              <Card key={i}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{x.p.name}</div>
                {/* Η ΔΙΕΥΘΥΝΣΗ ΚΑΙ ΤΟ ΑΤΑΚ ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ. Το ΑΤΑΚ
                    είναι ο αριθμός που πληκτρολογεί ο λογιστής στο Ε2· η
                    διεύθυνση είναι για να καταλάβει ποιο ακίνητο κοιτά. */}
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                  {x.p.address || 'Χωρίς διεύθυνση'}
                  {x.p.atak ? <span style={{ fontFamily: T.font.num, color: 'var(--text-secondary)' }}>{` · ΑΤΑΚ ${x.p.atak}`}</span> : null}
                </div>
                {x.rentAnnual > 0 && row(`Ενοίκια ${year} · ${x.rentMonths} ${x.rentMonths === 1 ? 'καταχωρημένη περίοδος' : 'καταχωρημένες περίοδοι'}`, feAuto(x.rentAnnual))}
                {/* ΤΟ ΜΗΔΕΝ ΛΕΓΕΤΑΙ, ΔΕΝ ΠΑΡΑΛΕΙΠΕΤΑΙ. Ένα ακίνητο που απλώς
                    λείπει από τη λίστα διαβάζεται ως «δεν απέδωσε»· ο λογιστής
                    πρέπει να ξέρει ότι δεν καταχωρήθηκε τίποτα, για να ρωτήσει. */}
                {/* ΤΟ «ΚΑΜΙΑ ΕΙΣΠΡΑΞΗ» ΕΙΠΩΘΗΚΕ ΗΔΗ ΠΑΝΩ, ΟΝΟΜΑΣΤΙΚΑ. Εδώ μένει
                    μόνο ό,τι ΔΕΝ χωρά εκεί: το σημερινό μίσθωμα, που είναι
                    συμφραζόμενο και όχι έσοδο της χρήσης. */}
                {x.income === 0 && x.p.rent_monthly ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    Σήμερα νοικιάζεται {feAuto(x.p.rent_monthly)} τον μήνα, χωρίς καταχωρημένη είσπραξη στη χρήση {year}.
                  </div>
                ) : null}
                {x.shortGross > 0 && row('Βραχυχρόνια (καταγεγραμμένο ποσό)', feAuto(x.shortGross))}
                {row('Δαπάνες έτους', feAuto(x.expenses))}
                {(x.p.expenses || []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Δαπάνες ανά κατηγορία</div>
                    {Object.entries((x.p.expenses || []).reduce<Record<string, number>>((m, e) => { m[e.category || 'Άλλο'] = (m[e.category || 'Άλλο'] || 0) + (e.amount || 0); return m; }, {})).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{cat}</span>
                        <span style={{ fontFamily: T.font.mono, color: 'var(--text-primary)' }}>{feAuto(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}

            {/* «Δεν υπάρχουν …» είναι η αόριστη μορφή που η εφαρμογή έχει καταργήσει: η
                κενή κατάσταση λέει ΤΙ λείπει και για ΠΟΙΑ χρήση, χωρίς κάρτα γύρω από
                την απουσία και χωρίς να αφήνει τον λογιστή να αναρωτιέται αν φταίει
                το φίλτρο ή τα δεδομένα. */}
            {props.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, padding: '26px 20px', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Κανένα ακίνητο για τη χρήση {year}</div>
                Διάλεξε άλλη χρονιά από πάνω.
              </div>
            )}
            {/* Ο ΛΟΓΙΣΤΗΣ ΜΕ ΠΟΛΛΟΥΣ ΠΕΛΑΤΕΣ ΤΟ ΜΑΘΑΙΝΕΙ ΕΔΩ, ΟΧΙ ΑΠΟ ΔΙΑΦΗΜΙΣΗ.
                Είναι η στιγμή που κρατά στα χέρια του τον έναν σύνδεσμο και
                σκέφτεται ότι έχει άλλους εβδομήντα εννιά. */}
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginTop: 18, lineHeight: 1.7 }}>
              Έχεις κι άλλους πελάτες με Property OS;{' '}
              <a href="/accountant/workspace" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'underline' }}>Δες τους όλους μαζί</a>, με ό,τι λείπει από τον καθένα.
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Powered by Property OS · read-only · <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>Απόρρητο</a></div>
          </>
        )}
      </div>
    </div>
  );
}
