'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, fn, Skeleton, ExportButton, EmptyState, InfoBanner } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { comparableGroups } from '@/lib/property/visibility';
import { downloadCsv } from './exportCsv';
import { money, dec2, percent } from './xlsxStyle';
import { consolidateRentTax, taxShareOf, CONSOLIDATION_NOTE } from '@/lib/billing/consolidate';
import { resolveValue } from '@/lib/billing/propertyFacts';
import { mergeLedger, ledgerTotal, recurringMonthly } from '@/lib/expenses/ledger';

interface Property {
  id: string; name: string; prop_type: string | null; address: string | null;
  sqm: number | null; value: number | null; target_rent: number | null;
  status_detail: string | null;
  // Η αντικειμενική αξία δεν είναι «λιγότερο πραγματική» από την εμπορική: είναι
  // ο μόνος αριθμός που ο ιδιοκτήτης βρίσκει σίγουρα (Ε9). Η Επισκόπηση τη
  // χρησιμοποιεί ως εφεδρική εδώ και καιρό — η Σύγκριση όχι, και έδειχνε 0,0%.
  obj_value?: number | null;
  // Χρειάζονται για να κριθεί αν η σύγκριση είναι έντιμη: έτος κατασκευής και
  // περιοχή αλλάζουν το συμπέρασμα όσο και το ίδιο το ακίνητο.
  year_built?: number | null; postal_code?: string | null; rental_mode?: string | null;
}
interface Props { properties: Property[]; userId: string; }

interface Agg {
  /** Δαπάνες του έτους, κάθε ευρώ ΜΙΑ φορά (από τον κοινό πυρήνα). */
  expensesYTD: number;
  /** Ο μέσος μήνας σε πάγια, διαιρεμένος με το ΕΥΡΟΣ του ιστορικού (όχι με 12). */
  recurringMonthly: number;
  monthlyRent: number;
  budgetMonthly: number;
}

// Μηνιαίος στόχος προϋπολογισμού από τις ρυθμίσεις: το ρητό «total», αλλιώς το άθροισμα
// των στόχων ανά κατηγορία (αγνοώντας μεταδεδομένα/διακόπτες).
const BUDGET_META = new Set(['total', 'notifyOverspend', 'rollover', 'participants', 'strPlatformPct', 'strMgmtPct', 'strTaxPct']);
const budgetTotalOf = (data: Record<string, unknown> | null | undefined): number => {
  if (!data) return 0;
  const t = parseFloat(String(data.total ?? ''));
  if (!isNaN(t) && String(data.total).trim() !== '') return t;
  return Object.entries(data)
    .filter(([k, v]) => !k.startsWith('__') && !BUDGET_META.has(k) && !isNaN(parseFloat(String(v))))
    .reduce((s, [, v]) => s + parseFloat(String(v)), 0);
};

const STATUS_LABELS: Record<string, string> = {
  rented: 'Ενοικιάζεται', vacant: 'Κενό', own_use: 'Ιδιοχρησία', renovation: 'Ανακαίνιση',
  for_sale: 'Προς Πώληση', seasonal: 'Εποχιακό', disputed: 'Αμφισβητούμενο',
};

// Ο τύπος ακινήτου με ανθρώπινα λόγια, για τον τίτλο της ομάδας. Ό,τι δεν
// αναγνωρίζεται εμφανίζεται όπως το έγραψε ο χρήστης.
const TYPE_LABELS: Record<string, string> = {
  apartment: 'Διαμερίσματα', house: 'Μονοκατοικίες', studio: 'Στούντιο',
  maisonette: 'Μεζονέτες', office: 'Γραφεία', shop: 'Καταστήματα',
  warehouse: 'Αποθήκες', land: 'Οικόπεδα', parking: 'Θέσεις parking',
  storage: 'Αποθήκες κτιρίου', villa: 'Βίλες', other: 'Άλλα',
};

