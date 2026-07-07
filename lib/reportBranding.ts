// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ πηγή αλήθειας για τη λευκή επωνυμία (white-label) των εκτυπώσιμων αναφορών.
// Δυνατότητα του πλάνου «Επαγγελματίας». Οι καθαρές συναρτήσεις (χωρίς DOM)
// χρησιμοποιούνται και από το statement.ts (που ΔΕΝ είναι 'use client'), γι' αυτό
// το μόνο React που εισάγεται εδώ είναι τα hooks, τα οποία καλούνται μόνο από
// client components. Ασφάλεια: το accent μπαίνει σε CSS και το logo σε src, οπότε
// καθαρίζονται αυστηρά κατά τη φόρτωση (sanitizeAccent/sanitizeLogo) — το escHtml
// από μόνο του ΔΕΝ αρκεί για αυτά τα δύο.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ReportBranding {
  enabled: boolean;
  companyName: string;
  logoUrl: string;
  accentColor: string;
  phone: string;
  email: string;
}

export const DEFAULT_ACCENT = '#1a73e8';

/** HTML-escape για ασφαλή παρεμβολή σε markup αναφορών. */
export function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Δέχεται μόνο έγκυρο 6ψήφιο hex (#rrggbb), αλλιώς επιστρέφει το προεπιλεγμένο. */
export function sanitizeAccent(c?: string | null): string {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : DEFAULT_ACCENT;
}

/** Δέχεται μόνο raster data-URL (png/jpg/webp/gif) έως ~700 KB· απορρίπτει SVG/εξωτερικά URL. */
export function sanitizeLogo(u?: string | null): string {
  if (!u) return '';
  if (u.length >= 700000) return '';
  return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(u) ? u : '';
}

/** Το χρώμα επωνυμίας (καθαρισμένο) ή το προεπιλεγμένο. */
export function reportAccent(b?: ReportBranding | null): string {
  return sanitizeAccent(b?.accentColor);
}

/** :root μεταβλητές που ορίζουν το --accent (αρκετές αναφορές το χρησιμοποιούν ήδη). */
export function brandRootVars(b?: ReportBranding | null): string {
  return `:root{--accent:${reportAccent(b)};--accent-text:#fff}`;
}

/** <img> του λογοτύπου (αν υπάρχει έγκυρο), αλλιώς κενό string. */
export function brandLogoImg(b?: ReportBranding | null, px = 32): string {
  const logo = sanitizeLogo(b?.logoUrl);
  return logo ? `<img src="${logo}" alt="" style="height:${px}px;width:auto;max-width:${px * 5}px;object-fit:contain;display:block"/>` : '';
}

/** Επωνυμία (escaped) ή fallback (προεπιλογή «Property OS»). */
export function brandName(b?: ReportBranding | null, fallback = 'Property OS'): string {
  return escHtml(b?.companyName?.trim() || fallback);
}

/** Γραμμή επικοινωνίας «τηλέφωνο · email» (escaped), ή κενό. */
export function brandContactLine(b?: ReportBranding | null): string {
  return [b?.phone?.trim(), b?.email?.trim()].filter(Boolean).map(escHtml).join(' · ');
}

/** Φόρτωση προφίλ επωνυμίας ανά χρήστη. null όταν λείπει ή enabled=false. */
export async function loadReportBranding(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ReportBranding | null> {
  const { data } = await supabase
    .from('report_branding')
    .select('enabled, company_name, logo_url, accent_color, phone, email')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || data.enabled === false) return null;
  return {
    enabled: true,
    companyName: (data.company_name as string) || '',
    logoUrl: sanitizeLogo(data.logo_url as string),
    accentColor: sanitizeAccent(data.accent_color as string),
    phone: (data.phone as string) || '',
    email: (data.email as string) || '',
  };
}

/** Client hook: φορτώνει το προφίλ επωνυμίας εκ των προτέρων (για να είναι έτοιμο πριν το window.open). */
export function useReportBranding(userId?: string): ReportBranding | null {
  const [branding, setBranding] = useState<ReportBranding | null>(null);
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let alive = true;
    loadReportBranding(supabase, userId).then(b => { if (alive) setBranding(b); });
    return () => { alive = false; };
  }, [userId]);
  return branding;
}
