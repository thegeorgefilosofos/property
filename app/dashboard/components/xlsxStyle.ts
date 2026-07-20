'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Κοινό «λογιστικό» στυλ για ΟΛΕΣ τις εξαγωγές Excel — ώστε κάθε αρχείο (Ε2,
// φάκελος λογιστή κ.λπ.) να έχει την ίδια, καθαρή, επαγγελματική εμφάνιση:
// έντονες αναδιπλωμένες επικεφαλίδες σε γκρι φόντο, πλαίσια, στοίχιση, δύο
// δεκαδικά, ημερομηνίες. Ασπρόμαυρο (γκρι/μαύρο) — χωρίς χρώμα/θόρυβο.
// ═══════════════════════════════════════════════════════════════════════════
import XLSX from 'xlsx-js-style';
export { XLSX };

export const FMT = {
  eur: '#,##0.00;-#,##0.00',   // ευρώ, δύο δεκαδικά, αρνητικά με πρόσημο
  int: '#,##0',
  pct: '0.00',
  date: 'dd/mm/yyyy',
} as const;

const INK = '111111', SUB = '6B7280', LINE = 'D0D5DD', HEADBG = 'E9ECEF', SECBG = 'F3F4F6';
const bThin = { style: 'thin', color: { rgb: LINE } };
export const boxAll = { top: bThin, bottom: bThin, left: bThin, right: bThin };
// Μία γραμματοσειρά παντού (τυποποίηση): Calibri — καθαρή, τυπική για λογιστικά,
// αποδίδει σωστά ελληνικά. font(): βοηθός για ενιαία εφαρμογή του ονόματος.
const FONT = 'Calibri';
const font = (o: { bold?: boolean; italic?: boolean; sz: number; color?: { rgb: string } }) => ({ name: FONT, color: { rgb: INK }, ...o });

export const S = {
  title: { font: font({ bold: true, sz: 13 }), alignment: { vertical: 'center' } },
  sub: { font: font({ italic: true, sz: 9, color: { rgb: SUB } }), alignment: { vertical: 'center' } },
  section: { font: font({ bold: true, sz: 10 }), fill: { fgColor: { rgb: SECBG } }, alignment: { vertical: 'center' } },
  label: { font: font({ sz: 10, color: { rgb: '374151' } }), alignment: { vertical: 'center' } },
  field: { font: font({ sz: 10 }), alignment: { vertical: 'center' }, border: { bottom: bThin } },
  head: { font: font({ bold: true, sz: 9.5 }), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, fill: { fgColor: { rgb: HEADBG } }, border: boxAll },
  txt: { font: font({ sz: 10 }), alignment: { horizontal: 'left', vertical: 'center' }, border: boxAll },
  txtWrap: { font: font({ sz: 10 }), alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: boxAll },
  num: { font: font({ sz: 10 }), alignment: { horizontal: 'right', vertical: 'center' }, border: boxAll },
  strongTxt: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'left', vertical: 'center' }, border: boxAll },
  strongNum: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'right', vertical: 'center' }, border: boxAll },
  totTxt: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'left', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: INK } }, bottom: bThin, left: bThin, right: bThin } },
  totNum: { font: font({ bold: true, sz: 10 }), alignment: { horizontal: 'right', vertical: 'center' }, border: { top: { style: 'medium', color: { rgb: INK } }, bottom: bThin, left: bThin, right: bThin } },
} as const;

export type Cell = { v: string | number | Date; t?: string; z?: string; s?: object };

/** Ασφαλής εφαρμογή στυλ/τύπου/μορφής σε κελί (δημιουργεί το κελί αν λείπει). */
export function setCell(ws: XLSX.WorkSheet, r: number, c: number, patch: Partial<Cell>): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cur = (ws[addr] as Cell) || { v: '', t: 's' };
  ws[addr] = { ...cur, ...patch, s: { ...((cur.s as object) || {}), ...(patch.s || {}) } };
}
