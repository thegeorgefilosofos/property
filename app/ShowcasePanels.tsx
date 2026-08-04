'use client';

import { T } from '@/components/Theme';
// ═══════════════════════════════════════════════════════════════════════════
// Τα τρία «πάνελ προϊόντος» (Σάρωση · Πίνακας · Βοηθός), ΜΙΑ πηγή αλήθειας
// για το showcase του hero ΚΑΙ το scrollytelling «Πώς δουλεύει». Μαζί τους
// το PanelFX: τα keyframes και οι ζωντανές αντιδράσεις που χρειάζονται τα
// πάνελ όπου κι αν εμφανίζονται. Καμία εικόνα, μόνο κώδικας.
// ═══════════════════════════════════════════════════════════════════════════

// Κινήσεις των πάνελ: γραμμή σάρωσης, εμφάνιση chips/μηνυμάτων, κυματισμός
// φωνής, ανάπτυξη ράβδων, και οι ζωντανές αντιδράσεις στο πέρασμα του κέρσορα.
export const PanelFX = () => (
  <style>{`
    @keyframes lpScan { 0% { top: 6%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 92%; opacity: 0; } }
    .lp-scanline { animation: lpScan 2.6s cubic-bezier(.4, 0, .2, 1) infinite; }
    @keyframes lpPop { 0% { opacity: 0; transform: translateY(6px) scale(.96); } 100% { opacity: 1; transform: none; } }
    .lp-pop { animation: lpPop .5s cubic-bezier(.2, 0, 0, 1) both; }
    @keyframes lpWave { 0%, 100% { transform: scaleY(.4); } 50% { transform: scaleY(1); } }
    .lp-bar { animation: lpWave 1s ease-in-out infinite; transform-origin: center; }
    @keyframes lpGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
    .lp-grow { transform-origin: bottom; animation: lpGrow .5s cubic-bezier(.2, 0, 0, 1) both; }
    .lp-live { transition: filter .18s ease, transform .18s cubic-bezier(.2, 0, 0, 1), box-shadow .18s ease; }
    .lp-live:hover { filter: brightness(1.13); transform: translateY(-1.5px); box-shadow: 0 4px 14px -6px rgba(16,24,40,.22); }
    .lp-vbar { transition: filter .18s ease; }
    .lp-vbar:hover { filter: brightness(1.4) saturate(1.15); }
    @media (max-width: 760px) { .lp-rail { display: none; } }
    @media (prefers-reduced-motion: reduce) {
      .lp-scanline, .lp-bar, .lp-pop, .lp-grow { animation: none !important; }
      .lp-live, .lp-vbar { transition: none; }
      .lp-live:hover { transform: none; }
    }
  `}</style>
);

const check = <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;

// ── Πάνελ: Ο πίνακάς σου ─────────────────────────────────────────────────────
export function PanelDashboard() {
  const months = [42, 55, 48, 61, 52, 70, 66, 78, 60, 84, 72, 90];
  const kpis = [['Καθαρή απόδοση', '4,8%'], ['Μηνιαία έσοδα', '1.250 €'], ['Πληρότητα', '92%']];
  return (
    <div style={{ display: 'flex', gap: 16, textAlign: 'left' }}>
      <div className="lp-rail" style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 12px' }}>
          <div style={{ width: 22, height: 22, borderRadius: 8, background: 'var(--accent)', color: 'var(--on-tone)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>P</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Property OS</div>
        </div>
        {['Επισκόπηση', 'Ενοίκιο', 'Δαπάνες', 'Λογαριασμοί', 'Ημερολόγιο'].map((r, i) => (
          <div key={i} className="lp-live" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, background: i === 0 ? 'var(--bg-elevated)' : 'transparent', border: i === 0 ? '1px solid var(--border-subtle)' : '1px solid transparent', color: i === 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 12.5, fontWeight: i === 0 ? 700 : 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: i === 0 ? 'var(--text-secondary)' : 'var(--border-strong)' }} />{r}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {kpis.map(([l, v], i) => (
            <div key={i} className="lp-live" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '13px 14px', minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</div>
              <div style={{ fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 16px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Έσοδα ανά μήνα</div>
            <div style={{ fontSize: 11, color: 'var(--positive)', fontWeight: 700 }}>▲ 12% φέτος</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(4px, 1.2vw, 9px)', height: 92 }}>
            {months.map((m, i) => (
              <div key={i} className="lp-grow lp-vbar" style={{ animationDelay: `${i * 0.04}s`, flex: 1, height: `${m}%`, borderRadius: '4px 4px 0 0', background: i === months.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 34%, transparent)' }} />
            ))}
          </div>
        </div>
        <div className="lp-hide-xs lp-live" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Πρόταση:</strong> αλλάζοντας πάροχο ρεύματος, γλιτώνεις 184 € τον χρόνο.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Πάνελ: Σάρωση ────────────────────────────────────────────────────────────
export function PanelScan() {
  const filed = ['Λογαριασμοί', 'Δαπάνες', 'Ημερολόγιο', 'Αρχείο'];
  return (
    <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'left' }}>
      <div className="lp-live" style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 18px 16px' }}>
        <div className="lp-scanline" style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Ρεύμα</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Μηνιαίος λογαριασμός</div>
        </div>
        {[['Περίοδος', 'Ιούν 2026'], ['Κατανάλωση', '312 kWh'], ['Ημερομηνία λήξης', '10/08/2026']].map(([l, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--text-secondary)' }}><span>{l}</span><span style={{ color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Πληρωτέο</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>88,50&nbsp;€</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 2px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
        Μπήκε μόνος του σε:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {filed.map((t, i) => (
          <span key={i} className="lp-pop lp-live" style={{ animationDelay: `${0.18 * i + 0.3}s`, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100, padding: '6px 12px' }}>{check}{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── Πάνελ: Βοηθός ────────────────────────────────────────────────────────────
export function PanelAssistant() {
  return (
    <div style={{ maxWidth: 460, margin: '0 auto', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingBottom: 12, marginBottom: 4, borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>Ν</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Νόα</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Ο βοηθός σου για τα ακίνητα</div>
        </div>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--positive)' }} />
      </div>
      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="lp-pop lp-live" style={{ animationDelay: '.1s', alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 14px', borderRadius: 14, borderBottomRightRadius: 4, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, lineHeight: 1.5 }}>Νόα, πόσα ξόδεψα σε ρεύμα φέτος;</div>
        <div className="lp-pop lp-live" style={{ animationDelay: '.5s', alignSelf: 'flex-start', maxWidth: '90%', padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
          Φέτος ξόδεψες <strong>1.240&nbsp;€</strong> σε ρεύμα, 18% περισσότερα από πέρσι, ενώ η κατανάλωση έμεινε σχεδόν σταθερή. Θέλεις να σου προτείνω οικονομικότερο πρόγραμμα ή πάροχο για το ακίνητό σου;
        </div>
        <div className="lp-pop" style={{ animationDelay: '.9s', alignSelf: 'flex-start' }}>
          <span className="lp-live" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)', borderRadius: 100, padding: '6px 12px' }}>
            Μετάβαση: Σύγκριση ρεύματος
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0 2px', borderTop: '1px solid var(--border-subtle)', marginTop: 4 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 24 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
            <span key={i} className="lp-bar" style={{ animationDelay: `${i * 0.09}s`, width: 3, height: 18, borderRadius: 3, background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }} />
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginLeft: 'auto' }}>Μίλα του ελληνικά…</div>
      </div>
    </div>
  );
}
