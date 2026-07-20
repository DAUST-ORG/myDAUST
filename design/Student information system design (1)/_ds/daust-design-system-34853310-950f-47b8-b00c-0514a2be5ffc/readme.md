# DAUST Design System

**Dakar American University of Science & Technology** — brand & product UI design system.

DAUST is a five-year engineering university founded in 2017 by Prof. Sidy Ndao, located in Somone (Thiès region, Senegal). It follows an American-style education model emphasizing research, innovation, critical thinking and hands-on discovery, with the mission to educate Africa's future world-class engineers, scientists and innovators. Programs span Computer & Electrical Engineering, Mechanical Engineering, an Intensive English Program, a Technology Ventures (startup) program, and applied research.

DAUST's flagship product is **myDAUST**, a campus platform (`apps/api` NestJS, `apps/portal` Next.js, `apps/vitrine` Next.js) covering payments/billing, academics, admissions, dining, student affairs, and an innovation/project tracker. This design system was built by reading that codebase directly — tokens, component atoms, and page layouts below are lifted from real source, not screenshots.

## Sources used

- **Codebase**: `DAUST-ORG/myDAUST` (GitHub) — explore further at https://github.com/DAUST-ORG/myDAUST. Its `design/` folder holds 7 "throwaway design prototype" surfaces the DAUST team already built as the source of truth for screens: `daust-vitrine-design` (public website), `daust-admin-design` (billing/admin ops), `daust-student-design`, `daust-teacher-design`, `daust-student-affairs-design`, `daust-innovation-design`. Explore these directly for deeper fidelity than this system attempts to cover.
- **Local attachment**: `DAUST Platform Design/` — an earlier, website-only pass at this same brand (built before codebase access), used to sanity-check tone/copy; superseded here by the real codebase tokens (they matched exactly).
- **Uploaded logo**: `logo-daust-white.png` (white wordmark, transparent) — copied into `assets/logos/`.
- Root-level product screenshots in the repo (`admin-dashboard-full.png`, `portal-student-dashboard.png`, `faculty-dashboard.png`, etc.) are **actual dev-build screenshots** — plainer than the polished `design/` prototypes, used only as secondary confirmation of information architecture (nav labels, page structure).

## Brand at a glance

- **Primary color:** Navy `#153B6A` · **Accent:** Orange `#ED8425` · **Secondary accent:** Steel `#9DA6AE`
- **Signature motif:** the **tri-dash** (navy / orange / steel bars) beneath wordmarks and section headings, and the **capsule/pill** shape (buttons, badges, logo container).
- **Tone:** confident, mission-driven, pan-African, forward-looking, technical.

## Components

Grouped by directory under `components/`:

- **Core** (`components/core/`) — Button, IconButton, Badge, Avatar, Card
- **Forms** (`components/forms/`) — Input, Field, Select, SearchInput, Toggle, Segmented
- **Data** (`components/data/`) — Stat, Progress, Tabs, EmptyState, Sparkline, BarChart, Donut
- **Overlays** (`components/overlays/`) — Modal, Drawer
- **Layout** (`components/layout/`) — PageHeader, SectionTitle
- **Brand** (`components/brand/`) — TriDash, Eyebrow
- **Marketing** (`components/marketing/`) — Header, Footer, CTABand, PageHero, Heading, StatCounter

### Intentional additions
None of these are inventions beyond the source — every component above has a direct counterpart in `design/daust-admin-design/app/components.jsx` (the dashboard atom set, reused verbatim in style across teacher/student/affairs/innovation designs) or `design/daust-vitrine-design/shared.jsx` (the marketing-site primitives). The dashboard `Button` and marketing `Button` were merged into one component with a superset of variants (`primary/navy/secondary/outline/outlineLight/ghost/danger`) rather than kept as two colliding exports.

## Content fundamentals — how DAUST writes

