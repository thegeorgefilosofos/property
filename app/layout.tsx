import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ThemeProvider } from "./ThemeProvider";
import CookieConsent from "./CookieConsent";

export const metadata: Metadata = {
  title: "Property OS",
  description: "Premium real estate management for Greek investors",
};

// Prevent flash of wrong theme, runs before React hydration
const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('pos-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = saved ? saved === 'dark' : prefersDark;
    document.documentElement.setAttribute('data-mode', isDark ? 'dark' : 'light');
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
        {/* Μόνο για τα εικονίδια (Material Symbols) που φορτώνονται από την Google. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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