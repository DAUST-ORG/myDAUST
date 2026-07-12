import { readdirSync } from "node:fs";
import { basename, extname } from "node:path";
import { PrismaClient } from "@prisma/client";

// Set Student.photoUrl for each `<studentNo>.<ext>` file in PHOTOS_DIR. Run AFTER the
// files are uploaded to the vitrine bucket (aws s3 cp PHOTOS_DIR s3://.../avatars/).
// Only students with an actual photo file get a URL, so the 2 photo-less rows stay null.
//
//   PHOTOS_DIR=./photos PHOTO_BASE_URL=https://daust.net/avatars \
//     CONFIRM=1 pnpm --filter @mydaust/db attach-photos

const prisma = new PrismaClient();

async function main() {
  const dir = process.env.PHOTOS_DIR;
  if (!dir) throw new Error("Set PHOTOS_DIR to the extracted photos directory.");
  const base = (process.env.PHOTO_BASE_URL ?? "https://daust.net/avatars").replace(/\/$/, "");
  const commit = process.env.CONFIRM === "1";

  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f));
  console.log(`Found ${files.length} photo files in ${dir}`);

  let set = 0;
  const missing: string[] = [];
  for (const file of files) {
    const studentNo = basename(file, extname(file));
    const photoUrl = `${base}/${file}`;
    if (!commit) continue;
    const res = await prisma.student.updateMany({ where: { studentNo }, data: { photoUrl } });
    if (res.count === 0) missing.push(studentNo);
    else set += res.count;
  }

  console.log(`${commit ? "Set" : "[dry run] would set"} photoUrl for ${commit ? set : files.length} students.`);
  if (missing.length) console.log(`No student row for: ${missing.join(", ")}`);
  if (!commit) console.log("Dry run only. Re-run with CONFIRM=1 to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
