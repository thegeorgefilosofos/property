'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TextInput, DatePicker, CustomSelect } from './UIComponents';
import { T, fe } from '@/components/Theme';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });

type Severity = 'critical' | 'warning' | 'info' | 'tip';

interface Notification {
  id:        string;
  title:     string;
  body:      string;
  cta?:      string;
  ctaTab?:   string;
  severity:  Severity;
  amount?:   number;
  date:      string;
  manual?:   boolean; // user-created reminder
}

interface ManualReminder {
  id:       string;
  title:    string;
  body:     string;
  dueDate:  string;
  severity: Severity;
  audience: 'owner' | 'tenant' | 'both';
  repeat:   'none' | 'monthly' | 'yearly';
  createdAt: string;
}

const SEV: Record<Severity, { bg: string; border: string; dot: string; text: string; label: string }> = {
  critical: { bg: 'rgba(197,34,31,0.06)',  border: 'rgba(197,34,31,0.2)',   dot: 'var(--negative)', text: 'var(--negative)', label: 'Επείγον'    },
  warning:  { bg: 'rgba(242,153,0,0.05)',  border: 'rgba(242,153,0,0.2)',   dot: 'var(--warning)',  text: 'var(--warning)',  label: 'Προσοχή'    },
  info:     { bg: 'rgba(26,115,232,0.04)', border: 'rgba(26,115,232,0.15)', dot: 'var(--info)',     text: 'var(--info)',     label: 'Πληροφορία' },
  tip:      { bg: 'rgba(52,168,83,0.04)',  border: 'rgba(52,168,83,0.15)',  dot: 'var(--positive)', text: 'var(--positive)', label: 'Συμβουλή'   },
};

const AUDIENCE_OPTIONS = [
  { value: 'owner',  label: 'Ιδιοκτήτης'          },
  { value: 'tenant', label: 'Ενοικιαστής'           },
  { value: 'both',   label: 'Ιδιοκτήτης & Ενοικιαστής' },
];
const REPEAT_OPTIONS = [
  { value: 'none',    label: 'Μόνο μία φορά'  },
  { value: 'monthly', label: 'Κάθε μήνα'      },
  { value: 'yearly',  label: 'Κάθε χρόνο'     },
];
const SEV_OPTIONS = [
  { value: 'critical', label: 'Επείγον'    },
  { value: 'warning',  label: 'Προσοχή'   },
  { value: 'info',     label: 'Πληροφορία'},
  { value: 'tip',      label: 'Συμβουλή'  },
];

const ENFIA_2026 = [
  { date: '2026-05-31', label: '1η Δόση' }, { date: '2026-06-30', label: '2η Δόση' },
  { date: '2026-07-31', label: '3η Δόση' }, { date: '2026-08-31', label: '4η Δόση' },
  { date: '2026-09-30', label: '5η Δόση' }, { date: '2026-10-30', label: '6η Δόση' },
];

interface Props { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void; onCountChange?: (count: number) => void; }

