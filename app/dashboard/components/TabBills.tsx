'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΟΘΟΝΗ ΓΙΑ ΤΟΥΣ ΛΟΓΑΡΙΑΣΜΟΥΣ.
//
// ΤΙ ΥΠΗΡΧΕ: επτά καρτέλες (Επισκόπηση, Ρεύμα, Αέριο, Κοινόχρηστα, Πάροχοι,
// Ασφάλεια, Υπηρεσίες). Ο ιδιοκτήτης που ήθελε να δει τη ΔΕΗ του έπρεπε πρώτα να
// μαντέψει σε ποια από τις επτά μένει — και η σωστή απάντηση ήταν «στην
// Επισκόπηση», γιατί εκεί ζει η λίστα των λογαριασμών. Οι υπόλοιπες έξι δεν
// είναι λογαριασμοί: είναι ΕΡΓΑΛΕΙΑ πάνω σε μια κατηγορία (σύγκριση τιμολογίων,
// ρυθμίσεις παρόχου, τιμές αγοράς).
//
// ΤΙ ΙΣΧΥΕΙ ΤΩΡΑ: μία λίστα λογαριασμών με φίλτρο κατηγορίας, μπροστά. Τα έξι
// εργαλεία πίσω από ένα «Περισσότερα». Καμία λειτουργία δεν αφαιρέθηκε — άλλαξε
// μόνο ποιο πράγμα βλέπεις πρώτο.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, Skeleton } from '@/components/Theme';
import { mergeLedger, recurringMonthly } from '@/lib/expenses/ledger';

// ── Static imports, all components must be static for Next.js App Router ────
import BillsDashboard    from './BillsDashboard';
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
  propertyName?:    string;
  propertyAddress?: string;
}

/** Τα εργαλεία που ζουν πίσω από το «Περισσότερα». */
type ToolId = 'electricity' | 'gas' | 'common' | 'providers' | 'insurance' | 'services';

