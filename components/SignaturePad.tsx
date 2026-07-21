'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SignaturePad — ηλεκτρονική υπογραφή (e-signature) για νομικά έγγραφα.
// Δύο τρόποι: «Σχέδιο» (ζωγραφική με ποντίκι/δάχτυλο) ή «Πληκτρολόγηση» (το όνομα
// σε καλλιγραφική γραμματοσειρά). Παράγει PNG data URL μέσω onChange, έτοιμο για
// ενσωμάτωση στο true-PDF (lib/pdf/pdfReport → section 'sign').
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { T, TT } from '@/components/Theme';

export default function SignaturePad({ onChange, height = 120 }: { onChange: (dataUrl: string) => void; height?: number }) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typed, setTyped] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Ρύθμιση καμβά σε ανάλυση οθόνης (crisp σε high-DPI).
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(3, (globalThis.devicePixelRatio || 1));
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111111';
  }, [mode]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => { drawing.current = true; last.current = pos(e); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = canvasRef.current!; const ctx = c.getContext('2d')!; const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; if (!hasInk) setHasInk(true);
  };
  const end = () => {
    if (!drawing.current) return; drawing.current = false;
    const c = canvasRef.current!; onChange(c.toDataURL('image/png'));
  };

  const clear = () => {
    const c = canvasRef.current; if (c) { const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, c.width, c.height); }
    setHasInk(false); setTyped(''); onChange('');
  };

  // Πληκτρολόγηση → render σε καμβά (καλλιγραφική).
  const renderTyped = (text: string) => {
    setTyped(text);
    const off = document.createElement('canvas');
    off.width = 520; off.height = 150;
    const ctx = off.getContext('2d')!;
    ctx.fillStyle = '#111111'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 52px "Brush Script MT", "Segoe Script", "Comic Sans MS", cursive';
    ctx.fillText(text || '', 12, 82);
    onChange(text.trim() ? off.toDataURL('image/png') : '');
  };

  const tab = (m: 'draw' | 'type', label: string): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: T.radius.inner, cursor: 'pointer',
    border: `1px solid ${mode === m ? 'var(--accent-border)' : 'var(--border-default)'}`,
    background: mode === m ? 'var(--accent-soft)' : 'transparent', color: mode === m ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans,
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={tab('draw', '')} onClick={() => setMode('draw')}>Σχέδιο</button>
          <button type="button" style={tab('type', '')} onClick={() => setMode('type')}>Πληκτρολόγηση</button>
        </div>
        <button type="button" onClick={clear} style={{ ...TT.caption, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 700 }}>Καθαρισμός</button>
      </div>

      {mode === 'draw' ? (
        <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
          style={{ width: '100%', height, border: '1px solid var(--border-default)', borderRadius: T.radius.inner, background: '#fff', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
      ) : (
        <div style={{ border: '1px solid var(--border-default)', borderRadius: T.radius.inner, background: '#fff', padding: 12 }}>
          <input value={typed} onChange={e => renderTyped(e.target.value)} placeholder="Πληκτρολόγησε το όνομά σου"
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: '#111', fontSize: 34, fontStyle: 'italic', fontFamily: '"Brush Script MT","Segoe Script","Comic Sans MS",cursive', boxSizing: 'border-box' }} />
        </div>
      )}
      <div style={{ ...TT.caption, marginTop: 6 }}>{mode === 'draw' ? (hasInk ? 'Υπέγραψε παραπάνω · μπορείς να καθαρίσεις και να ξαναϋπογράψεις.' : 'Υπόγραψε με το ποντίκι ή το δάχτυλο.') : 'Η υπογραφή δημιουργείται από το όνομά σου.'}</div>
    </div>
  );
}
