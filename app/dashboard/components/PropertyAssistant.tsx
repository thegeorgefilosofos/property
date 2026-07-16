'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PropertyAssistant, ο προσωπικός βοηθός ακινήτων, ορατός ΠΑΝΤΟΥ στην εφαρμογή.
// Πλωτό κουμπί (FAB) σε κάθε καρτέλα → πάνελ συνομιλίας. Ο χρήστης διαλέγει όνομα
// & φύλο. Απαντά με ανθρώπινη ψυχή σε ΟΤΙΔΗΠΟΤΕ (χαλαρά ή σύνθετα ακινήτων),
// δίνει γνώμη, παραπέμπει στον σωστό επαγγελματία, και καθοδηγεί μέσα στο app.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T } from '@/components/Theme';
import { resolveRent, resolveValue, computeYields } from '@/lib/billing/propertyFacts';
import { computeInsights, type Insight } from '@/lib/insights/engine';
import { RENTAL_TAX_SUMMARY_2026, CLIMATE_LEVY_SUMMARY_2025, MUNICIPAL_ACCOM_SUMMARY } from '@/lib/billing/greekTax';
import { annuityMonthly } from '@/lib/loans/recommend';
import { reservePlan } from '@/lib/billing/budgetPro';
import { incomeStatement, taxProvision } from '@/lib/accounting/statement';
import { clientStats, stayTotal, CLIENT_TYPE_LABELS, type ClientType } from '@/lib/clients/clients';
import { suggestBase, realizedAdr, indicativeMonthly } from '@/lib/pricing/dynamicPricing';
import {
  type AssistantIdentity, type Gender, type Memory, type AssistantAction, DEFAULT_IDENTITY, GENDER_OPTIONS, ADDRESS_OPTIONS, NAME_SUGGESTIONS,
  NAV_MAP, buildSystemPrompt, parseAction, cleanForSpeech, loadIdentity, saveIdentity,
  loadHistory, saveHistory, clearHistory,
  loadMemories, addMemory, removeMemory, clearMemories,
} from './assistantPersona';
import { classifyExpense } from '@/lib/expenses/classify';
import { inferRole, roleLabel } from '@/lib/contacts/roles';
import { upcomingHolidays, holidayName, isWeekend } from '@/lib/calendar/greekHolidays';

interface PropContext { name: string; propType?: string; address?: string; value?: number; sqm?: number; status?: string; targetRent?: number; }
interface PropSummary { name: string; propType?: string; value?: number; targetRent?: number; sqm?: number; status?: string; }
interface Props { propertyId: string; userId: string; propContext: PropContext; allProperties?: PropSummary[]; onNavigate: (tab: string) => void; onScan: () => void; }
type Action = AssistantAction;
interface Msg { role: 'user' | 'assistant'; text: string; action?: Action; }
// Σύστημα αναγνώρισης αντικειμένου από φωτο (συσκευασία/ετικέτα/booklet/απόδειξη).
const IMG_ITEM_SCAN_SYSTEM = `Είσαι σύστημα αναγνώρισης οικιακού εξοπλισμού από φωτογραφία. Επίστρεψε ΑΥΣΤΗΡΑ ΜΟΝΟ JSON:
{"name":"","brand":"","model":"","category":"<μία από: Έπιπλα, Ηλεκτρικές Συσκευές, Ηλεκτρονικά, Υδραυλικά, Θέρμανση & Ψύξη, Φωτιστικά, Διακόσμηση, Λοιπά>","price":"αριθμός € ή κενό","warranty_expiry":"YYYY-MM-DD ή κενό","energy_class":"","power_watts":""}
Το name περιγραφικό (π.χ. «Πλυντήριο Bosch WAU28»). Άφησε κενά όσα δεν διακρίνονται. Χωρίς κείμενο εκτός JSON.`
// Ελαφρύ ευρετήριο πελατών για να «βρίσκει» ο βοηθός από όνομα/τηλέφωνο/ΑΦΜ.
type ClientLite = { id: string; name: string; phone: string; afm: string; vip: boolean };
// Ελαφρύ ευρετήριο επαφών (τεχνικοί/πάροχοι) για επικοινωνία (WhatsApp/Viber/email/κλήση).
type ContactLite = { name: string; role: string; phone: string; email: string };

const eur = (n?: number | null) => n == null ? '—' : `${Math.round(n).toLocaleString('el-GR')} €`;
const navLabel = (id: string) => NAV_MAP.find(n => n.id === id)?.label || id;
const onlyDigits = (p: string) => (p || '').replace(/\D/g, '');
// Ετικέτα κουμπιού επικοινωνίας ανά κανάλι (χωρίς emoji, ελληνικά).
const reachLabel = (ch: 'whatsapp' | 'viber' | 'email' | 'call', name: string) =>
  ch === 'call' ? `Κλήση ${name}`
    : ch === 'email' ? `Email προς ${name}`
    : ch === 'viber' ? `Άνοιγμα Viber προς ${name}`
    : `Άνοιγμα WhatsApp προς ${name}`;
const CH_HUMAN: Record<'whatsapp' | 'viber' | 'email' | 'call', string> = { whatsapp: 'WhatsApp', viber: 'Viber', email: 'email', call: 'κλήση' };

const SUGGESTED = [
  'Τι εκκρεμεί τώρα;',
  'Πόσα ξόδεψα φέτος και πού;',
  'Πώς φορολογείται το ενοίκιό μου;',
  'Πώς ανεβάζω την αξία του ακινήτου;',
];

