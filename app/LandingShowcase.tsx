'use client';

// ═══════════════════════════════════════════════════════════════════════════
// LandingShowcase: το προϊόν μέσα σε πλαίσιο εφαρμογής, στην πρώτη οθόνη.
// Δείχνει ΜΙΑ πράξη, τη Σάρωση, γιατί αυτή ακριβώς υπόσχεται ο τίτλος από πάνω.
//
// ΓΙΑΤΙ ΕΦΥΓΕ ΤΟ ΚΑΡΟΥΖΕΛ ΤΩΝ ΤΡΙΩΝ ΚΑΡΤΕΛΩΝ:
//
// 1. ΕΛΕΓΕ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ ΔΥΟ ΦΟΡΕΣ. Τα τρία πάνελ (Σάρωση, Πίνακας, Βοηθός)
//    είναι ακριβώς τα ίδια που δείχνει και το scrollytelling «Πώς δουλεύει»,
//    λίγο πιο κάτω, με αφήγηση δίπλα τους. Στο hero έπαιζαν χωρίς αφήγηση, σε
//    5,2 δευτερόλεπτα το καθένα, δηλαδή πολύ γρήγορα για να καταλάβεις τι
//    βλέπεις και πολύ αργά για να το προσπεράσεις. Ό,τι επαναλαμβάνεται παύει
//    να είναι σχεδιασμός και γίνεται θόρυβος.
//
// 2. Η ΨΕΥΤΙΚΗ ΓΡΑΜΜΗ ΔΙΕΥΘΥΝΣΗΣ ΕΛΕΓΕ ΨΕΜΑΤΑ. Το πλαίσιο γράφει πάντα
//    «properwise.gr/scan», ενώ το περιεχόμενο άλλαζε σε πίνακα και βοηθό.
//    Μια λεπτομέρεια που δεν στέκει είναι χειρότερη από λεπτομέρεια που λείπει.
//
// 3. ΣΥΓΚΡΟΥΣΗ ΟΝΟΜΑΤΩΝ. Η μπάρα προόδου της καρτέλας λεγόταν .lp-progress,
//    ίδιο όνομα με τη γραμμή ανάγνωσης του page.tsx. Δύο καθολικά <style> με
//    την ίδια κλάση: το ένα ακύρωνε το άλλο, με αποτέλεσμα η γραμμή ανάγνωσης
//    να γεμίζει μία φορά και να μένει μόνιμα γεμάτη.
//
// Ό,τι κάνει τη σκηνή ζωντανή μένει ακέραιο: το πλαίσιο γέρνει προς τον
// κέρσορα, «κάθεται» με scroll-driven κίνηση καθώς μπαίνει στην οθόνη και
// φωτίζεται σαν έκθεμα μέσα στο σκοτεινό hero.
//
// ΚΑΝΟΝΑΣ ΟΝΟΜΑΤΩΝ: το πρόθεμα lp- ανήκει ΑΠΟΚΛΕΙΣΤΙΚΑ στο app/page.tsx.
// Κάθε component γράφει δικές του κλάσεις με δικό του πρόθεμα (εδώ: ls-).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { PanelFX, PanelScan } from './ShowcasePanels';
import { T } from '@/components/tokens';

