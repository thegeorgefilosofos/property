'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font:   { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

type Severity = 'critical' | 'warning' | 'info' | 'tip';
type NotifCategory = 'payment' | 'contract' | 'enfia' | 'insurance' | 'budget' | 'energy' | 'streaming' | 'maintenance';

interface SmartNotification {
  id:       string;
  title:    string;
  body:     string;
  cta?:     string;
  ctaTab?:  string;
  severity: Severity;
  category: NotifCategory;
  date:     string;
  dismissed: boolean;
  icon:     string;
}

const SEV_STYLE: Record<Severity, { bg: string; border: string; dot: string; badge: string; label: string }> = {
  critical: { bg: 'rgba(197,34,31,0.07)',  border: 'rgba(197,34,31,0.25)',  dot: 'var(--negative)', badge: 'rgba(197,34,31,0.1)',  label: 'Επείγον'   },
  warning:  { bg: 'rgba(242,153,0,0.06)',  border: 'rgba(242,153,0,0.25)',  dot: 'var(--warning)',  badge: 'rgba(242,153,0,0.1)',  label: 'Προσοχή'   },
  info:     { bg: 'rgba(26,115,232,0.05)', border: 'rgba(26,115,232,0.2)', dot: 'var(--info)',     badge: 'rgba(26,115,232,0.1)', label: 'Πληροφορία'},
  tip:      { bg: 'rgba(52,168,83,0.05)',  border: 'rgba(52,168,83,0.2)',  dot: 'var(--positive)', badge: 'rgba(52,168,83,0.1)',  label: 'Συμβουλή'  },
};

const ENFIA_DEADLINES = [
  { date: '2026-05-31', label: '1η Δόση' }, { date: '2026-06-30', label: '2η Δόση' },
  { date: '2026-07-31', label: '3η Δόση' }, { date: '2026-08-31', label: '4η Δόση' },
  { date: '2026-09-30', label: '5η Δόση' }, { date: '2026-10-30', label: '6η Δόση' },
];

interface Props { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void; }