interface ToolDef { id: ToolId; label: string; icon: string; desc: string }

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
  overdueCount: number;
  tenantName:   string;
  /** Ώρα τελευταίας ανάγνωσης, ήδη μορφοποιημένη. Το «πριν 3 λεπτά» απαιτούσε
   *  `Date.now()` μέσα στην απόδοση: ακάθαρτο, και μπαγιάτικο μόλις σταματήσει
   *  να ξαναποδίδεται. Η ώρα δεν παλιώνει. */
  updatedAt:    string;
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
  { id: 'insurance',   label: 'Ασφάλεια & συνδρομές', icon: 'shield',   desc: 'Ασφάλεια κατοικίας, streaming, cloud' },
  { id: 'services',    label: 'Υπηρεσίες',            icon: 'wrench',   desc: 'ΕΝΦΙΑ, δημοτικά τέλη, καθαρισμός, κηπουρός' },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabBills({
  propertyId, userId, propertyName = 'Ακίνητό μου', propertyAddress = '',
}: Props) {
  const supabase   = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const toolsRef   = useRef<HTMLDivElement | null>(null);

  const [openTools,  setOpenTools]  = useState(false);
  const [tool,       setTool]       = useState<ToolId | null>(null);
  const [strip,      setStrip]      = useState<StripData>({ recurringPerMonth: null, overdueCount: 0, tenantName: '', updatedAt: '' });
  // Το `strip` ξεκινά με μηδενικά, οπότε η κεφαλίδα δεν έδειχνε κανένα chip και
  // μετά τα chips εμφανίζονταν μονομιάς και έσπρωχναν τη γραμμή. Δύο σκελετοί
  // κρατούν τη θέση τους όσο τρέχουν τα παράλληλα ερωτήματα.
  const [stripLoading, setStripLoading] = useState(true);

  const loadStrip = useCallback(async () => {
    if (!propertyId) return;
    try {
      const now = new Date();
      // Οι δαπάνες χρειάζονται για να μη μετρηθεί δύο φορές ο πληρωμένος πάγιος:
      // ο λογαριασμός είναι το πρόγραμμα, η δαπάνη το γεγονός, δεμένα με bill_id.
      const [{ data: bills }, { data: expenses }, { data: contacts }] = await Promise.all([
        supabase.from('bills').select('id,name,amount,paid,paid_at,due_date,created_at,category,recurring').eq('property_id', propertyId),
        supabase.from('expenses').select('id,bill_id,amount,date,description,category,paid,expense_group,is_recurring,store_vendor').eq('property_id', propertyId),
        supabase.from('contacts').select('full_name').eq('property_id', propertyId).eq('role', 'tenant').limit(1),
      ]);

      const { entries } = mergeLedger((bills ?? []) as never[], (expenses ?? []) as never[]);
      const recurringPerMonth = recurringMonthly(entries).perMonth;
      const overdueCount = (bills ?? []).filter(b => !b.paid && b.due_date && new Date(b.due_date) < now).length;

      setStrip({
        recurringPerMonth, overdueCount, tenantName: contacts?.[0]?.full_name ?? '',
        updatedAt: now.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }),
      });
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
    setOpenTools(true);
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
            Όλοι οι λογαριασμοί του ακινήτου σε μία λίστα, με φίλτρο κατηγορίας.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Η ΠΡΑΣΙΝΗ ΚΟΥΚΚΙΔΑ «LIVE» ΕΦΥΓΕ. Δεν ήταν πληροφορία του ιδιοκτήτη:
              ήταν η κατάσταση μιας σύνδεσης websocket, με αγγλική λέξη και με
              σημασιολογικό πράσινο, μόνιμα στην κορυφή της οθόνης. Ό,τι έχει να
              πει μια χαμένη σύνδεση το λέει η ίδια η οθόνη όταν τα νούμερα δεν
              ανανεώνονται — και τότε αρκεί η ανανέωση της σελίδας. */}
          {showSkeleton ? (
            <>
              <Skeleton w={90} h={24} r={T.radius.pill} />
              <Skeleton w={110} h={24} r={T.radius.pill} />
            </>
          ) : (
            <>
              {strip.tenantName && <span style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{strip.tenantName}</span>}
              {strip.recurringPerMonth !== null && strip.recurringPerMonth > 0 && <span title="Ο μέσος μήνας σε πάγια, μετρημένος από τους λογαριασμούς που έχεις καταχωρήσει (σύνολο παγίων ÷ οι μήνες που καλύπτουν). Εμφανίζεται μόλις υπάρχουν δύο περίοδοι — με μία δεν υπάρχει μέσος όρος." style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(strip.recurringPerMonth, 0)} / μήνα</span>}
              {strip.overdueCount > 0 && (
                <span style={{ padding: '4px 12px', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.sans }}>
                  {strip.overdueCount} ληξιπρόθεσμα
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── «Πληρώνεις παραπάνω» — μόνο όταν υπάρχει πραγματική διαφορά ── */}
      <ExpenseSwitchAlert propertyId={propertyId} onOpen={openTool} />

      {/* ── Η οθόνη: μία λίστα λογαριασμών ─────────────────────────────── */}
      <BillsDashboard propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress}/>

      {/* ── Περισσότερα: τα εργαλεία ανά κατηγορία ─────────────────────── */}
      <div ref={toolsRef}>
        <button type="button" onClick={() => setOpenTools(v => !v)} aria-expanded={openTools}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, cursor: 'pointer', fontFamily: T.font.sans, color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Περισσότερα</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>ρυθμίσεις παρόχων, συγκρίσεις τιμολογίων, κοινόχρηστα</span>
          <span style={{ flex: 1 }} />
          <span aria-hidden style={{ display: 'flex', color: 'var(--text-tertiary)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: openTools ? 'none' : 'rotate(-90deg)', transition: 'transform 0.18s' }}><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </button>

        {openTools && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: activeTool ? 16 : 0 }}>
              {TOOLS.map(t => {
                const on = tool === t.id;
                return (
                  <button key={t.id} type="button" title={t.desc}
                    onClick={() => setTool(on ? null : t.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`, cursor: 'pointer', fontSize: 11.5, fontWeight: on ? 700 : 500, fontFamily: T.font.sans, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                    <TabIcon name={t.icon} size={12}/>
                    {t.label}
                  </button>
                );
              })}
            </div>

            {activeTool && (
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                {tool === 'electricity' && <BillsElectricity propertyId={propertyId} userId={userId}/>}
                {tool === 'gas'         && <BillsGas         propertyId={propertyId} userId={userId}/>}
                {tool === 'common'      && <BillsCommon      propertyId={propertyId} userId={userId}/>}
                {tool === 'providers'   && <BillsProviders   propertyId={propertyId} userId={userId}/>}
                {tool === 'insurance'   && <BillsInsurance   propertyId={propertyId} userId={userId}/>}
                {tool === 'services'    && <BillsServices    propertyId={propertyId} userId={userId}/>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
