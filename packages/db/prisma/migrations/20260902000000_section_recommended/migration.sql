-- Staff-curated "Recommended" flag on course sections. Off by default for
-- every existing section; only a registrar/admin toggle flips it on.
ALTER TABLE "Section" ADD COLUMN "recommended" BOOLEAN NOT NULL DEFAULT false;