export default function PropertyAssistant({ propertyId, userId, propContext, allProperties = [], onNavigate, onScan }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [identity, setIdentity] = useState<AssistantIdentity>(DEFAULT_IDENTITY);
  const [hasIdentity, setHasIdentity] = useState(true);
  const [editing, setEditing] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);   // λήψη/επιλογή φωτο αντικειμένου για αναγνώριση
  const [err, setErr] = useState('');
  const [ctxStr, setCtxStr] = useState('');
  const [insightsStr, setInsightsStr] = useState('');
  const [marketStr, setMarketStr] = useState('');
  const [clientsStr, setClientsStr] = useState('');
  const [pricingStr, setPricingStr] = useState('');
  const [techStr, setTechStr] = useState('');   // επαφές τεχνικών/παρόχων (καρτέλα Επαφές)
  const [memories, setMemories] = useState<Memory[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listeningRef = useRef(false);
  const clientsRef = useRef<ClientLite[]>([]);   // ευρετήριο πελατών για εκτέλεση ενεργειών (VIP, check-in)
  const contactsRef = useRef<ContactLite[]>([]); // ευρετήριο επαφών για επικοινωνία (WhatsApp/Viber/email/κλήση)
  // Ανοιχτά στοιχεία προς πληρωμή, για τη σήμανση «πληρωμένο» ([[paid:…]]).
  const openBillsRef = useRef<{ id: string; name: string; category: string; amount: number }[]>([]);
  const openRentRef = useRef<{ id: string; label: string; amount: number }[]>([]);

  // Ταυτότητα από localStorage (μία φορά)
  useEffect(() => {
    const saved = loadIdentity();
    if (saved) { setIdentity(saved); setHasIdentity(true); }
    else { setHasIdentity(false); }
  }, []);

  // Κλείσιμο με κλικ εκτός πάνελ (χωρίς να χρειάζεται το «×»). Δεν κλείνει όταν
  // επεξεργάζεσαι ταυτότητα ή όταν «ακούει», για να μη χαθεί η ενέργεια.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (listeningRef.current) return; // μη διακόπτεις ενεργή φωνή
      const el = e.target as Element | null;
      if (el && el.closest('.pa-panel, .pa-fab')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Μνήμη ανά ακίνητο: φόρτωσε προηγούμενη συζήτηση (αν το επιτρέπει ο χρήστης),
  // και ξεκίνα καθαρά όταν αλλάζει ακίνητο. Διαβάζουμε τη ρύθμιση από το storage
  // (πηγή αλήθειας) για να μη «χτυπάει» με το αρχικό state.
  useEffect(() => {
    setCtxStr(''); setInsightsStr(''); setMarketStr(''); setClientsStr(''); setPricingStr(''); setTechStr('');
    const mem = loadIdentity()?.memory !== false;
    setMsgs(mem ? loadHistory(propertyId).map(m => ({ role: m.role, text: m.text })) : []);
  }, [propertyId]);

  // Μόνιμη μνήμη (γεγονότα) ανά χρήστη, μόνο αν το επιτρέπει η ρύθμιση.
  useEffect(() => {
    setMemories(identity.memory ? loadMemories(userId) : []);
  }, [userId, identity.memory]);

  // Αποθήκευση συζήτησης όταν η μνήμη είναι ενεργή.
  useEffect(() => {
    if (identity.memory && msgs.length) saveHistory(propertyId, msgs.map(({ role, text }) => ({ role, text })));
  }, [msgs, identity.memory, propertyId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy, editing]);

  // Σύγκριση ακινήτων, δίνεται στο μοντέλο μόνο αν το ζητήσει ο χρήστης.
  const allPropsContext = identity.compare && allProperties.length > 1
    ? allProperties.map((p, i) => {
        const gy = computeYields(resolveRent({ targetRent: p.targetRent }).value, resolveValue(p.value).value, 0).grossYield;
        const y = gy > 0 ? gy.toFixed(1) : null;
        return `${i + 1}. ${p.name}${p.propType ? ` (${p.propType})` : ''}: αξία ${eur(p.value)}, ενοίκιο-στόχος ${eur(p.targetRent)}/μήνα${y ? `, μεικτή απόδοση ~${y}%` : ''}${p.sqm ? `, ${p.sqm} τ.μ.` : ''}${p.status ? `, ${p.status}` : ''}`;
      }).join('\n')
    : undefined;

  // Φόρτωση δεδομένων ακινήτου (μία φορά όταν ανοίξει), για συγκεκριμένες απαντήσεις.
  const loadContext = useCallback(async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = now.toISOString().split('T')[0];
    const [{ data: exp }, { data: bil }, { data: ten }, { data: st }, { data: cal }, { data: rates }, { data: tar }, { data: loans }, { data: clientRows }, { data: stayRows }, { data: contactRows }, { data: chk }] = await Promise.all([
      supabase.from('expenses').select('amount,category,date,paid,payment_method').eq('property_id', propertyId).eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('bills').select('id,name,amount,paid,due_date,category').eq('property_id', propertyId).eq('user_id', userId),
      supabase.from('tenants').select('full_name,monthly_rent,lease_end,deposit_amount').eq('property_id', propertyId).eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
      supabase.from('property_settings').select('insurance_company,insurance_expiry,insurance_amount').eq('property_id', propertyId).maybeSingle(),
      supabase.from('calendar_events').select('title,event_date,amount,status').eq('property_id', propertyId).eq('user_id', userId).gte('event_date', new Date().toISOString().split('T')[0]).order('event_date').limit(10),
      supabase.from('market_rates').select('euribor_3m,bog_housing_new,updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('energy_tariffs').select('kwh_day').eq('valid_month', month).order('kwh_day'),
      supabase.from('loans').select('bank,loan_type,amount,rate,rate_type,years,start_date,status').eq('property_id', propertyId).eq('user_id', userId),
      supabase.from('clients').select('id,type,full_name,afm,phone,email,rating,do_not_rent,vip,tags,budget,needs').eq('user_id', userId).order('created_at', { ascending: false }).limit(80),
      supabase.from('client_stays').select('client_id,property_id,check_in,check_out,nights,nightly_rate,total,rating,damages,damage_cost,channel,notes').eq('user_id', userId),
      supabase.from('contacts').select('full_name,role,phone,email').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('checklist_items').select('description,category,priority,due_date,status,estimated_cost,assigned_contact_name').eq('property_id', propertyId).eq('user_id', userId).neq('status', 'done').neq('status', 'skipped').order('due_date', { ascending: true, nullsFirst: false }).limit(60),
    ]);
    const expenses = exp || [];
    const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const paid = expenses.filter(e => (e as any).paid !== false).reduce((s, e) => s + (e.amount || 0), 0);
    const catMap: Record<string, number> = {};
    expenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + (e.amount || 0); });
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const unpaid = (bil || []).filter(b => !b.paid);
    openBillsRef.current = unpaid.map((b: any) => ({ id: b.id, name: b.name || 'λογαριασμός', category: b.category || '', amount: b.amount || 0 }));
    // Ανεξόφλητες δόσεις ενοικίου (για σήμανση «πληρωμένο» από τον βοηθό)
    const MON_GR = ['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου','Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
    const { data: rentDue } = await supabase.from('rent_payments').select('id,period_month,period_year,amount,paid').eq('property_id', propertyId).eq('user_id', userId).eq('paid', false).order('period_year').order('period_month');
    openRentRef.current = (rentDue || []).map((r: any) => ({ id: r.id, label: `Ενοίκιο ${MON_GR[(r.period_month || 1) - 1]} ${r.period_year}`, amount: r.amount || 0 }));
    const t = ten?.[0];
    const rent = resolveRent({ tenantRent: t?.monthly_rent, targetRent: propContext.targetRent }).value;
    const value = resolveValue(propContext.value).value;
    const { grossYield: grossY, netYield: netY } = computeYields(rent, value, total);
    const leaseEnd = t?.lease_end || null;
    const daysLease = leaseEnd ? Math.ceil((new Date(leaseEnd).getTime() - Date.now()) / 86400000) : null;

    const loanRows = loans || [];
    const rateTypeGr = (rt?: string) => rt === 'variable' ? 'κυμαινόμενο' : rt === 'mixed' ? 'μεικτό' : 'σταθερό';
    const monthlyDebt = loanRows.reduce((s, l: any) => s + annuityMonthly(l.amount || 0, l.rate || 0, l.years || 0), 0);
    const loanLine = loanRows.length
      ? `Δάνεια (${loanRows.length}): εκτιμώμενη συνολική μηνιαία δόση ${eur(Math.round(monthlyDebt))}. ${loanRows.map((l: any) => `${l.bank || 'τράπεζα'} ${eur(l.amount || 0)} με ${Number(l.rate || 0).toFixed(2)}% ${rateTypeGr(l.rate_type)} σε ${l.years || 0} έτη`).join('; ')}`
      : 'Δεν έχει καταχωρηθεί δάνειο για αυτό το ακίνητο.';

    // Έσοδα φιλοξενίας (διαμονές επισκεπτών από το Πελατολόγιο συνδεδεμένες σε αυτό το ακίνητο).
    const propStays = (stayRows || []).filter((s: any) => s.property_id === propertyId);
    const propHostRevenue = propStays.reduce((sum: number, s: any) => sum + stayTotal(s), 0);
    const hostingLine = propStays.length
      ? `Έσοδα φιλοξενίας από διαμονές επισκεπτών σε αυτό το ακίνητο: ${eur(Math.round(propHostRevenue))} από ${propStays.length} διαμονές (πηγή: Πελατολόγιο).`
      : '';

    // ── Λογιστική εικόνα (ΙΔΙΑ μηχανή με την καρτέλα Λογιστική) ώστε ο βοηθός να
    // συμβουλεύει με τον σωστό φόρο/καθαρό, όχι με πρόχειρες εκτιμήσεις. ──────────
    const isShortAcct = propStays.length > 0;
    const yearStays = propStays.filter((s: any) => (s.check_in || '').slice(0, 4) === String(year));
    const acctGross = isShortAcct ? yearStays.reduce((sum: number, s: any) => sum + stayTotal(s), 0) : rent * 12;
    const acctStmt = incomeStatement({
      regime: isShortAcct ? 'individual_shortterm' : 'individual_longterm',
      grossIncome: acctGross, otherCashExpenses: paid, loanPrincipal: Math.round(monthlyDebt * 12),
    });
    const acctProv = taxProvision(acctStmt, now.getMonth() + 1);
    const accountingLine = acctGross > 0
      ? `Λογιστική ${year} (${isShortAcct ? 'βραχυχρόνια' : 'μακροχρόνια'} μίσθωση): μεικτά έσοδα ${eur(Math.round(acctStmt.grossIncome))}, φορολογητέο ${eur(Math.round(acctStmt.taxableIncome))}, εκτιμώμενος φόρος εισοδήματος ${eur(Math.round(acctStmt.incomeTax))} (μέσος συντελεστής ${(acctStmt.effectiveRate * 100).toFixed(1)}%), καθαρό αποτέλεσμα ${eur(Math.round(acctStmt.netProfit))}. Πρόταση πρόβλεψης φόρου: περίπου ${eur(Math.round(acctProv.monthly))} τον μήνα να μπαίνουν στην άκρη. Εκτίμηση με την κλίμακα 2026 (μακροχρόνια: τεκμαρτή έκπτωση 5%· βραχυχρόνια: φόρος στα μεικτά)· τελική επιβεβαίωση με λογιστή/ΑΑΔΕ.`
      : '';

    // ── Εκκρεμότητες: πραγματικές ανοιχτές εργασίες (καρτέλα Εκκρεμότητες) ώστε ο βοηθός
    // να απαντά «τι εκκρεμεί;» με στοιχεία, όχι υποθέσεις, και να ξεχωρίζει τις ληξιπρόθεσμες.
    const openTasks = chk || [];
    const overdueTasks = openTasks.filter((i: any) => i.due_date && i.due_date < todayStr);
    const taskCostSum = openTasks.reduce((s: number, i: any) => s + (Number(i.estimated_cost) || 0), 0);
    const checklistLine = openTasks.length
      ? `Ανοιχτές εκκρεμότητες (${openTasks.length}${overdueTasks.length ? `, εκ των οποίων ${overdueTasks.length} ληξιπρόθεσμες` : ''}${taskCostSum > 0 ? `, εκτιμώμενο κόστος ${eur(Math.round(taskCostSum))}` : ''}): ${openTasks.slice(0, 15).map((i: any) => `${i.description}${i.due_date ? ` [προθεσμία ${i.due_date}${i.due_date < todayStr ? ' — ΛΗΞΙΠΡΟΘΕΣΜΗ' : ''}]` : ''}${i.estimated_cost ? ` ~${eur(i.estimated_cost)}` : ''}${i.assigned_contact_name ? ` (ανάθεση: ${i.assigned_contact_name})` : ''}`).join('; ')}${openTasks.length > 15 ? ` (και ${openTasks.length - 15} ακόμη)` : ''}`
      : 'Δεν υπάρχουν ανοιχτές εκκρεμότητες.';

    // ── Δυναμική τιμολόγηση: βάση + ενδεικτικός πίνακας ανά μήνα (για τον βοηθό) ──
    // Προτίμησε τη ΒΑΣΗ που έχει ορίσει ο χρήστης στην καρτέλα Τιμολόγηση (αν υπάρχει).
    const { data: pset } = await supabase.from('pricing_settings').select('base,weekend_premium').eq('user_id', userId).eq('property_id', propertyId).maybeSingle();
    const wkndPrem = pset?.weekend_premium != null ? Number(pset.weekend_premium) : 0.18;
    const priceBase = (pset?.base != null ? Number(pset.base) : 0) || suggestBase(propStays) || (propContext.targetRent ? Math.round((propContext.targetRent / 30) * 2.2) : 0);
    if (priceBase > 0) {
      const adrVal = realizedAdr(propStays);
      const MON = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
      const table = indicativeMonthly(priceBase, wkndPrem).map(r => `${MON[r.month]} ${r.weekday}/${r.weekend}`).join(', ');
      setPricingStr([
        `Βάση: ${eur(priceBase)}/νύχτα${adrVal > 0 ? ` (μέση πραγματική ADR ${eur(Math.round(adrVal))} από ${propStays.length} διαμονές)` : ' (εκτίμηση, χωρίς επαρκές ιστορικό)'}.`,
        `Ενδεικτικές τιμές ανά μήνα (καθημερινή/Σαββατοκύριακο): ${table}.`,
        `Πρόσθετοι κανόνες: αργίες και υψηλή ζήτηση (Δεκαπενταύγουστος, Πάσχα, Εορτές, Πρωτοχρονιά) περίπου +25%. Last minute σε κενές κοντινές ημέρες περίπου -8% έως -15%. Υψηλή πληρότητα γύρω από την ημερομηνία ανεβάζει έως +12%.`,
        `Για ημερομηνία που ζητά ο χρήστης: πάρε τον μήνα από τον πίνακα (καθημερινή ή Σαββατοκύριακο) και πρόσθεσε αργία/ζήτηση αν ισχύει. Οι τιμές είναι ενδεικτικές προτάσεις.`,
      ].join('\n'));
    } else {
      setPricingStr('Δεν έχει οριστεί βασική τιμή ούτε υπάρχει ιστορικό διαμονών. Για προτάσεις τιμής, ο χρήστης ορίζει βασική τιμή στην καρτέλα Τιμολόγηση.');
    }

    // ── Προϋπολογισμός: μηνιαίος στόχος, κουμπαράδες, ειδοποίηση υπέρβασης ────────
    // Ώστε ο βοηθός να απαντά «πόσο είναι ο στόχος;», «πώς πάνε οι κουμπαράδες;» και
    // να μπορεί να φτιάχνει κουμπαρά με [[vault:]]. Πηγή: ίδιες ρυθμίσεις με την καρτέλα.
    const [{ data: budgetSet }, { data: vaultSet }] = await Promise.all([
      supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'budgets').maybeSingle(),
      supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle(),
    ]);
    const bData = (budgetSet?.data as Record<string, unknown> | null) || {};
    const monthlyTarget = parseFloat(String(bData.total ?? '')) || 390;
    const notifyOverspend = String(bData.notifyOverspend) === 'true';
    const vArr = ((vaultSet?.data as { vaults?: any[] } | null)?.vaults) || [];
    const monthsUntilDue = (due?: string): number => {
      if (!due) return 0;
      const d = new Date(due), nn = new Date();
      return Math.max(0, (d.getFullYear() - nn.getFullYear()) * 12 + (d.getMonth() - nn.getMonth()));
    };
    const vaultSaved = vArr.reduce((s: number, v: any) => s + (Number(v.current) || 0), 0);
    const vaultTarget = vArr.reduce((s: number, v: any) => s + (Number(v.target) || 0), 0);
    const vaultMonthly = vArr.reduce((s: number, v: any) => {
      const mo = monthsUntilDue(v.due);
      return v.due && mo > 0 ? s + reservePlan(Number(v.target) || 0, Number(v.current) || 0, mo).requiredMonthly : s;
    }, 0);
    const budgetLine = [
      `Προϋπολογισμός: μηνιαίος στόχος δαπανών ${eur(monthlyTarget)}. Ειδοποίηση υπέρβασης: ${notifyOverspend ? 'ενεργή (email μέσω προτιμήσεων ειδοποιήσεων)' : 'ανενεργή'}.`,
      vArr.length
        ? `Κουμπαράδες (${vArr.length}): μαζεμένα ${eur(vaultSaved)} από στόχο ${eur(vaultTarget)}${vaultMonthly > 0 ? `, απαιτούμενη μηνιαία εισφορά ${eur(vaultMonthly)}` : ''}. ${vArr.slice(0, 6).map((v: any) => `${v.name || 'κουμπαράς'} ${eur(Number(v.current) || 0)}/${eur(Number(v.target) || 0)}${v.due ? ` έως ${v.due}` : ''}`).join('; ')}`
        : 'Κουμπαράδες: δεν έχει δημιουργηθεί κανένας ακόμη. Μπορείς να φτιάξεις (π.χ. ΕΝΦΙΑ, λέβητας, κενές περίοδοι) με [[vault: όνομα | στόχος | ΕΕΕΕ-ΜΜ-ΗΗ]].',
    ].join(' ');

    const lines = [
      `Ακίνητο: ${propContext.name}${propContext.propType ? ` (${propContext.propType})` : ''}${propContext.address ? `, ${propContext.address}` : ''}`,
      propContext.sqm ? `Εμβαδόν: ${propContext.sqm} τ.μ.` : '',
      value ? `Εμπορική αξία: ${eur(value)}` : 'Εμπορική αξία: δεν έχει καταχωρηθεί',
      propContext.status ? `Κατάσταση: ${propContext.status}` : '',
      `Ενοίκιο: ${eur(rent)}/μήνα (ετήσιο ${eur(rent * 12)})`,
      value ? `Απόδοση: μεικτή ${grossY.toFixed(1)}%, καθαρή ${netY.toFixed(1)}%` : '',
      `Δαπάνες ${year}: σύνολο ${eur(total)} (πληρωμένες ${eur(paid)}, εκκρεμείς ${eur(total - paid)})`,
      topCats.length ? `Μεγαλύτερες κατηγορίες: ${topCats.map(([c, a]) => `${c} ${eur(a)}`).join(', ')}` : '',
      unpaid.length ? `Απλήρωτοι λογαριασμοί (${unpaid.length}): ${unpaid.slice(0, 12).map(b => `${(b as any).name || 'λογαριασμός'} ${eur(b.amount)}${(b as any).due_date ? ` λήξη ${(b as any).due_date}` : ''}`).join('; ')}` : 'Δεν υπάρχουν απλήρωτοι λογαριασμοί.',
      openRentRef.current.length ? `Ανεξόφλητες δόσεις ενοικίου (${openRentRef.current.length}): ${openRentRef.current.slice(0, 12).map(r => `${r.label} ${eur(r.amount)}`).join('; ')}` : '',
      t ? `Ενοικιαστής: ${t.full_name || 'καταχωρημένος'}${t.deposit_amount ? `, εγγύηση ${eur(t.deposit_amount)}` : ''}` : 'Δεν έχει καταχωρηθεί ενοικιαστής.',
      leaseEnd ? `Λήξη μίσθωσης: ${leaseEnd}${daysLease != null ? ` (σε ${daysLease} ημέρες)` : ''}` : '',
      st?.insurance_company || st?.insurance_expiry ? `Ασφάλεια: ${st?.insurance_company || 'εταιρεία άγνωστη'}${st?.insurance_expiry ? `, λήξη ${st.insurance_expiry}` : ''}` : 'Ασφάλεια: δεν έχει καταχωρηθεί.',
      loanLine,
      hostingLine,
      accountingLine,
      budgetLine,
      (cal || []).length ? `Επόμενα στο ημερολόγιο: ${(cal || []).map(c => `${c.event_date} ${c.title}${c.amount ? ` ${eur(c.amount)}` : ''}`).join('; ')}` : '',
      checklistLine,
      `Σήμερα είναι ${new Date(todayStr).toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${isWeekend(todayStr) ? ' (Σαββατοκύριακο)' : ''}${holidayName(todayStr) ? ` — αργία: ${holidayName(todayStr)}` : ''}.`,
      `Επόμενες επίσημες αργίες Ελλάδας: ${upcomingHolidays(todayStr, 5).map(h => `${h.name} (${new Date(h.date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })})`).join(', ')}. Όταν προτείνεις ημερομηνία/ώρα ραντεβού, απόφυγε Σαββατοκύριακα και αργίες εκτός αν το ζητήσει ο χρήστης, και ανάφερέ το αν η ημέρα που διαλέγει πέφτει σε αργία/Σαββατοκύριακο.`,
    ].filter(Boolean);
    setCtxStr(lines.join('\n'));

    // ── Insights: τι εκκρεμεί / ευκαιρίες, με την ίδια μηχανή που τροφοδοτεί την Επισκόπηση.
    // Φιλτράρουμε το «λείπουν στοιχεία» γιατί εδώ δεν φορτώνουμε πλήρες προφίλ (το δείχνει η Επισκόπηση).
    const insights: Insight[] = computeInsights({
      now: now.getTime(),
      property: {
        name: propContext.name, prop_type: propContext.propType, value, sqm: propContext.sqm,
        target_rent: propContext.targetRent, insurance_expiry: st?.insurance_expiry, insurance_amount: (st as any)?.insurance_amount,
      },
      tenant: t ? { monthly_rent: t.monthly_rent, lease_end: t.lease_end } : null,
      rent, propValue: value, grossYield: grossY, netYield: netY, expensesYTD: total,
      expenses: expenses.map(e => ({ category: e.category, amount: e.amount || 0, date: e.date, paid: (e as any).paid !== false, payment_method: (e as any).payment_method })),
      bills: (bil || []).map(b => ({ type: (b as any).category, amount: b.amount, paid: b.paid, due_date: (b as any).due_date })),
      tasks: [], inventory: [],
      checklist: openTasks.map((i: any) => ({ due_date: i.due_date, status: i.status, priority: i.priority })),
    }).filter(i => i.id !== 'profile-incomplete');
    const KIND_TXT: Record<string, string> = { urgent: 'ΕΠΕΙΓΟΝ', attention: 'ΠΡΟΣΟΧΗ', opportunity: 'ΕΥΚΑΙΡΙΑ', positive: 'ΘΕΤΙΚΟ' };
    setInsightsStr(insights.slice(0, 6).map(i => `• [${KIND_TXT[i.kind]}] ${i.title}${i.metric ? ` (${i.metric})` : ''}: ${i.detail}`).join('\n'));

    // ── Αγορά: πραγματικά τρέχοντα νούμερα (επιτόκια, ρεύμα) + σταθερή φορο-κλίμακα 2026.
    const mLines: string[] = [];
    if (rates?.euribor_3m != null) mLines.push(`Euribor 3 μηνών: ${Number(rates.euribor_3m).toFixed(2)}% (ο δείκτης πάνω στον οποίο πατούν τα κυμαινόμενα επιτόκια στεγαστικών).`);
    if (rates?.bog_housing_new != null) mLines.push(`Μέσο επιτόκιο νέου στεγαστικού δανείου (στοιχεία Τράπεζας της Ελλάδος): περίπου ${Number(rates.bog_housing_new).toFixed(2)}%.`);
    const kwh = (tar || []).map(r => Number((r as any).kwh_day)).filter(v => v > 0).sort((a, b) => a - b);
    if (kwh.length) mLines.push(`Τιμή ρεύματος σε σταθερά τιμολόγια αυτόν τον μήνα: από ${kwh[0].toFixed(3).replace('.', ',')} έως ${kwh[kwh.length - 1].toFixed(3).replace('.', ',')} ευρώ ανά κιλοβατώρα.`);
    mLines.push(RENTAL_TAX_SUMMARY_2026);
    mLines.push(CLIMATE_LEVY_SUMMARY_2025);
    mLines.push(MUNICIPAL_ACCOM_SUMMARY);
    setMarketStr(mLines.join('\n'));

    // ── Πελατολόγιο: ρόστερ με ιστορικό, ώστε ο βοηθός να βρίσκει από όνομα/τηλέφωνο/ΑΦΜ ──
    const clientRoster = clientRows || [];
    clientsRef.current = clientRoster.map((c: any) => ({ id: c.id, name: c.full_name || '', phone: String(c.phone || ''), afm: String(c.afm || ''), vip: !!c.vip }));
    if (clientRoster.length) {
      const staysByClient = new Map<string, any[]>();
      (stayRows || []).forEach((s: any) => { const a = staysByClient.get(s.client_id) || []; a.push(s); staysByClient.set(s.client_id, a); });
      const nowMs = Date.now();
      const revSince = (arr: any[], days: number) => arr.reduce((s, st) => {
        const d = st.check_out || st.check_in; if (!d) return s;
        const t = new Date(d).getTime(); if (isNaN(t) || (nowMs - t) > days * 86400000 || t > nowMs) return s;
        return s + (Number(st.total) || (Number(st.nights) || 0) * (Number(st.nightly_rate) || 0));
      }, 0);
      const cLines = clientRoster.slice(0, 50).map((c: any) => {
        const arr = staysByClient.get(c.id) || [];
        const cs = clientStats(arr);
        const lastBooking = arr.map((s: any) => s.check_in).filter(Boolean).sort().slice(-1)[0] || null;
        const lastNote = arr.slice().sort((a: any, b: any) => String(a.check_in || '').localeCompare(String(b.check_in || ''))).map((s: any) => s.notes).filter((n: any) => n && String(n).trim()).slice(-1)[0];
        const bits: string[] = [c.full_name, CLIENT_TYPE_LABELS[c.type as ClientType] || c.type];
        if (c.vip) bits.push('VIP');
        if (cs.stayCount >= 2) bits.push('επαναλαμβανόμενος (2+ διαμονές)');
        if (c.phone) bits.push(`τηλ ${c.phone}`);
        if (c.afm) bits.push(`ΑΦΜ ${c.afm}`);
        if (typeof c.rating === 'number') bits.push(`βαθμολογία ${c.rating}/5`);
        if (cs.stayCount) bits.push(`${cs.stayCount} διαμονές, ${cs.nights} νύχτες, συνολικά έσοδα ${eur(cs.revenue)}`);
        if (cs.stayCount) bits.push(`έσοδα: τελευταίος μήνας ${eur(revSince(arr, 30))}, εξάμηνο ${eur(revSince(arr, 182))}, έτος ${eur(revSince(arr, 365))}`);
        if (lastBooking) bits.push(`τελευταία κράτηση ${lastBooking}`);
        if (cs.hasDamage) bits.push(`φθορές ${eur(cs.damageTotal)}`);
        if (c.do_not_rent) bits.push('ΠΡΟΣΟΧΗ/μαύρη λίστα');
        if (c.budget) bits.push(`προϋπολογισμός ${eur(c.budget)}`);
        if (c.needs) bits.push(`ανάγκες: ${c.needs}`);
        if (lastNote) bits.push(`σημείωση τελευταίας διαμονής: «${String(lastNote).slice(0, 160)}»`);
        return `• ${bits.filter(Boolean).join(' · ')}`;
      });
      const extra = clientRoster.length > 50 ? `\n(και ${clientRoster.length - 50} ακόμη, δες την καρτέλα Πελατολόγιο)` : '';
      setClientsStr(`Σύνολο πελατών: ${clientRoster.length}\n${cLines.join('\n')}${extra}`);
    } else setClientsStr('');

    // ── Επαφές τεχνικών/παρόχων (καρτέλα Επαφές): για να προτείνει ο βοηθός ΠΟΙΟΝ
    // να καλέσει/προγραμματίσει για μια εργασία, ή να παραπέμψει αν λείπει ο ρόλος ──
    const techRoster = (contactRows || []).filter((c: any) => c.full_name);
    contactsRef.current = techRoster.map((c: any) => ({ name: c.full_name || '', role: c.role || 'other', phone: String(c.phone || ''), email: String(c.email || '') }));
    if (techRoster.length) {
      const tLines = techRoster.slice(0, 60).map((c: any) => {
        const bits = [c.full_name, roleLabel(c.role || 'other')];
        if (c.phone) bits.push(`τηλ ${c.phone}`);
        return `• ${bits.filter(Boolean).join(' · ')}`;
      });
      setTechStr(`Σύνολο επαφών: ${techRoster.length}\n${tLines.join('\n')}`);
    } else setTechStr('');
  }, [propertyId, userId, propContext, supabase]);

  useEffect(() => { if (open && !ctxStr) loadContext(); }, [open, ctxStr, loadContext]);

  const runAction = (a?: Action, keepOpen = false) => {
    if (!a) return;
    if (a.type === 'scan') onScan();
    else if (a.type === 'go') onNavigate(a.tab);
    else if (a.type === 'book') { bookAppointment(a.title, a.date, a.time); return; } // κρατά ανοιχτό το πάνελ για την επιβεβαίωση
    else if (a.type === 'client') { registerClient(a); return; }
    else if (a.type === 'expense') { registerExpense(a.description, a.amount); return; }
    else if (a.type === 'vip') { toggleVip(a.who); return; }
    else if (a.type === 'checkin') { makeCheckinLink(a.who); return; }
    else if (a.type === 'contact') { registerContact(a.name, a.phone, a.role); return; }
    else if (a.type === 'reach') { reachContact(a); return; }
    else if (a.type === 'task') { addTask(a); return; }
    else if (a.type === 'paid') { markPaid(a.description, a.amount); return; }
    else if (a.type === 'inventory') { registerInventory(a); return; }
    else if (a.type === 'vault') { createVault(a); return; }
    if (!keepOpen) setOpen(false);
  };

  // Βρες πελάτη από όνομα/τηλέφωνο/ΑΦΜ (ανεκτικό: μερικό όνομα, ψηφία τηλεφώνου).
  const findClient = (who: string): ClientLite | null => {
    const q = (who || '').trim().toLowerCase();
    if (!q) return null;
    const digits = q.replace(/\D/g, '');
    const list = clientsRef.current;
    if (digits.length >= 6) {
      const byNum = list.find(c => c.afm.replace(/\D/g, '') === digits || c.phone.replace(/\D/g, '').endsWith(digits));
      if (byNum) return byNum;
    }
    const exact = list.find(c => c.name.toLowerCase() === q);
    if (exact) return exact;
    const partial = list.filter(c => c.name.toLowerCase().includes(q));
    return partial.length === 1 ? partial[0] : null;   // αν είναι διφορούμενο, μη μαντεύεις
  };

  // Βρες επαφή (τεχνικό/πάροχο) από όνομα ή ρόλο. Ανεκτικό: ακριβές όνομα → μερικό
  // όνομα → ετικέτα ρόλου → συμπερασμένος ρόλος. Επιστρέφει την καλύτερη μοναδική.
  const findContact = (name: string): ContactLite | null => {
    const q = (name || '').trim().toLowerCase();
    if (!q) return null;
    const list = contactsRef.current;
    const exact = list.find(c => c.name.toLowerCase() === q);
    if (exact) return exact;
    const partial = list.filter(c => { const n = c.name.toLowerCase(); return !!n && (n.includes(q) || q.includes(n)); });
    if (partial.length) return partial[0];
    const byRoleLabel = list.filter(c => { const rl = roleLabel(c.role || 'other').toLowerCase(); return !!rl && (rl.includes(q) || q.includes(rl)); });
    if (byRoleLabel.length) return byRoleLabel[0];
    const inferred = inferRole(q);
    if (inferred && inferred !== 'other') {
      const byRole = list.filter(c => (c.role || 'other') === inferred);
      if (byRole.length) return byRole[0];
    }
    return null;
  };

  // Χτίζει «τίμιο» deep link προς την επαφή. Δεν στέλνει τίποτα — απλώς ανοίγει το μέσο.
  // Επιστρέφει είτε το url, είτε ποιο στοιχείο λείπει (τηλέφωνο ή email).
  const buildReachLink = (c: ContactLite, channel: 'whatsapp' | 'viber' | 'email' | 'call', text?: string): { url?: string; need?: 'phone' | 'email' } => {
    const t = (text || '').trim();
    if (channel === 'email') {
      if (!c.email) return { need: 'email' };
      const subject = encodeURIComponent('Επικοινωνία');
      return { url: `mailto:${c.email}?subject=${subject}${t ? `&body=${encodeURIComponent(t)}` : ''}` };
    }
    // whatsapp / viber / call: χρειάζονται τηλέφωνο
    if (!c.phone) return { need: 'phone' };
    let d = onlyDigits(c.phone);
    if (!d) return { need: 'phone' };
    if (d.length === 10) d = `30${d}`;   // ελληνικός αριθμός 10 ψηφίων → διεθνής με πρόθεμα 30
    if (channel === 'viber') return { url: `viber://chat?number=${d}` };   // το Viber δεν προ-συμπληρώνει κείμενο
    if (channel === 'call') return { url: `tel:+${d}` };
    return { url: `https://wa.me/${d}${t ? `?text=${encodeURIComponent(t)}` : ''}` };   // whatsapp
  };

  // Επικοινωνία με επαφή: αναλύει ποιον εννοεί ο χρήστης, χτίζει τον σύνδεσμο και
  // σπρώχνει μήνυμα με κουμπί που ΑΝΟΙΓΕΙ το μέσο όταν το πατήσει ο χρήστης (όχι αυτόματα).
  const reachContact = (a: { name: string; channel: 'whatsapp' | 'viber' | 'email' | 'call'; text?: string }) => {
    const c = findContact(a.name);
    if (!c) {
      setMsgs(m => [...m, { role: 'assistant', text: `Δεν βρήκα την επαφή «${a.name}». Ποιον εννοείς;`, action: { type: 'go', tab: 'contacts' } }]);
      return;
    }
    const link = buildReachLink(c, a.channel, a.text);
    if (link.url) {
      const how = a.channel === 'call' ? `να καλέσεις τον/την «${c.name}»`
        : a.channel === 'email' ? `να ανοίξει το email προς τον/την «${c.name}»`
          : `να ανοίξει το ${a.channel === 'viber' ? 'Viber' : 'WhatsApp'} προς τον/την «${c.name}»`;
      setMsgs(m => [...m, { role: 'assistant', text: `Πάτησε ${how}. Το μήνυμα δεν φεύγει μόνο του — ανοίγει η εφαρμογή για να το στείλεις εσύ.`, action: { type: 'reach', name: c.name, channel: a.channel, text: a.text } }]);
      return;
    }
    // Λείπει το απαραίτητο στοιχείο για το κανάλι — πρότεινε διαθέσιμη εναλλακτική.
    if (link.need === 'phone') {
      if (c.email) setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο τηλέφωνο για ${CH_HUMAN[a.channel]}. Έχει όμως email — να το ετοιμάσω;`, action: { type: 'reach', name: c.name, channel: 'email', text: a.text } }]);
      else setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο τηλέφωνο ούτε email. Πρόσθεσε στοιχεία επικοινωνίας στις Επαφές.`, action: { type: 'go', tab: 'contacts' } }]);
    } else {
      if (c.phone) setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο email. Έχει τηλέφωνο — να ανοίξω WhatsApp αντ' αυτού;`, action: { type: 'reach', name: c.name, channel: 'whatsapp', text: a.text } }]);
      else setMsgs(m => [...m, { role: 'assistant', text: `Ο/Η «${c.name}» δεν έχει αποθηκευμένο email ούτε τηλέφωνο. Πρόσθεσε στοιχεία επικοινωνίας στις Επαφές.`, action: { type: 'go', tab: 'contacts' } }]);
    }
  };

  // Καταχώρηση δαπάνης με μία φράση: η κατηγορία/ομάδα προκύπτει αυτόματα.
  const registerExpense = async (description: string, amount: number) => {
    const { group, category, deductible } = classifyExpense(description);
    try {
      await supabase.from('expenses').insert({
        property_id: propertyId, user_id: userId,
        description: description.slice(0, 120), amount,
        category, expense_group: group,
        date: new Date().toISOString().split('T')[0],
        paid_by: 'owner', payment_method: 'cash', paid: true,
      });
      setCtxStr('');   // ξαναφόρτωσε το πλαίσιο ώστε ο βοηθός να «ξέρει» τη νέα δαπάνη
      loadContext();
      setMsgs(m => [...m, { role: 'assistant', text: `Το κατέγραψα. Πρόσθεσα δαπάνη «${description}» ${eur(amount)} στην κατηγορία «${category}»${deductible ? ' (εκπίπτει φορολογικά)' : ''}. Θέλεις να την ανοίξω για να προσθέσεις απόδειξη ή ΦΠΑ;`, action: { type: 'go', tab: 'expenses' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω τη δαπάνη τώρα. Δοκίμασε ξανά ή πρόσθεσέ την από την καρτέλα Δαπάνες.' }]);
    }
  };

  // Σήμανση ΥΠΑΡΧΟΝΤΟΣ ανοιχτού στοιχείου (λογαριασμός ή δόση ενοικίου) ως πληρωμένου.
  // Ασφαλές: αν δεν υπάρχει ΜΟΝΑΔΙΚΗ σαφής αντιστοίχιση, ΔΕΝ μαντεύει — ζητά διευκρίνιση.
  const markPaid = async (description: string, amount?: number) => {
    const q = (description || '').trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase();
    const amtOk = (a: number) => amount == null || (a > 0 && Math.abs(a - amount) / a <= 0.01);
    const bills = openBillsRef.current;
    const rents = openRentRef.current;
    // Υποψήφια: λογαριασμοί (όνομα/κατηγορία ταιριάζει με το κείμενο) + δόσεις ενοικίου.
    // Προσοχή: ΠΟΤΕ να μη ταιριάζει με κενή κατηγορία (q.includes('') === true) — θα
    // σημείωνε λάθος λογαριασμό ως πληρωμένο.
    const textHit = (field: string) => { const f = norm(field).trim(); return !!f && f.length >= 2 && (f.includes(q) || q.includes(f)); };
    const billHits = bills.filter(b => (textHit(b.name) || textHit(b.category)) && amtOk(b.amount));
    const rentHits = /ενοικ|μισθωμ|δοση|δόση/.test(q) || rents.some(r => norm(r.label).includes(q))
      ? rents.filter(r => amtOk(r.amount) && (norm(r.label).includes(q) || /ενοικ|μισθωμ|δοση|δόση/.test(q)))
      : [];
    const totalHits = billHits.length + rentHits.length;
    if (totalHits === 0) {
      const opts = [...bills.map(b => `${b.name} ${eur(b.amount)}`), ...rents.map(r => `${r.label} ${eur(r.amount)}`)];
      setMsgs(m => [...m, { role: 'assistant', text: opts.length ? `Δεν βρήκα ανοιχτό στοιχείο που να ταιριάζει καθαρά με «${description}». Ποιο εννοείς; Ανοιχτά: ${opts.slice(0, 12).join('· ')}.` : `Δεν βλέπω ανοιχτούς λογαριασμούς ή δόσεις ενοικίου για αυτό το ακίνητο.` }]);
      return;
    }
    if (totalHits > 1) {
      const opts = [...billHits.map(b => `${b.name} ${eur(b.amount)}`), ...rentHits.map(r => `${r.label} ${eur(r.amount)}`)];
      setMsgs(m => [...m, { role: 'assistant', text: `Ταιριάζουν περισσότερα από ένα. Σε ποιο να το αντιστοιχίσω; ${opts.join('· ')}.` }]);
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      if (billHits.length === 1) {
        const b = billHits[0];
        await supabase.from('bills').update({ paid: true, paid_at: new Date().toISOString() }).eq('id', b.id);
        await supabase.from('expenses').update({ paid: true }).eq('bill_id', b.id);
        setMsgs(m => [...m, { role: 'assistant', text: `Έγινε. Σημείωσα τον λογαριασμό «${b.name}» ${eur(b.amount)} ως πληρωμένο.`, action: { type: 'go', tab: 'finances' } }]);
      } else {
        const r = rentHits[0];
        await supabase.from('rent_payments').update({ paid: true, paid_date: today }).eq('id', r.id);
        setMsgs(m => [...m, { role: 'assistant', text: `Έγινε. Σημείωσα τη δόση «${r.label}» ${eur(r.amount)} ως πληρωμένη.`, action: { type: 'go', tab: 'tenant' } }]);
      }
      setCtxStr(''); loadContext();
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να το σημειώσω πληρωμένο τώρα. Δοκίμασε ξανά ή κάν’ το από την αντίστοιχη καρτέλα.' }]);
    }
  };

  // Εναλλαγή VIP σε υπάρχοντα πελάτη.
  const toggleVip = async (who: string) => {
    const c = findClient(who);
    if (!c) { setMsgs(m => [...m, { role: 'assistant', text: `Δεν βρήκα ξεκάθαρα ποιον πελάτη εννοείς με «${who}». Πες μου το ακριβές όνομα ή το τηλέφωνο, ή δες το πελατολόγιο.`, action: { type: 'go', tab: 'clients' } }]); return; }
    const next = !c.vip;
    try {
      await supabase.from('clients').update({ vip: next }).eq('id', c.id).eq('user_id', userId);
      c.vip = next; setClientsStr(''); loadContext();
      setMsgs(m => [...m, { role: 'assistant', text: next ? `Έγινε. Σήμανα τον/την «${c.name}» ως VIP. Θα εμφανίζεται στο φίλτρο VIP του πελατολογίου.` : `Έγινε. Αφαίρεσα το VIP από τον/την «${c.name}».`, action: { type: 'go', tab: 'clients' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να το αλλάξω τώρα. Δοκίμασε από το πελατολόγιο.', action: { type: 'go', tab: 'clients' } }]);
    }
  };

  // Δημιουργία/αντιγραφή συνδέσμου pre-check-in για πελάτη.
  const makeCheckinLink = async (who: string) => {
    const c = findClient(who);
    if (!c) { setMsgs(m => [...m, { role: 'assistant', text: `Δεν βρήκα ξεκάθαρα τον πελάτη «${who}». Πες μου ακριβές όνομα ή τηλέφωνο, ή άνοιξε το πελατολόγιο.`, action: { type: 'go', tab: 'clients' } }]); return; }
    try {
      const { data } = await supabase.from('checkin_links').upsert({ user_id: userId, client_id: c.id, property_id: propertyId, active: true }, { onConflict: 'user_id,client_id' }).select('token').maybeSingle();
      if (data?.token) {
        const url = `${window.location.origin}/checkin/${data.token}`;
        try { await navigator.clipboard.writeText(url); } catch { /* το εμφανίζουμε ούτως ή άλλως */ }
        setMsgs(m => [...m, { role: 'assistant', text: `Έτοιμο. Αντέγραψα τον σύνδεσμο check-in για τον/την «${c.name}». Στείλ' τον στον επισκέπτη σε WhatsApp ή Viber:\n${url}`, action: { type: 'go', tab: 'clients' } }]);
      } else throw new Error('no token');
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να φτιάξω τον σύνδεσμο τώρα. Δοκίμασε από την καρτέλα του πελάτη στο πελατολόγιο.', action: { type: 'go', tab: 'clients' } }]);
    }
  };

  // Προσθήκη επαφής (τεχνικός/πάροχος) στην καρτέλα Επαφές, με αυτόματο ρόλο.
  const registerContact = async (name: string, phone?: string, role?: string) => {
    const roleValue = inferRole(role || name);
    try {
      await supabase.from('contacts').insert({
        property_id: propertyId, user_id: userId,
        full_name: name.slice(0, 120), role: roleValue,
        phone: phone || null, email: null, notes: null,
      });
      setMsgs(m => [...m, { role: 'assistant', text: `Την κράτησα. Πρόσθεσα τον/την «${name}»${phone ? ` (${phone})` : ''} στις Επαφές του ακινήτου. Θέλεις να ανοίξω τις Επαφές για να προσθέσεις κι άλλα;`, action: { type: 'go', tab: 'contacts' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω την επαφή τώρα. Δοκίμασε ξανά ή πρόσθεσέ την από την καρτέλα Επαφές.' }]);
    }
  };

  // Καταχώρηση αντικειμένου στην Απογραφή (από τον βοηθό, με φωνή/κείμενο ή φωτο).
  const registerInventory = async (a: { name: string; category?: string; value?: number; brand?: string; model?: string; room?: string }) => {
    try {
      await supabase.from('inventory_items').insert({
        property_id: propertyId, user_id: userId,
        name: a.name.slice(0, 120), category: a.category || 'Λοιπά',
        brand: a.brand || null, model: a.model || null, room: a.room || null,
        purchase_value: a.value || 0, condition: 'Καλή',
      });
      setMsgs(m => [...m, { role: 'assistant', text: `Το κατέγραψα στην Απογραφή: «${a.name}»${a.value ? ` (αξία ${a.value}€)` : ''}. Θέλεις να ανοίξω την Απογραφή για να προσθέσεις φωτογραφία, εγγύηση ή άλλες λεπτομέρειες;`, action: { type: 'go', tab: 'inventory' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να το καταγράψω τώρα. Δοκίμασε από την καρτέλα Απογραφή.' }]);
    }
  };

  // Δημιουργία κουμπαρά/αποθεματικού στον Προϋπολογισμό (από τον βοηθό, με φωνή/κείμενο).
  // Συγχωνεύεται στη ρύθμιση bills_settings section 'vaults' — ίδιο μοντέλο με την καρτέλα.
  const createVault = async (a: { name: string; target: number; due?: string }) => {
    try {
      const { data: cur } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle();
      const existing = ((cur?.data as { vaults?: any[] } | null)?.vaults) || [];
      const nv = { id: `v_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`, name: a.name.slice(0, 60), target: a.target, current: 0, ...(a.due ? { due: a.due } : {}) };
      await supabase.from('bills_settings').upsert(
        { property_id: propertyId, user_id: userId, section: 'vaults', data: { vaults: [...existing, nv] } },
        { onConflict: 'property_id,section' },
      );
      const dueStr = a.due ? ` έως ${new Date(a.due).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}` : '';
      setMsgs(m => [...m, { role: 'assistant', text: `Τον έφτιαξα. Πρόσθεσα κουμπαρά «${nv.name}» με στόχο ${eur(a.target)}${dueStr} στον Προϋπολογισμό. Θα υπολογίζει πόσο να βάζεις κάθε μήνα. Θέλεις να τον δεις;`, action: { type: 'go', tab: 'finances' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να φτιάξω τον κουμπαρά τώρα. Δοκίμασε από τον Προϋπολογισμό.', action: { type: 'go', tab: 'finances' } }]);
    }
  };

  // Προσθήκη νέας εκκρεμότητας — με προθεσμία/κόστος/προτεραιότητα & αυτόματο κύκλωμα.
  const addTask = async (a: { description: string; category?: string; due_date?: string; est_cost?: number; priority?: string }) => {
    const d = a.description.slice(0, 200);
    const category = a.category || (/φόρο|ενφια|ε2|ε1|δήλωσ|ααδε|μισθωτήρι|ασφαλιστ/i.test(d) ? 'legal'
      : /υδραυλικ|ηλεκτρολ|επισκευ|συντήρησ|βλάβη|βαφ|καθαρι|μάστορ/i.test(d) ? 'maintenance'
      : /πληρωμ|λογαριασμ|δόση|κόστος/i.test(d) ? 'financial' : 'other');
    const priority = a.priority || 'normal';
    const due = a.due_date || null;
    const est = a.est_cost || 0;
    const today = new Date().toISOString().split('T')[0];
    try {
      const { data: ins } = await supabase.from('checklist_items').insert({
        property_id: propertyId, user_id: userId, description: d,
        category, priority, recurring: 'none', due_date: due,
        status: 'pending', completed: false, note: null,
        estimated_cost: est, actual_cost: 0, sort_order: 0,
      }).select('id').single();
      const newId = (ins as { id?: string } | null)?.id;
      // Κύκλωμα: ημερολόγιο (email υπενθύμιση) + εκκρεμής δαπάνη.
      let calId: string | null = null, expId: string | null = null;
      if (newId && due) { const { data } = await supabase.from('calendar_events').insert({ property_id: propertyId, user_id: userId, title: d, event_date: due, category: 'maintenance', amount: est, priority: priority === 'normal' ? 'medium' : priority, status: 'pending', recurring: false, source: 'checklist' }).select('id').single(); calId = (data as { id?: string } | null)?.id || null; }
      if (newId && est > 0) { const { data } = await supabase.from('expenses').insert({ property_id: propertyId, user_id: userId, description: d, amount: est, category: 'Συντήρηση & Επισκευές', expense_group: 'maintenance', date: due || today, paid_by: 'owner', paid: false, notes: 'Προγραμματισμένη εκκρεμότητα' }).select('id').single(); expId = (data as { id?: string } | null)?.id || null; }
      if (newId && (calId || expId)) await supabase.from('checklist_items').update({ calendar_event_id: calId, expense_id: expId }).eq('id', newId);
      const bits: string[] = [];
      if (due) bits.push('προθεσμία + υπενθύμιση email');
      if (est > 0) bits.push(`~${est}€ στον προϋπολογισμό`);
      setMsgs(m => [...m, { role: 'assistant', text: `Το πρόσθεσα στις Εκκρεμότητες: «${d}»${bits.length ? ` — ${bits.join(', ')}` : ''}. Θέλεις να το δεις;`, action: { type: 'go', tab: 'checklist' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να προσθέσω την εκκρεμότητα τώρα. Δοκίμασε από την καρτέλα Εκκρεμότητες.' }]);
    }
  };

  // Καταχώρηση νέου πελάτη στο Πελατολόγιο (από τον βοηθό, με φωνή ή κείμενο).
  const registerClient = async (a: { name: string; phone?: string; afm?: string; ctype?: string }) => {
    const raw = (a.ctype || '').toLowerCase();
    const ctype: ClientType = /owner|ιδιοκτ/.test(raw) ? 'owner' : /client|πελατ/.test(raw) ? 'client' : 'lead';
    try {
      await supabase.from('clients').insert({
        user_id: userId, full_name: a.name, type: ctype,
        phone: a.phone || null, afm: a.afm || null, stage: 'lead',
      });
      setClientsStr('');
      loadContext();
      setMsgs(m => [...m, { role: 'assistant', text: `Τον καταχώρησα. Πρόσθεσα τον/την «${a.name}»${a.phone ? ` (${a.phone})` : ''} στο Πελατολόγιο ως ${CLIENT_TYPE_LABELS[ctype]}. Θέλεις να ανοίξω την καρτέλα για να συμπληρώσεις κι άλλα στοιχεία;`, action: { type: 'go', tab: 'clients' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω τον πελάτη τώρα. Δοκίμασε ξανά ή πρόσθεσέ τον από την καρτέλα Πελατολόγιο.' }]);
    }
  };

  // Κράτηση ραντεβού: γράφει γεγονός στο Ημερολόγιο. Η υπάρχουσα ροή υπενθυμίσεων
  // (send-reminders) στέλνει email 3 & 1 ημέρα πριν, αν ο χρήστης έχει ενεργές ειδοποιήσεις.
  const bookAppointment = async (title: string, date: string, time?: string) => {
    // Κατηγορία από τον τίτλο (ώστε π.χ. «check κλιματιστικό» να πάει σε Συντήρηση, όχι Οικονομικά).
    const t = (title || '').toLowerCase();
    const category = /service|συντήρησ|καθαρισ|κλιματ|κλίμα|clima|air ?cond|λέβητ|καυστήρ|θερμοσίφ|βλάβ|επισκευ|υδραυλ|ηλεκτρολ|ψυκτ|μάστορ|συνεργ|έλεγχ|check/.test(t) ? 'maintenance'
      : /τράπεζ|δάνει|χρηματοδ|λογιστ|φορο|ενφια|εφορ|πληρωμ|είσπραξ/.test(t) ? 'financial'
      : /ενοικιαστ|μισθωτ|tenant|συμβόλαι|μίσθωσ/.test(t) ? 'tenant'
      : 'reminder';
    try {
      // Αποφυγή διπλοεγγραφής: ίδιο ακίνητο + τίτλος + ημερομηνία υπάρχει ήδη.
      const { data: dup } = await supabase.from('calendar_events').select('id').eq('property_id', propertyId).eq('event_date', date).eq('title', title).limit(1);
      if (dup && dup.length) {
        setMsgs(m => [...m, { role: 'assistant', text: `Υπάρχει ήδη «${title}» για εκείνη την ημερομηνία στο Ημερολόγιο, δεν το ξαναπρόσθεσα. Θέλεις να το δεις;`, action: { type: 'go', tab: 'calendar' } }]);
        return;
      }
      await supabase.from('calendar_events').insert({
        property_id: propertyId, user_id: userId, title, category,
        event_date: date, event_time: time || null, duration_minutes: time ? 60 : null,
        priority: 'high', status: 'pending', source: 'assistant',
        notes: 'Ραντεβού που προγραμμάτισε ο βοηθός. Θα σταλεί υπενθύμιση πριν λήξει (email, εφόσον είναι ενεργές οι ειδοποιήσεις· με ένα άγγιγμα και σε Viber/WhatsApp).',
      });
      const whenStr = `${new Date(date).toLocaleDateString('el-GR')}${time ? ` στις ${time}` : ''}`;
      setMsgs(m => [...m, { role: 'assistant', text: `Το έκλεισα. Πρόσθεσα το «${title}» για ${whenStr} στο Ημερολόγιο και θα σου θυμίσω πριν λήξει. Θέλεις να ανοίξω το Ημερολόγιο;`, action: { type: 'go', tab: 'calendar' } }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να αποθηκεύσω το ραντεβού τώρα. Δοκίμασε ξανά ή πρόσθεσέ το χειροκίνητα στο Ημερολόγιο.' }]);
    }
  };

  // ── Φωνή: ομιλία στα ελληνικά (hands-free) ─────────────────────────────────
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  const recRef = useRef<any>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const handsFreeRef = useRef(false);
  const supportsSTT = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  useEffect(() => {
    if (!supportsTTS) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load(); window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  }, [supportsTTS]);

  const pickVoice = (): SpeechSynthesisVoice | null => {
    const el = voicesRef.current.filter(v => v.lang && v.lang.toLowerCase().startsWith('el'));
    if (!el.length) return null;
    const find = (re: RegExp) => el.find(v => re.test(v.name));
    if (identity.gender === 'female') return find(/female|woman|γυναι|Melina|Maria/i) || el[0];
    if (identity.gender === 'male') return find(/male|man|άνδρ|ανδρ|Nicolas|Stefanos|Giorgos/i) || el[0];
    return find(/Google/i) || el[0];
  };

  const speak = (text: string, after?: () => void) => {
    const spoken = cleanForSpeech(text);
    if (!supportsTTS || !spoken) { after?.(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      const v = pickVoice(); if (v) u.voice = v;
      u.lang = 'el-GR'; u.rate = 1.0; u.pitch = identity.gender === 'female' ? 1.06 : identity.gender === 'male' ? 0.94 : 1.0;
      u.onstart = () => setSpeaking(true);
      u.onend = () => { setSpeaking(false); after?.(); };
      u.onerror = () => { setSpeaking(false); after?.(); };
      window.speechSynthesis.speak(u);
    } catch { after?.(); }
  };
  const stopSpeaking = () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } setSpeaking(false); };

  const stopListening = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); };
  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    stopSpeaking();
    const rec = new SR();
    rec.lang = 'el-GR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr; else interim += tr;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = (ev: any) => { setListening(false); if ((ev?.error || '') === 'not-allowed' || (ev?.error || '') === 'service-not-allowed') { setHandsFree(false); handsFreeRef.current = false; } };
    rec.onend = () => {
      setListening(false);
      const t = finalText.trim();
      if (t) { setInput(''); ask(t, true); }
      // Hands-free: αν δεν πιάστηκε ομιλία (παύση/θόρυβος), ξανάνοιξε το μικρόφωνο
      // ώστε ο κύκλος να μη «σπάει». Δεν ξεκινά αν μιλάει ο βοηθός ή ήδη ακούει.
      else if (handsFreeRef.current) setTimeout(() => { if (handsFreeRef.current && !listeningRef.current && !(supportsTTS && window.speechSynthesis.speaking)) startListening(); }, 500);
    };
    recRef.current = rec; setInput(''); setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  const toggleMic = () => { if (listening) stopListening(); else { setOpen(true); startListening(); } };

  const ask = async (question: string, viaVoice = false) => {
    const q = question.trim();
    if (!q || busy) return;
    setErr(''); setInput('');
    const history = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(history); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const system = buildSystemPrompt(identity, ctxStr || 'Τα δεδομένα φορτώνονται.', allPropsContext, {
        insights: insightsStr || undefined,
        market: marketStr || undefined,
        clients: clientsStr || undefined,
        contactsPro: techStr || undefined,
        pricing: pricingStr || undefined,
        memories: identity.memory ? memories.map(m => m.text) : undefined,
        today: new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      });
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ max_tokens: 900, system, messages: history.map(m => ({ role: m.role, content: m.text })) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key' : 'service'); setMsgs(m => m.slice(0, -1)); return; }
      const raw: string = data?.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Δεν έχω απάντηση αυτή τη στιγμή.';
      const { clean, action, remember } = parseAction(raw);
      // Μόνιμη μνήμη: κράτησε το γεγονός που ζήτησε ο βοηθός (μόνο αν το επιτρέπει η ρύθμιση).
      if (remember && identity.memory) setMemories(addMemory(userId, remember));
      // Η «επικοινωνία με επαφή» δεν εμφανίζεται ως κουμπί στο πρώτο μήνυμα· την
      // «εκτελούμε» αμέσως (ανάλυση επαφής) ώστε να προκύψει είτε κουμπί-σύνδεσμος
      // που ανοίγει το μέσο με ένα άγγιγμα, είτε ερώτηση/εναλλακτική αν λείπει κάτι.
      const isReach = action?.type === 'reach';
      setMsgs(m => [...m, { role: 'assistant', text: clean, action: isReach ? undefined : action }]);
      if (isReach) runAction(action, true);
      // Φωνητική απάντηση + εκτέλεση ενέργειας / συνέχιση συνομιλίας.
      if (viaVoice || handsFreeRef.current) {
        speak(clean, () => {
          if (action && !isReach) runAction(action, true);
          if (handsFreeRef.current) setTimeout(() => startListening(), 350);
        });
      }
    } catch { setErr('service'); setMsgs(m => m.slice(0, -1)); }
    finally { setBusy(false); }
  };

  // Αναγνώριση αντικειμένου από ΦΩΤΟΓΡΑΦΙΑ (συσκευασία/ετικέτα/booklet/απόδειξη) →
  // προτείνει καταχώρηση στην Απογραφή με ένα άγγιγμα. Vision, με χρονικό όριο.
  const askImage = async (file: File) => {
    if (!file.type.startsWith('image/') || busy) return;
    if (file.size > 10 * 1024 * 1024) { setMsgs(m => [...m, { role: 'assistant', text: 'Η φωτογραφία είναι πολύ μεγάλη (>10MB). Δοκίμασε μικρότερη.' }]); return; }
    setErr('');
    setMsgs(m => [...m, { role: 'user', text: 'Φωτογραφία αντικειμένου' }]);
    setBusy(true);
    try {
      const b64: string | null = await new Promise(res => { const r = new FileReader(); r.onload = () => res((r.result as string).split(',')[1] || null); r.onerror = () => res(null); r.readAsDataURL(file); });
      if (!b64) { setBusy(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch('/api/anthropic', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, system: IMG_ITEM_SCAN_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: b64 } }, { type: 'text', text: 'Διάβασε το αντικείμενο/συσκευή από τη φωτογραφία.' }] }] }),
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok || data?.error) { setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να διαβάσω τη φωτογραφία τώρα. Δοκίμασε ξανά ή πες μου τα στοιχεία.' }]); setBusy(false); return; }
      const txt: string = data?.content?.find((c: { type: string }) => c.type === 'text')?.text || '{}';
      let d: Record<string, string> = {};
      try { d = JSON.parse(txt.replace(/```json?|```/g, '').trim()); } catch { /* ignore */ }
      const CATS = ['Έπιπλα', 'Ηλεκτρικές Συσκευές', 'Ηλεκτρονικά', 'Υδραυλικά', 'Θέρμανση & Ψύξη', 'Φωτιστικά', 'Διακόσμηση', 'Λοιπά'];
      const name = (d.name || [d.brand, d.model].filter(Boolean).join(' ') || '').slice(0, 120);
      if (!name) { setMsgs(m => [...m, { role: 'assistant', text: 'Δεν κατάλαβα καθαρά το αντικείμενο. Δοκίμασε πιο κοντινή/καθαρή λήψη ή πες μου τι είναι.' }]); setBusy(false); return; }
      const val = d.price ? Math.round(parseFloat(String(d.price).replace(/[^\d.]/g, '')) || 0) : 0;
      const category = d.category && CATS.includes(d.category) ? d.category : undefined;
      const action = { type: 'inventory' as const, name, category, value: val > 0 ? val : undefined, brand: d.brand || undefined, model: d.model || undefined };
      const bits = [d.brand, d.model && `μοντ. ${d.model}`, val > 0 && `~${val}€`, category].filter(Boolean).join(' · ');
      setMsgs(m => [...m, { role: 'assistant', text: `Διάβασα: ${name}${bits ? ` (${bits})` : ''}. Να το καταγράψω στην Απογραφή;`, action }]);
    } catch { setMsgs(m => [...m, { role: 'assistant', text: 'Δεν μπόρεσα να διαβάσω τη φωτογραφία τώρα. Δοκίμασε ξανά.' }]); }
    finally { setBusy(false); }
  };

  const initial = (identity.name || 'A').trim().charAt(0).toUpperCase();
  const greeting = hasIdentity
    ? (identity.formal
        ? `Γεια σας! Είμαι ${identity.name}. Ρωτήστε με οτιδήποτε για ${propContext.name} ή για ακίνητα γενικά.`
        : `Γεια σου! Είμαι ${identity.name}. Ρώτησέ με οτιδήποτε για ${propContext.name} ή για ακίνητα γενικά.`)
    : `Γεια σου! Θα είμαι ο βοηθός σου. Πρώτα, πες μου πώς να με λες.`;
  const askVerb = identity.formal ? 'Ρωτήστε' : 'Ρώτησε';

  // Χρωματική ταυτότητα avatar ανά φύλο (διακριτικά).
  const avatarBg = identity.gender === 'female' ? 'linear-gradient(135deg,#ec4899,#f9a8d4)'
    : identity.gender === 'male' ? 'linear-gradient(135deg,var(--accent),#8ab4f8)'
    : 'linear-gradient(135deg,#8b5cf6,#22d3ee)';

  // ── Μετακίνηση του βοηθού (σύρσιμο) ώστε να μην εμποδίζει το περιεχόμενο ──
  const FAB = 60;
  const fabDrag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  useEffect(() => {
    try { const s = localStorage.getItem('pa_fab_pos'); if (s) setFabPos(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!fabPos || dragging) return;
    try { localStorage.setItem('pa_fab_pos', JSON.stringify(fabPos)); } catch { /* ignore */ }
  }, [fabPos, dragging]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = fabDrag.current; if (!d) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true; if (!dragging) setDragging(true);
      e.preventDefault();
      const m = 8;
      const x = Math.max(m, Math.min(d.ox + dx, window.innerWidth - FAB - m));
      const y = Math.max(m, Math.min(d.oy + dy, window.innerHeight - FAB - m));
      setFabPos({ x, y });
    };
    const up = () => {
      const d = fabDrag.current; fabDrag.current = null;
      if (d?.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 80); }
      setDragging(false);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);
  const startFabDrag = (e: React.PointerEvent) => {
    if (e.button && e.button !== 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    fabDrag.current = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
  };
  const fabToggle = (next: boolean) => () => { if (justDragged.current) return; setOpen(next); };
  const fabFixed: React.CSSProperties = fabPos ? { left: fabPos.x, top: fabPos.y, right: 'auto', bottom: 'auto' } : {};
  // Θέση πάνελ: αν ο βοηθός έχει μετακινηθεί, το πάνελ ανοίγει κοντά του (πάνω ή κάτω, με clamp).
  const panelFixed: React.CSSProperties = (() => {
    if (!fabPos || typeof window === 'undefined') return {};
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = Math.min(390, vw - 32), ph = Math.min(600, vh - 130);
    let top = fabPos.y - ph - 10;
    if (top < 12) top = Math.min(fabPos.y + FAB + 10, vh - ph - 12);
    let left = fabPos.x + FAB - pw;
    left = Math.max(12, Math.min(left, vw - pw - 12));
    return { left, top, right: 'auto', bottom: 'auto' };
  })();

  return (
    <>
      {/* FAB, ορατό σε κάθε καρτέλα */}
      {!open && (
        <div className="pa-fab-wrap" style={fabFixed}>
          {!fabPos && <span className="pa-fab-label">{askVerb} τον/την {identity.name}</span>}
          <button className="pa-fab" onPointerDown={startFabDrag} onClick={fabToggle(true)} aria-label={`Βοηθός: ${identity.name} (σύρετε για μετακίνηση)`} title="Σύρετε για μετακίνηση"
            style={{ background: avatarBg, cursor: dragging ? 'grabbing' : 'pointer' }}>
            <span className="pa-fab-initial">{initial}</span>
            <span className="pa-fab-spark" aria-hidden>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
            </span>
            {(listening || speaking) && <span className="pa-fab-live" style={{ background: listening ? 'var(--negative)' : 'var(--accent)' }} />}
          </button>
        </div>
      )}
      {open && (
        <button className="pa-fab" onPointerDown={startFabDrag} onClick={fabToggle(false)} aria-label="Κλείσιμο" title="Σύρετε για μετακίνηση" style={{ background: avatarBg, ...fabFixed, cursor: dragging ? 'grabbing' : 'pointer' }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}

      {open && (
        <div className="pa-panel" style={panelFixed}>
          {/* Κεφαλίδα */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: T.font.sans, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{identity.name}</div>
              <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-secondary)' }}>Ο βοηθός σου για τα ακίνητα</div>
            </div>
            {(supportsSTT || supportsTTS) && (
              <button onClick={() => { const next = !handsFree; setHandsFree(next); if (next && supportsSTT) { setOpen(true); startListening(); } else { stopListening(); stopSpeaking(); } }}
                title={handsFree ? 'Κλείσε τη λειτουργία φωνής' : 'Λειτουργία φωνής (μίλα ελεύθερα)'} aria-label="Λειτουργία φωνής"
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: handsFree ? 'var(--accent)' : 'transparent', color: handsFree ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 18 0" /><path d="M21 12v3a2 2 0 0 1-2 2h-1v-5h3z" /><path d="M3 12v3a2 2 0 0 0 2 2h1v-5H3z" /></svg>
              </button>
            )}
            <button onClick={() => setEditing(e => !e)} title="Προσάρμοσε τον βοηθό" aria-label="Ρυθμίσεις βοηθού"
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: editing ? 'var(--accent-dim)' : 'transparent', color: editing ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          </div>
          {(listening || speaking) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-dim)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: listening ? 'var(--negative)' : 'var(--accent)', animation: 'pa-pulse 1.1s infinite' }} />
              <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{listening ? 'Ακούω…' : `${identity.name} μιλάει…`}</span>
              {speaking && <button onClick={stopSpeaking} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700 }}>Σταμάτα</button>}
            </div>
          )}

          {/* Επεξεργασία ταυτότητας */}
          {(editing || !hasIdentity) ? (
            <IdentityEditor
              draft={identity}
              hasMemory={msgs.length > 0 || loadHistory(propertyId).length > 0}
              facts={memories}
              onForgetFact={(id) => setMemories(removeMemory(userId, id))}
              onForgetAllFacts={() => { clearMemories(userId); setMemories([]); }}
              onCancel={hasIdentity ? () => setEditing(false) : undefined}
              onClearMemory={() => { clearHistory(propertyId); setMsgs([]); }}
              onSave={(id) => {
                // Αν έκλεισε τη μνήμη, σβήσε ό,τι έχει αποθηκευτεί (σεβασμός στην επιλογή).
                if (identity.memory && !id.memory) { clearHistory(propertyId); clearMemories(userId); setMemories([]); }
                setIdentity(id); saveIdentity(id); setHasIdentity(true); setEditing(false);
              }}
            />
          ) : (
            <>
              {/* Σώμα */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                {msgs.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ maxWidth: '90%', padding: '11px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>{greeting}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {SUGGESTED.map(s => (
                        <button key={s} onClick={() => ask(s)} style={{ fontFamily: T.font.sans, fontSize: 12, padding: '7px 12px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                    <div style={{ maxWidth: '90%', padding: '11px 14px', borderRadius: 14, fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)', color: m.role === 'user' ? 'var(--accent-text)' : 'var(--text-primary)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border-subtle)', borderBottomRightRadius: m.role === 'user' ? 4 : 14, borderBottomLeftRadius: m.role === 'user' ? 14 : 4 }}>{m.text}</div>
                    {m.action && (m.action.type === 'reach' ? (() => {
                      // Κουμπί/σύνδεσμος επικοινωνίας: ανοίγει το μέσο ΜΟΝΟ με το άγγιγμα
                      // του χρήστη (ποτέ αυτόματα). Για tel:/mailto: ρεαλιστικό <a>, για
                      // WhatsApp/Viber άνοιγμα σε νέα καρτέλα.
                      const ract = m.action;
                      const c = findContact(ract.name);
                      const link = c ? buildReachLink(c, ract.channel, ract.text) : null;
                      if (!link?.url) return null;
                      const style = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' } as const;
                      const inner = (<>{reachLabel(ract.channel, ract.name)}<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>);
                      return (ract.channel === 'call' || ract.channel === 'email')
                        ? <a href={link.url} style={style}>{inner}</a>
                        : <button onClick={() => window.open(link.url!, '_blank')} style={style}>{inner}</button>;
                    })() : (
                      <button onClick={() => runAction(m.action)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {m.action.type === 'scan' ? 'Σκάναρε έγγραφο'
                          : m.action.type === 'book' ? `Κλείσε ραντεβού: ${new Date(m.action.date).toLocaleDateString('el-GR')}`
                          : m.action.type === 'client' ? `Καταχώρησε: ${m.action.name}`
                          : m.action.type === 'expense' ? `Κατέγραψε δαπάνη: ${eur(m.action.amount)}`
                          : m.action.type === 'vip' ? `Σήμανε VIP: ${m.action.who}`
                          : m.action.type === 'checkin' ? `Σύνδεσμος check-in: ${m.action.who}`
                          : m.action.type === 'contact' ? `Πρόσθεσε επαφή: ${m.action.name}`
                          : m.action.type === 'paid' ? `Σήμανση πληρωμένο: ${m.action.description}`
                          : m.action.type === 'task' ? `Νέα εκκρεμότητα`
                          : m.action.type === 'inventory' ? `Κατέγραψε: ${m.action.name}`
                          : m.action.type === 'vault' ? `Φτιάξε κουμπαρά: ${m.action.name}`
                          : `Πήγαινε: ${navLabel(m.action.tab)}`}
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </button>
                    ))}
                  </div>
                ))}
                {busy && <div style={{ display: 'flex', gap: 5, padding: '4px 2px' }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', animation: `pa-bounce 1s ${i * 0.15}s infinite ease-in-out` }} />)}</div>}
                {err && (
                  <div style={{ background: err === 'key' ? 'var(--bg-elevated)' : 'var(--warning-soft)', border: `1px solid ${err === 'key' ? 'var(--border-subtle)' : 'var(--warning-border)'}`, borderRadius: T.radius.inner, padding: '10px 13px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {err === 'key' ? `Ο ${identity.name} χρειάζεται ενεργό κλειδί AI για να απαντήσει. Μόλις ενεργοποιηθεί, θα μιλάει ζωντανά για το ακίνητό σου.` : 'Δεν μπόρεσα να απαντήσω τώρα, δοκίμασε ξανά σε λίγο.'}
                  </div>
                )}
              </div>

              {/* Είσοδος */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <input ref={imgRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) askImage(f); e.currentTarget.value = ''; }} />
                <button onClick={() => { if (!busy) imgRef.current?.click(); }} disabled={busy} aria-label="Φωτογραφία αντικειμένου" title="Φωτογράφισε ένα αντικείμενο για καταγραφή στην Απογραφή"
                  style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" /><circle cx="12" cy="13" r="3.2" /></svg>
                </button>
                {supportsSTT && (
                  <button onClick={toggleMic} disabled={busy} aria-label={listening ? 'Σταμάτα' : 'Μίλα'} title={listening ? 'Σταμάτα' : 'Μίλα στα ελληνικά'}
                    style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: listening ? 'var(--negative)' : 'var(--bg-elevated)', color: listening ? '#fff' : 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: listening ? 'pa-pulse 1.1s infinite' : 'none' }}>
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                  </button>
                )}
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(input); }} placeholder={listening ? 'Ακούω…' : `${askVerb} τον/την ${identity.name}…`} disabled={busy}
                  style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '10px 15px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                <button onClick={() => ask(input)} disabled={busy || !input.trim()} aria-label="Αποστολή"
                  style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() && !busy ? 'var(--accent)' : 'var(--bg-elevated)', color: input.trim() && !busy ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: input.trim() && !busy ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes pa-bounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}
        @keyframes pa-pulse{0%,100%{box-shadow:0 0 0 0 rgba(234,67,53,.4)}50%{box-shadow:0 0 0 6px rgba(234,67,53,0)}}
        .pa-fab-wrap{position:fixed;right:24px;bottom:24px;z-index:1200;display:flex;align-items:center;gap:10px}
        .pa-fab-label{background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:100px;padding:8px 14px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;white-space:nowrap;box-shadow:0 4px 14px rgba(60,64,67,.18);opacity:0;transform:translateX(8px);transition:opacity .18s,transform .18s;pointer-events:none}
        .pa-fab-wrap:hover .pa-fab-label{opacity:1;transform:translateX(0)}
        .pa-fab{position:fixed;right:24px;bottom:24px;width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(26,115,232,.42),0 2px 8px rgba(60,64,67,.28);z-index:1201;transition:transform .14s cubic-bezier(.2,0,0,1),box-shadow .2s}
        .pa-fab-wrap .pa-fab{position:relative;right:auto;bottom:auto}
        .pa-fab:hover{transform:scale(1.07);box-shadow:0 8px 26px rgba(26,115,232,.5),0 3px 10px rgba(60,64,67,.3)}
        .pa-fab:active{transform:scale(.95)}
        .pa-fab-initial{color:#fff;font-family:'Inter',sans-serif;font-weight:700;font-size:24px;line-height:1;letter-spacing:.5px}
        .pa-fab-spark{position:absolute;top:-2px;right:-2px;width:20px;height:20px;border-radius:50%;background:#fff;color:var(--accent);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2)}
        .pa-fab-live{position:absolute;bottom:2px;right:2px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg-base);animation:pa-pulse 1.1s infinite}
        .pa-panel{position:fixed;right:24px;bottom:92px;width:390px;max-width:calc(100vw - 32px);height:min(600px,calc(100vh - 130px));background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.24);z-index:1200;display:flex;flex-direction:column;overflow:hidden}
        @media (max-width:600px){
          .pa-fab-wrap{bottom:82px;right:16px}
          .pa-fab-label{display:none}
          .pa-fab{bottom:82px;right:16px}
          .pa-panel{right:8px;left:8px;bottom:78px;width:auto;max-width:none;height:min(560px,calc(100vh - 100px))}
        }
      `}</style>
    </>
  );
}

// ── Διακόπτης (toggle) ──────────────────────────────────────────────────────
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={on}
      style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'var(--accent)' : 'var(--border-default)', position: 'relative', transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );
}

// ── Επεξεργαστής ταυτότητας (όνομα + φύλο + μνήμη + σύγκριση) ────────────────
function IdentityEditor({ draft, onSave, onCancel, onClearMemory, hasMemory, facts, onForgetFact, onForgetAllFacts }: { draft: AssistantIdentity; onSave: (id: AssistantIdentity) => void; onCancel?: () => void; onClearMemory: () => void; hasMemory: boolean; facts: Memory[]; onForgetFact: (id: string) => void; onForgetAllFacts: () => void }) {
  const [gender, setGender] = useState<Gender>(draft.gender);
  const [name, setName] = useState(draft.name);
  const [memory, setMemory] = useState(draft.memory);
  const [compare, setCompare] = useState(draft.compare);
  const [formal, setFormal] = useState(draft.formal);
  const suggestions = NAME_SUGGESTIONS[gender];
  const row = { display: 'flex', alignItems: 'center', gap: 12 } as const;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Φτιάξε τον βοηθό σου</div>
        <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Διάλεξε πώς θέλεις να είναι. Μπορείς να το αλλάξεις όποτε θες.</div>
      </div>

      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Φύλο / ταυτότητα</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {GENDER_OPTIONS.map(g => {
            const active = gender === g.value;
            return (
              <button key={g.value} onClick={() => setGender(g.value)}
                style={{ display: 'inline-flex', alignItems: 'center', fontFamily: T.font.sans, fontSize: 12, fontWeight: active ? 700 : 500, padding: '8px 14px', borderRadius: T.radius.pill, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, fontFamily: T.font.sans }}>Πώς θέλεις να σου μιλάει;</div>
        <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4, marginBottom: 8 }}>Στον ενικό για πιο φιλική κουβέντα ή στον πληθυντικό για πιο επίσημο ύφος.</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {ADDRESS_OPTIONS.map(a => {
            const active = formal === a.value;
            return (
              <button key={String(a.value)} onClick={() => setFormal(a.value)}
                style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontFamily: T.font.sans, fontSize: 12, fontWeight: active ? 700 : 500, padding: '8px 14px', borderRadius: T.radius.pill, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {a.label}<span style={{ fontSize: 10, fontWeight: 500, opacity: 0.8 }}>{a.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Όνομα</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Γράψε ένα όνομα…" maxLength={24}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 13px', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', marginBottom: 10 }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setName(s)}
              style={{ fontFamily: T.font.sans, fontSize: 12, padding: '6px 11px', borderRadius: T.radius.pill, cursor: 'pointer', border: `1px solid ${name === s ? 'var(--accent)' : 'var(--border-subtle)'}`, background: name === s ? 'var(--accent-dim)' : 'transparent', color: name === s ? 'var(--accent)' : 'var(--text-secondary)' }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Μνήμη & σύγκριση */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Να θυμάται τις συζητήσεις</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>Συνεχίζει από εκεί που μείνατε, ανά ακίνητο. Μένει μόνο στη συσκευή σου.</div>
          </div>
          <Switch on={memory} onToggle={() => setMemory(v => !v)} />
        </div>
        {memory && hasMemory && (
          <button onClick={onClearMemory} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--negative)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 600 }}>Σβήσε τη μνήμη αυτού του ακινήτου</button>
        )}
        {memory && facts.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>Τι θυμάται για σένα</div>
              <button onClick={onForgetAllFacts} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 11, fontWeight: 600 }}>Ξέχασέ τα όλα</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {facts.map(f => (
                <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '5px 6px 5px 11px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-primary)', maxWidth: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{f.text}</span>
                  <button onClick={() => onForgetFact(f.id)} aria-label="Ξέχασέ το" title="Ξέχασέ το" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, flexShrink: 0, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Σύγκριση μεταξύ ακινήτων</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>Να βλέπει και τα άλλα σου ακίνητα για συγκρίσεις (ποιο αποδίδει καλύτερα).</div>
          </div>
          <Switch on={compare} onToggle={() => setCompare(v => !v)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {onCancel && <button onClick={onCancel} style={{ flex: '0 0 auto', height: 42, padding: '0 18px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Άκυρο</button>}
        <button onClick={() => onSave({ name: name.trim() || DEFAULT_IDENTITY.name, gender, memory, compare, formal })} style={{ flex: 1, height: 42, borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Αποθήκευση</button>
      </div>
    </div>
  );
}