export default function BillsNotifications({ propertyId, userId = '', onNavigateTab }: Props) {
  const supabase = createClient();
  const [notifications,  setNotifications]  = useState<SmartNotification[]>([]);
  const [dismissed,      setDismissed]      = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [filterSev,      setFilterSev]      = useState<Severity|'all'>('all');
  const [settings,       setSettings]       = useState<{ notifEmail: boolean; notifBrowser: boolean; notifEnfia: boolean; notifContracts: boolean; notifBudget: boolean; notifEnergy: boolean; notifRenewal: boolean; }>({
    notifEmail: true, notifBrowser: true, notifEnfia: true, notifContracts: true, notifBudget: true, notifEnergy: true, notifRenewal: true,
  });

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      setLoading(true);
      try {
        // Load dismissed notifications from localStorage
        const dismissedKey = `notif_dismissed_${propertyId}`;
        const savedDismissed = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(dismissedKey) ?? '[]') : [];
        setDismissed(new Set(savedDismissed));

        // Load settings + bills + bills_settings in parallel
        const [billsRes, settingsRes, notifPrefsRes] = await Promise.all([
          supabase.from('bills').select('*').eq('property_id', propertyId),
          supabase.from('bills_settings').select('section, data').eq('property_id', propertyId),
          supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'notifications').maybeSingle(),
        ]);

        if (notifPrefsRes.data?.data) setSettings(notifPrefsRes.data.data as any);

        const bills    = billsRes.data    || [];
        const allSett  = settingsRes.data || [];
        const getSett  = (s: string) => allSett.find(x => x.section === s)?.data as any;

        const notifs: SmartNotification[] = [];
        const today = new Date();
        const daysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);

        // ── 1. Unpaid bills overdue ─────────────────────────────────────────
        const overdue = bills.filter(b => !b.paid && b.due_date && new Date(b.due_date) < today);
        overdue.forEach(b => {
          const days = Math.abs(daysUntil(b.due_date));
          notifs.push({
            id: `overdue_${b.id}`, icon: 'critical',
            title: `Ληξιπρόθεσμος λογαριασμός: ${b.name || b.category}`,
            body:  `${fe(b.amount)} — έληξε πριν ${days} ημέρες. Πλήρωσε άμεσα για να αποφύγεις πρόστιμα.`,
            cta: 'Δες τους λογαριασμούς', ctaTab: 'dashboard',
            severity: 'critical', category: 'payment',
            date: new Date().toISOString(), dismissed: false,
          });
        });

        // ── 2. Bills due soon (3-7 days) ────────────────────────────────────
        const dueSoon = bills.filter(b => !b.paid && b.due_date && daysUntil(b.due_date) >= 0 && daysUntil(b.due_date) <= 7);
        dueSoon.forEach(b => {
          const days = daysUntil(b.due_date);
          notifs.push({
            id: `duesoon_${b.id}`, icon: 'payment',
            title: `${b.name || b.category} λήγει ${days === 0 ? 'σήμερα' : `σε ${days} ημέρες`}`,
            body:  `Ποσό: ${fe(b.amount)}. ${days <= 2 ? 'Πλήρωσε άμεσα.' : 'Οργανώσου έγκαιρα.'}`,
            cta: 'Σήμανση ως Πληρωμένο', ctaTab: 'dashboard',
            severity: days <= 2 ? 'critical' : 'warning', category: 'payment',
            date: new Date().toISOString(), dismissed: false,
          });
        });

        // ── 3. ΕΝΦΙΑ deadlines ───────────────────────────────────────────────
        const svc = getSett('services');
        const nextEnfia = ENFIA_DEADLINES.find(d => daysUntil(d.date) >= 0);
        if (nextEnfia) {
          const days = daysUntil(nextEnfia.date);
          const installment = svc ? (parseFloat(svc.enfiaAnnual) / 6 || parseFloat(svc.enfiaMonthly) * 2 || 0) : 0;
          if (days <= 30) {
            notifs.push({
              id: `enfia_${nextEnfia.date}`, icon: 'services',
              title: `ΕΝΦΙΑ 2026 — ${nextEnfia.label} σε ${days} ημέρες`,
              body:  `${installment > 0 ? `Ποσό δόσης: ${fe(installment)}. ` : ''}Πληρωμή μέσω myAADE → Ο Λογαριασμός μου → Οφειλές.`,
              cta: 'Δες ΕΝΦΙΑ Υπολογιστή', ctaTab: 'services',
              severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info',
              category: 'enfia', date: new Date().toISOString(), dismissed: false,
            });
          }
        }

        // ── 4. Insurance renewal ─────────────────────────────────────────────
        const ins = getSett('insurance');
        if (ins?.insRenewalDate) {
          const days = daysUntil(ins.insRenewalDate);
          if (days >= 0 && days <= 60) {
            notifs.push({
              id: `ins_renewal_${ins.insRenewalDate}`, icon: 'insurance',
              title: `Ανανέωση ασφαλιστηρίου σε ${days} ημέρες`,
              body:  `Τρέχον πρόγραμμα λήγει. Χρησιμοποίησε τη σύγκριση ασφαλιστικών για να βρεις καλύτερη τιμή.`,
              cta: 'Σύγκριση Ασφαλιστικών', ctaTab: 'insurance',
              severity: days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'info',
              category: 'insurance', date: new Date().toISOString(), dismissed: false,
            });
          }
        }

        // ── 5. Internet contract expiry ──────────────────────────────────────
        const prov = getSett('providers');
        if (prov?.internetContractEnd) {
          const days = daysUntil(prov.internetContractEnd);
          if (days >= 0 && days <= 90) {
            const hasBetterDeal = prov.internetPrice && parseFloat(prov.internetPrice) > 22;
            notifs.push({
              id: `internet_contract_${prov.internetContractEnd}`, icon: 'contract',
              title: `Σύμβαση Internet (${prov.internetProvider || 'Πάροχος'}) λήγει σε ${days} ημέρες`,
              body:  `${hasBetterDeal ? `Τρέχουσα τιμή ${fe(parseFloat(prov.internetPrice))}. Υπάρχουν καλύτερες προσφορές στην αγορά. ` : ''}Σύγκρινε στο ΕΕΤΤ 360°.`,
              cta: 'Δες Παρόχους', ctaTab: 'providers',
              severity: days <= 14 ? 'warning' : 'info',
              category: 'contract', date: new Date().toISOString(), dismissed: false,
            });
          }
        }

        // ── 6. High electricity consumption ─────────────────────────────────
        const elec = getSett('electricity');
        if (elec?.kwhHistory) {
          const history: number[] = elec.kwhHistory.map((v: string) => parseFloat(v) || 0).filter((v: number) => v > 0);
          if (history.length >= 3) {
            const avg = history.reduce((s: number, v: number) => s + v, 0) / history.length;
            const thisMonth = history[new Date().getMonth()];
            if (thisMonth && thisMonth > avg * 1.25) {
              const pct = Math.round(((thisMonth - avg) / avg) * 100);
              notifs.push({
                id: `energy_high_${new Date().getMonth()}`, icon: 'energy',
                title: `Αυξημένη κατανάλωση ρεύματος: +${pct}% από μ.ο.`,
                body:  `Αυτό τον μήνα: ${thisMonth} kWh vs μέσο ${Math.round(avg)} kWh. Έλεγξε κλιματιστικά και θερμοσίφωνα.`,
                cta: 'Δες Ανάλυση Ρεύματος', ctaTab: 'electricity',
                severity: pct > 50 ? 'warning' : 'info',
                category: 'energy', date: new Date().toISOString(), dismissed: false,
              });
            }
          }
        }

        // ── 7. Streaming renewal alerts ──────────────────────────────────────
        (ins?.activeStreaming || []).forEach((a: any) => {
          if (!a.renewalDate) return;
          const days = daysUntil(a.renewalDate);
          if (days >= 0 && days <= 5) {
            const svcLabel = a.service.charAt(0).toUpperCase() + a.service.slice(1);
            notifs.push({
              id: `streaming_${a.service}_${a.renewalDate}`, icon: 'media',
              title: `${svcLabel} ανανεώνεται ${days === 0 ? 'σήμερα' : `σε ${days} ημέρες`}`,
              body:  `Θα χρεωθείς αυτόματα. ${a.splitActive ? `Ενημέρωσε τους συμμετέχοντες.` : ''}`,
              cta: 'Ασφάλεια & Συνδρομές', ctaTab: 'insurance',
              severity: 'info', category: 'streaming',
              date: new Date().toISOString(), dismissed: false,
            });
          }
        });

        // ── 8. Energy savings tip ────────────────────────────────────────────
        if (elec?.provider && elec?.tariffId) {
          // Check if there might be a better tariff (simplified check)
          const currentKwh = 0.16; // rough check
          notifs.push({
            id: `energy_tip_${new Date().getMonth()}`, icon: 'tip',
            title: 'Σύγκρινε τιμολόγιο ρεύματος',
            body:  'Το energycost.gr (ΡΑΑΕΥ) δείχνει αν υπάρχει καλύτερη επιλογή βάσει της κατανάλωσής σου.',
            cta: 'Σύγκριση Παρόχων Ρεύματος', ctaTab: 'electricity',
            severity: 'tip', category: 'energy',
            date: new Date().toISOString(), dismissed: false,
          });
        }

        // ── 9. Budget over-alert ─────────────────────────────────────────────
        const budgetSett = getSett('budgets');
        if (budgetSett?.electricity && elec) {
          const budgetElec = parseFloat(budgetSett.electricity) || 0;
          // Estimate current month electricity cost
          const avgKwh  = (elec.kwhHistory || []).reduce((s: number, v: string) => s + (parseFloat(v) || 0), 0) / 12 || 150;
          const estCost = avgKwh * 0.18; // rough estimate with all fees
          if (budgetElec > 0 && estCost > budgetElec * 0.9) {
            notifs.push({
              id: `budget_elec_${new Date().getMonth()}`, icon: 'budget',
              title: 'Κινδυνεύεις να υπερβείς το budget ρεύματος',
              body:  `Εκτίμηση μήνα: ${fe(estCost)} vs budget ${fe(budgetElec)}. Πρόβλεψη: ${estCost > budgetElec ? 'υπέρβαση' : 'εντός ορίου'}.`,
              cta: 'Budget & Στόχοι', ctaTab: 'budget',
              severity: estCost > budgetElec ? 'warning' : 'info',
              category: 'budget', date: new Date().toISOString(), dismissed: false,
            });
          }
        }

        // Sort: critical → warning → info → tip, then by date
        const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, tip: 3 };
        notifs.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
        setNotifications(notifs);
      } catch (e) { console.error('Notifications error:', e); }
      finally { setLoading(false); }
    })();
  }, [propertyId]);

  const dismiss = (id: string) => {
    const next = new Set([...dismissed, id]);
    setDismissed(next);
    if (typeof window !== 'undefined') localStorage.setItem(`notif_dismissed_${propertyId}`, JSON.stringify([...next]));
  };

  const clearAll = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setDismissed(allIds);
    if (typeof window !== 'undefined') localStorage.setItem(`notif_dismissed_${propertyId}`, JSON.stringify([...allIds]));
  };

  const visible   = notifications.filter(n => !dismissed.has(n.id) && (filterSev === 'all' || n.severity === filterSev));
  const critCount = notifications.filter(n => !dismissed.has(n.id) && n.severity === 'critical').length;
  const warnCount = notifications.filter(n => !dismissed.has(n.id) && n.severity === 'warning').length;

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ανάλυση δεδομένων...</div>;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Έξυπνες Ειδοποιήσεις</div>
            {critCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--negative)', background: 'rgba(197,34,31,0.1)', padding: '2px 10px', borderRadius: T.radius.pill }}>{critCount} επείγον</span>}
            {warnCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', background: 'rgba(242,153,0,0.1)', padding: '2px 10px', borderRadius: T.radius.pill }}>{warnCount} προσοχή</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Βάσει δεδομένων λογαριασμών, συμβολαίων και ιστορικού</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all','critical','warning','info','tip'] as const).map(s => (
            <button key={s} onClick={() => setFilterSev(s)}
              style={{ fontSize: 10, padding: '5px 12px', borderRadius: T.radius.pill, border: `1px solid ${filterSev === s ? 'var(--accent)' : 'var(--border-subtle)'}`, background: filterSev === s ? 'rgba(212,175,66,0.1)' : 'transparent', color: filterSev === s ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: filterSev === s ? 700 : 400, fontFamily: T.font.sans }}>
              {s === 'all' ? 'Όλες' : SEV_STYLE[s].label}
            </button>
          ))}
          {visible.length > 0 && (
            <button onClick={clearAll}
              style={{ fontSize: 10, padding: '5px 12px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
              Dismiss Όλες
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, fontFamily: T.font.sans }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Όλα καλά!</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Δεν υπάρχουν ενεργές ειδοποιήσεις{filterSev !== 'all' ? ' για αυτό το φίλτρο' : ''}</div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map(n => {
          const style = SEV_STYLE[n.severity];
          return (
            <div key={n.id} style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: T.radius.card, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'all 0.2s' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: style.dot, flexShrink: 0, marginTop: 4 }}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{n.title}</div>
                  <span style={{ fontSize: 8, fontWeight: 700, color: style.dot, background: style.badge, padding: '2px 8px', borderRadius: T.radius.pill, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{style.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: n.cta ? 10 : 0 }}>{n.body}</div>
                {n.cta && n.ctaTab && (
                  <button onClick={() => onNavigateTab?.(n.ctaTab!)}
                    style={{ fontSize: 11, fontWeight: 700, color: style.dot, background: 'transparent', border: `1px solid ${style.border}`, borderRadius: T.radius.btn, padding: '5px 14px', cursor: 'pointer', fontFamily: T.font.sans }}>
                    {n.cta} →
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(n.id)}
                style={{ fontSize: 16, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', flexShrink: 0, lineHeight: 1, marginTop: -2 }}>
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Dismissed section */}
      {dismissed.size > 0 && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={() => { setDismissed(new Set()); if (typeof window !== 'undefined') localStorage.removeItem(`notif_dismissed_${propertyId}`); }}
            style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '5px 16px', cursor: 'pointer', fontFamily: T.font.sans }}>
            Επαναφορά {dismissed.size} ειδοποιήσεων
          </button>
        </div>
      )}
    </div>
  );
}