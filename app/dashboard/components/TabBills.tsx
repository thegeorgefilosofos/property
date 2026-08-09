'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΣΥΜΒΟΛΑΙΑ ΚΑΙ ΠΑΡΟΧΟΙ — και ΜΟΝΟ αυτά.
//
// ΤΙ ΥΠΗΡΧΕ ΕΔΩ ΚΑΙ ΕΦΥΓΕ. Μια δεύτερη ολόκληρη οθόνη δαπανών
// (BillsDashboard): δική της φόρμα καταχώρησης λογαριασμού, δική της λίστα με
// σήμανση πληρωμής και διαγραφή, δικά της τρία γραφήματα, δικός της «Ετήσιος
// Απολογισμός». Καθένα από αυτά υπήρχε ήδη αλλού:
//   · η φόρμα και η λίστα, στις «Δαπάνες» (ExpenseLedger)
//   · τα γραφήματα και η πρόβλεψη έτους, στον «Προϋπολογισμό» (BillsBudget)
// Δηλαδή ο ιδιοκτήτης είχε ΔΥΟ φόρμες με διαφορετικά πεδία για το ίδιο ευρώ,
// δύο λίστες που έδειχναν τα ίδια νούμερα αλλιώς, και τρία σημεία να ρωτήσει
// «πόσο ξόδεψα φέτος» με τρεις πιθανές απαντήσεις.
//
// Η αρχή ήταν ήδη γραμμένη στο TabFinances και απλώς δεν είχε εφαρμοστεί ως το
// τέλος: «ο λογαριασμός δεν είναι άλλο πράγμα από τη δαπάνη — είναι δαπάνη που
// δεν την έχεις πληρώσει ακόμη», και «τα έξι εργαλεία έπαψαν να είναι σημείο
// καταχώρησης και έγιναν αυτό που πάντα ήταν, δηλαδή συμβόλαια και συγκρίσεις».
//
// ΤΙ ΜΕΝΕΙ: πόσο τρέχουν τα πάγια τον μήνα (το νούμερο πάνω στο οποίο πατά κάθε
// σύγκριση), η ειδοποίηση όταν πληρώνεις παραπάνω από ό,τι χρειάζεται, και τα
// έξι εργαλεία ανά κατηγορία. Χωρίς πτυσσόμενο «Περισσότερα»: όταν δεν υπάρχει
// τίποτα μπροστά του, ένα «Περισσότερα» είναι απλώς ένα κλικ πριν το μοναδικό
// περιεχόμενο της οθόνης.
//
// ΠΟΥ ΠΗΓΕ Ο ΔΙΑΜΟΙΡΑΣΜΟΣ. Το «Ποιος πληρώνει / μερίδιό μου» ήταν το μόνο
// γνήσια μοναδικό της παλιάς φόρμας — και το διάβαζε όλη η εφαρμογή ενώ το
// έγραφε μόνο εκείνη. Ζει τώρα στη φόρμα των «Δαπανών», με τα υπόλοιπα πεδία.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, Skeleton } from '@/components/Theme';
import { mergeLedger, type LedgerEntry } from '@/lib/expenses/ledger';
import { contractOverview, totalMonthly, CONTRACT_EMPTY_HINT, type ContractCard, type ContractKind } from '@/lib/contracts/overview';

// ── Static imports, all components must be static for Next.js App Router ────
import BillsElectricity  from './BillsElectricity';
import BillsGas          from './BillsGas';
import BillsCommon       from './BillsCommon';
import BillsProviders    from './BillsProviders';
import BillsInsurance    from './BillsInsurance';
import BillsServices     from './BillsServices';
import ExpenseSwitchAlert from './ExpenseSwitchAlert';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  propertyId:       string;
  userId:           string;
}

/** Τα εργαλεία που ζουν πίσω από το «Περισσότερα». */
type ToolId = 'electricity' | 'gas' | 'common' | 'providers' | 'insurance' | 'services';

interface ToolDef { id: ToolId; label: string; icon: string; desc: string }

/**
 * Ποιο εργαλείο ανοίγει κάθε κάρτα.
 *
 * Οι κατηγορίες συμβολαίου είναι επτά και τα εργαλεία έξι: το νερό και το
 * internet ζουν και τα δύο στους «Παρόχους», οι συνδρομές μαζί με την ασφάλεια.
 * Ο χάρτης γράφεται μία φορά εδώ αντί να μαντεύεται στην απόδοση.
 */
const TOOL_OF: Record<ContractKind, ToolId> = {
  electricity: 'electricity', gas: 'gas', water: 'providers', internet: 'providers',
  insurance: 'insurance', subscriptions: 'insurance', common: 'common',
};

