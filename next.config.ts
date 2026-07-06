import type { NextConfig } from "next";

// ── Content Security Policy ──────────────────────────────────────────────────
// Επιτρέπει ό,τι χρειάζεται πραγματικά η εφαρμογή (Google Fonts, inline styles,
// το inline theme-init script, Supabase realtime, data/blob εικόνες για σάρωση)
// και μπλοκάρει τα υπόλοιπα (ξένα scripts, framing, object embeds) ώστε ακόμη κι
// αν περάσει XSS, να μη μπορεί να στείλει δεδομένα έξω ή να κλέψει τη συνεδρία.
// Σε development το Next.js (Turbopack + React dev tools) απαιτεί eval() και
// websocket για hot-reload· γι' αυτό χαλαρώνουμε ΜΟΝΟ τοπικά. Στην παραγωγή η
// πολιτική μένει αυστηρή, χωρίς 'unsafe-eval' και χωρίς upgrade-insecure στο dev
// (που σπάει το http://localhost).
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // Το inline theme-init script + η ενυδάτωση του Next χρειάζονται 'unsafe-inline'.
  // Το 'unsafe-eval' μπαίνει ΜΟΝΟ σε development (το χρειάζεται το Next dev).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Ο browser μιλάει απευθείας στο Supabase (REST + realtime). Το AI καλείται
  // server-side μέσω /api/anthropic ('self'), όχι από τον browser. Σε development
  // προστίθεται το ws:// για το hot-reload του Next.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Σε production ανάγκασε HTTPS· τοπικά όχι, γιατί σπάει το http://localhost.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Κάμερα (σάρωση) & μικρόφωνο (φωνή) επιτρέπονται μόνο στο ίδιο origin· τα άλλα κλειστά.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
