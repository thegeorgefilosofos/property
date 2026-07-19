'use client';

// ═══════════════════════════════════════════════════════════════════════════
// AIInsights, «έξυπνη ανάλυση» ακινήτου με Claude (μέσω /api/anthropic).
// Στέλνει ΜΟΝΟ συγκεντρωτικά οικονομικά (όχι προσωπικά δεδομένα) και επιστρέφει
// 3-5 πρακτικές συστάσεις. Δεν καλείται αυτόματα, ο χρήστης πατά «Ανάλυση».
// Υποβαθμίζεται ομαλά αν λείπει το ANTHROPIC_API_KEY.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, TT, Spinner, Btn } from '@/components/Theme';

export interface InsightContext {
  propName: string;
  propType: string;
  address?: string;
  value?: number;
  sqm?: number;
  monthlyRent: number;
  grossYield: number;
  netYield: number;
  expensesYTD: number;
  annualRent: number;
  daysToLeaseEnd?: number | null;
  status?: string;
}

interface Insight { title: string; tone: 'positive' | 'warning' | 'negative' | 'info'; detail: string; }

const TONE_FALLBACK: Insight['tone'] = 'info';
const validTone = (t: string): Insight['tone'] =>
  (['positive', 'warning', 'negative', 'info'].includes(t) ? t : TONE_FALLBACK) as Insight['tone'];

export default function AIInsights({ ctx }: { ctx: InsightContext }) {
  const supabase = createClient();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [errMsg, setErrMsg] = useState('');

  const run = async () => {
    setState('loading'); setErrMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const num = (n: number | undefined) => (n == null ? 'άγνωστο' : Math.round(n).toLocaleString('el-GR'));
      const prompt = `Είσαι σύμβουλος ακινήτων στην Ελλάδα. Ανάλυσε ΣΥΝΟΠΤΙΚΑ το παρακάτω ακίνητο και δώσε 3 έως 5 πρακτικές, συγκεκριμένες συστάσεις για τον ιδιοκτήτη (απόδοση, δαπάνες, ενοίκιο, ρίσκο σύμβασης, φορολογία, ενέργεια). Μίλα ελληνικά, χωρίς συντομογραφίες.

Δεδομένα:
- Τύπος: ${ctx.propType}${ctx.address ? `, ${ctx.address}` : ''}
- Εμβαδόν: ${ctx.sqm ?? 'άγνωστο'} τ.μ.
- Εμπορική αξία: ${num(ctx.value)} €
- Μηνιαίο ενοίκιο: ${num(ctx.monthlyRent)} €  (ετήσιο ${num(ctx.annualRent)} €)
- Μεικτή απόδοση: ${ctx.grossYield.toFixed(1)}%  ·  Καθαρή απόδοση: ${ctx.netYield.toFixed(1)}%
- Δαπάνες έτους: ${num(ctx.expensesYTD)} €
- Κατάσταση: ${ctx.status ?? 'άγνωστη'}${ctx.daysToLeaseEnd != null ? `\n- Ημέρες ως λήξη μίσθωσης: ${ctx.daysToLeaseEnd}` : ''}

Απάντησε ΑΥΣΤΗΡΑ με έγκυρο JSON array, χωρίς άλλο κείμενο, στη μορφή:
[{"title":"σύντομος τίτλος","tone":"positive|warning|negative|info","detail":"1-2 προτάσεις με συγκεκριμένη ενέργεια"}]`;

      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Σφάλμα ανάλυσης');

      const text: string = data?.content?.[0]?.text ?? '';
      const jsonStart = text.indexOf('['); const jsonEnd = text.lastIndexOf(']');
      if (jsonStart < 0 || jsonEnd < 0) throw new Error('Μη αναμενόμενη απάντηση');
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as any[];
      const clean: Insight[] = parsed.slice(0, 5).map(p => ({ title: String(p.title || '').slice(0, 120), tone: validTone(String(p.tone || 'info')), detail: String(p.detail || '').slice(0, 400) }));
      setInsights(clean); setState('done');
    } catch (e: any) {
      setErrMsg(e?.message || 'Σφάλμα'); setState('error');
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: state === 'idle' ? 0 : 14 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...TT.label, color: 'var(--text-secondary)' }}>Έξυπνη Ανάλυση</div>
          <div style={{ ...TT.caption }}>Προτάσεις με τεχνητή νοημοσύνη βάσει των στοιχείων του ακινήτου</div>
        </div>
        {state !== 'loading' && (
          <Btn variant="primary" onClick={run}>{state === 'done' || state === 'error' ? 'Ανανέωση' : 'Ανάλυση'}</Btn>
        )}
      </div>

      {state === 'loading' && <Spinner label="Ανάλυση σε εξέλιξη…" />}

      {state === 'error' && (
        <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: '10px 16px', ...TT.bodySm, color: 'var(--text-secondary)' }}>
          Δεν ήταν δυνατή η ανάλυση: {errMsg}. Βεβαιώσου ότι έχει οριστεί το ANTHROPIC_API_KEY.
        </div>
      )}

      {state === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {insights.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: `var(--${a.tone}-soft)`, border: `1px solid var(--${a.tone}-border)`, borderRadius: T.radius.inner, padding: '10px 16px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--${a.tone})`, marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TT.body, fontWeight: 700, fontSize: 13 }}>{a.title}</div>
                <div style={{ ...TT.caption, marginTop: 2, lineHeight: 1.5 }}>{a.detail}</div>
              </div>
            </div>
          ))}
          <div style={{ ...TT.caption, marginTop: 2 }}>Οι προτάσεις είναι ενδεικτικές και δεν αποτελούν φορολογική ή επενδυτική συμβουλή.</div>
        </div>
      )}
    </div>
  );
}
