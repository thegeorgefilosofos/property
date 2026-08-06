'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, fn, fp, DASH, Skeleton, ExportButton, EmptyState, InfoBanner, PageTitle } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { comparableGroups } from '@/lib/property/visibility';
import { downloadCsv } from './exportCsv';
import { money, dec2, percent } from './xlsxStyle';
import { consolidateRentTax, taxShareOf, CONSOLIDATION_NOTE } from '@/lib/billing/consolidate';
import { resolveValue } from '@/lib/billing/propertyFacts';
import { mergeLedger, ledgerTotal, recurringMonthly } from '@/lib/expenses/ledger';
import { athensToday } from '@/lib/core/time';

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
        <PageTitle title="Σύγκριση ακινήτων" />
        <div className="card">
          <EmptyState icon={<Building2 size={20} />}
            title={single ? 'Χρειάζονται τουλάχιστον δύο ακίνητα' : 'Δεν υπάρχουν δύο ακίνητα ίδιου τύπου'}
            hint={single
              ? 'Πρόσθεσε ένα δεύτερο ακίνητο για να τα δεις δίπλα-δίπλα.'
              : 'Συγκρίνονται μόνο ακίνητα ίδιου τύπου: ένα διαμέρισμα κι ένα κατάστημα δεν έχουν κοινή αγορά. Συμπλήρωσε τον τύπο σε κάθε ακίνητο ή πρόσθεσε ένα δεύτερο ίδιου τύπου.'} />
        </div>
      </div>
    );
  }

  // Μετρικές ανά ακίνητο (μόνο της ομάδας που κοιτάζει ο χρήστης)
  const rowsData = inGroup.map(p => {
    const a = agg[p.id] || { expensesYTD: 0, recurringMonthly: 0, monthlyRent: 0, budgetMonthly: 0 };
    // ΙΔΙΑ ΠΗΓΗ ΑΛΗΘΕΙΑΣ ΜΕ ΤΗΝ ΕΠΙΣΚΟΨΗ. Πριν ήταν `p.value || 0`: ο
    // ιδιοκτήτης που είχε συμπληρώσει μόνο αντικειμενική αξία (η συνηθέστερη
    // περίπτωση — τη βρίσκει στο Ε9) έβλεπε «4,2%» στην Επισκόπηση και «0,0%» εδώ.
    const value = resolveValue(p.value, p.obj_value).value;
    const sqm = p.sqm || 0;
    const rent = a.monthlyRent || p.target_rent || 0;
    const perSqm = sqm > 0 && value > 0 ? value / sqm : null;
    const grossYield = value > 0 && rent > 0 ? (rent * 12 / value) * 100 : null;
    // ΜΟΝΟ ΜΙΑ ΑΦΑΙΡΕΣΗ. Οι πάγιοι λογαριασμοί είναι ΗΔΗ μέσα στις δαπάνες του
    // έτους — ο πυρήνας τους μέτρησε μία φορά. Η παλιά γραμμή αφαιρούσε και τα
    // δύο, και το ακίνητο έδειχνε διπλάσιο κόστος απ' όσο έχει.
    const netMonthly = rent > 0 ? rent - a.expensesYTD / 12 : null;
    const taxShare = taxShareOf(portfolioTax, p.id);
    return {
      p, sqm, expensesYTD: a.expensesYTD, recurringMonthly: a.recurringMonthly, budgetMonthly: a.budgetMonthly,
      value: value > 0 ? value : null,
      rent: rent > 0 ? rent : null,
      perSqm, grossYield, netMonthly, taxShare,
    };
  });

  // ── ΤΟ ΚΕΝΟ ΔΕΝ ΕΙΝΑΙ ΜΗΔΕΝ ─────────────────────────────────────────────────
  // Ο πίνακας γέμιζε «0,00 €» και «0,0%» για κάθε ακίνητο χωρίς καταχωρημένη αξία
  // ή ενοίκιο — δηλαδή έλεγε ότι το ακίνητο αξίζει μηδέν και αποδίδει μηδέν, ενώ
  // απλώς δεν του το έχει πει κανείς. Πλέον όποια μετρική στηρίζεται σε στοιχείο
  // που λείπει επιστρέφει `null` και γράφεται παύλα.
  //
  // Η ΔΙΑΚΡΙΣΗ ΕΙΝΑΙ ΟΥΣΙΑΣΤΙΚΗ, ΟΧΙ ΚΟΣΜΗΤΙΚΗ: στις δαπάνες το μηδέν είναι
  // ΑΠΑΝΤΗΣΗ («δεν έχεις καταχωρήσει καμία»), οπότε εκεί γράφεται «0 €».
  // ΤΟ «ΚΑΛΥΤΕΡΟ» ΜΟΝΟ ΕΚΕΙ ΠΟΥ ΣΗΜΑΙΝΕΙ ΚΑΤΙ.
  //
  // Οι τρεις γραμμές κόστους είχαν κι αυτές «καλύτερη τιμή» — τη ΧΑΜΗΛΟΤΕΡΗ. Σε
  // κάθε χαρτοφυλάκιο με ένα κενό ακίνητο, το κενό κέρδιζε και τις τρεις: μηδέν
  // πάγια, μηδέν φόρο, ελάχιστες δαπάνες. Η οθόνη στεφάνωνε ως «καλύτερο» το
  // ακίνητο που ΔΕΝ αποδίδει τίποτα, τρεις φορές στην ίδια στήλη.
  //
  // Το κόστος είναι συμφραζόμενο, όχι αγώνας: χαμηλές δαπάνες μπορεί να σημαίνουν
  // καλή διαχείριση ή αχρησιμοποίητο ακίνητο, και ο πίνακας δεν ξέρει ποιο. Ο
  // δείκτης μένει στα τρία μεγέθη όπου το «περισσότερο» είναι αδιαμφισβήτητα
  // καλύτερο για τον ιδιοκτήτη — και πέφτει από έξι σημάδια σε τρία.
  type Dir = 'high' | 'low' | 'none';
  // Η ΕΠΕΞΗΓΗΣΗ ΖΕΙ ΜΕΣΑ ΣΤΗ ΜΕΤΡΙΚΗ. Πριν υπήρχε χωριστός πίνακας `METRIC_TIPS`
  // με ΚΛΕΙΔΙ ΤΗΝ ΕΛΛΗΝΙΚΗ ΕΤΙΚΕΤΑ: αλλάζοντας «Δαπάνες Έτους» σε «Δαπάνες
  // έτους» —πεζό έψιλον— το tooltip εξαφανιζόταν αθόρυβα, χωρίς κανένα σφάλμα.
  const metrics: { label: string; tip?: string; get: (r: typeof rowsData[number]) => number | null; fmt: (n: number) => string; dir: Dir }[] = [
    { label: 'Μηνιαίο ενοίκιο', get: r => r.rent, fmt: n => fe(n, 0), dir: 'high',
      tip: 'Από το μισθωτήριο· αν δεν υπάρχει, ο στόχος ενοικίου του ακινήτου.' },
    { label: 'Μεικτή απόδοση', get: r => r.grossYield, fmt: n => fp(n), dir: 'high',
      tip: 'Ετήσιο ενοίκιο ÷ αξία ακινήτου. Χρησιμοποιείται η εμπορική αξία· αν λείπει, η αντικειμενική (Ε9) — ίδιος κανόνας με την Επισκόπηση.' },
    { label: 'Δαπάνες έτους', get: r => r.expensesYTD, fmt: n => fe(n, 0), dir: 'none',
      tip: 'Κάθε ευρώ μία φορά: ο πληρωμένος λογαριασμός και η δαπάνη του είναι το ίδιο γεγονός. Ίδιος υπολογισμός με τις Δαπάνες και τον Προϋπολογισμό.' },
    { label: 'Πάγια ανά μήνα', get: r => r.recurringMonthly, fmt: n => fe(n, 0), dir: 'none',
      tip: 'Ο μέσος μήνας σε επαναλαμβανόμενες δαπάνες, από ό,τι όντως καταχωρήθηκε φέτος. Είναι υποσύνολο των δαπανών του έτους, γι\u2019 αυτό δεν αφαιρείται ξεχωριστά.' },
    { label: 'Μερίδιο φόρου', get: r => r.taxShare, fmt: n => fe(n, 0), dir: 'none',
      tip: 'Ο φόρος ενοικίων είναι προοδευτικός στο ΣΥΝΟΛΟ των ακινήτων σου (Ε1), όχι ανά ακίνητο. Εδώ φαίνεται το μερίδιο κάθε ακινήτου από τον ένα φόρο.' },
    { label: 'Καθαρό ανά μήνα (εκτίμηση)', get: r => r.netMonthly, fmt: n => fe(n, 0), dir: 'high',
      tip: 'Εκτίμηση: ενοίκιο − (δαπάνες έτους ÷ 12). Δεν περιλαμβάνει δόσεις δανείου, φόρους ή έκτακτα.' },
  ];

  // Η «καλύτερη τιμή» βγαίνει ΜΟΝΟ από όσα ξέρουμε. Ένα ακίνητο χωρίς ενοίκιο δεν
  // έχει «τη χαμηλότερη» δαπάνη επειδή τυχαίνει να είναι κενό το κελί του — και
  // σε ισοπαλία δεν αναδεικνύεται κανένα, γιατί δεν υπάρχει καλύτερο.
  const bestId = (m: typeof metrics[number]): string | null => {
    if (m.dir === 'none') return null;
    const vals = rowsData.map(r => ({ id: r.p.id, v: m.get(r) })).filter((x): x is { id: string; v: number } => x.v != null);
    if (vals.length < 2) return null;
    const win = vals.reduce((best, x) => ((m.dir === 'high' ? x.v > best.v : x.v < best.v) ? x : best));
    return vals.filter(x => x.v === win.v).length > 1 ? null : win.id;
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
    // Στο CSV το κενό μένει ΚΕΝΟ, όχι μηδέν: ένα υπολογιστικό φύλλο που δείχνει 0
    // εκεί που δεν ξέρουμε, παράγει λάθος μέσους όρους στα χέρια του λογιστή.
    const c = (n: number | null) => (n == null ? '' : money(n));
    const rows = rowsData.map(r => [
      r.p.name, STATUS_LABELS[r.p.status_detail || ''] || r.p.prop_type || '',
      c(r.value), r.sqm > 0 ? dec2(r.sqm) : '', c(r.perSqm), c(r.rent), c(r.rent == null ? null : r.rent * 12),
      r.grossYield == null ? '' : percent(r.grossYield), money(r.recurringMonthly), money(r.expensesYTD),
      c(r.netMonthly), c(r.netMonthly == null ? null : r.netMonthly * 12), money(r.taxShare),
    ]);
    // Γραμμή συνόλων της ομάδας (όχι όλου του χαρτοφυλακίου: εξάγεται ό,τι φαίνεται).
    const sum = (f: (r: typeof rowsData[number]) => number | null) => rowsData.reduce((s, r) => s + (f(r) ?? 0), 0);
    rows.push(['ΣΥΝΟΛΟ', '', money(sum(r => r.value)), dec2(sum(r => r.sqm)), '', money(sum(r => r.rent)), money(sum(r => (r.rent ?? 0) * 12)), '', money(sum(r => r.recurringMonthly)), money(sum(r => r.expensesYTD)), money(sum(r => r.netMonthly)), money(sum(r => (r.netMonthly ?? 0) * 12)), money(sum(r => r.taxShare))]);
    // Η προειδοποίηση ταξιδεύει ΜΑΖΙ με τα νούμερα. Ένα αρχείο που φτάνει στον
    // λογιστή χωρίς αυτή είναι ακριβώς η παραπλανητική σύγκριση που θέλαμε να
    // αποφύγουμε — μόνο που τώρα δεν υπάρχει οθόνη να την εξηγήσει.
    rows.push([`${CONSOLIDATION_NOTE} Συνολικά ${portfolioTax.count} ακίνητα με εισόδημα, ενοίκια ${money(portfolioTax.totalAnnualRent)} €, φόρος ${money(portfolioTax.totalTax)} €.`]);
    if (rowsData.length < portfolioTax.count) {
      rows.push([`Προσοχή: το αρχείο περιέχει ${rowsData.length} από τα ${portfolioTax.count} ακίνητα με εισόδημα (εξάγεται η ομάδα που εμφανίζεται στην οθόνη). Το άθροισμα της στήλης φόρου είναι μέρος του συνολικού φόρου, όχι ο συνολικός φόρος.`]);
    }
    if (group.warning) rows.push([group.warning]);
    // Κοινός, θωρακισμένος exporter (BOM, «;», escaping + εξουδετέρωση formula-injection).
    downloadCsv(`sygkrisi_akiniton_${athensToday()}`, cols, rows);
  };

  // ── ΕΝΑ ΚΕΛΙ, ΕΝΑΣ ΚΑΝΟΝΑΣ ────────────────────────────────────────────────
  // Πριν, το κελί της καλύτερης τιμής βαφόταν πράσινο ΚΑΙ έπαιρνε πράσινο φόντο:
  // σε πίνακα έξι γραμμών, έξι πράσινα κελιά — δηλαδή χρώμα σε κάθε δεύτερη
  // ματιά, που έπαυε να ξεχωρίζει οτιδήποτε. Η ανάδειξη γίνεται με ΒΑΡΟΣ και
  // ένταση κειμένου, όπως σε κάθε άλλον πίνακα της εφαρμογής.
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, fontFamily: T.font.sans, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 12.5, whiteSpace: 'nowrap', textAlign: 'right' };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle
        title="Σύγκριση ακινήτων"
        sub={`${rowsData.length} ${typeLabel(group.key, inGroup[0]).toLowerCase()}, δίπλα-δίπλα`}
        right={!loading ? <ExportButton onClick={exportCSV} /> : undefined}
      />

      {/* Περισσότερες από μία ομάδες: ο χρήστης διαλέγει ποια κοιτάζει. Η επιλογή
          μπαίνει μόνο όταν υπάρχει κάτι να επιλεγεί — με μία ομάδα θα ήταν θόρυβος. */}
      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {groups.map(g => {
            const on = g.key === group.key;
            return (
              <button key={g.key} type="button" onClick={() => setGroupKey(g.key)} aria-pressed={on}
                style={{ height: 28, padding: '0 12px', borderRadius: 100, cursor: 'pointer', fontFamily: T.font.sans, fontSize: 11.5, fontWeight: on ? 700 : 500,
                  border: `1px solid ${on ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                  background: on ? 'var(--bg-hover)' : 'transparent',
                  color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
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
        <Skeleton h={300} r={14} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 200 + rowsData.length * 150 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-surface)' }} />
                {rowsData.map(r => (
                  <th key={r.p.id} style={{ ...th, textAlign: 'right' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{r.p.name}</div>
                    {/* Ταυτότητα, όχι μετρική: εμβαδόν, αξία και τιμή/τ.μ. λένε ποιο
                        ακίνητο κοιτάζεις. Δεν έχουν «καλύτερη τιμή», γι' αυτό δεν
                        είναι γραμμές του πίνακα. Ό,τι λείπει, απλώς λείπει —
                        δεν γράφεται παύλα για κάθε πεδίο χωριστά. */}
                    <div title={r.p.value ? 'Εμπορική αξία' : 'Αντικειμενική αξία (Ε9), επειδή δεν έχει καταχωρηθεί εμπορική'}
                      style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginTop: 3, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                      {[STATUS_LABELS[r.p.status_detail || ''] || null, r.sqm > 0 ? `${fn(r.sqm)} τ.μ.` : null, r.value != null ? fe(r.value, 0) : null, r.perSqm != null ? `${fe(r.perSqm, 0)}/τ.μ.` : null].filter(Boolean).join(' · ') || DASH}
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
                    <td title={m.tip} style={{ ...td, textAlign: 'left', fontFamily: T.font.sans, color: 'var(--text-secondary)', fontWeight: 500, fontSize: 12, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>{m.label}</td>
                    {rowsData.map(r => {
                      const v = m.get(r);
                      const isBest = best === r.p.id;
                      return (
                        <td key={r.p.id} style={{ ...td,
                          color: v == null ? 'var(--text-tertiary)' : isBest ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: isBest ? 700 : 400 }}>
                          {v == null ? DASH : m.fmt(v)}
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

      {/* ΜΙΑ ΓΡΑΜΜΗ, ΟΧΙ ΠΑΡΑΓΡΑΦΟΣ. Εδώ ζούσαν τρεις σειρές ψιλών γραμμάτων που
          επαναλάμβαναν όσα λέει ήδη το tooltip κάθε μετρικής και ο τίτλος της
          οθόνης. Μένει μόνο ό,τι δεν λέγεται αλλού: πώς διαβάζεται ο πίνακας. */}
      {!loading && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Έντονα</strong> το υψηλότερο ενοίκιο, απόδοση και καθαρό. Στις δαπάνες δεν υπάρχει «καλύτερο»: το χαμηλότερο κόστος είναι συνήθως το ακίνητο που δεν αποδίδει. <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{DASH}</strong> όπου λείπει στοιχείο.
          {portfolioTax.count > 1 && ` ${CONSOLIDATION_NOTE}`}
        </div>
      )}
    </div>
  );
}