// Ελληνικές επεξηγήσεις για όρους/συντομογραφίες (εμφανίζονται ως tooltip στη μετρική)
const METRIC_TIPS: Record<string, string> = {
  'Μεικτή Απόδοση': 'Ακαθάριστη ετήσια απόδοση: (μηνιαίο ενοίκιο × 12) ÷ αξία ακινήτου. Χρησιμοποιείται η εμπορική αξία· αν λείπει, η αντικειμενική (Ε9) — ίδιος κανόνας με την Επισκόπηση.',
  'Μερίδιο Φόρου Ενοικίου': 'Ο φόρος εισοδήματος από ενοίκια είναι προοδευτικός στο ΣΥΝΟΛΟ των ακινήτων σου (Ε1), όχι ανά ακίνητο. Εδώ φαίνεται το μερίδιο κάθε ακινήτου από τον ένα φόρο, κατ’ αναλογία του φορολογητέου του. Γι’ αυτό οι γραμμές αθροίζουν στη γραμμή ΣΥΝΟΛΟ της εξαγωγής.',
  'Πάγια ανά μήνα': 'Ο μέσος μήνας σε επαναλαμβανόμενες δαπάνες, από ό,τι ΟΝΤΩΣ καταχωρήθηκε φέτος (πάγια έτους ÷ 12). Είναι ΥΠΟΣΥΝΟΛΟ των δαπανών του έτους, γι\u2019 αυτό δεν αφαιρείται ξεχωριστά από το καθαρό.',
  'Δαπάνες Έτους': 'Κάθε ευρώ μία φορά: ο πληρωμένος λογαριασμός και η δαπάνη του είναι το ίδιο γεγονός και μετριούνται μία φορά, ενώ ο απλήρωτος λογαριασμός μετράει στην ημερομηνία που λήγει. Ίδιος υπολογισμός με τις Δαπάνες και τον Προϋπολογισμό.',
  'Καθαρό ανά μήνα (εκτ.)': 'Εκτίμηση: ενοίκιο − (δαπάνες έτους ÷ 12). Οι πάγιοι λογαριασμοί περιλαμβάνονται ήδη στις δαπάνες του έτους και δεν αφαιρούνται δεύτερη φορά.',
};

