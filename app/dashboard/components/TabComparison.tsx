'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, fn, fp, ABSENT, ABSENT_SHORT, Skeleton, ExportButton, EmptyState, InfoBanner, PageTitle } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { comparableGroups } from '@/lib/property/visibility';
import { statusLabel, type StatusRow } from '@/lib/property/status';
import { downloadTableXlsx } from './exportCsv';
import { money } from './xlsxStyle';
import { consolidateRentTax, taxShareOf, CONSOLIDATION_NOTE } from '@/lib/billing/consolidate';
import { resolveValue } from '@/lib/billing/propertyFacts';
import { mergeLedger, ledgerTotal, recurringMonthly } from '@/lib/expenses/ledger';
import { athensToday } from '@/lib/core/time';
import type { ExpensesRow, BillsRow, TenantsRow, BillsSettingsRow } from '@/lib/supabase/tables';

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
// Η στήλη `bills_settings.data` είναι jsonb: υπάρχει στη βάση, το ΣΧΗΜΑ της όχι
// (γι' αυτό `Json = unknown` στο tables.ts). Άρα δεν αρκεί ο τύπος, χρειάζεται
// φύλακας: ένας πίνακας ή ένα σκέτο string περνούσε ως «ρυθμίσεις» και το
// `Object.entries` του έδινε δείκτες αντί για ονόματα κατηγοριών — δηλαδή
// σιωπηλά λάθος μηνιαίος στόχος, χωρίς κανένα σφάλμα.
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const budgetTotalOf = (data: Record<string, unknown> | null | undefined): number => {
  if (!data) return 0;
  const t = parseFloat(String(data.total ?? ''));
  if (!isNaN(t) && String(data.total).trim() !== '') return t;
  return Object.entries(data)
    .filter(([k, v]) => !k.startsWith('__') && !BUDGET_META.has(k) && !isNaN(parseFloat(String(v))))
    .reduce((s, [, v]) => s + parseFloat(String(v)), 0);
};

