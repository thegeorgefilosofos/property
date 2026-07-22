# Email Console

Internal cockpit for the automated email system. Renders the full
`supabase/functions/_shared/emailCopy.CATALOG` (102 emails, 15 programs)
as a customer-journey map rather than a flat list.

## What it is

A single self-contained HTML page, built to be published as an artifact.

- **Journey arc** — the five relationship phases (Υποδοχή · Αφοσίωση ·
  Ανάπτυξη · Καθημερινότητα · Εμπιστοσύνη) head the tool and drive navigation,
  each with its own wayfinding hue.
- **Program map** — a uniform, phase-colored grid of the 15 programs
  (overview); drill into a phase to see its emails as compact cards.
- **Plan targeting** — filter by Δωρεάν / Ιδιώτης / Επαγγελματίας.
- **Live preview** — any email opens in a side sheet with full campaign
  metadata (έναυσμα, χρονισμός, συχνότητα, στόχος) and a pixel-accurate render.
- Google-clean, light + dark, embedded Inter, correct accent-free Greek
  uppercase.

## Build

```
# 1. regenerate the data from the catalog (renders every email to blocks)
npx tsx gen-console-data.ts        # writes console-data.json

# 2. inline font + data into the template
node build-console.mjs             # writes email-console.html
```

`console-data.json` and `email-console.html` are build outputs and are not
tracked. The source of truth is the catalog plus `console-template.html` and
`gen-console-data.ts`. `inter.css` is the self-hosted font (CDN is blocked in
the build environment) embedded as base64 `@font-face` data URIs.
