'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ActivityLog, «Δραστηριότητα». Πρόσφατα ευαίσθητα γεγονότα λογαριασμού και
// ενέργειες ομάδας (audit log). Αποδίδεται ΓΥΜΝΟ μέσα σε υπάρχουσα ενότητα.
// Premium/minimal timeline· χωρίς color noise. Read-only.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Skeleton, EmptyState } from '@/components/Theme';
import { History } from 'lucide-react';
import { activityLabel, type ActivityRow } from '@/lib/activity';

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'μόλις τώρα';
  const m = Math.floor(s / 60); if (m < 60) return `πριν ${m} λεπτά`;
  const h = Math.floor(m / 60); if (h < 24) return `πριν ${h} ${h === 1 ? 'ώρα' : 'ώρες'}`;
  const dd = Math.floor(h / 24); if (dd < 30) return `πριν ${dd} ${dd === 1 ? 'ημέρα' : 'ημέρες'}`;
  // ΧΡΟΝΟΣΗΜΑΝΣΗ, ΟΧΙ ΗΜΕΡΟΛΟΓΙΑΚΗ ΗΜΕΡΑ: το `iso` κουβαλά ώρα (η ίδια
  // συνάρτηση μετράει «πριν 3 ώρες» από πάνω). Η τοπική ώρα ΕΙΝΑΙ το ζητούμενο.
  return new Date(iso).toLocaleDateString('el-GR');
}

export default function ActivityLog() {
  const supabase = createClient();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('my_activity', { p_limit: 30 });
        if (alive) setRows((data as ActivityRow[] | null) ?? []);
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows === null) {
    // Το σχήμα είναι γνωστό (γραμμές timeline), οπότε δείχνουμε το σχήμα και όχι
    // γυμνό «Φόρτωση…»: η ενότητα δεν αλλάζει ύψος όταν φτάσουν τα δεδομένα.
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
        {[0, 1, 2].map(i => <Skeleton key={i} h={34} r={10} />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<History size={20} />}
        title="Καμία δραστηριότητα ακόμη"
        hint="Εδώ θα βλέπεις σημαντικές ενέργειες στον λογαριασμό και στην ομάδα σου."
      />
    );
  }

  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0',
          borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-raised)', flexShrink: 0, marginTop: 6 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.4 }}>
              {activityLabel(r)}
            </div>
            {r.actor_email && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.actor_email}
              </div>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, flexShrink: 0, whiteSpace: 'nowrap' }} title={new Date(r.created_at).toLocaleString('el-GR')}>
            {relTime(r.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
