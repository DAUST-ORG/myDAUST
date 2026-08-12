import type {
  TranscriptPdfGeneration,
  TranscriptSemester,
  TranscriptView,
  TranscriptViewEntry,
} from "@mydaust/shared";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit, { type Font as FontkitFont } from "@pdf-lib/fontkit";
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const FIRST_CONTENT_TOP = 538;
const CONTINUATION_CONTENT_TOP = 720;
const CONTENT_BOTTOM = 52;
const TERM_HEADER_HEIGHT = 30;
const TABLE_HEADER_HEIGHT = 21;
const ROW_HEIGHT = 24;
const FRAGMENT_GAP = 9;

const NAVY = rgb(0.035, 0.145, 0.285);
const NAVY_MID = rgb(0.09, 0.25, 0.44);
const ORANGE = rgb(0.93, 0.42, 0.08);
const INK = rgb(0.09, 0.12, 0.16);
const MUTED = rgb(0.36, 0.41, 0.47);
const BORDER = rgb(0.82, 0.85, 0.89);
const PALE = rgb(0.955, 0.966, 0.979);
const WHITE = rgb(1, 1, 1);

const REGULAR_FONT_PATH = resolve(__dirname, "assets/Saira-Regular.ttf");
const BOLD_FONT_PATH = resolve(__dirname, "assets/Saira-Bold.ttf");
const glyphSupport = new WeakMap<PDFFont, FontkitFont>();
let fontAssetsPromise:
  | Promise<{
      regular: Uint8Array;
      bold: Uint8Array;
      regularSupport: FontkitFont;
      boldSupport: FontkitFont;
    }>
  | undefined;

export class UnsupportedTranscriptCharacterError extends Error {
  readonly characters: string[];

  constructor(characters: string[]) {
    const detail = characters
      .map(
        (character) =>
          `${JSON.stringify(character)} (U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`,
      )
      .join(", ");
    super(`Transcript PDF contains unsupported characters: ${detail}`);
    this.name = "UnsupportedTranscriptCharacterError";
    this.characters = characters;
  }
}

function loadFontAssets() {
  fontAssetsPromise ??= Promise.all([
    readFile(REGULAR_FONT_PATH),
    readFile(BOLD_FONT_PATH),
  ]).then(([regular, bold]) => ({
    regular,
    bold,
    regularSupport: fontkit.create(regular),
    boldSupport: fontkit.create(bold),
  }));
  return fontAssetsPromise;
}

export interface TranscriptPdfFragment {
  semester: TranscriptSemester;
  entries: TranscriptViewEntry[];
  continued: boolean;
}

export interface TranscriptPdfPagePlan {
  watermark: string;
  fragments: TranscriptPdfFragment[];
}

export interface RenderedTranscriptPdf {
  bytes: Uint8Array;
  pageCount: number;
  watermark: string;
}

export function transcriptWatermark(
  kind: TranscriptPdfGeneration["generator"]["kind"],
): string {
  return kind === "student"
    ? "UNOFFICIAL · STUDENT-GENERATED"
    : "UNOFFICIAL · STAFF-GENERATED";
}

/** Pure pagination plan used by the renderer and regression tests. */
export function paginateTranscript(
  view: TranscriptView,
  generation: TranscriptPdfGeneration,
): TranscriptPdfPagePlan[] {
  const watermark = transcriptWatermark(generation.generator.kind);
  const pages: TranscriptPdfPagePlan[] = [{ watermark, fragments: [] }];
  let remaining = FIRST_CONTENT_TOP - CONTENT_BOTTOM;

  const addPage = () => {
    pages.push({ watermark, fragments: [] });
    remaining = CONTINUATION_CONTENT_TOP - CONTENT_BOTTOM;
  };

  for (const semester of view.semesters) {
    let offset = 0;
    let continued = false;
    while (offset < semester.entries.length) {
      const fixed = TERM_HEADER_HEIGHT + TABLE_HEADER_HEIGHT + FRAGMENT_GAP;
      if (remaining < fixed + ROW_HEIGHT) addPage();
      const capacity = Math.max(
        1,
        Math.floor((remaining - fixed) / ROW_HEIGHT),
      );
      const entries = semester.entries.slice(offset, offset + capacity);
      pages.at(-1)!.fragments.push({ semester, entries, continued });
      remaining -= fixed + entries.length * ROW_HEIGHT;
      offset += entries.length;
      continued = true;
      if (offset < semester.entries.length) addPage();
    }
  }

  return pages;
}