export default function BillsNotifications({ propertyId, userId = '', onNavigateTab, onCountChange }: Props) {
  const supabase = createClient();

  const [notifs,      setNotifs]      = useState<Notification[]>([]);
  const [manualList,  setManualList]  = useState<ManualReminder[]>([]);
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(true);
  const [filter,      setFilter]      = useState<Severity | 'all'>('all');
  const [showCreate,  setShowCreate]  = useState(false);

  // New reminder form
  const [newTitle,    setNewTitle]    = useState('');
  const [newBody,     setNewBody]     = useState('');
  const [newDueDate,  setNewDueDate]  = useState('');
  const [newSeverity, setNewSeverity] = useState<string>('info');
  const [newAudience, setNewAudience] = useState('owner');
  const [newRepeat,   setNewRepeat]   = useState('none');
  const [saving,      setSaving]      = useState(false);

  // Load manual reminders from Supabase
  const loadManual = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('bills_settings')
        .select('data')
        .eq('property_id', propertyId)
        .eq('section', 'reminders')
        .maybeSingle();
      if (data?.data) setManualList((data.data as any).items || []);
    } catch (_) {}
  }, [propertyId]);

  // Build auto-notifications from real data
  const buildNotifications = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const today    = new Date();
      const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000);
      const daysAgo   = (d: string) => Math.ceil((today.getTime() - new Date(d).getTime()) / 86400000);

      const [billsRes, settingsRes, expensesRes] = await Promise.all([
        supabase.from('bills').select('*').eq('property_id', propertyId).order('due_date'),
        supabase.from('bills_settings').select('section,data').eq('property_id', propertyId),
        supabase.from('expenses').select('amount,date,category').eq('property_id', propertyId)
          .gte('date', new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]),
      ]);

      const bills    = billsRes.data    || [];
      const setts    = settingsRes.data || [];
      const expenses = expensesRes.data || [];
      const getSett  = (s: string) => setts.find(x => x.section === s)?.data as Record<string, unknown> | undefined;
      const prov     = getSett('providers');
      const ins      = getSett('insurance');
      const elec     = getSett('electricity');
      const svc      = getSett('services');
      const budgets  = getSett('budgets');

      const result: Notification[] = [];

      // ── 1. Overdue bills ────────────────────────────────────────────────────
      const overdue = bills.filter(b => !b.paid && b.due_date && daysAgo(b.due_date) > 0);
      if (overdue.length > 0) {
        const total = overdue.reduce((s, b) => s + (b.amount || 0), 0);
        result.push({
          id: `overdue_${overdue.length}_${total}`,
          title: `${overdue.length} ${overdue.length === 1 ? 'ληξιπρόθεσμος λογαριασμός' : 'ληξιπρόθεσμοι λογαριασμοί'}`,
          body: overdue.slice(0, 3).map(b => `${b.name || b.category} — ${fe(b.amount)}, έληξε ${fmtDate(b.due_date)}`).join(' · ') + (overdue.length > 3 ? ` και ${overdue.length - 3} ακόμη.` : ''),
          cta: 'Επισκόπηση', ctaTab: 'dashboard',
          severity: 'critical', amount: total, date: today.toISOString(),
        });
      }

      // ── 2. Bills due soon (≤7 days) ─────────────────────────────────────────
      const dueSoon = bills.filter(b => !b.paid && b.due_date && daysUntil(b.due_date) >= 0 && daysUntil(b.due_date) <= 7);
      dueSoon.forEach(b => {
        const days = daysUntil(b.due_date);
        result.push({
          id: `due_${b.id}`,
          title: `${b.name || b.category} — λήγει ${days === 0 ? 'σήμερα' : `σε ${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`}`,
          body: `Ποσό: ${fe(b.amount)}. Εξόφληση μέχρι ${fmtDate(b.due_date)}.`,
          cta: 'Πήγαινε στην Επισκόπηση', ctaTab: 'dashboard',
          severity: days <= 2 ? 'critical' : 'warning', amount: b.amount, date: today.toISOString(),
        });
      });

      // ── 3. ΕΝΦΙΑ — only if installment not already paid ─────────────────────
      const nextEnfia = ENFIA_2026.find(d => daysUntil(d.date) >= 0 && daysUntil(d.date) <= 45);
      if (nextEnfia) {
        const days        = daysUntil(nextEnfia.date);
        const enfiaAnnual = parseFloat(String(svc?.enfiaAnnual)) || 0;
        const installment = enfiaAnnual > 0 ? enfiaAnnual / 6 : 0;
        const alreadyPaid = bills.some(b =>
          (b.category === 'taxes' || b.category === 'enfia') &&
          b.due_date && b.due_date.startsWith(nextEnfia.date.slice(0, 7)) && b.paid
        );
        if (!alreadyPaid) {
          result.push({
            id: `enfia_${nextEnfia.date}`,
            title: `ΕΝΦΙΑ 2026 — ${nextEnfia.label} σε ${days} ημέρες`,
            body: installment > 0
              ? `Δόση: ${fe(installment)}. Πληρωμή μέσω myAADE → Ο Λογαριασμός μου → Οφειλές.`
              : `Πληρωμή μέσω myAADE → Ο Λογαριασμός μου → Οφειλές.`,
            cta: 'Υπολογιστής ΕΝΦΙΑ', ctaTab: 'services',
            severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info',
            amount: installment || undefined, date: today.toISOString(),
          });
        }
      }

      // ── 4. Insurance renewal ─────────────────────────────────────────────────
      if (ins?.insRenewalDate) {
        const days    = daysUntil(String(ins.insRenewalDate));
        const company = String(ins.insProvider || 'Ασφαλιστική');
        const cost    = parseFloat(String(ins.insCustomPrice)) || 0;
        if (days >= 0 && days <= 60) {
          result.push({
            id: `ins_${ins.insRenewalDate}`,
            title: `Ανανέωση ασφαλιστηρίου σε ${days} ημέρες`,
            body: `${company}${cost > 0 ? ` — τρέχον ${fe(cost)}/μήνα` : ''}. Σύγκρινε τιμές πριν ανανεώσεις.`,
            cta: 'Σύγκριση Ασφαλιστικών', ctaTab: 'insurance',
            severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info', date: today.toISOString(),
          });
        }
      }

      // ── 5. Internet contract ─────────────────────────────────────────────────
      if (prov?.internetContractEnd) {
        const days     = daysUntil(String(prov.internetContractEnd));
        const price    = parseFloat(String(prov?.internetPrice)) || 0;
        const provider = String(prov?.internetProvider || 'Πάροχος');
        if (days >= 0 && days <= 90) {
          result.push({
            id: `internet_${prov.internetContractEnd}`,
            title: `Σύμβαση ${provider} λήγει σε ${days} ημέρες`,
            body: price > 22
              ? `Τρέχον: ${fe(price)}/μήνα. Ελέγξε για καλύτερες επιλογές στο ΕΕΤΤ 360°.`
              : `Θύμισε να επικοινωνήσεις με ${provider} για ανανέωση.`,
            cta: 'Πάροχοι', ctaTab: 'providers',
            severity: days <= 14 ? 'warning' : 'info', date: today.toISOString(),
          });
        }
      }

      // ── 5b. Gas contract ─────────────────────────────────────────────────────
      const gas = getSett('gas');
      if (gas?.gasContractStart && gas?.gasContractMonths) {
        const start  = new Date(String(gas.gasContractStart));
        const months = parseInt(String(gas.gasContractMonths)) || 0;
        if (months > 0) {
          const expiry = new Date(start);
          expiry.setMonth(expiry.getMonth() + months);
          const days = daysUntil(expiry.toISOString().split('T')[0]);
          const price = parseFloat(String(gas?.gasMonthly)) || 0;
          if (days >= 0 && days <= 30) {
            result.push({
              id: `gas_${gas.gasContractStart}`,
              title: `Σύμβαση Φυσικού Αερίου λήγει σε ${days} ημέρες`,
              body: price > 0 ? `Τρέχον: ${fe(price)}/μήνα. Σύγκρινε νέα τιμολόγια στο tab Φυσικού Αερίου.` : `Σύγκρινε νέα τιμολόγια πριν ανανεώσεις.`,
              cta: 'Φυσικό Αέριο', ctaTab: 'gas',
              severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info', date: today.toISOString(),
            });
          }
        }
      }

      // ── 6. Budget overrun ────────────────────────────────────────────────────
      if (budgets) {
        const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
        const budgetTotal   = parseFloat(String(budgets.total)) || 0;
        if (budgetTotal > 0 && totalExpenses > budgetTotal * 0.85) {
          const pct = Math.round((totalExpenses / budgetTotal) * 100);
          result.push({
            id: `budget_${today.getMonth()}`,
            title: pct >= 100 ? 'Υπέρβαση μηνιαίου προϋπολογισμού' : `Προϋπολογισμός στο ${pct}%`,
            body: `Δαπάνες μήνα: ${fe(totalExpenses)} από ${fe(budgetTotal)}.`,
            cta: 'Προϋπολογισμός', ctaTab: 'budget',
            severity: pct >= 100 ? 'warning' : 'info',
            amount: totalExpenses, date: today.toISOString(),
          });
        }
      }

      // ── 7. High electricity consumption ─────────────────────────────────────
      if (elec?.kwhHistory) {
        const history   = (elec.kwhHistory as string[]).map(v => parseFloat(v) || 0).filter(v => v > 0);
        const month     = today.getMonth();
        const thisMonth = history[month];
        if (history.length >= 6 && thisMonth) {
          const avg = history.reduce((s, v) => s + v, 0) / history.length;
          if (thisMonth > avg * 1.2) {
            const pct = Math.round(((thisMonth - avg) / avg) * 100);
            result.push({
              id: `elec_${month}`,
              title: `Κατανάλωση ρεύματος +${pct}% από μέσο όρο`,
              body: `${Math.round(thisMonth)} kWh έναντι μέσου ${Math.round(avg)} kWh. Έλεγξε κλιματιστικά και θερμοσίφωνα.`,
              cta: 'Ανάλυση Ρεύματος', ctaTab: 'electricity',
              severity: pct > 40 ? 'warning' : 'info', date: today.toISOString(),
            });
          }
        }
      }

      // ── 8. Streaming renewals (≤3 days) ─────────────────────────────────────
      const streaming = (ins?.activeStreaming || []) as Array<{ service: string; renewalDate?: string; splitActive?: boolean }>;
      streaming.forEach(a => {
        if (!a.renewalDate) return;
        const days = daysUntil(a.renewalDate);
        if (days >= 0 && days <= 3) {
          const label = ({ netflix: 'Netflix', spotify: 'Spotify', disney: 'Disney+', amazon: 'Amazon Prime', max: 'Max', youtube: 'YouTube Premium' } as any)[a.service] || a.service;
          result.push({
            id: `stream_${a.service}`,
            title: `${label} ανανεώνεται ${days === 0 ? 'σήμερα' : `σε ${days} ημέρες`}`,
            body: a.splitActive ? 'Θυμήσου να ενημερώσεις τους συμμετέχοντες για τη χρέωση.' : 'Αυτόματη χρέωση μέσω κάρτας.',
            cta: 'Ασφάλεια & Συνδρομές', ctaTab: 'insurance',
            severity: 'info', date: today.toISOString(),
          });
        }
      });

      const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, tip: 3 };
      result.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
      setNotifs(result);
    } catch (e) { console.error('Notifications error:', e); }
    finally { setLoading(false); }
  }, [propertyId]);

  useEffect(() => { buildNotifications(); loadManual(); }, [buildNotifications, loadManual]);

  // Realtime
  useEffect(() => {
    if (!propertyId) return;
    const ch = supabase
      .channel(`notif_rt_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, buildNotifications)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [propertyId, buildNotifications]);

  // Dismissed — localStorage
  const storageKey = `notif_d_${propertyId}`;
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    setDismissed(new Set(saved));
  }, [storageKey]);

  const dismiss = (id: string) => {
    const next = new Set([...dismissed, id]);
    setDismissed(next);
    if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify([...next]));
  };
  const dismissAll = () => {
    const all = new Set([...notifs.map(n => n.id), ...manualList.map(m => m.id)]);
    setDismissed(all);
    if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify([...all]));
  };

  // ── Save manual reminder ──────────────────────────────────────────────────
  const saveReminder = async () => {
    if (!newTitle.trim() || !newDueDate) return;
    setSaving(true);
    try {
      const newReminder: ManualReminder = {
        id:        `r_${Date.now()}`,
        title:     newTitle.trim(),
        body:      newBody.trim(),
        dueDate:   newDueDate,
        severity:  newSeverity as Severity,
        audience:  newAudience as 'owner' | 'tenant' | 'both',
        repeat:    newRepeat as 'none' | 'monthly' | 'yearly',
        createdAt: new Date().toISOString(),
      };
      const updated = [...manualList, newReminder];
      await supabase.from('bills_settings').upsert(
        { property_id: propertyId, user_id: userId, section: 'reminders', data: { items: updated } },
        { onConflict: 'property_id,section' }
      );
      setManualList(updated);
      setShowCreate(false);
      setNewTitle(''); setNewBody(''); setNewDueDate(''); setNewSeverity('info'); setNewAudience('owner'); setNewRepeat('none');
    } catch (_) {} finally { setSaving(false); }
  };

  const deleteReminder = async (id: string) => {
    const updated = manualList.filter(m => m.id !== id);
    await supabase.from('bills_settings').upsert(
      { property_id: propertyId, user_id: userId, section: 'reminders', data: { items: updated } },
      { onConflict: 'property_id,section' }
    );
    setManualList(updated);
  };

  // Convert manual reminders to notifications
  const manualNotifs: Notification[] = manualList.map(m => ({
    id:       m.id,
    title:    m.title,
    body:     [m.body, m.dueDate ? `Ημερομηνία: ${fmtDate(m.dueDate)}` : '', m.audience !== 'owner' ? `Για: ${AUDIENCE_OPTIONS.find(a => a.value === m.audience)?.label}` : ''].filter(Boolean).join(' · '),
    severity: m.severity,
    date:     m.dueDate,
    manual:   true,
  }));

  const allNotifs  = [...notifs, ...manualNotifs];
  const visible    = allNotifs.filter(n => !dismissed.has(n.id) && (filter === 'all' || n.severity === filter));
  const critCount  = allNotifs.filter(n => !dismissed.has(n.id) && n.severity === 'critical').length;
  const warnCount  = allNotifs.filter(n => !dismissed.has(n.id) && n.severity === 'warning').length;
  const activeCount = allNotifs.filter(n => !dismissed.has(n.id)).length;

  // ── Sync count to parent strip ────────────────────────────────────────────
  useEffect(() => {
    onCountChange?.(activeCount);
  }, [activeCount, onCountChange]);

  if (loading) return (
    <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: T.font.sans, color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Ανάλυση δεδομένων...
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Ειδοποιήσεις</div>
            {critCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--negative)', background: 'rgba(197,34,31,0.1)', padding: '2px 10px', borderRadius: T.radius.pill }}>{critCount} {critCount === 1 ? 'επείγον' : 'επείγοντα'}</span>}
            {warnCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', background: 'rgba(242,153,0,0.1)', padding: '2px 10px', borderRadius: T.radius.pill }}>{warnCount} {warnCount === 1 ? 'προειδοποίηση' : 'προειδοποιήσεις'}</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Αυτόματες βάσει δεδομένων · Χειροκίνητες υπενθυμίσεις για ιδιοκτήτες & ενοικιαστές</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['all','critical','warning','info','tip'] as const).map(s => {
            const cnt = s === 'all' ? allNotifs.filter(n => !dismissed.has(n.id)).length : allNotifs.filter(n => !dismissed.has(n.id) && n.severity === s).length;
            return (
              <button key={s} onClick={() => setFilter(s)}
                style={{ fontSize: 10, padding: '5px 12px', borderRadius: T.radius.pill, border: `1px solid ${filter === s ? 'var(--accent)' : 'var(--border-subtle)'}`, background: filter === s ? 'rgba(212,175,66,0.1)' : 'transparent', color: filter === s ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: filter === s ? 700 : 400, fontFamily: T.font.sans }}>
                {s === 'all' ? 'Όλες' : SEV[s].label}{cnt > 0 && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: filter === s ? 'var(--accent)' : 'var(--text-tertiary)' }}>{cnt}</span>}
              </button>
            );
          })}
          <button onClick={() => setShowCreate(v => !v)}
            style={{ fontSize: 10, padding: '5px 14px', borderRadius: T.radius.pill, border: `1px solid ${showCreate ? 'var(--accent)' : 'var(--border-default)'}`, background: showCreate ? 'rgba(212,175,66,0.08)' : 'transparent', color: showCreate ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: showCreate ? 700 : 500, fontFamily: T.font.sans }}>
            + Νέα Υπενθύμιση
          </button>
          {visible.length > 0 && (
            <button onClick={dismissAll}
              style={{ fontSize: 10, padding: '5px 12px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: T.font.sans }}>
              Κλείσιμο όλων
            </button>
          )}
        </div>
      </div>

      {/* Create reminder panel */}
      {showCreate && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, letterSpacing: '-0.01em' }}>Νέα Υπενθύμιση</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TextInput label="Τίτλος" value={newTitle} onChange={setNewTitle} placeholder="π.χ. Λήξη Ασφαλιστηρίου, Επιθεώρηση Πυρασφάλειας..."/>
            <DatePicker label="Ημερομηνία" value={newDueDate} onChange={setNewDueDate}/>
          </div>
          <div style={{ marginBottom: 12 }}>
            <TextInput label="Περιγραφή (προαιρετικό)" value={newBody} onChange={setNewBody} placeholder="π.χ. Επικοινώνησε με ασφαλιστικό..."/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <CustomSelect label="Σημαντικότητα" value={newSeverity} onChange={setNewSeverity} options={SEV_OPTIONS}/>
            <CustomSelect label="Αφορά" value={newAudience} onChange={setNewAudience} options={AUDIENCE_OPTIONS}/>
            <CustomSelect label="Επανάληψη" value={newRepeat} onChange={setNewRepeat} options={REPEAT_OPTIONS}/>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)}
              style={{ padding: '8px 20px', fontSize: 12, borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
              Ακύρωση
            </button>
            <button onClick={saveReminder} disabled={saving || !newTitle.trim() || !newDueDate}
              style={{ padding: '8px 24px', fontSize: 12, fontWeight: 700, borderRadius: T.radius.btn, border: 'none', background: newTitle.trim() && newDueDate ? 'var(--accent)' : 'var(--bg-elevated)', color: newTitle.trim() && newDueDate ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: newTitle.trim() && newDueDate ? 'pointer' : 'not-allowed', fontFamily: T.font.sans }}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {visible.length === 0 && !showCreate && (
        <div style={{ textAlign: 'center', padding: '52px 0' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Όλα εντάξει</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {filter !== 'all' ? `Δεν υπάρχουν ${SEV[filter as Severity].label.toLowerCase()} ειδοποιήσεις` : 'Δεν υπάρχουν ενεργές ειδοποιήσεις'}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <button onClick={() => setShowCreate(true)}
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'rgba(212,175,66,0.08)', border: '1px solid rgba(212,175,66,0.2)', borderRadius: T.radius.pill, padding: '8px 20px', cursor: 'pointer', fontFamily: T.font.sans }}>
              + Πρόσθεσε Υπενθύμιση
            </button>
            {dismissed.size > 0 && (
              <button onClick={() => {
                setDismissed(new Set());
                if (typeof window !== 'undefined') localStorage.removeItem(storageKey);
              }}
                style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '8px 20px', cursor: 'pointer', fontFamily: T.font.sans }}>
                Επαναφορά Ειδοποιήσεων
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notifications */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(n => {
          const s = SEV[n.severity];
          const isManual = n.manual;
          return (
            <div key={n.id} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: T.radius.card, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 5 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{n.title}</span>
                  <span style={{ fontSize: 8, fontWeight: 800, color: s.text, padding: '2px 8px', borderRadius: T.radius.pill, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', background: s.border }}>
                    {s.label}
                  </span>
                  {isManual && (
                    <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Χειροκίνητη
                    </span>
                  )}
                  {n.amount && n.amount > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: n.severity === 'critical' ? 'var(--negative)' : 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                      {fe(n.amount)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: (n.cta && n.ctaTab) ? 12 : 0 }}>
                  {n.body}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {n.cta && n.ctaTab && (
                    <button onClick={() => onNavigateTab?.(n.ctaTab!)}
                      style={{ fontSize: 11, fontWeight: 700, color: s.text, background: 'transparent', border: `1px solid ${s.border}`, borderRadius: T.radius.btn, padding: '6px 14px', cursor: 'pointer', fontFamily: T.font.sans }}>
                      {n.cta} →
                    </button>
                  )}
                  {isManual && (
                    <button onClick={() => deleteReminder(n.id)}
                      style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.sans, padding: '6px 0' }}>
                      Διαγραφή
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => dismiss(n.id)}
                style={{ fontSize: 18, lineHeight: 1, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0, marginTop: -2, opacity: 0.5 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}