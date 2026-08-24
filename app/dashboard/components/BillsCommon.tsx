'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as expenses from '@/lib/data/expenses';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import { NumberInput, TextInput, DatePicker, CustomSelect, addBtn } from './UIComponents';
import { T, TT, fe, formGrid, fieldRow, InfoBanner, Card, EmptyState, fp, histInputStyle, localDay, ABSENT_SHORT } from '@/components/Theme';
import { notifyOk } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { HandCoins, BarChart3 } from 'lucide-react';
import { athensToday } from '@/lib/core/time';
import { MONTHS_SHORT } from '@/lib/core/months';


// Τα ελληνικά δεν έχουν Title Case: «Παραδοσιακός Διαχειριστής» είναι αγγλική
// συνήθεια. Το κλειδί «billys» μένει ως έχει — είναι αποθηκευμένη τιμή σε
// ρυθμίσεις χρηστών και μια μετονομασία θα έσβηνε την επιλογή τους.
const MGMT_TYPES = [
  { value: 'traditional', label: 'Παραδοσιακός διαχειριστής' },
  { value: 'office',      label: 'Γραφείο διαχείρισης'       },
  { value: 'billys',      label: 'Ψηφιακή πλατφόρμα'         },
  { value: 'none',        label: 'Χωρίς διαχειριστή'         },
];

// Μόνο η εξήγηση. Το `monthly` ήταν μηδέν και στα τέσσερα, δηλαδή εφεδρική τιμή
// που δεν πρόσθετε ποτέ τίποτα, και το `url` έδειχνε σε ιστότοπο τρίτου από
// σύνδεσμο που δεν υπάρχει πια.
const MGMT_INFO: Record<string, string> = {
  traditional: 'Παραδοσιακός διαχειριστής, εθελοντής ή αμειβόμενος ένοικος ή ιδιοκτήτης.',
  office:      'Επαγγελματική εταιρεία διαχείρισης, συνήθως 20 έως 50 € τον μήνα.',
  billys:      'Ψηφιακή πλατφόρμα κοινοχρήστων: online έκδοση, ειδοποιήσεις, πληρωμές.',
  none:        'Αυτοδιαχείριση, χωρίς κόστος, απαιτεί χρόνο από τον ιδιοκτήτη.',
};



// Ανάλυση κοινοχρήστων ανά κατηγορία, λογική κατανομής με χιλιοστά (Billys-style).
// payer: ποιος επιβαρύνεται κατά τον νόμο/έθιμο (ενοικιαστής=λειτουργικά, ιδιοκτήτης=κεφαλαιουχικά).
const COMMON_CATEGORIES: { key: string; label: string; payer: 'tenant' | 'owner' }[] = [
  { key: 'cleaning',    label: 'Καθαρισμός',              payer: 'tenant' },
  { key: 'power',       label: 'Ρεύμα κοινοχρήστων',      payer: 'tenant' },
  { key: 'elevator',    label: 'Ασανσέρ (λειτουργία)',    payer: 'tenant' },
  { key: 'heating',     label: 'Θέρμανση / πετρέλαιο',    payer: 'tenant' },
  { key: 'water',       label: 'Ύδρευση κοινοχρήστων',    payer: 'tenant' },
  { key: 'garden',      label: 'Κηπουρός / πράσινο',      payer: 'tenant' },
  { key: 'manager',     label: 'Αμοιβή διαχειριστή',      payer: 'tenant' },
  { key: 'maintenance', label: 'Συντήρηση / επισκευές',   payer: 'owner'  },
  { key: 'reserve',     label: 'Αποθεματικό κτιρίου',     payer: 'owner'  },
];


// Η γεωμετρία της στήλης του πεδίου, σε ένα σημείο: το πλάτος της στήλης και το
// εσωτερικό περιθώριο του πεδίου. Το δεύτερο το χρειάζεται ΚΑΙ η επικεφαλίδα,
// για να πέφτει πάνω από τα ψηφία και όχι πάνω από το περίγραμμα.
const FIELD_COL = 150
const FIELD_PAD = 12

interface Props { propertyId: string; userId?: string; }

