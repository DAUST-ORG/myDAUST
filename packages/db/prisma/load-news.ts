import { PrismaClient } from "@prisma/client";
import { buildContent, slugify } from "@mydaust/shared";

/**
 * Seed the site's built-in news items as editable, published NewsArticle rows —
 * so the public News section is backend-driven and Comms can edit them. Idempotent:
 * only seeds when the table is empty (never clobbers Comms-authored articles).
 *
 *   DATABASE_URL=... pnpm --filter @mydaust/db run load:news
 */
const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.newsArticle.count();
  if (existing > 0) {
    console.log(`NewsArticle already has ${existing} row(s) — leaving them untouched.`);
    return;
  }
  const en = buildContent("en");
  const fr = buildContent("fr");
  for (let i = 0; i < en.news.length; i += 1) {
    const e = en.news[i]!;
    const f = fr.news[i]!;
    const slug = slugify(e.title);
    await prisma.newsArticle.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        titleEn: e.title,
        titleFr: f.title,
        excerptEn: e.excerpt,
        excerptFr: f.excerpt,
        // Body is a placeholder for now; the cards open the external link below. Comms can flesh these out.
        bodyEn: e.excerpt,
        bodyFr: f.excerpt,
        imageUrl: null,
        externalUrl: e.href ?? null,
        tag: e.tag,
        date: e.date,
        published: true,
        sortOrder: i,
      },
    });
  }
  console.log(`Seeded ${await prisma.newsArticle.count()} news articles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