- **Voice:** aspirational and mission-led, but concrete. Copy ties technology to purpose and Africa's future — e.g. "Educating Africa's future world-class engineers" and "An American-style university, rooted in African impact."
- **Person:** the institution speaks as "DAUST" or "we/our"; addresses prospective students warmly but not casually ("Our Mission", "DAUST offers a powerfully positive environment").
- **Casing:** headlines are Title Case or sentence case ("Your engineering journey starts in Somone"). Eyebrows/section kickers are ALL CAPS with wide tracking ("LIFE @ DAUST", "WHY DAUST", "ADMISSIONS OPEN · SEPTEMBER 2026").
- **Numbers as proof:** big stat blocks recur — "100+ Student Projects", "1000+ Impact Attendees", "100% Graduate Employment." Pair a large display number with a short label; count-up animation on scroll into view.
- **Headlines are short and active:** "An education built for impact", "Shaping Futures, Creating Opportunities."
- **Bilingual:** content appears in English and French (e.g. news posts). Default UI chrome to English.
- **No emoji.** The only "@" stylization is the brand-ism "LIFE @ DAUST."
- **CTAs:** direct, verb-first — "Apply Now", "Explore programs", "View All News", "Read more →". Arrow glyphs (→) are a recurring inline affordance on links/CTAs.
- **Vibe:** prestigious-but-accessible engineering school; pride in campus life, labs, research, student projects, and measurable outcomes.

## Visual foundations

- **Color & vibe:** deep navy anchors full-bleed hero sections, headers, footers, sidebars, and stat bands. Orange is the single energizing accent (CTAs, the middle dash, active nav states, "+" in stats) — used sparingly, never as a background wash. Steel is a quiet third note (the third dash, muted UI). Clean, institutional, high-trust, technical edge.
- **Type:** two families. **Saira** (self-hosted variable font, width 50–125%, weight 100–900) for display/headlines — a wide technical grotesque that echoes the custom wordmark. **Montserrat** (Google Fonts) for body/UI and the all-caps eyebrow style. Headlines lean bold and slightly wide; eyebrows are uppercase with `.12–.16em` tracking. `IBM Plex Mono` for code/mono contexts (loaded via Google Fonts here — flag if DAUST has an official mono face).
- **Backgrounds:** solid navy or clean white/`#f5f7f9`. Photography is central (campus, labs, students, events) — warm, candid, real, not stock-cold; use `image-slot`-style placeholders until real photography is supplied. Subtle dotted-grid overlays and soft orange radial glows appear on navy sections. Avoid heavy multi-hue gradients — the one true gradient is the navy→navy-700→navy-deep brand gradient.
- **Shape language:** the capsule/pill is core — buttons, badges, tabs, the logo container are always fully rounded. Cards use 14px radius; photos in cards are often full-bleed at the top with no radius.
- **Borders:** hairline `#D7DEE6` (`--border`) on light surfaces; navy sections are borderless, relying on contrast alone.
- **Shadows:** soft, always navy-tinted (`rgba(15,44,80,…)`) — never gray/black. Deeper "navy" shadow under floating navy panels and hovered cards.
- **Corner radii:** `4 / 6 / 8 / 14 / 22px` plus the `999px` pill.
- **Animation:** restrained, professional. Fades/rises with `cubic-bezier(.2,.7,.3,1)`, ~130–280ms. No bounce or spring. Count-up number animation on stat bands (scroll-triggered, `IntersectionObserver`). Scroll-reveal is translate-only (never opacity-gated) so content is never trapped invisible.
- **Hover states:** buttons darken (orange→`#d6731a`, navy→`#1d4a82`) or invert fill on outline variants, plus a 1px lift (`translateY(-1px)`). Cards lift 2px with a deeper shadow.
- **Press states:** `scale(.98)`, no color shift beyond the hover state already applied.
- **Transparency/blur:** used lightly — a translucent navy scrim (`rgba(15,44,80,.55)` + `blur(3px)`) behind modals and photographic hero text. Not a glassmorphism-heavy system.
- **Layout:** generous whitespace, centered max-width content (marketing ~1180px, dashboards up to 1320px content max), clear section rhythm (eyebrow → headline → tri-dash → body). Dashboards use a fixed 248–264px navy sidebar + white content area with a sticky topbar (search + user email).
- **Color vibe of imagery:** warm, candid campus/student photography — not desaturated or cool-toned; placeholders use the navy brand gradient until real photos are supplied.