export default function BillsCommon({ propertyId, userId = '' }: Props) {
  const supabase  = createClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mgmtType,     setMgmtType]     = useState('traditional');
  const [mgmtCost,     setMgmtCost]     = useState('');
  const [mgmtDueDay,   setMgmtDueDay]   = useState('25');
  const [fundBalance,  setFundBalance]  = useState('');
  const [fundMyPct,    setFundMyPct]    = useState('');
  const [fundMonthly,  setFundMonthly]  = useState('');
  const [fundLastDate, setFundLastDate] = useState('');
  const [extraReason,  setExtraReason]  = useState('');
  const [extraAmount,  setExtraAmount]  = useState('');
  const [extraDate,    setExtraDate]    = useState('');
  const [extras,       setExtras]       = useState<{ reason: string; amount: string; date: string; transferredToExpenses?: boolean }[]>([]);
  const [history,      setHistory]      = useState<string[]>(Array(12).fill(''));
  const [millesimi,    setMillesimi]    = useState('');
  const [catData,      setCatData]      = useState<Record<string, string>>({});
  const [transferring, setTransferring] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // ── ΚΑΘΕ ΑΚΙΝΗΤΟ ΞΕΚΙΝΑ ΑΠΟ ΤΟ ΜΗΔΕΝ ──────────────────────────────────────
  // ΤΟ ΣΦΑΛΜΑ. Κάθε πεδίο γραφόταν μόνο ΑΝ υπήρχε στην απάντηση («if (d.catData)»),
  // και όταν το νέο ακίνητο δεν είχε καθόλου γραμμή δεν γραφόταν τίποτα. Το
  // component δεν επαναπροσαρτάται στην αλλαγή ακινήτου (δεν έχει `key`, σε
  // αντίθεση με το ExpenseLedger δίπλα του), οπότε η οθόνη κρατούσε ΟΛΑ τα
  // δεδομένα του προηγούμενου: χιλιοστά, υπόλοιπο ταμείου, δωδεκάμηνο ιστορικό,
  // κατηγορίες κτιρίου, λίστα εκτάκτων. Και μόλις ο χρήστης άγγιζε ΕΝΑ πεδίο,
  // το `upd()` στέλνει ΟΛΟ το state — δηλαδή τα έγραφε στο νέο ακίνητο.
  //
  // ΤΟ ΑΚΡΙΒΟΤΕΡΟ ΕΠΑΚΟΛΟΥΘΟ ΔΕΝ ΗΤΑΝ ΤΑ ΡΥΘΜΙΣΤΙΚΑ. Μια κληρονομημένη έκτακτη
  // δαπάνη («Αντικατάσταση ασανσέρ 1.800 €») εμφανιζόταν με ενεργό το κουμπί
  // μεταφοράς, και η `transferToExpenses` γράφει με το ΤΡΕΧΟΝ propertyId: 1.800 €
  // καταχωρημένα σε λάθος ακίνητο, άρα λάθος Ε2 και λάθος απόδοση, και για τα δύο.
  //
  // Τώρα κάθε πεδίο γράφεται ΠΑΝΤΑ, με την προεπιλογή του όταν λείπει. Καμία
  // τιμή δεν επιβιώνει από ακίνητο σε ακίνητο.
  useEffect(() => {
    if (!propertyId) return;
    let alive = true;
    (async () => {
      const d = await settings.section(supabase, propertyId, 'common', userId);
      if (!alive) return;
      const str = (v: unknown, fallback = '') => (v === undefined || v === null ? fallback : String(v));
      setMgmtType(str(d?.mgmtType, 'traditional'));
      setMgmtCost(str(d?.mgmtCost));
      setMgmtDueDay(str(d?.mgmtDueDay, '25'));
      setFundBalance(str(d?.fundBalance));
      setFundMyPct(str(d?.fundMyPct));
      setFundMonthly(str(d?.fundMonthly));
      setFundLastDate(str(d?.fundLastDate));
      setExtras((d?.extras as typeof extras) ?? []);
      setHistory((d?.history as string[]) ?? Array(12).fill(''));
      setMillesimi(str(d?.millesimi));
      setCatData((d?.catData as Record<string, string>) ?? {});
      // Και τα πεδία της φόρμας νέας έκτακτης: μισογραμμένη εγγραφή του ενός
      // ακινήτου δεν έχει καμία δουλειά να περιμένει στο επόμενο.
      setExtraReason(''); setExtraAmount(''); setExtraDate('');
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, userId]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const save = useCallback((patch: Record<string, unknown>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saved('Οι ρυθμίσεις κοινοχρήστων δεν αποθηκεύτηκαν',
        settings.put(supabase, propertyId, userId, 'common', patch));
    }, 800);
  }, [propertyId, userId]);

  const upd = useCallback((patch: Record<string, unknown>) => {
    save({ mgmtType, mgmtCost, mgmtDueDay, fundBalance, fundMyPct, fundMonthly, fundLastDate, extras, history, millesimi, catData, ...patch });
  }, [mgmtType, mgmtCost, mgmtDueDay, fundBalance, fundMyPct, fundMonthly, fundLastDate, extras, history, millesimi, catData, save]);

  const sMgmt    = (v: string) => { setMgmtType(v);    upd({ mgmtType: v    }); };
  const sMgmtC   = (v: string) => { setMgmtCost(v);    upd({ mgmtCost: v    }); };
  const sMgmtD   = (v: string) => { setMgmtDueDay(v);  upd({ mgmtDueDay: v  }); };
  const sFundBal = (v: string) => { setFundBalance(v);  upd({ fundBalance: v  }); };
  const sFundPct = (v: string) => { setFundMyPct(v);    upd({ fundMyPct: v    }); };
  const sFundM   = (v: string) => { setFundMonthly(v);  upd({ fundMonthly: v  }); };
  const sFundD   = (v: string) => { setFundLastDate(v); upd({ fundLastDate: v }); };
  const sHist    = (i: number, v: string) => {
    const n = [...history]; n[i] = v; setHistory(n); upd({ history: n });
  };
  const sMill    = (v: string) => { setMillesimi(v); upd({ millesimi: v }); };
  // ΚΑΝΕΝΑ ΑΡΝΗΤΙΚΟ ΚΟΙΝΟΧΡΗΣΤΟ. Το `min={0}` του HTML εμποδίζει τα βελάκια,
  // όχι την πληκτρολόγηση: το «-50» γραφόταν κανονικά, αποθηκευόταν, και έβγαζε
  // αρνητικό μερίδιο σε πίνακα δαπανών. Το κτίριο δεν σου δίνει χρήματα.
  const sCat     = (key: string, v: string) => {
    const clean = v.replace(/-/g, '');
    const n = { ...catData, [key]: clean }; setCatData(n); upd({ catData: n });
  };

  const addExtra = () => {
    if (!extraReason || !extraAmount) return;
    const n = [...extras, { reason: extraReason, amount: extraAmount, date: extraDate, transferredToExpenses: false }];
    setExtras(n); upd({ extras: n });
    setExtraReason(''); setExtraAmount(''); setExtraDate('');
  };
  const delExtra = (i: number) => {
    const n = extras.filter((_, j) => j !== i); setExtras(n); upd({ extras: n });
  };
  const transferToExpenses = async (i: number) => {
    const e = extras[i];
    if (!e || e.transferredToExpenses || transferring === i) return;
    setTransferring(i);
    // Το try/catch που ήταν εδώ δεν έπιανε ποτέ τίποτα: το Supabase επιστρέφει
    // σφάλμα, δεν το πετά. Η δαπάνη μπορούσε να μη γραφτεί και η έκτακτη να
    // σημειωθεί «μεταφέρθηκε» — χαμένη και από τις δύο πλευρές.
    const ok = await saved('Η έκτακτη δαπάνη δεν καταχωρήθηκε', expenses.insert(supabase, [expenses.row(
      { propertyId, userId: String(userId) },
      {
        amount: parseFloat(e.amount),
        description: `Κοινόχρηστα, ${e.reason}`,
        date: e.date || athensToday(),
        category: 'Κοινόχρηστα',
      },
    )]));
    setTransferring(null);
    if (!ok) return;
    const n = extras.map((ex, j) => j === i ? { ...ex, transferredToExpenses: true } : ex);
    setExtras(n); upd({ extras: n });
    // Ο τόνος (θετικό/αρνητικό) δηλώνεται πια ρητά. Πριν, η επιτυχία ξεχώριζε από
    // την αποτυχία με `transferMsg.startsWith('Σφάλμα')` — αν άλλαζε η διατύπωση
    // του μηνύματος, η αποτυχία εμφανιζόταν ουδέτερη και διαβαζόταν ως επιτυχία.
    notifyOk(`«${e.reason}», ${fe(parseFloat(e.amount))} προστέθηκε στις Δαπάνες`);
  };

  const mgmtInfo    = MGMT_INFO[mgmtType];
  const mgmtMonthly = parseFloat(mgmtCost) || 0;
  const monthlyAvg  = history.filter(v => v).length > 0
    ? history.reduce((s, v) => s + (parseFloat(v) || 0), 0) / history.filter(v => v).length : 0;
  const totalCommon  = mgmtMonthly + (parseFloat(fundMonthly) || 0) + monthlyAvg;
  const maxH         = Math.max(...history.map(v => parseFloat(v) || 0), 1);
  const currentMonth = new Date().getMonth();
  const myFundShare  = fundBalance && fundMyPct ? parseFloat(fundBalance) * (parseFloat(fundMyPct) / 100) : 0;
  const totalExtras  = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const fundMonths   = fundMonthly && myFundShare > 0 ? Math.floor(myFundShare / (parseFloat(fundMonthly) || 1)) : 0;

  // Ανάλυση κοινοχρήστων ανά κατηγορία, κατανομή με χιλιοστά (Billys logic)
  const millRatio    = (parseFloat(millesimi) || 0) / 1000;          // μερίδιο ιδιοκτησίας
  const catRows      = COMMON_CATEGORIES.map(c => {
    const building = parseFloat(catData[c.key]) || 0;                // μηνιαίο σύνολο κτιρίου
    const myShare  = building * millRatio;                            // το μερίδιό μου
    return { ...c, building, myShare };
  });
  const catBuildingTotal = catRows.reduce((s, r) => s + r.building, 0);
  const myCatTotal       = catRows.reduce((s, r) => s + r.myShare, 0);
  const tenantBurden     = catRows.filter(r => r.payer === 'tenant').reduce((s, r) => s + r.myShare, 0);
  const ownerBurden      = catRows.filter(r => r.payer === 'owner').reduce((s, r) => s + r.myShare, 0);
  const hasCatData       = catBuildingTotal > 0;

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`
        .mgmt-card { transition: background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s; }
        .mgmt-card:hover { border-color: var(--border-default) !important; background: var(--bg-surface) !important; }
        .mgmt-card.active:hover { border-color: var(--accent) !important; background: var(--accent-soft) !important; }
        .hist-bar { transition: opacity 0.15s; }
        .hist-bar:hover { opacity: 0.85; }
      `}</style>

      {/* ═══ ΤΡΙΑ ΜΗΔΕΝΙΚΑ ΠΡΙΝ Ο ΧΡΗΣΤΗΣ ΓΡΑΨΕΙ ΤΙΠΟΤΑ ═══════════════════════
          Η σειρά άνοιγε την οθόνη με «Δωρεάν · 0,00 € · 0,00 €», δηλαδή τρεις
          μεγάλες κάρτες που δεν μετρούσαν τίποτα: τα νούμερα παράγονται από τα
          πεδία ΠΙΟ ΚΑΤΩ, που είναι ακόμη άδεια. Ένα «0,00 €» σε θέση μετρικής
          δεν διαβάζεται «δεν ξέρω ακόμη»· διαβάζεται «μηδέν», και είναι το ίδιο
          σφάλμα με τα μηδενικά του πίνακα κατηγοριών.

          Εμφανίζεται μόλις υπάρχει έστω ένα μετρημένο νούμερο, και κάθε κάρτα
          δείχνει μόνο τη δική της γνωστή τιμή. */}
      {(mgmtMonthly > 0 || parseFloat(fundMonthly) > 0 || monthlyAvg > 0) && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Διαχείριση τον μήνα',  value: mgmtMonthly > 0 ? fe(mgmtMonthly) : 'Δωρεάν' },
          { label: 'Ταμείο τον μήνα',      value: parseFloat(fundMonthly) > 0 ? fe(parseFloat(fundMonthly)) : ABSENT_SHORT },
          { label: 'Μέσος όρος κοινοχρήστων',  value: monthlyAvg > 0 ? fe(monthlyAvg) : ABSENT_SHORT },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>
      )}

      {/* ── Οδηγός ευθύνης: ποιος πληρώνει τι (ελληνικό πλαίσιο) ──────────── */}
      <InfoBanner tone="neutral">
        <strong>Ποιος πληρώνει τι:</strong> τα <strong>λειτουργικά κοινόχρηστα</strong> (καθαρισμός, ρεύμα/λάμπες κλιμακοστασίου, ασανσέρ, κηπουρός, αμοιβή διαχειριστή) βαρύνουν τον <strong>ενοικιαστή</strong>. Οι <strong>έκτακτες/κεφαλαιουχικές δαπάνες</strong> (επισκευή στέγης/ασανσέρ, μονώσεις, αντικαταστάσεις) και το <strong>αποθεματικό</strong> βαρύνουν τον <strong>ιδιοκτήτη</strong>. Οι έκτακτες εισφορές παρακάτω μεταφέρονται αυτόματα στις Δαπάνες σου.
      </InfoBanner>

      {/* ── Ανάλυση Κοινοχρήστων ανά Κατηγορία (χιλιοστά, Billys logic) ──── */}
      <Card pad="lg">
        {secHdr('Ανάλυση Κοινοχρήστων ανά Κατηγορία')}

        <div style={{ ...formGrid(), marginBottom: 16 }}>
          <NumberInput label="Τα χιλιοστά μου (‰)" value={millesimi} onChange={sMill} suffix="‰" step={1} max={1000}/>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Το μερίδιό μου</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fp((millRatio * 100))}</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 16, border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: T.font.sans }}>
            Καταχώρησε το <strong>μηνιαίο σύνολο του κτιρίου</strong> για κάθε κατηγορία. Το μερίδιό σου υπολογίζεται αυτόματα με βάση τα <strong>χιλιοστά</strong> σου, όπως στην κατανομή κοινοχρήστων της πολυκατοικίας.
          </div>
        </div>

        {/* ═══ Η ΣΤΗΛΗ «ΒΑΡΥΝΕΙ» ΕΛΕΓΕ ΤΟ ΙΔΙΟ ΕΝΝΙΑ ΦΟΡΕΣ ══════════════════
            Κάθε γραμμή κουβαλούσε ένα σήμα «Ενοικιαστής» ή «Ιδιοκτήτης»: επτά
            πανομοιότυπα μπλε σήματα στη σειρά και δύο γκρίζα από κάτω. Οι
            γραμμές ήταν ήδη ταξινομημένες ακριβώς έτσι, οπότε το σήμα δεν
            πρόσθετε πληροφορία — πρόσθετε θόρυβο, μια στήλη πλάτους και ένα
            χρώμα που τραβούσε το μάτι εννιά φορές χωρίς λόγο.

            Η ίδια πληροφορία λέγεται τώρα ΔΥΟ φορές, ως επικεφαλίδα της ομάδας
            της, εκεί που τη διαβάζει κανείς μία φορά και την ξέρει για όλες τις
            γραμμές από κάτω. */}
        {(['tenant', 'owner'] as const).map(payer => {
          const rows = catRows.filter(r => r.payer === payer);
          if (!rows.length) return null;
          return (
        <div key={payer} style={{ marginTop: payer === 'owner' ? 20 : 0 }}>
        {/* ═══ Η ΕΠΙΚΕΦΑΛΙΔΑ ΣΤΟΙΧΙΖΟΤΑΝ ΣΤΟ ΠΕΡΙΓΡΑΜΜΑ, Η ΤΙΜΗ ΣΤΟ ΜΕΛΑΝΙ ══
            Το «Σύνολο κτιρίου» ήταν δεξιά στοιχισμένο στο ΑΚΡΟ της στήλης, ενώ
            τα ψηφία που τιτλοφορεί κάθονται δώδεκα εικονοστοιχεία πιο μέσα —
            όσο το padding του πεδίου. Δηλαδή η ετικέτα δεν κάθεται ποτέ πάνω
            από τον αριθμό της· κάθεται πάνω από το πλαίσιο. Με άδεια πεδία, που
            είναι και η πρώτη εικόνα που βλέπει ο χρήστης, η απόκλιση διαβάζεται
            ως στραβή στοίχιση.

            Η στοίχιση βγαίνει τώρα από ΤΟ ΙΔΙΟ νούμερο με το πεδίο (FIELD_PAD),
            οπότε δεν μπορεί να ξαναποκλίνει. Η διπλανή στήλη δεν έχει πλαίσιο,
            άρα το μελάνι της είναι ήδη στο άκρο και μένει όπως είναι. */}
        <div style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${FIELD_COL}px 110px`, gap: 14, padding: '0 4px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4, alignItems: 'baseline' }}>
          <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-secondary)' }}>{payer === 'tenant' ? 'Βαρύνουν τον ενοικιαστή' : 'Βαρύνουν εσένα'}</div>
          <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right', paddingRight: FIELD_PAD }}>Σύνολο κτιρίου</div>
          <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'right' }}>Μερίδιό μου</div>
        </div>

        {rows.map(r => (
          <div key={r.key} style={{ display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${FIELD_COL}px 110px`, gap: 14, alignItems: 'center', padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.sans, fontWeight: 500 }}>{r.label}</div>
            {/* ΤΟ ΣΚΟΥΡΟ «ΧΑΠΙ» ΕΓΙΝΕ ΠΕΔΙΟ. Ήταν `background: bg-base` με ακτίνα
                σήματος: μέσα σε σκούρο θέμα διαβαζόταν ως τρύπα, όχι ως κουτί
                που δέχεται γράψιμο, και δεν έμοιαζε με κανένα άλλο πεδίο της
                εφαρμογής. Ίδια επιφάνεια, ίδιο περίγραμμα, ίδια ακτίνα, ίδιο
                δαχτυλίδι εστίασης με τα υπόλοιπα. */}
            <input
              aria-label={`${r.label}, μηνιαίο σύνολο κτιρίου σε ευρώ`}
              type="number" min={0} inputMode="decimal" value={catData[r.key] ?? ''} onChange={e => sCat(r.key, e.target.value)}
              className="po-field"
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: `8px ${FIELD_PAD}px`, fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', textAlign: 'right', outline: 'none' }}/>
            <div style={{ fontSize: 12, fontWeight: 600, color: r.myShare > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{r.myShare > 0 ? fe(r.myShare) : ''}</div>
          </div>
        ))}
        </div>
          );
        })}

        {hasCatData && millRatio > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 16 }}>
            {[
              { label: 'Το σύνολό μου / μήνα',   value: fe(myCatTotal),   color: 'var(--text-primary)' },
              { label: 'Βαρύνει ενοικιαστή',     value: fe(tenantBurden), color: 'var(--accent)'       },
              { label: 'Βαρύνει εσένα',          value: fe(ownerBurden),  color: 'var(--text-primary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 16px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {hasCatData && millRatio === 0 && (
          <div style={{ textAlign: 'center', padding: '14px 0 4px', fontSize: 11, color: 'var(--warning)', fontFamily: T.font.sans }}>
            Συμπλήρωσε τα χιλιοστά σου παραπάνω για να υπολογιστεί το μερίδιό σου.
          </div>
        )}
      </Card>

      {/* ── Διαχείριση Κτηρίου ───────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Διαχείριση Κτηρίου')}

        {/* FIX: 3 cols so DatePicker has enough room, was 4 cols causing overflow */}
        <div style={{ ...fieldRow(180), marginBottom: 14 }}>
          <CustomSelect label="Τύπος διαχείρισης" labelInfo={mgmtInfo} value={mgmtType} onChange={sMgmt} options={MGMT_TYPES}/>
          <NumberInput  label="Μηνιαίο κόστος" value={mgmtCost}   onChange={sMgmtC} suffix="€" step={5}/>
          <NumberInput  label="Ημέρα χρέωσης"       value={mgmtDueDay} onChange={sMgmtD} suffix="η" step={1}/>
        </div>

        {/* ═══ ΤΡΙΑ ΤΜΗΜΑΤΑ ΕΦΥΓΑΝ ΑΠΟ ΕΔΩ ═══════════════════════════════════

            ΕΝΑΣ ΚΑΤΑΛΟΓΟΣ ΕΞΙ ΞΕΝΩΝ ΠΛΑΤΦΟΡΜΩΝ, με τιμές, περιγραφές και έξι
            συνδέσμους «Επίσκεψη» που έβγαζαν τον χρήστη έξω από την εφαρμογή.
            Δεν είναι δουλειά μιας εφαρμογής διαχείρισης ακινήτων να διαφημίζει
            έξι ανταγωνιστές μέσα στην οθόνη των κοινοχρήστων, ούτε να συντηρεί
            τιμοκαταλόγους τρίτων που σαπίζουν σιωπηλά. Και οι «τιμές» τους δεν
            ήταν καν τιμές: «Οικονομικό», «~86 €/έτος», «Δωρεάν – 29 €/μήνα»,
            τυπωμένες σε γραμματοσειρά πίνακα σαν να ήταν ποσά.

            ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΣ «ΣΥΓΚΡΙΣΗ ΕΠΙΛΟΓΩΝ» που ρωτούσαν ΑΚΡΙΒΩΣ ό,τι ο
            επιλογέας «Τύπος διαχείρισης» δύο γραμμές πιο πάνω, με τις ίδιες
            τέσσερις επιλογές. Δύο χειριστήρια για μία απόφαση, το ένα κάτω από
            το άλλο.

            ΕΝΑ ΠΛΑΙΣΙΟ ΠΕΡΙΓΡΑΦΗΣ που εξηγούσε την επιλεγμένη επιλογή. Η
            εξήγηση δεν χάθηκε: ζει πίσω από την κουκκίδα του επιλογέα, εκεί
            όπου ζουν όλες οι εξηγήσεις της εφαρμογής. */}

      </Card>

      {/* ── Ταμείο Κτηρίου ───────────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Ταμείο Κτηρίου')}

        {/* Τα τέσσερα στοιχεία του ταμείου είναι ΕΝΑ πράγμα: υπόλοιπο, μερίδιο,
            εισφορά, πότε ενημερώθηκε. Ήταν σπασμένα σε δύο σειρές των δύο, με
            μισή κάρτα άδεια δεξιά — όχι επιλογή, αλλά ό,τι απέμενε από ένα
            πλέγμα με σταθερό μέγιστο στήλης. Μία σειρά, ίσα μοιρασμένη. */}
        <div style={{ ...fieldRow(180), marginBottom: 14 }}>
          <NumberInput label="Υπόλοιπο ταμείου"    value={fundBalance}  onChange={sFundBal} suffix="€" step={100}/>
          <NumberInput label="Μερίδιό μου"         value={fundMyPct}    onChange={sFundPct} suffix="%" step={1} max={100}/>
          <NumberInput label="Μηνιαία εισφορά"     value={fundMonthly}  onChange={sFundM}   suffix="€" step={5}/>
          <DatePicker  label="Τελευταία ενημέρωση" value={fundLastDate} onChange={sFundD}/>
        </div>

        {myFundShare > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' as const }}>
              {[
                { label: 'Μερίδιό σου',     value: fe(myFundShare),                              color: 'var(--text-primary)' },
                { label: 'Απόθεμα (μήνες)', value: `${fundMonths} μήνες`,                         color: fundMonths >= 6 ? 'var(--positive)' : 'var(--warning)' },
                { label: 'Εισφορά / έτος',  value: fe((parseFloat(fundMonthly) || 0) * 12),       color: 'var(--text-primary)' },
              ].map((k, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 5, fontFamily: T.font.sans }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Έκτακτες Εισφορές ────────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Έκτακτες Εισφορές')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          {/* Η ενέργεια είναι η τέταρτη στήλη της σειράς, όχι κουμπί κρεμασμένο
              από κάτω δεξιά. Και δεν φαίνεται πατήσιμη χωρίς αιτία και ποσό. */}
          <div style={fieldRow(160)}>
            <TextInput   label="Αιτία"      value={extraReason} onChange={setExtraReason} placeholder="Παράδειγμα: Ανακαίνιση ταράτσας"/>
            <NumberInput label="Ποσό"       value={extraAmount} onChange={setExtraAmount} suffix="€" step={50}/>
            <DatePicker  label="Ημερομηνία" value={extraDate}   onChange={setExtraDate}/>
            <button type="button" disabled={!extraReason.trim() || !extraAmount} onClick={addExtra}
              style={addBtn(!extraReason.trim() || !extraAmount)}>
              Προσθήκη
            </button>
          </div>
        </div>

        {extras.length === 0 && (
          <EmptyState
            icon={<HandCoins size={20} />}
            title="Καμία έκτακτη εισφορά ακόμη"
            hint="Κατέγραψε έκτακτες χρεώσεις κοινοχρήστων (π.χ. ανακαίνιση, ασανσέρ) για σωστό ετήσιο σύνολο."
          />
        )}

        {extras.map((e, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border-subtle)', opacity: e.transferredToExpenses ? 0.5 : 1 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{e.reason}</span>
              {e.date && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.sans }}>{localDay(e.date).toLocaleDateString('el-GR')}</span>}
              {e.transferredToExpenses && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 12, background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>
                  Στις Δαπάνες ✓
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(parseFloat(e.amount))}</span>
              {!e.transferredToExpenses && (
                <button onClick={() => transferToExpenses(i)} disabled={transferring === i}
                  style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: transferring === i ? 'not-allowed' : 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, fontWeight: 600, opacity: transferring === i ? 0.6 : 1, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                  {transferring === i ? 'Μεταφορά…' : 'Μεταφορά στις Δαπάνες'}
                </button>
              )}
              <button onClick={() => delExtra(i)}
                style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✕
              </button>
            </div>
          </div>
        ))}

        {totalExtras > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Σύνολο έκτακτων εισφορών</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(totalExtras)}</span>
          </div>
        )}
      </Card>

      {/* ── Ιστορικό Κοινοχρήστων ────────────────────────────────────────── */}
      <Card pad="lg">
        {secHdr('Ιστορικό Κοινοχρήστων ανά Μήνα')}

        {history.every(v => !v) && (
          <EmptyState
            icon={<BarChart3 size={20} />}
            title="Κανένα μηνιαίο ποσό ακόμη"
            hint="Καταχώρησε μηνιαία ποσά κοινοχρήστων παρακάτω για να δεις την εξέλιξη του έτους."
          />
        )}

        {/* Ραβδόγραμμα, με τονισμό στο πέρασμα του δείκτη */}
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 62px), 1fr))', gap: 5, alignItems: 'flex-end', height: 64, marginBottom: 0, padding: '4px 0 0' }}>
          {monthlyAvg > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(monthlyAvg / maxH) * 54}px`, borderTop: '1px dashed color-mix(in srgb, var(--accent) 40%, transparent)', pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', right: 0, top: -11, fontSize: 11, color: 'var(--accent)', background: 'var(--bg-surface)', padding: '0 4px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', borderRadius: 3 }}>
                μέσος όρος {monthlyAvg.toFixed(0)}
              </span>
            </div>
          )}
          {MONTHS_SHORT.map((m, i) => {
            const val    = parseFloat(history[i]) || 0;
            const pct    = val / maxH;
            const isCur  = i === currentMonth;
            const isHov  = hoveredMonth === i;
            const isHigh = monthlyAvg > 0 && val > monthlyAvg * 1.2;
            const barBg  = isCur ? 'var(--accent)' : isHigh ? 'var(--negative)' : isHov ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)';
            return (
              <div key={i}
                className="hist-bar"
                style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredMonth(i)}
                onMouseLeave={() => setHoveredMonth(null)}>
                <div style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', height: 14, display: 'flex', alignItems: 'flex-end', color: isHigh ? 'var(--negative)' : isCur ? 'var(--accent)' : isHov ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                  {val > 0 ? Math.round(val) : ''}
                </div>
                <div style={{ width: '100%', height: `${Math.max(pct * 48, 2)}px`, background: barBg, borderRadius: '3px 3px 0 0', transition: 'background 0.15s' }}/>
              </div>
            );
          })}
        </div>

        {/* ΟΙ ΜΗΝΕΣ ΓΡΑΦΟΝΤΑΝ ΔΥΟ ΦΟΡΕΣ, Η ΜΙΑ ΚΑΤΩ ΑΠΟ ΤΗΝ ΑΛΛΗ. Μία σειρά
            ετικετών κάτω από τις στήλες του γραφήματος, και αμέσως από κάτω
            δεύτερη ίδια σειρά πάνω από τα δώδεκα πεδία. Είκοσι τέσσερα
            «Ιαν Φεβ Μαρ…» σε τριάντα εικονοστοιχεία ύψους.

            Έμεινε η μία, αυτή που ανήκει στα πεδία: εκεί η ετικέτα ΕΙΝΑΙ
            συνδεδεμένη με το κουτί της, οπότε κάνει και τη δουλειά της για τον
            αναγνώστη οθόνης. Οι στήλες του γραφήματος πατάνε ακριβώς από πάνω,
            στην ίδια θέση, άρα διαβάζονται από την ίδια ετικέτα. */}


        {/* Πλέγμα πεδίων, με ύφος περάσματος δείκτη και εστίασης */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 62px), 1fr))', gap: 5 }}>
          {MONTHS_SHORT.map((m, i) => (
            <div key={i}>
              {/* Η ΕΤΙΚΕΤΑ ΠΕΡΙΤΥΛΙΓΕΙ ΤΟ ΠΕΔΙΟ, ΔΕΝ ΚΑΘΕΤΑΙ ΑΠΛΩΣ ΑΠΟ ΠΑΝΩ.
                  Χωρίς σύνδεση, ο αναγνώστης οθόνης έλεγε δώδεκα φορές «πεδίο
                  αριθμού, €» χωρίς να πει ποιον μήνα. Και τα 8 εικονοστοιχεία
                  ήταν αδιάβαστα σε κινητό — 10 είναι το ελάχιστο που έχει νόημα
                  για ετικέτα δίπλα σε ποσό. */}
              <label style={{ fontSize: 11, color: i === currentMonth ? 'var(--accent)' : hoveredMonth === i ? 'var(--text-secondary)' : 'var(--text-tertiary)', display: 'block', marginBottom: 3, textAlign: 'center', fontFamily: T.font.sans, fontWeight: i === currentMonth ? 700 : 400, transition: 'color 0.15s' }}>
                <span style={{ display: 'block', marginBottom: 3 }}>{m}</span>
              <input
                aria-label={`${m}, ποσό σε ευρώ`}
                type="number" min={0}
                value={history[i]}
                onChange={e => sHist(i, e.target.value)}
                placeholder="€"
                onMouseEnter={() => setHoveredMonth(i)}
                onMouseLeave={() => setHoveredMonth(null)}
                onFocus={() => setHoveredMonth(i)}
                onBlur={() => setHoveredMonth(null)}
                style={histInputStyle(i === currentMonth, hoveredMonth === i)}
              />
              </label>
            </div>
          ))}
        </div>

        {monthlyAvg > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginTop: 14 }}>
            {[
              { label: 'Μέσο Μηνιαίο',      value: fe(monthlyAvg),                                         color: 'var(--text-primary)' },
              { label: 'Ακριβότερος Μήνας',  value: fe(Math.max(...history.map(v => parseFloat(v) || 0))), color: 'var(--text-primary)' },
              { label: 'Ετήσιο Εκτιμώμενο', value: fe(monthlyAvg * 12),                                    color: 'var(--text-primary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Σύνοψη Κοινοχρήστων ──────────────────────────────────────────── */}
      {totalCommon > 0 && (
        <Card pad="lg">
          {secHdr('Σύνοψη Κοινοχρήστων')}
          {[
            { label: 'Διαχείριση',         amount: mgmtMonthly,                  skip: !mgmtMonthly },
            { label: 'Εισφορά Ταμείου',    amount: parseFloat(fundMonthly) || 0, skip: !(parseFloat(fundMonthly) || 0) },
            { label: 'Μέσος Όρος Κοινοχρήστων',  amount: monthlyAvg,                   skip: !monthlyAvg  },
          ].filter(r => !r.skip && r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalCommon > 0 ? (r.amount / totalCommon) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 3 }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο κοινοχρήστων</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(totalCommon)} / μήνα</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{fe(totalCommon * 12)} / έτος</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}