// Ο πίνακας STATUS_LABELS έφυγε: ήταν ΤΡΙΤΟ λεξιλόγιο για την κατάσταση
// ακινήτου («Ενοικιάζεται», «Εποχιακό»), δίπλα στο lib/property/status.ts που
// είναι η μία πηγή («Μακροχρόνια μίσθωση», «Βραχυχρόνια μίσθωση») και σε ένα
// ακόμη στο Χαρτοφυλάκιο. Το ίδιο ακίνητο λεγόταν αλλιώς σε κάθε οθόνη, και
// διάβαζε ωμό `status_detail` — άρα αγνοούσε το `rental_mode`, που είναι το
// πεδίο που γράφει σήμερα το dropdown κατάστασης.

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
      // ΠΟΙΟΣ ΕΝΟΙΚΟΣ ΜΕΤΡΑ, ΟΤΑΝ ΕΙΝΑΙ ΠΕΡΙΣΣΟΤΕΡΟΙ ΑΠΟ ΕΝΑΣ.
      // Ένα ακίνητο έχει συνήθως ιστορικό ενοίκων: παλιός, νέος, ενδιάμεσος.
      // Χωρίς ταξινόμηση η PostgREST δεν εγγυάται σειρά, οπότε η οθόνη έπαιρνε
      // ΟΠΟΙΑΔΗΠΟΤΕ γραμμή έτυχε να έρθει τελευταία — δηλαδή μπορούσε να δείξει
      // το ενοίκιο ενοίκου που έφυγε πέρσι, και να το περάσει και στη φορολογική
      // ενοποίηση. Ο πιο πρόσφατος μετρά, ίδιος κανόνας με το Χαρτοφυλάκιο.
      supabase.from('tenants').select('monthly_rent,property_id,updated_at').in('property_id', ids).eq('user_id', userId)
        .order('updated_at', { ascending: false }),
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
    // ΤΑ ΣΧΗΜΑΤΑ ΕΙΝΑΙ ΑΚΡΙΒΩΣ ΟΙ ΣΤΗΛΕΣ ΤΩΝ SELECT ΠΑΡΑΠΑΝΩ.
    // Ήταν `as never[]`, που δεν είναι τύπος αλλά σβήσιμο τύπου: το `never[]`
    // πηγαίνει παντού, οπότε ο πυρήνας του ημερολογίου δεχόταν ό,τι κι αν του
    // έδινε το ερώτημα. Ένα λάθος όνομα στήλης στο `select(...)` περνούσε ως
    // `undefined` και έβγαινε ως μηδέν δαπάνες — δηλαδή «φθηνό» ακίνητο.
    // Κομμένα με `Pick` από το παραγόμενο σχήμα: το όνομα κάθε στήλης ελέγχεται
    // μία φορά, στη μεταγλώττιση.
    const expRows: Pick<ExpensesRow, 'id' | 'bill_id' | 'amount' | 'date' | 'description' | 'category' | 'paid' | 'expense_group' | 'is_recurring' | 'store_vendor' | 'property_id'>[] = exp || [];
    const bilRows: Pick<BillsRow, 'id' | 'name' | 'amount' | 'paid' | 'paid_at' | 'due_date' | 'created_at' | 'category' | 'recurring' | 'property_id'>[] = bil || [];
    const tenRows: Pick<TenantsRow, 'monthly_rent' | 'property_id' | 'updated_at'>[] = ten || [];
    const budRows: Pick<BillsSettingsRow, 'property_id' | 'data'>[] = bud || [];
    const expByProp = byProp(expRows);
    const bilByProp = byProp(bilRows);

    const m: Record<string, Agg> = {};
    ids.forEach(id => {
      const { entries } = mergeLedger(bilByProp[id], expByProp[id]);
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
    // ΓΡΑΜΜΗ ΧΩΡΙΣ ΑΚΙΝΗΤΟ ΔΕΝ ΑΝΗΚΕΙ ΣΕ ΚΑΝΕΝΑ ΑΚΙΝΗΤΟ.
    // Το `property_id` και στους δύο πίνακες μπορεί να είναι κενό — ο τύπος το
    // λέει, το `any` το έκρυβε. Το παλιό `m[t.property_id]` έψαχνε τότε το κλειδί
    // «null» και ο έλεγχος το προσπερνούσε κατά τύχη, όχι κατά πρόθεση. Τώρα ο
    // έλεγχος είναι ρητός και τον απαιτεί ο μεταγλωττιστής.
    //
    // Η λίστα έρχεται φθίνουσα κατά `updated_at`, άρα ο ΠΡΩΤΟΣ ένοικος κάθε
    // ακινήτου είναι ο πιο πρόσφατος και κρατά τη θέση του.
    const rentSeen = new Set<string>();
    tenRows.forEach(t => {
      const id = t.property_id;
      if (!id || !m[id] || rentSeen.has(id)) return;
      rentSeen.add(id);
      m[id].monthlyRent = Number(t.monthly_rent) || 0;
    });
    budRows.forEach(r => {
      const id = r.property_id;
      // Το `data` είναι jsonb: έρχεται απ' έξω, χωρίς σχήμα. Φύλακας πριν τη χρήση.
      if (id && m[id]) m[id].budgetMonthly = budgetTotalOf(isRecord(r.data) ? r.data : null);
    });
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
        {/* Ο υπότιτλος υπάρχει όταν η οθόνη έχει περιεχόμενο («3 διαμερίσματα,
            δίπλα-δίπλα») και έλειπε όταν δεν έχει — δηλαδή ακριβώς όταν ο χρήστης
            χρειάζεται να μάθει τι κάνει αυτή η οθόνη. Και η κενή κατάσταση ήταν
            τυλιγμένη σε κάρτα: ένα περίγραμμα γύρω από την απουσία της δίνει σώμα
            που δεν έχει, και οι σαράντα τρεις από τις σαράντα πέντε άλλες της
            εφαρμογής δεν το κάνουν. */}
        <PageTitle title="Σύγκριση ακινήτων" sub="Ποιο αποδίδει καλύτερα, με τα ίδια μέτρα για όλα" />
        <EmptyState icon={<Building2 size={20} />}
            title={single ? 'Χρειάζονται τουλάχιστον δύο ακίνητα' : 'Κανένα ζευγάρι ακινήτων ίδιου τύπου'}
            hint={single
              ? 'Πρόσθεσε ένα δεύτερο ακίνητο για να τα δεις δίπλα-δίπλα.'
              : 'Συγκρίνονται μόνο ακίνητα ίδιου τύπου: ένα διαμέρισμα κι ένα κατάστημα δεν έχουν κοινή αγορά. Συμπλήρωσε τον τύπο σε κάθε ακίνητο ή πρόσθεσε ένα δεύτερο ίδιου τύπου.'} />
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
  // ═══ ΕΙΚΟΣΙ ΔΥΟ ΤΕΤΡΑΓΩΝΙΚΑ ΔΙΠΛΑ ΣΕ ΕΞΗΝΤΑ ΠΕΝΤΕ ════════════════════════
  // Ο πίνακας σύγκρινε ΑΠΟΛΥΤΑ ΕΥΡΩ: «Δαπάνες 751,00 € έναντι 324,10 €». Με
  // τριπλάσιο εμβαδόν, το μεγάλο ακίνητο κερδίζει πάντα στα έσοδα και χάνει
  // πάντα στα έξοδα — και η οθόνη το παραδεχόταν με προειδοποίηση από πάνω, και
  // μετά το έκανε έτσι κι αλλιώς. Προειδοποίηση που δεν αλλάζει τη μέτρηση δεν
  // είναι ειλικρίνεια, είναι άλλοθι.
  //
  // Η δίκαιη βάση είναι το τετραγωνικό, και ο δείκτης που δεν εξαρτάται καθόλου
  // από μέγεθος είναι το ΚΟΣΤΟΣ ΑΝΑ ΕΥΡΩ ΕΣΟΔΟΥ: πόσα ξοδεύεις για να μπει ένα
  // ευρώ. Αυτό είναι συμπέρασμα· το «751 έναντι 324» δεν είναι.
  const perSqmOf = (v: number | null, sqm: number): number | null =>
    v == null || !(sqm > 0) ? null : Math.round((v / sqm) * 100) / 100;

  const allMetrics: { label: string; tip?: string; get: (r: typeof rowsData[number]) => number | null; fmt: (n: number) => string; dir: Dir }[] = [
    { label: 'Μηνιαίο ενοίκιο', get: r => r.rent, fmt: n => fe(n), dir: 'high',
      tip: 'Από το μισθωτήριο· αν δεν υπάρχει, ο στόχος ενοικίου του ακινήτου.' },
    { label: 'Μεικτή απόδοση', get: r => r.grossYield, fmt: n => fp(n), dir: 'high',
      tip: 'Ετήσιο ενοίκιο ÷ αξία ακινήτου. Χρησιμοποιείται η εμπορική αξία· αν λείπει, η αντικειμενική (Ε9)· ίδιος κανόνας με την Επισκόπηση.' },
    { label: 'Δαπάνες έτους', get: r => r.expensesYTD, fmt: n => fe(n), dir: 'none',
      tip: 'Κάθε ευρώ μία φορά: ο πληρωμένος λογαριασμός και η δαπάνη του είναι το ίδιο γεγονός. Ίδιος υπολογισμός με τις Δαπάνες και τον Προϋπολογισμό.' },
    { label: 'Πάγια ανά μήνα', get: r => r.recurringMonthly, fmt: n => fe(n), dir: 'none',
      tip: 'Ο μέσος μήνας σε επαναλαμβανόμενες δαπάνες, από ό,τι όντως καταχωρήθηκε φέτος. Είναι υποσύνολο των δαπανών του έτους, γι\u2019 αυτό δεν αφαιρείται ξεχωριστά.' },
    { label: 'Μερίδιο φόρου', get: r => r.taxShare, fmt: n => fe(n), dir: 'none',
      tip: 'Ο φόρος ενοικίων είναι προοδευτικός στο ΣΥΝΟΛΟ των ακινήτων σου (Ε1), όχι ανά ακίνητο. Εδώ φαίνεται το μερίδιο κάθε ακινήτου από τον ένα φόρο.' },
    { label: 'Καθαρό ανά μήνα (εκτίμηση)', get: r => r.netMonthly, fmt: n => fe(n), dir: 'high',
      tip: 'Εκτίμηση: ενοίκιο − (δαπάνες έτους ÷ 12). Δεν περιλαμβάνει δόσεις δανείου, φόρους ή έκτακτα.' },
    // ── ΟΙ ΤΡΕΙΣ ΓΡΑΜΜΕΣ ΠΟΥ ΔΕΝ ΕΞΑΡΤΩΝΤΑΙ ΑΠΟ ΜΕΓΕΘΟΣ ───────────────────
    { label: 'Ενοίκιο ανά τετραγωνικό', get: r => perSqmOf(r.rent, r.sqm), fmt: n => fe(n), dir: 'high',
      tip: 'Μηνιαίο ενοίκιο διά το εμβαδόν. Η μόνη δίκαιη σύγκριση ανάμεσα σε ακίνητα διαφορετικού μεγέθους: ένα μεγαλύτερο ακίνητο βγάζει περισσότερα ούτως ή άλλως.' },
    { label: 'Δαπάνες ανά τετραγωνικό', get: r => perSqmOf(r.expensesYTD, r.sqm), fmt: n => fe(n), dir: 'none',
      tip: 'Δαπάνες έτους διά το εμβαδόν. Δείχνει αν ένα ακίνητο κοστίζει περισσότερο επειδή είναι ακριβό στη συντήρηση ή απλώς επειδή είναι μεγαλύτερο.' },
    { label: 'Κόστος ανά ευρώ εσόδου', get: r => (r.rent == null || r.rent <= 0 ? null : Math.round((r.expensesYTD / (r.rent * 12)) * 100) / 100),
      fmt: n => fe(n), dir: 'low',
      tip: 'Πόσα ξοδεύεις για να μπει ένα ευρώ. Δεν εξαρτάται ούτε από μέγεθος ούτε από αξία, άρα συγκρίνει ό,τι δεν συγκρίνουν τα υπόλοιπα. Εδώ το χαμηλότερο ΕΙΝΑΙ καλύτερο, γιατί το κλάσμα προϋποθέτει ότι υπάρχει έσοδο.' },
  ];
  // ═══ ΓΡΑΜΜΗ ΧΩΡΙΣ ΚΑΝΕΝΑ ΣΤΟΙΧΕΙΟ ΔΕΝ ΕΙΝΑΙ ΓΡΑΜΜΗ ══════════════════════
  // Η «Μεικτή απόδοση» εμφανιζόταν με παύλα ΚΑΙ στις δύο στήλες: μια ολόκληρη
  // σειρά πίνακα για να ανακοινώσει ότι δεν ξέρουμε τίποτα. Η απουσία λέγεται
  // με απουσία — η γραμμή δεν αποδίδεται καθόλου.
  const metrics = allMetrics.filter(m => rowsData.some(r => m.get(r) != null));

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
    //
    // ΤΑ ΠΟΣΑ ΦΕΥΓΟΥΝ ΩΣ ΑΡΙΘΜΟΙ. Πριν περνούσαν από τη `money()`, που παράγει
    // κείμενο «1.234,56 €»: το φύλλο φαινόταν σωστό και δεν αθροιζόταν σε καμία
    // στήλη — ο λογιστής επέλεγε τη στήλη «Αξία» και το Excel έδειχνε μηδέν. Το
    // «€» το δίνει πια η μορφή του κελιού, όχι το περιεχόμενο, γι' αυτό δεν
    // γράφεται και δεύτερη φορά δίπλα στον αριθμό.
    const c = (n: number | null) => (n == null ? '' : n);
    const rows: (string | number)[][] = rowsData.map(r => [
      r.p.name, statusLabel(r.p as StatusRow) || r.p.prop_type || '',
      c(r.value), r.sqm > 0 ? r.sqm : '', c(r.perSqm), c(r.rent), c(r.rent == null ? null : r.rent * 12),
      r.grossYield ?? '', r.recurringMonthly, r.expensesYTD,
      c(r.netMonthly), c(r.netMonthly == null ? null : r.netMonthly * 12), r.taxShare,
    ]);
    // Η γραμμή ΣΥΝΟΛΟ δεν γράφεται εδώ: την προσθέτει ο κοινός exporter ως
    // ζωντανό SUM. Γραμμένη και στα δύο σημεία, θα μετριόταν δύο φορές.
    //
    // Η προειδοποίηση ταξιδεύει ΜΑΖΙ με τα νούμερα. Ένα αρχείο που φτάνει στον
    // λογιστή χωρίς αυτή είναι ακριβώς η παραπλανητική σύγκριση που θέλαμε να
    // αποφύγουμε — μόνο που τώρα δεν υπάρχει οθόνη να την εξηγήσει.
    const notes = [
      `${CONSOLIDATION_NOTE} Συνολικά ${portfolioTax.count} ακίνητα με εισόδημα, ενοίκια ${money(portfolioTax.totalAnnualRent)}, φόρος ${money(portfolioTax.totalTax)}.`,
      rowsData.length < portfolioTax.count
        ? `Προσοχή: το αρχείο περιέχει ${rowsData.length} από τα ${portfolioTax.count} ακίνητα με εισόδημα (εξάγεται η ομάδα που εμφανίζεται στην οθόνη). Το άθροισμα της στήλης φόρου είναι μέρος του συνολικού φόρου, όχι ο συνολικός φόρος.`
        : '',
      group.warning || '',
    ];
    downloadTableXlsx(`Σύγκριση ακινήτων ${athensToday()}`, {
      title: 'Σύγκριση ακινήτων', headers: cols, rows, notes,
    });
  };

  // ── ΕΝΑ ΚΕΛΙ, ΕΝΑΣ ΚΑΝΟΝΑΣ ────────────────────────────────────────────────
  // Πριν, το κελί της καλύτερης τιμής βαφόταν πράσινο ΚΑΙ έπαιρνε πράσινο φόντο:
  // σε πίνακα έξι γραμμών, έξι πράσινα κελιά — δηλαδή χρώμα σε κάθε δεύτερη
  // ματιά, που έπαυε να ξεχωρίζει οτιδήποτε. Η ανάδειξη γίνεται με ΒΑΡΟΣ και
  // ένταση κειμένου, όπως σε κάθε άλλον πίνακα της εφαρμογής.
  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, fontFamily: T.font.sans, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 13, whiteSpace: 'nowrap', textAlign: 'right' };

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
                style={{ height: 28, padding: '0 12px', borderRadius: 100, cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: on ? 700 : 500,
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{r.p.name}</div>
                    {/* Ταυτότητα, όχι μετρική: εμβαδόν, αξία και τιμή/τ.μ. λένε ποιο
                        ακίνητο κοιτάζεις. Δεν έχουν «καλύτερη τιμή», γι' αυτό δεν
                        είναι γραμμές του πίνακα. Ό,τι λείπει, απλώς λείπει —
                        δεν γράφεται παύλα για κάθε πεδίο χωριστά. */}
                    <div title={r.p.value ? 'Εμπορική αξία' : 'Αντικειμενική αξία (Ε9), επειδή δεν έχει καταχωρηθεί εμπορική'}
                      style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginTop: 3, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                      {[statusLabel(r.p as StatusRow) || null, r.sqm > 0 ? `${fn(r.sqm)} τετραγωνικά` : null, r.value != null ? fe(r.value) : null, r.perSqm != null ? `${fe(r.perSqm)} ανά τετραγωνικό` : null].filter(Boolean).join(' · ') || ABSENT}
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
                          {/* Ήταν παύλα. Σε στήλη αριθμών η παύλα δεν έχει
                              υποδιαστολή, δεν στοιχίζεται με τίποτα, και τρυπάει
                              τη γραμμή. Η λέξη το λέει και διαβάζεται. */}
                          {v == null ? <span style={{ fontFamily: T.font.sans, fontSize: 11 }}>{ABSENT_SHORT}</span> : m.fmt(v)}
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
          <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Έντονα</strong> το υψηλότερο ενοίκιο, απόδοση και καθαρό. Στις δαπάνες δεν υπάρχει «καλύτερο»: το χαμηλότερο κόστος είναι συνήθως το ακίνητο που δεν αποδίδει. «{ABSENT_SHORT}» όπου λείπει στοιχείο. Οι τρεις τελευταίες γραμμές δεν εξαρτώνται από το μέγεθος, οπότε είναι οι μόνες που συγκρίνουν δίκαια ακίνητα διαφορετικού εμβαδού.
          {portfolioTax.count > 1 && ` ${CONSOLIDATION_NOTE}`}
        </div>
      )}
    </div>
  );
}
