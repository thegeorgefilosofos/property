'use client';

// ═══════════════════════════════════════════════════════════════════════════
// LandingShowcase, διαδραστικό, αυτο-εναλλασσόμενο showcase μέσα σε πλαίσιο
// εφαρμογής. Τρεις πράξεις: Πίνακας · Σάρωση · Βοηθός. Εναλλάσσεται μόνο του,
// κάνεις κλικ για να αλλάξεις, σταματά όταν το κοιτάς (hover). 0 εικόνες.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';

const TABS = [
  { key: 'scan', label: 'Σάρωση' },
  { key: 'dashboard', label: 'Ο πίνακάς σου' },
  { key: 'assistant', label: 'Βοηθός' },
];
const ROTATE_MS = 5200;

export default function LandingShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = setInterval(() => setActive(a => (a + 1) % TABS.length), ROTATE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused]);

  return (
    <div style={{ position: 'relative', maxWidth: 960, margin: 'clamp(40px, 6vw, 72px) auto 0' }}>
      <style>{`
        .lp-mockup { box-shadow: 0 1px 1px rgba(16,24,40,.05), 0 12px 24px -8px rgba(16,24,40,.10), 0 40px 64px -24px rgba(16,24,40,.14); transform-origin: center top; will-change: transform; }
        [data-mode="dark"] .lp-mockup { box-shadow: 0 1px 2px rgba(16,24,40,.40), 0 20px 40px -12px rgba(16,24,40,.55), 0 48px 90px -24px rgba(16,24,40,.65); }
        @media (prefers-color-scheme: dark) {
          :root:not([data-mode="light"]) .lp-mockup { box-shadow: 0 1px 2px rgba(16,24,40,.40), 0 20px 40px -12px rgba(16,24,40,.55), 0 48px 90px -24px rgba(16,24,40,.65); }
        }
        /* Λεπτό 3D «κάθισμα» καθώς μπαίνει στην οθόνη, scroll-driven, χωρίς engine.
           Progressive enhancement: όπου δεν υποστηρίζεται, το mockup είναι απλώς επίπεδο. */
        @keyframes lpTilt { from { opacity: .55; transform: perspective(1500px) rotateX(7deg) scale(.985); } to { opacity: 1; transform: perspective(1500px) rotateX(0deg) scale(1); } }
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            .lp-mockup { animation: lpTilt linear both; animation-timeline: view(); animation-range: entry 2% cover 40%; }
          }
        }
      `}</style>
      <div className="lp-mockup" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
        style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 18, overflow: 'hidden' }}>
        {/* chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <div className="lp-hide-xs" style={{ margin: '0 auto', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '5px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            property-os.gr/scan
          </div>
        </div>

        {/* stage */}
        <div role="tabpanel" id={`panel-${TABS[active].key}`} aria-labelledby={`tab-${TABS[active].key}`} style={{ position: 'relative', minHeight: 372 }}>
          <div key={active} className="lp-fade" style={{ padding: 'clamp(14px, 2.4vw, 22px)' }}>
            {active === 0 && <PanelScan />}
            {active === 1 && <PanelDashboard />}
            {active === 2 && <PanelAssistant />}
          </div>
        </div>
      </div>

      {/* tab pills */}
      <div role="tablist" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {TABS.map((t, i) => {
          const on = i === active;
          return (
            <button key={t.key} role="tab" aria-selected={on} id={`tab-${t.key}`} aria-controls={`panel-${t.key}`} onClick={() => { setActive(i); setPaused(true); }}
              style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--border-subtle)'}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: "'Inter', sans-serif", cursor: 'pointer', transition: 'all .2s' }}>
              {t.label}
              {on && !paused && <span key={active} className="lp-progress" style={{ position: 'absolute', left: 0, bottom: 0, height: 2, background: 'var(--accent)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Panel 1: Dashboard ──────────────────────────────────────────────────────
function PanelDashboard() {
  const months = [42, 55, 48, 61, 52, 70, 66, 78, 60, 84, 72, 90];
  const kpis = [['Καθαρή απόδοση', '4,8%'], ['Έσοδα / μήνα', '1.250 €'], ['Πληρότητα', '92%']];
  return (
    <div style={{ display: 'flex', gap: 16, textAlign: 'left' }}>
      <div className="lp-rail" style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 12px' }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>P</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Property OS</div>
        </div>
        {['Επισκόπηση', 'Ενοίκιο', 'Δαπάνες', 'Λογαριασμοί', 'Ημερολόγιο'].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, background: i === 0 ? 'var(--bg-elevated)' : 'transparent', border: i === 0 ? '1px solid var(--border-subtle)' : '1px solid transparent', color: i === 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontSize: 12.5, fontWeight: i === 0 ? 700 : 500 }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: i === 0 ? 'var(--text-secondary)' : 'var(--border-strong)' }} />{r}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {kpis.map(([l, v], i) => (
            <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '13px 14px' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{l}</div>
              <div style={{ fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{v}</div>
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
              <div key={i} className="lp-grow" style={{ animationDelay: `${i * 0.04}s`, flex: 1, height: `${m}%`, borderRadius: '4px 4px 0 0', background: i === months.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 34%, transparent)' }} />
            ))}
          </div>
        </div>
        <div className="lp-hide-xs" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Πρόταση:</strong> αλλάζοντας πάροχο ρεύματος εδώ, γλιτώνεις 184 € τον χρόνο.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panel 2: Scan ───────────────────────────────────────────────────────────
const check = <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
function PanelScan() {
  const filed = ['Λογαριασμοί', 'Δαπάνες', 'Ημερολόγιο', 'Αρχείο'];
  return (
    <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'left' }}>
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '18px 18px 16px' }}>
        <div className="lp-scanline" style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 60%, transparent)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em' }}>Ρεύμα</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Μηνιαίος λογαριασμός</div>
        </div>
        {[['Περίοδος', 'Ιούν 2026'], ['Κατανάλωση', '312 kWh'], ['Ημ. λήξης', '10/08/2026']].map(([l, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--text-secondary)' }}><span>{l}</span><span style={{ color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Πληρωτέο</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>88,50&nbsp;€</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 2px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>
        Μπήκε μόνος του σε:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {filed.map((t, i) => (
          <span key={i} className="lp-pop" style={{ animationDelay: `${0.18 * i + 0.3}s`, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100, padding: '6px 12px' }}>{check}{t}</span>
        ))}
      </div>
    </div>
  );
}

// ── Panel 3: Assistant ──────────────────────────────────────────────────────
function PanelAssistant() {
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
        <div className="lp-pop" style={{ animationDelay: '.1s', alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 14px', borderRadius: 14, borderBottomRightRadius: 4, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, lineHeight: 1.5 }}>Νόα, πόσα ξόδεψα σε ρεύμα φέτος;</div>
        <div className="lp-pop" style={{ animationDelay: '.5s', alignSelf: 'flex-start', maxWidth: '88%', padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
          Φέτος <strong>1.240 €</strong> σε ρεύμα, 18% πάνω από πέρσι. Το ένα ακίνητο τα τρώει όλα. Να σε πάω να δεις;
        </div>
        <div className="lp-pop" style={{ animationDelay: '.9s', alignSelf: 'flex-start' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 26%, transparent)', borderRadius: 100, padding: '6px 12px' }}>
            Πήγαινε: Δαπάνες
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
            <span key={i} className="lp-bar" style={{ animationDelay: `${i * 0.09}s`, width: 3, height: 18, borderRadius: 2, background: 'color-mix(in srgb, var(--accent) 55%, transparent)' }} />
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginLeft: 'auto' }}>Μίλα του ελληνικά…</div>
      </div>
    </div>
  );
}