export default function TabComparison({ properties, userId }: Props) {
  const supabase = createClient();
  const [agg, setAgg] = useState<Record<string, Agg>>({});
  const [loading, setLoading] = useState(true);
  // Ποια ομάδα κοιτάζει ο χρήστης. `null` σημαίνει «η μεγαλύτερη», που είναι και
  // η πιο χρήσιμη προεπιλογή: εκεί έχει τα περισσότερα να συγκρίνει.
  const [groupKey, setGroupKey] = useState<string | null>(null);

  // ΜΟΝΟ ΟΜΟΕΙΔΗ ΣΥΓΚΡΙΝΟΝΤΑΙ. Ένα διαμέρισμα κι ένα κατάστημα δεν έχουν κοινή
  // αγορά: η «καλύτερη απόδοση» ανάμεσά τους είναι αριθμός χωρίς νόημα. Η
  // ομαδοποίηση και η κρίση του πόσο διαφέρουν ζουν στο lib/property/visibility.ts,
  // ώστε το μενού και αυτή η οθόνη να λένε πάντα το ίδιο πράγμα.
  const groups = useMemo(() => comparableGroups(properties), [properties]);
  const group = groups.find(g => g.key === groupKey) ?? groups[0] ?? null;
  const inGroup = group ? properties.filter(p => group.ids.includes(p.id)) : [];
  const typeLabel = (key: string, sample: Property | undefined) =>
    TYPE_LABELS[key] ?? sample?.prop_type ?? key;

  const load = useCallback(async () => {
    const ids = properties.map(p => p.id);
    if (!ids.length) { setLoading(false); return; }
    const year = new Date().getFullYear();
    // Τα πεδία είναι αυτά που ζητά ο κοινός πυρήνας (lib/expenses/ledger.ts): ο
    // λογαριασμός δίνει πρόγραμμα και προθεσμία, η δαπάνη το γεγονός και το ποσό.
    const [{ data: exp }, { data: bil }, { data: ten }, { data: bud }] = await Promise.all([
      supabase.from('expenses')
        .select('id,bill_id,amount,date,description,category,paid,expense_group,is_recurring,store_vendor,property_id')
        .in('property_id', ids).eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('bills')
        .select('id,name,amount,paid,paid_at,due_date,created_at,category,recurring,property_id')
        .in('property_id', ids).eq('user_id', userId),
      supabase.from('tenants').select('monthly_rent,property_id').in('property_id', ids).eq('user_id', userId),
      supabase.from('bills_settings').select('property_id,data').in('property_id', ids).eq('section', 'budgets'),
    ]);

    // ΚΑΘΕ ΕΥΡΩ ΜΙΑ ΦΟΡΑ, ΑΝΑ ΑΚΙΝΗΤΟ.
    //
    // Πριν, η οθόνη άθροιζε χωριστά «όλες τις δαπάνες» και «όλους τους πάγιους
    // λογαριασμούς» — και αφαιρούσε ΚΑΙ ΤΑ ΔΥΟ από το ενοίκιο. Ο πληρωμένος
    // πάγιος όμως υπάρχει και στις δύο λίστες: ο λογαριασμός είναι το πρόγραμμα,
    // η δαπάνη το γεγονός, συνδεδεμένα με bill_id. Μετρημένο σε ακίνητο με ΔΕΗ
    // 100 €/μήνα και ενοίκιο 700 €: η οθόνη έλεγε −625 €/μήνα αντί για +575 €.
    // Λάθος 14.400 € τον χρόνο, ακριβώς στη στήλη που κρίνει ποιο ακίνητο αξίζει.
    const byProp = <R extends { property_id?: string | null }>(rows: R[] | null) => {
      const g: Record<string, R[]> = {};
      ids.forEach(id => { g[id] = []; });
      (rows || []).forEach(r => { const k = r.property_id || ''; if (g[k]) g[k].push(r); });
      return g;
    };
    const expByProp = byProp(exp as never[]);
    const bilByProp = byProp(bil as never[]);

    const m: Record<string, Agg> = {};
    ids.forEach(id => {
      const { entries } = mergeLedger(bilByProp[id] as never[], expByProp[id] as never[]);
      const ofYear = entries.filter(e => e.date >= `${year}-01-01` && e.date <= `${year}-12-31`);
      m[id] = {
        expensesYTD: ledgerTotal(ofYear),
        // ΜΕΤΡΗΜΕΝΟ, ΟΧΙ ΔΗΛΩΜΕΝΟ: ο μέσος μήνας σε πάγια, από ό,τι ΟΝΤΩΣ έτρεξε.
        // Η διαίρεση γίνεται με το ΕΥΡΟΣ του ιστορικού, όχι με σταθερό 12: όποιος
        // ξεκίνησε τον Οκτώβριο θα έβλεπε τα πάγιά του τέσσερις φορές μικρότερα.
        // Χωρίς αρκετό ιστορικό δεν δίνεται μέσος όρος — μηδέν αντί για εικασία.
        recurringMonthly: recurringMonthly(ofYear).perMonth ?? 0,
        monthlyRent: 0,
        budgetMonthly: 0,
      };
    });
    (ten || []).forEach((t: any) => { if (m[t.property_id]) m[t.property_id].monthlyRent = t.monthly_rent || 0; });
    (bud || []).forEach((r: any) => { if (m[r.property_id]) m[r.property_id].budgetMonthly = budgetTotalOf(r.data); });
    setAgg(m);
    setLoading(false);
  }, [properties, userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // ── ΦΟΡΟΣ ΣΕ ΕΠΙΠΕΔΟ ΦΟΡΟΛΟΓΟΥΜΕΝΟΥ ─────────────────────────────────────────
  // Η κλίμακα είναι προοδευτική στο ΣΥΝΟΛΟ των ενοικίων (Ε1). Άρα η ενοποίηση
  // γίνεται πάνω σε ΟΛΑ τα ακίνητα του χρήστη, όχι μόνο σε αυτά της ομάδας που
  // κοιτάζει — αλλιώς ο φόρος θα άλλαζε κάθε φορά που πατά άλλη καρτέλα ομάδας.
  const portfolioTax = useMemo(() => consolidateRentTax(properties.map(p => ({
    id: p.id,
    annualRent: ((agg[p.id]?.monthlyRent || p.target_rent || 0)) * 12,
    shortTerm: p.rental_mode === 'short_term',
  }))), [properties, agg]);


  if (!group) {
    // Δύο διαφορετικές ελλείψεις, δύο διαφορετικές απαντήσεις: άλλο «δεν έχεις
    // δεύτερο ακίνητο» και άλλο «τα δύο σου ακίνητα δεν συγκρίνονται μεταξύ τους».
    const single = properties.length < 2;
    return (
      <div style={{ fontFamily: T.font.sans }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 20px' }}>Σύγκριση Ακινήτων</h1>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 8 }}>
          <EmptyState icon={<Building2 size={20} />}
            title={single ? 'Χρειάζονται τουλάχιστον δύο ακίνητα' : 'Δεν υπάρχουν δύο ακίνητα ίδιου τύπου'}
            hint={single
              ? 'Πρόσθεσε ένα δεύτερο ακίνητο για να τα συγκρίνεις ως προς αξία, ενοίκιο, απόδοση, λογαριασμούς και δαπάνες.'
              : 'Η σύγκριση γίνεται μόνο ανάμεσα σε ακίνητα του ίδιου τύπου — ένα διαμέρισμα κι ένα κατάστημα δεν έχουν κοινή αγορά. Συμπλήρωσε τον τύπο στα στοιχεία κάθε ακινήτου ή πρόσθεσε ένα δεύτερο ίδιου τύπου.'} />
        </div>
      </div>
    );
  }

  // Μετρικές ανά ακίνητο (μόνο της ομάδας που κοιτάζει ο χρήστης)
  const rowsData = inGroup.map(p => {
    const a = agg[p.id] || { expensesYTD: 0, recurringMonthly: 0, monthlyRent: 0, budgetMonthly: 0 };
    // ΙΔΙΑ ΠΗΓΗ ΑΛΗΘΕΙΑΣ ΜΕ ΤΗΝ ΕΠΙΣΚΟΠΗΣΗ. Πριν ήταν `p.value || 0`: ο
    // ιδιοκτήτης που είχε συμπληρώσει μόνο αντικειμενική αξία (η συνηθέστερη
    // περίπτωση — τη βρίσκει στο Ε9) έβλεπε «4,2%» στην Επισκόπηση και «0,0%» εδώ.
    const value = resolveValue(p.value, p.obj_value).value;
    const sqm = p.sqm || 0;
    const rent = a.monthlyRent || p.target_rent || 0;
    const perSqm = sqm > 0 ? value / sqm : 0;
    const grossYield = value > 0 ? (rent * 12 / value) * 100 : 0;
    // ΜΟΝΟ ΜΙΑ ΑΦΑΙΡΕΣΗ. Οι πάγιοι λογαριασμοί είναι ΗΔΗ μέσα στις δαπάνες του
    // έτους — ο πυρήνας τους μέτρησε μία φορά. Η παλιά γραμμή αφαιρούσε και τα
    // δύο, και το ακίνητο έδειχνε διπλάσιο κόστος απ' όσο έχει.
    const netMonthly = rent - a.expensesYTD / 12;
    const taxShare = taxShareOf(portfolioTax, p.id);
    return { p, value, sqm, rent, perSqm, grossYield, recurringMonthly: a.recurringMonthly, expensesYTD: a.expensesYTD, netMonthly, budgetMonthly: a.budgetMonthly, taxShare };
  });

  // ΜΟΝΟ ΜΕΤΡΙΚΕΣ ΜΕ ΚΑΤΕΥΘΥΝΣΗ. Οι τέσσερις σειρές με dir:'none' (Εμπορική Αξία,
  // Εμβαδόν, Τιμή/τ.μ., Μηνιαίος Στόχος) ήταν εξ ορισμού χωρίς «καλύτερη τιμή»:
  // στατικά στοιχεία ταυτότητας, που ο χρήστης έχει δει, και που εδώ μόνο
  // μεγάλωναν τον πίνακα. Τα τρία πρώτα μετακόμισαν στην κεφαλίδα της στήλης, όπου
  // λένε ποιο ακίνητο κοιτάζεις· ο μηνιαίος στόχος ζει στον Προϋπολογισμό.
  type Dir = 'high' | 'low';
  const metrics: { label: string; get: (r: typeof rowsData[number]) => number; fmt: (n: number) => string; dir: Dir }[] = [
    { label: 'Μηνιαίο Ενοίκιο',      get: r => r.rent,        fmt: n => fe(n, 0),               dir: 'high' },
    { label: 'Μεικτή Απόδοση',       get: r => r.grossYield,  fmt: n => `${n.toFixed(1)}%`,     dir: 'high' },
    { label: 'Πάγια ανά μήνα',       get: r => r.recurringMonthly, fmt: n => fe(n, 0),          dir: 'low'  },
    { label: 'Δαπάνες Έτους',        get: r => r.expensesYTD, fmt: n => fe(n, 0),               dir: 'low'  },
    { label: 'Μερίδιο Φόρου Ενοικίου', get: r => r.taxShare,  fmt: n => fe(n, 0),               dir: 'low'  },
    { label: 'Καθαρό ανά μήνα (εκτ.)', get: r => r.netMonthly, fmt: n => fe(n, 0),              dir: 'high' },
  ];

  const bestId = (m: typeof metrics[number]): string | null => {
    const vals = rowsData.map(r => ({ id: r.p.id, v: m.get(r) })).filter(x => x.v !== 0 || m.dir === 'low');
    if (!vals.length) return null;
    return vals.reduce((best, x) => (m.dir === 'high' ? x.v > best.v : x.v < best.v) ? x : best).id;
  };

  // ── Εξαγωγή CSV (μορφή Ελληνικού Excel: διαχωριστικό «;», κόμμα δεκαδικών,
  //    UTF-8 BOM ώστε να φαίνονται σωστά τα ελληνικά). Χρήσιμο για λογιστή. ──
  const exportCSV = () => {
    // Κοινοί, τυποποιημένοι formatters: «1.234,56 €», «5,20 %», «85,5» (τ.μ.).
    // ΤΟ ΑΘΡΟΙΣΜΑ ΤΩΝ ΓΡΑΜΜΩΝ ΙΣΟΥΤΑΙ ΜΕ ΤΗ ΓΡΑΜΜΗ ΣΥΝΟΛΟ. Πριν, ο φόρος
    // υπολογιζόταν ανά γραμμή με τη προοδευτική κλίμακα ΚΑΙ ξεχωριστά στο σύνολο —
    // δηλαδή δύο ασυμβίβαστοι αριθμοί στο ίδιο αρχείο, το οποίο φτάνει στον
    // λογιστή. Τώρα η στήλη είναι το ΜΕΡΙΔΙΟ κάθε ακινήτου από τον ΕΝΑ φόρο του
    // φορολογούμενου, άρα προσθέτεται σωστά.
    const cols = ['Ακίνητο', 'Κατάσταση', 'Αξία (€)', 'Εμβαδόν (τ.μ.)', 'Τιμή/τ.μ. (€)', 'Μηνιαίο Ενοίκιο (€)', 'Ετήσιο Ενοίκιο (€)', 'Μεικτή Απόδοση (%)', 'Πάγια ανά μήνα (€)', 'Δαπάνες Έτους (€)', 'Καθαρό/μήνα εκτ. (€)', 'Καθαρό/έτος εκτ. (€)', 'Μερίδιο Φόρου Ενοικίου (€)'];
    const rows = rowsData.map(r => [
      r.p.name, STATUS_LABELS[r.p.status_detail || ''] || r.p.prop_type || '',
      money(r.value), dec2(r.sqm), money(r.perSqm), money(r.rent), money(r.rent * 12),
      percent(r.grossYield), money(r.recurringMonthly), money(r.expensesYTD),
      money(r.netMonthly), money(r.netMonthly * 12), money(r.taxShare),
    ]);
    // Γραμμή συνόλων της ομάδας (όχι όλου του χαρτοφυλακίου: εξάγεται ό,τι φαίνεται).
    const sum = (f: (r: typeof rowsData[number]) => number) => rowsData.reduce((s, r) => s + f(r), 0);
    rows.push(['ΣΥΝΟΛΟ', '', money(sum(r => r.value)), dec2(sum(r => r.sqm)), '', money(sum(r => r.rent)), money(sum(r => r.rent * 12)), '', money(sum(r => r.recurringMonthly)), money(sum(r => r.expensesYTD)), money(sum(r => r.netMonthly)), money(sum(r => r.netMonthly * 12)), money(sum(r => r.taxShare))]);
    // Η προειδοποίηση ταξιδεύει ΜΑΖΙ με τα νούμερα. Ένα αρχείο που φτάνει στον
    // λογιστή χωρίς αυτή είναι ακριβώς η παραπλανητική σύγκριση που θέλαμε να
    // αποφύγουμε — μόνο που τώρα δεν υπάρχει οθόνη να την εξηγήσει.
    rows.push([`${CONSOLIDATION_NOTE} Συνολικά ${portfolioTax.count} ακίνητα με εισόδημα, ενοίκια ${money(portfolioTax.totalAnnualRent)} €, φόρος ${money(portfolioTax.totalTax)} €.`]);
    if (rowsData.length < portfolioTax.count) {
      rows.push([`Προσοχή: το αρχείο περιέχει ${rowsData.length} από τα ${portfolioTax.count} ακίνητα με εισόδημα (εξάγεται η ομάδα που εμφανίζεται στην οθόνη). Το άθροισμα της στήλης φόρου είναι μέρος του συνολικού φόρου, όχι ο συνολικός φόρος.`]);
    }
    if (group.warning) rows.push([group.warning]);
    // Κοινός, θωρακισμένος exporter (BOM, «;», escaping + εξουδετέρωση formula-injection).
    downloadCsv(`sygkrisi_akiniton_${new Date().toISOString().slice(0, 10)}`, cols, rows);
  };

  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 12, whiteSpace: 'nowrap' };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.15 }}>Σύγκριση Ακινήτων</h1>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {rowsData.length} {typeLabel(group.key, inGroup[0]).toLowerCase()}, αξία, ενοίκιο, απόδοση, λογαριασμοί και δαπάνες δίπλα-δίπλα. Με πράσινο η καλύτερη τιμή ανά γραμμή.
          </div>
        </div>
        {/* ΤΟ «Εξαγωγή Ε2» ΕΦΥΓΕ ΑΠΟ ΕΔΩ. Ζούσε σε μια οθόνη που απαιτεί δύο
            ακίνητα ΙΔΙΟΥ ΤΥΠΟΥ και πλάνο «Ιδιοκτήτης»: ο ιδιοκτήτης ενός ακινήτου
            — δηλαδή ο μισός κόσμος — δεν το έφτανε ποτέ, παρότι το Ε2 τον αφορά
            ακριβώς όσο και τους άλλους. Και ήταν διπλότυπο του κουμπιού στο
            E2IncomeCalc. Ένα σημείο για το Ε2: Λογιστική → Αναλυτική Κατάσταση Ε2. */}
        {!loading && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <ExportButton onClick={exportCSV} />
          </div>
        )}
      </div>

      {/* Περισσότερες από μία ομάδες: ο χρήστης διαλέγει ποια κοιτάζει. Η επιλογή
          μπαίνει μόνο όταν υπάρχει κάτι να επιλεγεί — με μία ομάδα θα ήταν θόρυβος. */}
      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {groups.map(g => {
            const on = g.key === group.key;
            return (
              <button key={g.key} type="button" onClick={() => setGroupKey(g.key)} aria-pressed={on}
                style={{ height: T.h.sm, padding: '0 12px', borderRadius: 8, cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: on ? 700 : 500,
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
                  background: on ? 'var(--accent-dim)' : 'transparent',
                  color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {typeLabel(g.key, properties.find(p => p.id === g.ids[0]))} ({g.ids.length})
              </button>
            );
          })}
        </div>
      )}

      {/* Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΔΕΝ ΕΙΝΑΙ ΨΙΛΑ ΓΡΑΜΜΑΤΑ. Δύο διαμερίσματα είναι συγκρίσιμα
          ως κατηγορία, αλλά 45 τ.μ. του 1975 δίπλα σε 140 τ.μ. του 2018 βγάζουν
          «το δεύτερο αποδίδει καλύτερα» — αληθές και εντελώς άχρηστο. Ο χρήστης
          έχει δικαίωμα να δει τη σύγκριση· έχει και δικαίωμα να ξέρει τι κοιτάζει. */}
      {group.warning && <InfoBanner tone="warning">{group.warning}</InfoBanner>}

      {loading ? (
        // Σκελετός αντί για spinner: το σχήμα του πίνακα σύγκρισης είναι γνωστό εκ
        // των προτέρων, οπότε ο χώρος δεσμεύεται από την αρχή και η σελίδα δεν
        // «πηδά» όταν φτάνουν τα δεδομένα.
        <Skeleton h={320} r={14} />
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 8, overflowX: 'auto' }}>
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 120 + rowsData.length * 160 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, zIndex: 1 }}>Μετρική</th>
                {rowsData.map(r => (
                  <th key={r.p.id} style={th}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 0 }}>{r.p.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{STATUS_LABELS[r.p.status_detail || ''] || r.p.prop_type || ''}</div>
                    {/* Ταυτότητα, όχι μετρική: αξία, εμβαδόν και τιμή/τ.μ. λένε ποιο
                        ακίνητο κοιτάζεις. Δεν έχουν «καλύτερη τιμή», γι' αυτό δεν
                        είναι πια γραμμές του πίνακα. */}
                    <div title={r.p.value ? 'Εμπορική αξία' : 'Αντικειμενική αξία (από το Ε9), επειδή δεν έχει καταχωρηθεί εμπορική'}
                      style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginTop: 3, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {[r.sqm > 0 ? `${fn(r.sqm)} τ.μ.` : null, r.value > 0 ? fe(r.value, 0) : null, r.perSqm > 0 ? `${fe(r.perSqm, 0)}/τ.μ.` : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => {
                const best = bestId(m);
                return (
                  <tr key={i}>
                    <td title={METRIC_TIPS[m.label]} style={{ ...td, fontFamily: T.font.sans, color: 'var(--text-secondary)', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>{m.label}</td>
                    {rowsData.map(r => {
                      const isBest = best === r.p.id;
                      return (
                        <td key={r.p.id} style={{ ...td, color: isBest ? 'var(--positive)' : 'var(--text-primary)', fontWeight: isBest ? 700 : 400, background: isBest ? 'var(--positive-soft)' : 'transparent' }}>
                          {m.fmt(m.get(r))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
        Συγκρίνονται μόνο ακίνητα ίδιου τύπου. Το «Καθαρό ανά μήνα» είναι εκτίμηση: ενοίκιο − μηνιαίοι λογαριασμοί − (δαπάνες έτους ÷ 12). Δεν περιλαμβάνει δόσεις δανείου, φόρους ή έκτακτα.
        {portfolioTax.count > 1 && <> {CONSOLIDATION_NOTE} Σύνολο ενοικίων {fe(portfolioTax.totalAnnualRent, 0)}, φόρος {fe(portfolioTax.totalTax, 0)} για {portfolioTax.count} ακίνητα.</>}
      </div>
    </div>
  );
}
