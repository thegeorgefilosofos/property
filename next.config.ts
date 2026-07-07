import type { NextConfig } from "next";

// ── Security headers ─────────────────────────────────────────────────────────
// Το Content-Security-Policy ορίζεται πλέον στο proxy.ts (middleware) με
// per-request nonce, ώστε να φύγει το 'unsafe-inline' από το script-src. Εδώ
// μένουν οι υπόλοιπες κεφαλίδες. Σε development παραλείπουμε το HSTS (σπάει το
// http://localhost)· η CSP ούτως ή άλλως δεν στέλνεται σε dev από το middleware.
const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  ...(isDev ? [] : [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  ]),
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
