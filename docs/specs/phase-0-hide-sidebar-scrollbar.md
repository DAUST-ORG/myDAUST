# Phase 0 · Hide the portal sidebar scrollbar

## Why

The portal's left sidebar (`apps/portal/src/components/AppShell.tsx:108`
`<aside className="sidebar">`) is a sticky full-height column with two
internal overflow regions (`.sidebar` and `.side-nav` in
`apps/portal/src/app/globals.css:207,257`). On long nav trees (admin /
director have the most groups) the right edge of the sidebar shows a
default browser scrollbar that the design never accounted for. It is
visually loud against the navy chrome and contradicts the rest of the
sidebar's flat panels.

This branch removes the sidebar scrollbar only. The browser-level scrollbar
on the page itself stays, because hiding it would make page overflow
invisible to users — a UX trap, especially on mobile. Per the user's
decision, the sidebar is the only scrollbar affected and `apps/portal`
is the only app affected.

## Scope

### CSS changes in `apps/portal/src/app/globals.css`

Three rules, applied to the sidebar and its inner scroll region only:

```css
/* Hidden scrollbar on the sidebar — content still scrolls on overflow.
   Firefox (scrollbar-width) + WebKit (::-webkit-scrollbar) + IE legacy. */
.sidebar {
  scrollbar-width: none;            /* Firefox */
  -ms-overflow-style: none;         /* legacy Edge / IE */
}
.sidebar::-webkit-scrollbar {
  display: none;                    /* Chromium / Safari */
  width: 0;
  height: 0;
}
.side-nav {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.side-nav::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
```

Existing `overflow-y: auto` is preserved — content remains scrollable
(scroll wheel, trackpad, keyboard arrow keys, touch swipe) and `position:
sticky` on the sidebar header continues to work. The visible scrollbar
just disappears.

The rules are added below the existing `.sidebar` / `.side-nav`
declarations, not edited into them, so a future agent looking at the
existing rules sees the original behavior and the new rules sit next to
them with a comment explaining the load-bearing nature of `overflow-y:
auto`.

### What this branch does NOT touch

- `html` / `body` scrollbar (browser level) — explicitly preserved.
- Any `overflow-y: auto` on cards, tables, modals, or the vitrine.
- `apps/vitrine` — has no sidebar.
- The `overflow: hidden` rules at lines 1024, 1242, 1243 — those are
  text-overflow / ellipsis, unrelated.

## Acceptance criteria

1. `pnpm --filter @mydaust/portal run build` succeeds.
2. `pnpm -r typecheck` passes (no source changes outside CSS, but
   verifies the import graph still compiles).
3. Loading any portal route as any authenticated role (admin,
   registrar, bursar, dining, faculty, parent, student, etc.) shows
   no scrollbar on the sidebar's right edge. Verified manually via
   screenshot on a viewport where the nav exceeds the sidebar height
   (admin portal on a 1280x720 viewport is sufficient — its nav has
   the most groups).
4. The sidebar header (`<div className="brand">`), identity footer, and
   "VIEW AS" tiles (admin only) remain `position: sticky` and continue
   to stay visible while the inner nav scrolls. Verified by scrolling
   the sidebar nav and observing the brand block stays at the top.
5. The browser-level scrollbar on the page itself is still present
   and functional when page content exceeds the viewport.
6. Scrolling the sidebar with the mouse wheel, trackpad, arrow keys,
   and touch input still works. Verified manually on each.

## Out of scope

- Custom-styled scrollbars (e.g. thin / navy-themed). Possible follow-up
  if a future design review wants one.
- Removing scrollbars from in-page cards or tables.
- Removing scrollbars from the vitrine's contact form or any other
  embedded control.
- Adding visual affordance (e.g. a fade-out gradient at the sidebar's
  bottom edge) to hint that content continues. If desired, a separate
  branch.

## Risks

- **Discoverability.** A user who lands on a portal whose nav is taller
  than the viewport can no longer see the scrollbar. They can still
  scroll with the wheel / arrow keys / touch, but the affordance is
  gone. This is the trade-off the user has explicitly chosen; the PR
  description restates it so the senior reviewer can challenge it.
- **Sticky-header correctness.** The existing `position: sticky; top: 0;`
  on `.sidebar` and `.side-nav` depends on `overflow-y: auto` being
  intact. Preserving `overflow-y: auto` and only hiding the visual
  scrollbar preserves that.
- **Cross-browser.** `scrollbar-width: none` (Firefox 64+),
  `-ms-overflow-style: none` (legacy Edge / IE), and
  `::-webkit-scrollbar { display: none }` (Chromium / Safari) cover all
  browsers in AGENTS.md §14's stack. No new polyfills.
