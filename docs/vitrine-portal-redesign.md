# Vitrine & Portal Redesign

This document summarizes the redesign work done on the `vitrine` marketing
site and the `portal` login experience, plus the research that motivated it.

## Research

Surveyed two tiers of reference sites to ground the visual direction:

- **Peer engineering universities** — MIT, Stanford, Caltech, Georgia Tech,
  Carnegie Mellon. Findings: a near-universal nav skeleton (About / Academics
  / Research / Admissions / Campus Life / News / Alumni), a sans-body +
  serif-heading type pairing used by the more polished sites (Stanford,
  CMU), no off-the-shelf animation libraries anywhere, and hero carousels
  are effectively extinct at this tier — replaced by a single still or video
  with subtle motion.
- **Creative/tech-forward schools** — Hack Club, Olin College, Minerva
  University. Findings: scrapbook-style rotated photos and hand-drawn
  doodles (Hack Club), inline bold-word emphasis inside hero copy instead of
  one flat-weight paragraph (Olin), and oversized full-bleed serif
  statements plus a scrolling deadline ticker (Minerva).

These findings drove the typography swap, the marquee ticker, the statement
band, and the inline-emphasis helper described below.

## Design system changes (`apps/vitrine`)

- **Typography** — `--display` switched from Saira (sans) to Fraunces (a
  soft editorial serif), paired with the existing Montserrat body copy.
  Applies sitewide to all H1/H2/program-titles/stat-numbers via a single CSS
  variable.
- **Hero motion** — a slow Ken Burns pan/zoom on hero background images
  (`.hero-bg`), replacing flat static imagery.
- **Wave dividers** — `WaveDivider` (in `components/site.tsx`) renders a soft
  SVG wave at a section boundary instead of a hard rectangular cut.
- **Marquee ticker** — `Marquee` renders an infinite horizontally-scrolling
  strip (two duplicated tracks sliding left) for things like program names,
  admissions deadlines, or skill keywords. Used on the homepage, Academics,
  and Admissions.
- **Statement band** — a single oversized italic-serif line on a full-bleed
  dark section, breaking up repetitive card-grid rhythm (homepage, between
  Programs and Features).
- **Card hover personality** — `.card-tilt` (full card style) and
  `.tilt-hover` (transform-only, for cards that define their own
  background) apply an alternating ±1.3° rotation + lift on hover instead of
  a uniform translateY, so a six-card grid doesn't read as six identical
  templated tiles.
- **Inline emphasis** — `emphasize(text, words)` bolds specific words/phrases
  within a sentence (the Olin pattern) instead of setting a whole paragraph
  in one flat weight. Used in hero and section subcopy across Home,
  Academics, and Admissions.
- **`AnimatedNumber`** — a count-up-on-scroll stat number, extracted into
  `site.tsx` so Home, Academics, and any future page can share it.

A "3-line audience band" (Future Students / Current Students / Faculty &
Staff / Visitors & Family) was added and then removed sitewide per feedback
— the header and footer already cover that navigation need.

## New pages (`apps/vitrine/src/app`)

Four pages were added to close the gap with the real daust.org site
structure, each sourced from verified content on the live site (research
focus areas and center directors, the Technology Ventures Program's
six-stage curriculum, campus/student-life facts, alumni stats and
testimonials):

- `/research` — focus areas, the DAUST–IRESSEF Global Health Technology
  Research Center, and a leadership/directors grid.
- `/startups` — the Technology Ventures Program roadmap, deep-tech focus
  domains, and a "what you get" benefits list.
- `/campus` — a photo mosaic, student-life features, and a "plan your
  visit" section with real location/travel facts.
- `/alumni` — cohort stats, a "where they go" sectors grid, and graduate
  testimonials.

The header nav and footer were updated to include all four (and the
redundant "Home" nav link — already covered by the logo — was dropped). A
duplicate "Contact" footer link that pointed at the same place as the
dedicated Contact column was also removed.

## Page content enrichment

Three pages were filled out with previously-unused or newly-added real
content rather than left thin:

- **About** — a Leadership section (founder bio + quote) and a four-point
  founding timeline (2017 → 2022 → 2025 → 2026).
- **Academics** — an animated stat strip, a skills marquee, a two-phase
  program structure (PREPA foundation → specialization), a dedicated UNL
  2+2 partnership section with a large numeral callout, and a faculty
  directory with department avatar badges (real names per department).
- **Admissions** — a deadline/scholarship marquee under the hero, a
  visually featured (larger, two-column-span) tuition card instead of a
  flat fee grid, tilt-hover scholarship tiers, and FAQ answers that fade in
  on open instead of popping in instantly.

## Portal login redesign (`apps/portal/src/app/login`)

Replaced the bare stacked-input form with a split-screen layout:

- Left panel: Ken Burns campus photo, gradient overlay, brand mark, a
  founder pull-quote, and an accreditation/location footer line.
- Right panel: icon-prefixed email/password fields, a working show/hide
  password toggle, a styled error alert, a loading spinner on submit, and a
  "Demo accounts" disclosure where clicking a role chip actually autofills
  the form (replacing a plain copy-pasted credentials blob).
- Collapses to a single column on small screens.

## Notes for future work

- The job-placement stat is quoted as 100% on Home/About/Admissions but 90%
  on the Alumni page — both numbers come from the real site, but they
  should be reconciled to one source of truth.
- Faculty rosters, research directors, and the founding timeline are
  hardcoded in `i18n/en.ts` / `i18n/fr.ts`. They're accurate as of writing
  but will drift — worth sourcing from the CMS/API layer if this content
  needs to stay authoritative long-term.
