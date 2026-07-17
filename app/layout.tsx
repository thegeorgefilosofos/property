import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "./ThemeProvider";
import CookieConsent from "./CookieConsent";

export const metadata: Metadata = {
  title: "Property OS",
  description: "Premium real estate management for Greek investors",
};

// Prevent flash of wrong theme, runs before React hydration.
// Πρέπει να διαβάζει ΑΚΡΙΒΩΣ τα ίδια κλειδιά και το ίδιο default με τον
// ThemeProvider (pos_mode για dark/light, pos_theme για την παλέτα, default
// 'dark'/'midnight'), αλλιώς το pre-paint διαφέρει από το post-hydration και
// εμφανίζεται στιγμιαία λάθος θέμα.
const themeInitScript = `
(function() {
  try {
    var mode  = localStorage.getItem('pos_mode')  || 'dark';
    var theme = localStorage.getItem('pos_theme') || 'midnight';
    var el = document.documentElement;
    el.setAttribute('data-mode',  mode === 'light' ? 'light' : 'dark');
    el.setAttribute('data-theme', theme);
  } catch(e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // nonce από το middleware (proxy.ts) για το inline theme-init script υπό CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="el" suppressHydrationWarning>
      <head>
        {/* Κειμενικές γραμματοσειρές: self-hosted (βλ. globals.css @font-face).
            Preload τα δύο βασικά υποσύνολα του Inter ώστε να μη «τρεμοπαίζει» το
            κείμενο στο πρώτο paint (latin για UI, greek για τα ελληνικά). */}
        <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-greek.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* Καμία εξωτερική γραμματοσειρά: όλα self-hosted (Inter/Roboto Mono) + inline SVG εικονίδια. */}
        {/* Theme init, must run before paint to prevent flash */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>
          {children}
          <CookieConsent />
        </ThemeProvider>
      </body>
    </html>
  );
}