'use client';

// ═══════════════════════════════════════════════════════════════════════════
// LandingShowcase, διαδραστικό, αυτο-εναλλασσόμενο showcase μέσα σε πλαίσιο
// εφαρμογής. Τρεις πράξεις: Πίνακας · Σάρωση · Βοηθός. Εναλλάσσεται μόνο του,
// κάνεις κλικ για να αλλάξεις, σταματά όταν το κοιτάς (hover). 0 εικόνες.
// Τα πάνελ ζουν στο ShowcasePanels.tsx (κοινά με το scrollytelling).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { PanelFX, PanelScan, PanelDashboard, PanelAssistant } from './ShowcasePanels';
import { T } from '@/components/Theme';

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
  // Διακριτικό 3D: το πλαίσιο γέρνει ελάχιστα προς τον κέρσορα (έως 3,5°) και
  // επανέρχεται απαλά. Ανενεργό όταν ο χρήστης προτιμά μειωμένη κίνηση.
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const noMotion = useRef(false);
  useEffect(() => { try { noMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ } }, []);
  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (noMotion.current || !tiltRef.current) return;
    const r = tiltRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    tiltRef.current.style.transform = `perspective(1400px) rotateX(${(-y * 3.5).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg)`;
  };
  const resetTilt = () => { if (tiltRef.current) tiltRef.current.style.transform = 'perspective(1400px) rotateX(0deg) rotateY(0deg)'; };

  useEffect(() => {
    if (paused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = setInterval(() => setActive(a => (a + 1) % TABS.length), ROTATE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [paused]);

  return (
    <div style={{ position: 'relative', maxWidth: 960, margin: 'clamp(40px, 6vw, 72px) auto 0' }}>
      <PanelFX />
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
        /* Εναλλαγή σκηνής και μπάρα προόδου των καρτελών. */
        @keyframes lpFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .lp-fade { animation: lpFade .45s cubic-bezier(.2, 0, 0, 1) both; }
        @keyframes lpProg { from { width: 0; } to { width: 100%; } }
        .lp-progress { animation: lpProg ${ROTATE_MS}ms linear both; }
        @media (prefers-reduced-motion: reduce) {
          .lp-fade, .lp-progress { animation: none !important; }
        }
        /* Μέσα στο σκοτεινό hero, το mockup φωτίζεται σαν έκθεμα: απαλή γαλάζια
           λάμψη πίσω του, ώστε το προϊόν να είναι το φωτεινότερο σημείο της σκηνής. */
        .lp-hero .lp-mockup { box-shadow: 0 1px 2px rgba(2,6,18,.5), 0 24px 48px -12px rgba(2,6,18,.6), 0 0 140px -16px rgba(26,115,232,.45) !important; border-color: rgba(255,255,255,.14); }
      `}</style>
      <div ref={tiltRef} onMouseMove={onTilt} onMouseLeave={resetTilt} style={{ transition: 'transform 0.35s cubic-bezier(0.2, 0, 0, 1)', willChange: 'transform' }}>
      <div className="lp-mockup" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
        style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 18, overflow: 'hidden' }}>
        {/* chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <div className="lp-hide-xs" style={{ margin: '0 auto', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '5px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            propertyos.gr/scan
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
      </div>

      {/* tab pills */}
      <div role="tablist" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {TABS.map((t, i) => {
          const on = i === active;
          return (
            <button key={t.key} role="tab" aria-selected={on} id={`tab-${t.key}`} aria-controls={`panel-${t.key}`} onClick={() => { setActive(i); setPaused(true); }}
              style={{ position: 'relative', overflow: 'hidden', border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--border-subtle)'}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: T.font.sans, cursor: 'pointer', transition: 'all .2s' }}>
              {t.label}
              {on && !paused && <span key={active} className="lp-progress" style={{ position: 'absolute', left: 0, bottom: 0, height: 2, background: 'var(--accent)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
