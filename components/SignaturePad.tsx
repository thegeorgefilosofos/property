'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SignaturePad — ηλεκτρονική υπογραφή (e-signature) για νομικά έγγραφα.
// Δύο τρόποι: «Σχέδιο» (με ποντίκι/δάχτυλο) ή «Πληκτρολόγηση» (το όνομα σε
// καλλιγραφική γραμματοσειρά).
//
// Το πεδίο ακολουθεί το θέμα (σκούρο/ανοιχτό): η υπογραφή σχεδιάζεται με το
// μελάνι του κειμένου πάνω σε ήρεμη επιφάνεια, με διακριτική γραμμή υπογραφής.
// Η ΕΞΑΓΩΓΗ γίνεται πάντα με σκούρο μελάνι σε διάφανο καμβά, ώστε να είναι
// ευανάγνωστη στο λευκό PDF, ανεξάρτητα από το θέμα της οθόνης.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { T, TT } from '@/components/Theme';

type Pt = { x: number; y: number };

export default function SignaturePad({ onChange, height = 116 }: { onChange: (dataUrl: string) => void; height?: number }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef(false);

  const dpr = () => Math.min(3, globalThis.devicePixelRatio || 1);

  // Επανασχεδίαση του ορατού καμβά: διακριτική γραμμή υπογραφής + οι πινελιές
  // με το μελάνι του θέματος (getComputedStyle → resolved --text-primary).
  const redraw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const d = dpr();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const w = c.width / d, h = c.height / d;
    ctx.clearRect(0, 0, w, h);
    // Διακριτική γραμμή υπογραφής, σε ουδέτερο γκρι που διαβάζεται σε σκούρο/ανοιχτό.
    ctx.strokeStyle = 'rgba(140,140,145,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, h - 24); ctx.lineTo(w - 18, h - 24); ctx.stroke();
    // Πινελιές με το μελάνι του θέματος.
    ctx.strokeStyle = getComputedStyle(c).color;
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes.current) {
      if (s.length < 1) continue;
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y);
      for (const p of s) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }, []);

  const setup = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const d = dpr();
    c.width = Math.round(rect.width * d);
    c.height = Math.round(rect.height * d);
    redraw();
  }, [redraw]);

  useEffect(() => { setup(); }, [mode, setup]);

  const pos = (e: React.PointerEvent): Pt => { const c = canvasRef.current!; const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const start = (e: React.PointerEvent) => { drawing.current = true; strokes.current.push([pos(e)]); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; strokes.current[strokes.current.length - 1].push(pos(e)); redraw(); if (!hasInk) setHasInk(true); };
  const end = () => { if (!drawing.current) return; drawing.current = false; exportInk(); };

  // Εξαγωγή: σκούρο μελάνι σε ΔΙΑΦΑΝΟ καμβά (χωρίς λευκό πλαίσιο στο PDF).
  const exportInk = () => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const scale = 2;
    const off = document.createElement('canvas');
    off.width = Math.round(rect.width * scale);
    off.height = Math.round(rect.height * scale);
    const ctx = off.getContext('2d'); if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes.current) {
      if (s.length < 1) continue;
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y);
      for (const p of s) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    onChange(strokes.current.length ? off.toDataURL('image/png') : '');
  };

  const clear = () => { strokes.current = []; redraw(); setHasInk(false); setTyped(''); onChange(''); };

  /** Υπάρχει υπογραφή, με όποιον από τους δύο τρόπους. */
  const signed = mode === 'draw' ? hasInk : typed.trim().length > 0;

  // Πληκτρολόγηση → render με σκούρο μελάνι σε διάφανο καμβά (για το PDF).
  const renderTyped = (text: string) => {
    setTyped(text);
    const off = document.createElement('canvas');
    off.width = 520; off.height = 150;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#141414'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 52px "Brush Script MT", "Segoe Script", "Comic Sans MS", cursive';
    ctx.fillText(text || '', 12, 82);
    onChange(text.trim() ? off.toDataURL('image/png') : '');
  };

  // Ύψος από την κοινή κλίμακα αντί για literal 30: τα segmented controls του app
  // είχαν 30/34/36 ανάλογα με το αρχείο, οπότε η ίδια «γλώσσα» κουμπιού έδειχνε
  // διαφορετική σε κάθε οθόνη. T.h.sm είναι το πλησιέστερο σκαλί.
  const seg = (m: 'draw' | 'type'): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, height: T.h.sm, padding: '0 14px', borderRadius: T.radius.inner, cursor: 'pointer', border: 'none',
    background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? 'var(--accent-text)' : 'var(--text-secondary)',
    fontFamily: T.font.sans, transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s',
  });

  const surface: React.CSSProperties = {
    width: '100%', height, border: '1px solid var(--border-default)', borderRadius: T.radius.inner,
    background: 'var(--bg-elevated)', color: 'var(--text-primary)', boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Ο ΚΑΘΑΡΙΣΜΟΣ ΕΜΦΑΝΙΖΕΤΑΙ ΟΤΑΝ ΥΠΑΡΧΕΙ ΚΑΤΙ ΝΑ ΚΑΘΑΡΙΣΕΙ. Στο άδειο
          πλαίσιο ήταν κουμπί που δεν έκανε τίποτα — και το «τίποτα» το μαθαίνει
          ο χρήστης μόνο αφού το πατήσει. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner }}>
          <button type="button" style={seg('draw')} onClick={() => setMode('draw')}>Σχέδιο</button>
          <button type="button" style={seg('type')} onClick={() => setMode('type')}>Πληκτρολόγηση</button>
        </div>
        {signed && <button type="button" onClick={clear} style={{ ...TT.caption, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>Καθαρισμός</button>}
      </div>

      {mode === 'draw' ? (
        <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
          style={{ ...surface, touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
      ) : (
        <div style={{ ...surface, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
          <input value={typed} onChange={e => renderTyped(e.target.value)} placeholder="Πληκτρολόγησε το όνομά σου"
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 28, fontStyle: 'italic', fontFamily: '"Brush Script MT","Segoe Script","Comic Sans MS",cursive', boxSizing: 'border-box' }} />
        </div>
      )}
      {/* Η ΟΔΗΓΙΑ ΦΕΥΓΕΙ ΜΟΛΙΣ ΓΙΝΕΙ ΠΕΡΙΤΤΗ. Όποιος έχει ήδη υπογράψει ξέρει
          πώς υπογράφεται και το «μπορείς να καθαρίσεις» ήταν το κουμπί
          «Καθαρισμός» γραμμένο με άλλα λόγια, τρεις εκατοστές πιο κάτω. */}
      {!signed && <div style={{ ...TT.caption, marginTop: 6 }}>{mode === 'draw' ? 'Υπόγραψε με το ποντίκι ή το δάχτυλο.' : 'Η υπογραφή δημιουργείται από το όνομά σου.'}</div>}
    </div>
  );
}
