# Student Portal — Design vs Staging review

Captured 2026-07-22. Design prototype (`design/Student information system design (1)`)
set beside the live staging build (`daust-staging.azt.dev`), logged in as the demo
student `aissatou.diallo@daust.edu`. Data differs because the demo student is lightly
seeded — findings are about layout, components and fields, not the numbers.

Side-by-side artifact: https://claude.ai/code/artifact/c99dc842-febc-4339-967f-0cede3698733

Verdict spread: **3 Match · 5 Close · 2 Partial · 2 Divergent**.

## Global (from the shared atoms — ripples across every portal)

- **Stat atom label casing** — design uses sentence-case card labels ("Cumulative GPA");
  staging uppercases them ("CUMULATIVE GPA"). Fixing touches every portal, so treat
  separately.
- **Sidebar footer meta truncates** — design "Junior · Computer Eng."; staging
  "B.Sc. Computer Engineeri…" (cut off).

## Per screen

### 1. Dashboard — Close
- Stat cards diverge: design puts the icon top-right with a sentence-case label; staging
  inlines a small icon before an uppercase label.
- Remainder is seed-data richness (design: 5 courses / 91% attendance / 4 to-dos).

### 2. Registration — Match
- Faithful; staging is richer (section badges §A, colored card accents, Already-enrolled /
  Unavailable states).

### 3. My Courses — Close
- Design's previous-course rows each carry a "Materials" button; staging drops it
  (shows only the grade chip).

### 4. Schedule — Close
- Design has an "Export .ics" button top-right; staging is missing it.
- Staging adds a current-day column highlight not in the design (keep).

### 5. Grades & Transcript — Close
- Design has a 4th stat card "Dean's List — N terms" (derivable from term GPAs); staging
  shows only 3 cards.

### 6. Degree Audit — Close
- Category cards: design is a 2-column grid, staging uses 3 columns.
- Design subtitle carries "· Catalog {year}"; staging drops the catalog year.

### 7. Attendance — Close
- Design subtitle shows "· Overall attendance X%"; staging omits the overall summary.
- Per-course rows match; staging adds the late-counts-as-half helper note (keep).

### 8. Billing & Financials — Match
- Faithful. No Pay button on staging because the demo balance is settled — correct
  data-driven behavior. Money screen, untouched.

### 9. Dining — Divergent (decision needed)
- Design = swipe-balance model (swipes remaining / dining dollars / recent activity).
- Staging = meal-schedule + dining-pass + weekend-ordering model, built to the real data.
- The design's swipe/dining-dollar figures are data we don't capture. Recommendation: keep
  staging's real-data version rather than regress to the prototype's fiction.

### 10. Housing — Partial
- Staging has the assignment hero card but is missing the design's "Move-in checklist"
  side panel.
- Detail fields differ: design shows Resident Advisor / Move-in date / Contract; staging
  shows Room type / Status / Note.

### 11. Announcements — Match
- Faithful. Minor: staging shows absolute dates ("3 juil. 2026") + an author line vs the
  design's relative time ("2 days ago").

### 12. Messages — Divergent (decision needed)
- Design = single-column inbox list. Staging = two-pane inbox + live thread with
  compose/Send — materially more functional. Recommendation: keep staging's richer version.

### 13. My Profile — Partial
- Missing the design's "Documents" tab (the 5th tab). Note `/student/documents`,
  `/student/documents/enrollment`, `/student/documents/transcript` pages already exist.
- Hero: 4th stat is EMAIL vs design's STANDING; subtitle drops "· Junior · Year 3"; badge
  is Dean's List vs Active.
- Card field sets differ; staging surfaces extended fields that are unseeded, so most
  values read "—".

## Suggested fix scope

Unlike finance, nothing here is a deletable "beyond-design" screen — the two Divergent
screens are implemented differently and more richly than the fictional prototype.

- **Fix (Close + Partial):** My Courses materials button, Schedule .ics export, Grades
  Dean's-List card, Degree 2-col grid + catalog-year subtitle, Attendance overall %,
  Housing move-in checklist + fields, Profile Documents tab + hero fields.
- **Keep as-is (Divergent):** Dining and Messages — do not regress working functionality.
- **Separate call:** the two global atom issues (Stat casing, sidebar meta truncation).
