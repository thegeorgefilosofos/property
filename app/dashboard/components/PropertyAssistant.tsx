'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PropertyAssistant — ο βοηθός που ξέρει το ακίνητό σου.
// Ρωτάς με απλά ελληνικά («τι εκκρεμεί;», «πόσα ξόδεψα σε ρεύμα;», «πότε λήγει η
// ασφάλεια;») και απαντά ΜΟΝΟ από τα δικά σου δεδομένα, μέσω /api/anthropic.
// Υποβαθμίζεται ομαλά αν λείπει το ANTHROPIC_API_KEY (δείχνει φιλική οδηγία).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T } from '@/components/Theme';

export interface AssistantFacts {
  propName: string;
  propType?: string;
  address?: string;
  value?: number;
  sqm?: number;
  status?: string;
  monthlyRent: number;
  annualRent: number;
  grossYield: number;
  netYield: number;
  expensesYTD: number;
  paidExpensesYTD: number;
  pendingExpensesYTD: number;
  topCategories: [string, number][];   // [κατηγορία, ποσό]
  unpaidBills: { name: string; amount: number; due?: string | null }[];
  leaseEnd?: string | null;
  daysToLeaseEnd?: number | null;
  insurer?: string | null;
  insuranceExpiry?: string | null;
  upcoming: { title: string; date: string; amount?: number | null }[];  // επόμενα γεγονότα
}

interface Msg { role: 'user' | 'assistant'; text: string; }

const SUGGESTED = [
  'Τι εκκρεμεί αυτόν τον μήνα;',
  'Πόσα έχω ξοδέψει φέτος και πού;',
  'Πώς πάει η απόδοση του ακινήτου;',
  'Πότε λήγει η ασφάλεια και η μίσθωση;',
];

const eur = (n?: number | null) => n == null ? '—' : `${Math.round(n).toLocaleString('el-GR')} €`;