interface StripData {
  /**
   * Ο μέσος μήνας σε πάγια, ΜΕΤΡΗΜΕΝΟΣ. `null` όταν το ιστορικό δεν φτάνει.
   *
   * Ήταν `sum(λογαριασμοί με recurring)` με ετικέτα «/ μήνα». Κάθε γραμμή του
   * `bills` όμως είναι ΜΙΑ ΠΕΡΙΟΔΟΣ — ο χρήστης διαλέγει «Ιούλιος 2026» — και το
   * `recurring` είναι χαρακτηρισμός («Πάγιο» απέναντι σε «Εφάπαξ»), όχι
   * πρόγραμμα. Δώδεκα λογαριασμοί ΔΕΗ των 100 € έδειχναν «1.200 € / μήνα».
   */
  recurringPerMonth: number | null;
  /** Οι κάρτες συμβολαίων, υπολογισμένες από το ίδιο ιστορικό. */
  cards: ContractCard[];
  // ΤΑ ΑΛΛΑ ΤΡΙΑ ΕΦΥΓΑΝ ΜΑΖΙ ΜΕ ΤΗ ΛΙΣΤΑ. Ο μετρητής ληξιπρόθεσμων έδειχνε προς
  // μια λίστα που δεν υπάρχει πια σε αυτή την οθόνη — ένα σήμα που δεν οδηγεί
  // πουθενά είναι χειρότερο από κανένα σήμα. Το όνομα ενοικιαστή δεν είχε ποτέ
  // σχέση με τα συμβόλαια παρόχων, και η ώρα τελευταίας ανάγνωσης απαντούσε σε
  // ερώτηση που δεν έκανε κανείς. Μένει το ΕΝΑ νούμερο πάνω στο οποίο πατά κάθε
  // σύγκριση τιμολογίου: πόσο τρέχουν τα πάγια τον μήνα.
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  bolt:     'M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z',
  flame:    'M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-1.5-.5-2.5-1.5-4 .5 2-.5 3-1.5 2.5.5-2-.5-4-2-5.5z M12 13a2 2 0 1 1-2-2c.5 0 1 .5 1 1.5 0 1-.5.5-.5 1.5a1.5 1.5 0 0 0 1.5 1.5z',
  building: 'M3 21h18M5 21V7l8-4 8 4v14M9 21V15h6v6M9 11h1m4 0h1M9 7h1m4 0h1',
  wifi:     'M12 18h.01M8.5 14.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1 3.5 1.5M5 11a9 9 0 0 1 14 0M1.5 7.5a14 14 0 0 1 21 0',
  shield:   'M12 3l8 4v5c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4z',
  wrench:   'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
};

const TabIcon = ({ name, size = 13 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICONS[name] ?? ICONS.bolt}/>
  </svg>
);

// ─── Τα εργαλεία ──────────────────────────────────────────────────────────────
const TOOLS: ToolDef[] = [
  { id: 'electricity', label: 'Ρεύμα',                icon: 'bolt',     desc: 'Πάροχος, κατανάλωση, σύγκριση τιμολογίων' },
  { id: 'gas',         label: 'Φυσικό αέριο',         icon: 'flame',    desc: 'Πάροχος αερίου και σύγκριση τιμολογίων' },
  { id: 'common',      label: 'Κοινόχρηστα',          icon: 'building', desc: 'Διαχείριση κτηρίου, ταμείο, ιστορικό' },
  { id: 'providers',   label: 'Πάροχοι',              icon: 'wifi',     desc: 'Internet, νερό, θέρμανση, security' },
  { id: 'insurance',   label: 'Ασφάλεια και συνδρομές', icon: 'shield',   desc: 'Ασφάλεια κατοικίας, streaming, cloud' },
  { id: 'services',    label: 'Υπηρεσίες',            icon: 'wrench',   desc: 'ΕΝΦΙΑ, δημοτικά τέλη, καθαρισμός, κηπουρός' },
];


// ─── Η κάρτα ενός συμβολαίου ──────────────────────────────────────────────────
/**
 * ΕΝΑ ΣΧΗΜΑ, ΕΠΤΑ ΠΕΡΙΠΤΩΣΕΙΣ. Η γνωστή και η άγνωστη κατηγορία έχουν το ΙΔΙΟ
 * περίγραμμα και το ίδιο ύψος: αλλιώς το πλέγμα «χοροπηδά» ανάλογα με το τι
 * έχει καταχωρήσει ο χρήστης, και η οθόνη μοιάζει διαφορετική σε κάθε ακίνητο.
 *
 * ΤΟ ΑΓΝΩΣΤΟ ΔΕΝ ΓΡΑΦΕΤΑΙ ΜΗΔΕΝ. Ένα «0,00 €» στο αέριο σημαίνει «δεν πληρώνω
 * αέριο», ενώ η αλήθεια είναι «δεν ξέρω ακόμη». Η κενή κάρτα λέει τι λείπει και
 * πώς μπαίνει — με τον δρόμο που δεν απαιτεί πληκτρολόγηση.
 */