## Iconography

- **Icon system:** [Lucide](https://lucide.dev/) via CDN (`data-lucide="..."` + `lucide.createIcons()`), used consistently across every product surface in the source codebase (marketing site, admin, teacher, student, innovation designs all load it the same way). This is the real, already-adopted system — not a substitution.
- **Style:** clean outline/stroke icons, ~1.75px stroke weight, matching the geometric, technical brand tone.
- **Social icons:** Twitter/X, Facebook, LinkedIn, YouTube, Instagram via Lucide brand glyphs in the footer.
- **Emoji:** not used anywhere in the source. Unicode arrows (→) are used as inline affordances on links and CTAs.
- **Custom SVGs found:** a favicon and a small logo-icon mark (`assets/icons/favicon.svg`, `assets/logos/logo-icon.svg`) — copied as-is from the admin design folder. No other bespoke icon set exists; do not hand-draw icons — use Lucide.

## Index — what's in this system

| Path | What it is |
|---|---|
| `readme.md` | This file |
| `SKILL.md` | Agent-Skill manifest (Claude Code compatible) |
| `styles.css` | Imports `tokens/colors.css`, `tokens/typography.css`, `tokens/effects.css` |
| `tokens/` | Color, typography, spacing/radii/shadow/motion custom properties |
| `fonts/` | Self-hosted Saira variable font |
| `assets/logos/` | Wordmark (navy/white), full logo (navy/white/capsule), icon mark |
| `assets/icons/` | Favicon SVG |
| `guidelines/` | 12 foundation specimen cards (colors, type, spacing, radii, shadows, brand marks) — shown in the Design System tab |
| `components/core/` | Button, IconButton, Badge, Avatar, Card |
| `components/forms/` | Input, Field, Select, SearchInput, Toggle, Segmented |
| `components/data/` | Stat, Progress, Tabs, EmptyState, Sparkline, BarChart, Donut |
| `components/overlays/` | Modal, Drawer |
| `components/layout/` | PageHeader, SectionTitle |
| `components/brand/` | TriDash, Eyebrow |
| `components/marketing/` | Header, Footer, CTABand, PageHero, Heading, StatCounter |
| `ui_kits/vitrine/` | Interactive recreation of the daust.org public site home page + apply flow |
| `ui_kits/portal/` | Interactive recreation of the myDAUST portal shell (student/faculty/admin role dashboards) |

## Caveats & where to help

- **Fonts:** Saira is self-hosted from the codebase's own uploaded variable font file — real. Montserrat and IBM Plex Mono load from Google Fonts as the codebase itself does; if DAUST has licensed/official cuts of these, drop the files in `fonts/` and update `tokens/typography.css`.
- **Photography:** no real campus/student photography was provided (the source designs use `image-slot` placeholders too) — the UI kits use gradient placeholders. Drop real photos into the kits to complete the picture.
- **UI kits are partial:** `ui_kits/vitrine` covers the home page + apply flow (not the other 7 marketing pages); `ui_kits/portal` covers one dashboard view per role (not the full academics/finance/dining/affairs/innovation surfaces the codebase defines). The `design/` folder in the source repo has considerably more built out — pull from it directly for admissions, research, billing, gradebook, housing, etc.
- **Dark mode** tokens exist (`[data-theme="dark"]` in `tokens/colors.css`, lifted from the admin design) but no components have been visually verified against it yet.

**Please iterate with me** — tell me which product surface to flesh out next (billing/finance, gradebook, housing, innovation tracker), whether the merged `Button` variant set feels right, and whether real photography/fonts are available to swap in.