function buildContext(f: AssistantFacts): string {
  const lines = [
    `Ακίνητο: ${f.propName}${f.propType ? ` (${f.propType})` : ''}${f.address ? `, ${f.address}` : ''}`,
    f.sqm ? `Εμβαδόν: ${f.sqm} τ.μ.` : '',
    f.value ? `Εμπορική αξία: ${eur(f.value)}` : '',
    f.status ? `Κατάσταση: ${f.status}` : '',
    `Μηνιαίο ενοίκιο: ${eur(f.monthlyRent)} (ετήσιο ${eur(f.annualRent)})`,
    `Απόδοση: μεικτή ${f.grossYield.toFixed(1)}%, καθαρή ${f.netYield.toFixed(1)}%`,
    `Δαπάνες φέτος: ${eur(f.expensesYTD)} συνολικά — πληρωμένες ${eur(f.paidExpensesYTD)}, εκκρεμείς ${eur(f.pendingExpensesYTD)}`,
    f.topCategories.length ? `Μεγαλύτερες κατηγορίες δαπανών: ${f.topCategories.map(([c, a]) => `${c} ${eur(a)}`).join(', ')}` : '',
    f.unpaidBills.length
      ? `Απλήρωτοι λογαριασμοί (${f.unpaidBills.length}): ${f.unpaidBills.slice(0, 12).map(b => `${b.name} ${eur(b.amount)}${b.due ? ` (λήξη ${b.due})` : ''}`).join('; ')}`
      : 'Δεν υπάρχουν απλήρωτοι λογαριασμοί.',
    f.leaseEnd ? `Λήξη μίσθωσης: ${f.leaseEnd}${f.daysToLeaseEnd != null ? ` (σε ${f.daysToLeaseEnd} ημέρες)` : ''}` : 'Δεν έχει καταχωρηθεί ενεργή μίσθωση.',
    f.insurer || f.insuranceExpiry ? `Ασφάλεια: ${f.insurer || 'άγνωστη εταιρεία'}${f.insuranceExpiry ? `, λήξη ${f.insuranceExpiry}` : ''}` : 'Δεν έχει καταχωρηθεί ασφάλεια.',
    f.upcoming.length ? `Επόμενα γεγονότα: ${f.upcoming.slice(0, 12).map(e => `${e.date} ${e.title}${e.amount ? ` ${eur(e.amount)}` : ''}`).join('; ')}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

export default function PropertyAssistant({ facts }: { facts: AssistantFacts }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setOpen(true); setErr(''); setInput('');
    const history = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(history); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const system = `Είσαι ο προσωπικός βοηθός διαχείρισης ακινήτου του χρήστη. Απαντάς ΑΠΟΚΛΕΙΣΤΙΚΑ με βάση τα παρακάτω πραγματικά δεδομένα του ακινήτου. Αν κάτι δεν υπάρχει στα δεδομένα, πες το ειλικρινά και πρότεινε πού μπορεί να το καταχωρήσει. Μίλα ελληνικά, ζεστά και σύντομα (2-5 προτάσεις), με συγκεκριμένα νούμερα. Χωρίς συντομογραφίες, χωρίς νομική/φοροτεχνική βεβαιότητα — δώσε πρακτική καθοδήγηση.

ΔΕΔΟΜΕΝΑ ΑΚΙΝΗΤΟΥ:
${buildContext(facts)}`;
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
          max_tokens: 700, system,
          messages: history.map(m => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key' : 'service');
        setMsgs(m => m.slice(0, -1)); // αφαίρεσε την ερώτηση που απέτυχε
        return;
      }
      const text: string = data?.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Δεν έχω απάντηση αυτή τη στιγμή.';
      setMsgs(m => [...m, { role: 'assistant', text: text.trim() }]);
    } catch {
      setErr('service'); setMsgs(m => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
      {/* Κεφαλίδα */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: msgs.length ? 'default' : 'pointer' }}
        onClick={() => { if (!msgs.length) setOpen(o => !o); }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), #8ab4f8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Βοηθός ακινήτου</div>
          <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)' }}>Ρώτησέ με οτιδήποτε για {facts.propName} — απαντώ από τα δικά σου στοιχεία</div>
        </div>
        {!msgs.length && (
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
        )}
      </div>

      {(open || msgs.length > 0) && (
        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {/* Ιστορικό */}
          {msgs.length > 0 && (
            <div ref={scrollRef} style={{ maxHeight: 320, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '84%', padding: '10px 14px', borderRadius: 14, fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: m.role === 'user' ? 'var(--accent-text)' : 'var(--text-primary)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                    borderBottomRightRadius: m.role === 'user' ? 4 : 14, borderBottomLeftRadius: m.role === 'user' ? 14 : 4 }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 2px' }}>
                  {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', animation: `pa-bounce 1s ${i * 0.15}s infinite ease-in-out` }} />)}
                </div>
              )}
            </div>
          )}

          {/* Προτεινόμενες ερωτήσεις */}
          {msgs.length === 0 && (
            <div style={{ padding: '4px 18px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTED.map(s => (
                <button key={s} onClick={() => ask(s)}
                  style={{ fontFamily: T.font.sans, fontSize: 12, padding: '7px 13px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {err && (
            <div style={{ margin: '0 18px 12px', background: err === 'key' ? 'var(--info-soft)' : 'var(--warning-soft)', border: `1px solid ${err === 'key' ? 'var(--info-border)' : 'var(--warning-border)'}`, borderRadius: T.radius.inner, padding: '10px 14px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {err === 'key'
                ? 'Ο βοηθός AI χρειάζεται κλειδί για να απαντήσει. Μόλις ενεργοποιηθεί, θα απαντά ζωντανά για το ακίνητό σου.'
                : 'Δεν μπόρεσα να απαντήσω αυτή τη στιγμή — δοκίμασε ξανά σε λίγο.'}
            </div>
          )}

          {/* Είσοδος */}
          <div style={{ display: 'flex', gap: 8, padding: '0 18px 16px' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(input); }}
              placeholder="Γράψε την ερώτησή σου…" disabled={busy}
              style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '10px 16px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none' }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
            <button onClick={() => ask(input)} disabled={busy || !input.trim()}
              style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() && !busy ? 'var(--accent)' : 'var(--bg-elevated)', color: input.trim() && !busy ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: input.trim() && !busy ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes pa-bounce{0%,80%,100%{transform:translateY(0);opacity:0.4}40%{transform:translateY(-5px);opacity:1}}`}</style>
    </div>
  );
}