function ContractTile({ card, active, onOpen }: { card: ContractCard; active: boolean; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const raised = hover || active;
  const period = card.everyMonths === 2 ? 'ανά δίμηνο' : '';
  const meta = card.known
    ? [card.provider, period, `${card.occurrences} ${card.occurrences === 1 ? 'περίοδος' : 'περίοδοι'}`].filter(Boolean).join(' · ')
    : CONTRACT_EMPTY_HINT[card.kind];

  return (
    <button type="button" onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      aria-pressed={active}
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', gap: 12, minHeight: 104,
        padding: '14px 16px', borderRadius: T.radius.card, fontFamily: T.font.sans,
        background: raised ? 'var(--bg-surface)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        boxShadow: raised ? 'var(--elev-1)' : 'none',
        transition: `background .15s ${T.ease.standard}, border-color .15s, box-shadow .15s, transform .15s`,
        transform: hover && !active ? 'translateY(-1px)' : 'none',
      }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {card.label}
        </span>
        {/* Η ΙΕΡΑΡΧΙΑ ΒΓΑΙΝΕΙ ΑΠΟ ΜΕΓΕΘΟΣ ΚΑΙ ΒΑΡΟΣ, ΟΧΙ ΑΠΟ ΧΡΩΜΑ. Το ποσό
            είναι το μόνο μεγάλο νούμερο της κάρτας· ό,τι δεν γνωρίζουμε μένει
            στο μέγεθος του κειμένου, όχι σε κόκκινο. */}
        {card.monthly !== null && (
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {fe(card.monthly)}
          </span>
        )}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        {meta}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: card.known ? 'var(--accent)' : 'var(--text-tertiary)' }}>
        {card.known ? 'Σύγκριση και λεπτομέρειες' : 'Άνοιγμα'}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabBills({
  propertyId, userId,
}: Props) {
  const supabase   = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const toolsRef   = useRef<HTMLDivElement | null>(null);

  const [tool,       setTool]       = useState<ToolId | null>(null);
  const [strip,      setStrip]      = useState<StripData>({ recurringPerMonth: null, cards: [] });
  // Το `strip` ξεκινά με μηδενικά, οπότε η κεφαλίδα δεν έδειχνε κανένα chip και
  // μετά τα chips εμφανίζονταν μονομιάς και έσπρωχναν τη γραμμή. Δύο σκελετοί
  // κρατούν τη θέση τους όσο τρέχουν τα παράλληλα ερωτήματα.
  const [stripLoading, setStripLoading] = useState(true);

  const loadStrip = useCallback(async () => {
    if (!propertyId) return;
    try {
      // Οι δαπάνες χρειάζονται για να μη μετρηθεί δύο φορές ο πληρωμένος πάγιος:
      // ο λογαριασμός είναι το πρόγραμμα, η δαπάνη το γεγονός, δεμένα με bill_id.
      const [{ data: bills }, { data: expenses }] = await Promise.all([
        supabase.from('bills').select('id,name,amount,paid,paid_at,due_date,created_at,category,recurring').eq('property_id', propertyId),
        supabase.from('expenses').select('id,bill_id,amount,date,description,category,paid,expense_group,is_recurring,store_vendor').eq('property_id', propertyId),
      ]);

      const { entries } = mergeLedger((bills ?? []) as never[], (expenses ?? []) as never[]);
      const cards = contractOverview(entries as LedgerEntry[], new Date());
      // Το σύνολο βγαίνει από τις ΙΔΙΕΣ κάρτες που βλέπει ο χρήστης. Πριν, το
      // νούμερο της κεφαλίδας ερχόταν από άλλη συνάρτηση (`recurringMonthly`)
      // και μπορούσε να μη συμφωνεί με το άθροισμα των γραμμών από κάτω — δύο
      // απαντήσεις στην ίδια ερώτηση, στην ίδια οθόνη.
      setStrip({ recurringPerMonth: totalMonthly(cards) || null, cards });
    } catch (_) {} finally { setStripLoading(false); }
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;
    loadStrip();
    const ch = supabase
      .channel(`tabbills_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadStrip(); })
      .subscribe();
    channelRef.current = ch;
    return () => { mounted = false; supabase.removeChannel(ch); channelRef.current = null; };
  }, [propertyId, loadStrip]);

  // Άνοιγμα εργαλείου από αλλού (π.χ. από την ειδοποίηση «πληρώνεις παραπάνω»).
  const openTool = useCallback((id: ToolId) => {
    setTool(id);
    // Το requestAnimationFrame περιμένει να αποδοθεί το πάνελ πριν κυλήσει σε αυτό.
    requestAnimationFrame(() => toolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  // Χωρίς propertyId δεν τρέχει κανένα ερώτημα, άρα δεν υπάρχει τίποτα να
  // περιμένει ο σκελετός. Παράγωγη τιμή, ώστε το effect να μην γράφει state.
  const showSkeleton = stripLoading && !!propertyId;

  const activeTool = TOOLS.find(t => t.id === tool) ?? null;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3, fontFamily: T.font.sans }}>
            Λογαριασμοί & πάγιες δαπάνες
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Τι έχεις, τι πληρώνεις. Οι καταχωρήσεις γίνονται στις Δαπάνες.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Η ΠΡΑΣΙΝΗ ΚΟΥΚΚΙΔΑ «LIVE» ΕΦΥΓΕ. Δεν ήταν πληροφορία του ιδιοκτήτη:
              ήταν η κατάσταση μιας σύνδεσης websocket, με αγγλική λέξη και με
              σημασιολογικό πράσινο, μόνιμα στην κορυφή της οθόνης. Ό,τι έχει να
              πει μια χαμένη σύνδεση το λέει η ίδια η οθόνη όταν τα νούμερα δεν
              ανανεώνονται — και τότε αρκεί η ανανέωση της σελίδας. */}
          {showSkeleton
            ? <Skeleton w={110} h={24} r={T.radius.pill} />
            : strip.recurringPerMonth !== null && strip.recurringPerMonth > 0 && (
              <span title="Το άθροισμα των καρτών από κάτω. Κάθε κατηγορία μετριέται από το ιστορικό της με διάμεσο, και ο διμηνιαίος λογαριασμός μοιράζεται στους μήνες του. Κατηγορία χωρίς αρκετό ιστορικό δεν μπαίνει στο άθροισμα." style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(strip.recurringPerMonth)} τον μήνα</span>
            )}
        </div>
      </div>

      {/* ── «Πληρώνεις παραπάνω» — μόνο όταν υπάρχει πραγματική διαφορά ── */}
      <ExpenseSwitchAlert propertyId={propertyId} onOpen={openTool} />

      {/* ── ΟΙ ΚΑΡΤΕΣ: Η ΑΠΑΝΤΗΣΗ ΠΡΙΝ ΤΗΝ ΕΡΩΤΗΣΗ ────────────────────────
          ΠΡΙΝ: έξι κλειστά chips και η γραμμή «Διάλεξε κατηγορία για να δεις το
          συμβόλαιό σου». Τρία κλικ και άδεια οθόνη πριν ο ιδιοκτήτης δει
          οτιδήποτε δικό του — και πίσω από κάθε chip ένα πάνελ εκατοντάδων
          γραμμών με καταλόγους της αγοράς.

          Η ιεραρχία ήταν ανάποδη. Κανείς δεν ανοίγει τα Συμβόλαια για να
          μελετήσει την αγορά· τα ανοίγει για να θυμηθεί τι έχει και πόσο του
          κοστίζει. Η αγορά είναι η ΔΕΥΤΕΡΗ ερώτηση, και μόνο για όποιον τη
          ρωτήσει: ζει ακέραιη ένα κλικ πιο μέσα. */}
      <div ref={toolsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 10 }}>
        {showSkeleton
          ? [0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} h={104} r={T.radius.card} />)
          : strip.cards.map(c => (
            <ContractTile key={c.kind} card={c} active={tool === TOOL_OF[c.kind]}
              onOpen={() => openTool(TOOL_OF[c.kind])} />
          ))}
      </div>

      {activeTool && (
        <div style={{ marginTop: 16 }}>
          {/* Η κεφαλίδα του πάνελ λέει ΠΟΥ βρίσκεσαι και πώς βγαίνεις. Πριν, το
              πάνελ άνοιγε χωρίς τίτλο κάτω από μια σειρά chips, και ο μόνος
              τρόπος να κλείσει ήταν να ξαναπατήσεις το ίδιο chip. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><TabIcon name={activeTool.icon} size={15}/></span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{activeTool.label}</span>
            </div>
            <button type="button" onClick={() => setTool(null)}
              style={{ height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, flexShrink: 0 }}>
              Κλείσιμο
            </button>
          </div>
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
            {tool === 'electricity' && <BillsElectricity propertyId={propertyId} userId={userId} onNavigateTab={t => openTool(t as ToolId)}/>}
            {tool === 'gas'         && <BillsGas         propertyId={propertyId} userId={userId} onNavigateTab={t => openTool(t as ToolId)}/>}
            {tool === 'common'      && <BillsCommon      propertyId={propertyId} userId={userId}/>}
            {tool === 'providers'   && <BillsProviders   propertyId={propertyId} userId={userId}/>}
            {tool === 'insurance'   && <BillsInsurance   propertyId={propertyId} userId={userId}/>}
            {tool === 'services'    && <BillsServices    propertyId={propertyId} userId={userId}/>}
          </div>
        </div>
      )}
    </div>
  );
}
