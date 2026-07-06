'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Referral, κωδικός & σύνδεσμος πρόσκλησης φίλων (growth). Δείχνει τον κωδικό,
// τον σύνδεσμο εγγραφής και πόσοι έχουν εγγραφεί με αυτόν.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T } from '@/components/Theme';

export default function Referral({ userId }: { userId: string }) {
  const supabase = createClient();
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      let { data } = await supabase.from('referral_codes').select('code').eq('user_id', userId).maybeSingle();
      if (!data) {
        const ins = await supabase.from('referral_codes').insert({ user_id: userId }).select('code').single();
        data = ins.data;
      }
      if (data?.code) {
        setCode(data.code);
        const { data: n } = await supabase.rpc('get_referral_stats', { p_code: data.code });
        if (typeof n === 'number') setCount(n);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const link = code && typeof window !== 'undefined' ? `${window.location.origin}/signup?ref=${code}` : '';
  const copy = () => { if (link) { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
        <div style={{ fontFamily: T.font.sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontWeight: 700 }}>Πρόσκληση φίλων</div>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', fontFamily: T.font.num, lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 4 }}>εγγραφές με τον κωδικό σου</div>
        </div>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
          Μοίρασε τον σύνδεσμο. Για κάθε φίλο που εγγράφεται, θα κερδίζετε <strong style={{ color: 'var(--text-primary)' }}>και οι δύο έναν δωρεάν μήνα</strong> (με την ενεργοποίηση των πληρωμών).
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input readOnly value={link || 'Δημιουργία κωδικού…'} onFocus={e => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 220, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, outline: 'none' }} />
        <button onClick={copy} disabled={!link} style={{ height: 38, padding: '0 18px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: link ? 'pointer' : 'not-allowed', opacity: link ? 1 : 0.5 }}>{copied ? 'Αντιγράφηκε ✓' : 'Αντιγραφή'}</button>
      </div>
    </div>
  );
}