function pdfText(font: PDFFont, value: string): string {
  const normalized = value.normalize("NFC").replace(/[\u2010-\u2015]/g, "-");
  const support = glyphSupport.get(font);
  if (!support) {
    throw new Error("Transcript font support was not registered");
  }
  const unsupported = [
    ...new Set(
      [...normalized].filter(
        (character) => !support.hasGlyphForCodePoint(character.codePointAt(0)!),
      ),
    ),
  ];
  if (unsupported.length > 0) {
    throw new UnsupportedTranscriptCharacterError(unsupported);
  }
  return normalized;
}

function fitText(
  font: PDFFont,
  value: string,
  size: number,
  maxWidth: number,
): string {
  const safe = pdfText(font, value);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let clipped = safe;
  while (
    clipped.length > 1 &&
    font.widthOfTextAtSize(`${clipped}...`, size) > maxWidth
  ) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}...`;
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  options: Parameters<PDFPage["drawText"]>[1],
) {
  page.drawText(pdfText(font, value), { ...options, font });
}

function drawPageChrome(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  watermark: string,
) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 50,
    width: PAGE_WIDTH,
    height: 50,
    color: NAVY,
  });
  drawText(page, fonts.bold, "DAUST", {
    x: MARGIN,
    y: PAGE_HEIGHT - 32,
    size: 18,
    color: WHITE,
  });
  drawText(
    page,
    fonts.regular,
    "DAKAR AMERICAN UNIVERSITY OF SCIENCE & TECHNOLOGY",
    {
      x: 126,
      y: PAGE_HEIGHT - 29,
      size: 7.5,
      color: rgb(0.83, 0.88, 0.94),
    },
  );
  drawText(page, fonts.bold, watermark, {
    x: 78,
    y: 282,
    size: 25,
    color: NAVY,
    rotate: degrees(36),
    opacity: 0.075,
  });
}

function labelValue(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
) {
  drawText(page, fonts.bold, label.toUpperCase(), {
    x,
    y,
    size: 7.5,
    color: MUTED,
  });
  drawText(page, fonts.regular, fitText(fonts.regular, value, 9.5, width), {
    x,
    y: y - 14,
    size: 9.5,
    color: INK,
  });
}

function renderFirstPageIdentity(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  view: TranscriptView,
  generation: TranscriptPdfGeneration,
) {
  drawText(page, fonts.bold, "UNOFFICIAL ACADEMIC TRANSCRIPT", {
    x: MARGIN,
    y: 758,
    size: 18,
    color: NAVY,
  });
  page.drawRectangle({
    x: MARGIN,
    y: 744,
    width: 72,
    height: 3,
    color: ORANGE,
  });

  labelValue(page, fonts, "Student", view.student.name, MARGIN, 716, 225);
  labelValue(
    page,
    fonts,
    "Student number",
    view.student.studentNo,
    330,
    716,
    220,
  );
  const program = view.student.program
    ? `${view.student.program.degree ? `${view.student.program.degree} - ` : ""}${view.student.program.code} - ${view.student.program.name}`
    : "Program not assigned";
  labelValue(page, fonts, "Program", program, MARGIN, 677, 510);
  labelValue(
    page,
    fonts,
    "Generated",
    generation.generatedAtDakar,
    MARGIN,
    638,
    245,
  );
  labelValue(
    page,
    fonts,
    "Generated by",
    `${generation.generator.name} (${generation.generator.email})`,
    330,
    638,
    220,
  );

  const summaryY = 565;
  page.drawRectangle({
    x: MARGIN,
    y: summaryY,
    width: PAGE_WIDTH - MARGIN * 2,
    height: 45,
    color: NAVY,
  });
  const metrics = [
    ["Cumulative GPA", view.totals.gpa?.toFixed(2) ?? "N/A"],
    ["Attempted credits", String(view.totals.attemptedCredits)],
    ["Earned credits", String(view.totals.earnedCredits)],
    ["GPA credits", String(view.totals.gpaCredits)],
  ] as const;
  const cellWidth = (PAGE_WIDTH - MARGIN * 2) / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = MARGIN + index * cellWidth;
    if (index) {
      page.drawLine({
        start: { x, y: summaryY + 8 },
        end: { x, y: summaryY + 37 },
        thickness: 0.6,
        color: rgb(0.27, 0.39, 0.54),
      });
    }
    drawText(page, fonts.regular, label.toUpperCase(), {
      x: x + 11,
      y: summaryY + 29,
      size: 6.7,
      color: rgb(0.77, 0.83, 0.9),
    });
    drawText(page, fonts.bold, value, {
      x: x + 11,
      y: summaryY + 11,
      size: 12.5,
      color: WHITE,
    });
  });
}

function renderContinuationIdentity(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  view: TranscriptView,
) {
  drawText(page, fonts.bold, "UNOFFICIAL ACADEMIC TRANSCRIPT - CONTINUED", {
    x: MARGIN,
    y: 765,
    size: 11,
    color: NAVY,
  });
  page.drawRectangle({
    x: MARGIN,
    y: 753,
    width: 48,
    height: 2,
    color: ORANGE,
  });
  drawText(
    page,
    fonts.regular,
    fitText(
      fonts.regular,
      `${view.student.name} | ${view.student.studentNo}`,
      8.5,
      470,
    ),
    { x: MARGIN, y: 739, size: 8.5, color: MUTED },
  );
}

function renderSemesterFragment(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  fragment: TranscriptPdfFragment,
  y: number,
): number {
  const { semester } = fragment;
  page.drawRectangle({
    x: MARGIN,
    y: y - TERM_HEADER_HEIGHT,
    width: PAGE_WIDTH - MARGIN * 2,
    height: TERM_HEADER_HEIGHT,
    color: NAVY_MID,
  });
  drawText(
    page,
    fonts.bold,
    `${semester.label}${fragment.continued ? " (continued)" : ""}`,
    { x: MARGIN + 11, y: y - 19, size: 10.5, color: WHITE },
  );
  const termSummary = `GPA ${semester.gpa?.toFixed(2) ?? "N/A"} | ${semester.attemptedCredits} attempted | ${semester.earnedCredits} earned`;
  const summaryWidth = fonts.regular.widthOfTextAtSize(
    pdfText(fonts.regular, termSummary),
    7.5,
  );
  drawText(page, fonts.regular, termSummary, {
    x: PAGE_WIDTH - MARGIN - 10 - summaryWidth,
    y: y - 18,
    size: 7.5,
    color: rgb(0.87, 0.91, 0.95),
  });
  y -= TERM_HEADER_HEIGHT;

  page.drawRectangle({
    x: MARGIN,
    y: y - TABLE_HEADER_HEIGHT,
    width: PAGE_WIDTH - MARGIN * 2,
    height: TABLE_HEADER_HEIGHT,
    color: PALE,
  });
  const headers = [
    ["COURSE", MARGIN + 4],
    ["TITLE", 111],
    ["ATT.", 389],
    ["EARN.", 433],
    ["GRADE", 480],
    ["POINTS", 528],
  ] as const;
  for (const [label, x] of headers) {
    drawText(page, fonts.bold, label, {
      x,
      y: y - 14,
      size: 6.8,
      color: MUTED,
    });
  }
  y -= TABLE_HEADER_HEIGHT;

  fragment.entries.forEach((entry, index) => {
    const rowBottom = y - ROW_HEIGHT;
    if (index % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: rowBottom,
        width: PAGE_WIDTH - MARGIN * 2,
        height: ROW_HEIGHT,
        color: rgb(0.982, 0.985, 0.989),
      });
    }
    drawText(page, fonts.bold, fitText(fonts.bold, entry.courseCode, 7.7, 62), {
      x: MARGIN + 4,
      y: rowBottom + 8,
      size: 7.7,
      color: NAVY,
    });
    drawText(
      page,
      fonts.regular,
      fitText(fonts.regular, entry.title, 8.1, 267),
      {
        x: 111,
        y: rowBottom + 8,
        size: 8.1,
        color: INK,
      },
    );
    drawText(page, fonts.regular, String(entry.credits), {
      x: 397,
      y: rowBottom + 8,
      size: 8.1,
      color: INK,
    });
    drawText(page, fonts.regular, String(entry.earnedCredits), {
      x: 444,
      y: rowBottom + 8,
      size: 8.1,
      color: INK,
    });
    drawText(page, fonts.bold, entry.grade, {
      x: 488,
      y: rowBottom + 8,
      size: 8.4,
      color: INK,
    });
    drawText(
      page,
      fonts.regular,
      entry.points === null ? "-" : entry.points.toFixed(2),
      { x: 535, y: rowBottom + 8, size: 8.1, color: INK },
    );
    page.drawLine({
      start: { x: MARGIN, y: rowBottom },
      end: { x: PAGE_WIDTH - MARGIN, y: rowBottom },
      thickness: 0.35,
      color: BORDER,
    });
    y = rowBottom;
  });

  return y - FRAGMENT_GAP;
}

function renderFooter(
  page: PDFPage,
  fonts: { regular: PDFFont; bold: PDFFont },
  generation: TranscriptPdfGeneration,
  pageNumber: number,
  pageCount: number,
) {
  page.drawLine({
    start: { x: MARGIN, y: 38 },
    end: { x: PAGE_WIDTH - MARGIN, y: 38 },
    thickness: 0.5,
    color: BORDER,
  });
  drawText(
    page,
    fonts.regular,
    fitText(
      fonts.regular,
      `Generation ID ${generation.generationId} | ${generation.generator.role}: ${generation.generator.name}`,
      6.5,
      410,
    ),
    { x: MARGIN, y: 24, size: 6.5, color: MUTED },
  );
  const pageLabel = `Page ${pageNumber} of ${pageCount}`;
  const width = fonts.bold.widthOfTextAtSize(pageLabel, 6.5);
  drawText(page, fonts.bold, pageLabel, {
    x: PAGE_WIDTH - MARGIN - width,
    y: 24,
    size: 6.5,
    color: MUTED,
  });
}

export async function renderTranscriptPdf(
  view: TranscriptView,
  generation: TranscriptPdfGeneration,
): Promise<RenderedTranscriptPdf> {
  const document = await PDFDocument.create();
  document.setTitle(`Unofficial transcript - ${view.student.studentNo}`);
  document.setAuthor("Dakar American University of Science & Technology");
  document.setSubject(
    `${transcriptWatermark(generation.generator.kind)} academic record`,
  );
  document.setCreator("myDAUST");
  document.setProducer("myDAUST Transcript Service");
  document.setCreationDate(new Date(generation.generatedAt));
  document.setModificationDate(new Date(generation.generatedAt));

  const assets = await loadFontAssets();
  document.registerFontkit(fontkit);
  const fonts = {
    regular: await document.embedFont(assets.regular, { subset: true }),
    bold: await document.embedFont(assets.bold, { subset: true }),
  };
  glyphSupport.set(fonts.regular, assets.regularSupport);
  glyphSupport.set(fonts.bold, assets.boldSupport);
  const plan = paginateTranscript(view, generation);
  const pages = plan.map(() => document.addPage([PAGE_WIDTH, PAGE_HEIGHT]));

  pages.forEach((page, index) => {
    const pagePlan = plan[index]!;
    drawPageChrome(page, fonts, pagePlan.watermark);
    if (index === 0) renderFirstPageIdentity(page, fonts, view, generation);
    else renderContinuationIdentity(page, fonts, view);

    let y = index === 0 ? FIRST_CONTENT_TOP : CONTINUATION_CONTENT_TOP;
    if (pagePlan.fragments.length === 0 && index === 0) {
      drawText(page, fonts.bold, "No transcript entries", {
        x: MARGIN,
        y: y - 30,
        size: 11,
        color: NAVY,
      });
      drawText(
        page,
        fonts.regular,
        "No approved or historical courses are currently recorded.",
        { x: MARGIN, y: y - 48, size: 9, color: MUTED },
      );
    }
    for (const fragment of pagePlan.fragments) {
      y = renderSemesterFragment(page, fonts, fragment, y);
    }
    renderFooter(page, fonts, generation, index + 1, pages.length);
  });

  return {
    bytes: await document.save({ useObjectStreams: false }),
    pageCount: pages.length,
    watermark: transcriptWatermark(generation.generator.kind),
  };
}