export default function LandingShowcase() {
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

  return (
    <div style={{ position: 'relative', maxWidth: 660, margin: 'clamp(40px, 6vw, 72px) auto 0' }}>
      <PanelFX />
      <style>{`
        /* Βάση = σκούρο, όπως και το :root στο globals.css. Το φωτεινό είναι η
           εξαίρεση που δηλώνεται ρητά. Πριν υπήρχαν τρεις κανόνες για δύο θέματα:
           η σκιά του σκούρου ήταν γραμμένη δύο φορές, μία για το [data-mode] και
           μία για την προτίμηση λειτουργικού. */
        .ls-mockup { box-shadow: 0 1px 2px rgba(16,24,40,.40), 0 20px 40px -12px rgba(16,24,40,.55), 0 48px 90px -24px rgba(16,24,40,.65); transform-origin: center top; will-change: transform; }
        :root[data-mode="light"] .ls-mockup { box-shadow: 0 1px 1px rgba(16,24,40,.05), 0 12px 24px -8px rgba(16,24,40,.10), 0 40px 64px -24px rgba(16,24,40,.14); }
        /* Λεπτό 3D «κάθισμα» καθώς μπαίνει στην οθόνη, scroll-driven, χωρίς engine.
           Progressive enhancement: όπου δεν υποστηρίζεται, το mockup είναι απλώς επίπεδο. */
        @keyframes lsTilt { from { opacity: .55; transform: perspective(1500px) rotateX(7deg) scale(.985); } to { opacity: 1; transform: perspective(1500px) rotateX(0deg) scale(1); } }
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            .ls-mockup { animation: lsTilt linear both; animation-timeline: view(); animation-range: entry 2% cover 40%; }
          }
        }
        /* Μέσα στο σκοτεινό hero, το mockup φωτίζεται σαν έκθεμα: απαλή γαλάζια
           λάμψη πίσω του, ώστε το προϊόν να είναι το φωτεινότερο σημείο της σκηνής. */
        .lp-hero .ls-mockup { box-shadow: 0 1px 2px rgba(2,6,18,.5), 0 24px 48px -12px rgba(2,6,18,.6), 0 0 140px -16px color-mix(in srgb, var(--accent) 45%, transparent) !important; border-color: rgba(255,255,255,.14); }
      `}</style>
      <div ref={tiltRef} onMouseMove={onTilt} onMouseLeave={resetTilt} style={{ transition: 'transform 0.35s cubic-bezier(0.2, 0, 0, 1)', willChange: 'transform' }}>
        <div className="ls-mockup" style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.card, overflow: 'hidden' }}>
          {/* chrome */}
          {/* ═══ Η ΜΠΑΡΑ ΔΙΕΥΘΥΝΣΗΣ ΕΜΕΝΕ ΑΔΕΙΑ ΣΤΟ ΚΙΝΗΤΟ ═══════════════════
              Το πλαίσιο φορούσε `lp-hide-xs`, δηλαδή κάτω από 520 εικονοστοιχεία
              γινόταν `display: none`. Απέμεναν τρεις κουκκίδες σε μια κενή
              γκρίζα λωρίδα: όχι πλαίσιο περιηγητή, αλλά κάτι που μοιάζει να μη
              φόρτωσε. Ακριβώς στην πρώτη οθόνη, όπου κρίνεται αν το προϊόν
              δείχνει προσεγμένο.

              ΚΑΙ ΔΕΝ ΧΡΕΙΑΖΟΤΑΝ ΚΑΝ. Μετρημένο στα 390: το πλαίσιο έχει 313
              εικονοστοιχεία εσωτερικά, οι κουκκίδες πιάνουν 57 και το πλαίσιο
              διεύθυνσης 146. Χωρούσε με 110 περίσσευμα. Η απόκρυψη ήταν
              αμυντική υπόθεση, όχι μέτρηση.

              Οι κουκκίδες δηλώνουν `flex-shrink: 0` και το πλαίσιο κόβει με
              αποσιωπητικά: σε οποιοδήποτε πλάτος, η μπάρα μένει μπάρα. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)', flexShrink: 0 }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)', flexShrink: 0 }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--border-strong)', flexShrink: 0 }} />
            <div style={{ margin: '0 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '5px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>
              <svg aria-hidden="true" width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>properwise.gr/scan</span>
            </div>
          </div>

          {/* Η σκηνή: μία πράξη, αυτή που υπόσχεται ο τίτλος από πάνω. */}
          <div style={{ position: 'relative' }}>
            <div style={{ padding: 'clamp(18px, 2.6vw, 30px)' }}>
              <PanelScan />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
