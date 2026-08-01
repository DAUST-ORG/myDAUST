import { z } from "zod";

/** Create/update payload for a CMS news article (slug derived server-side when absent). */
export const NewsArticleInput = z.object({
  slug: z.string().max(120).optional(),
  titleEn: z.string().min(1).max(200),
  titleFr: z.string().min(1).max(200),
  excerptEn: z.string().max(600),
  excerptFr: z.string().max(600),
  bodyEn: z.string().max(20000),
  bodyFr: z.string().max(20000),
  imageUrl: z.string().max(300).nullish(),
  // Optional outbound link — when set, the card opens this instead of the in-app article.
  externalUrl: z.string().max(300).nullish(),
  tag: z.string().max(60).nullish(),
  date: z.string().max(40),
  published: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});
export type NewsArticleInput = z.infer<typeof NewsArticleInput>;

/** News card in the list (no body; both languages, the client localizes). */
export interface PublicNewsArticle {
  id: string;
  slug: string;
  titleEn: string;
  titleFr: string;
  excerptEn: string;
  excerptFr: string;
  imageUrl: string | null;
  externalUrl: string | null;
  tag: string | null;
  date: string;
}

/** A full article (list fields + body) for the article view. */
export interface PublicNewsArticleFull extends PublicNewsArticle {
  bodyEn: string;
  bodyFr: string;
}

/** Lowercase, ascii, hyphenated slug from a title. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "article";
}
