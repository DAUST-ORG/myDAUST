import { Injectable, NotFoundException } from "@nestjs/common";
import { type FacultyProfileInput, safeLink } from "@mydaust/shared";
import { PrismaService } from "../prisma/prisma.service.js";

/** Uploaded photo path (/uploads/...) or an http(s) URL; anything else → null. */
const safePhoto = (v: string | null | undefined): string | null =>
  typeof v === "string" && (/^\/[^/]/.test(v) || /^https?:\/\//i.test(v)) ? v.slice(0, 300) : null;

/** Faculty list source: platform people holding the "faculty" role. */
function facultyWhere() {
  return { roles: { has: "faculty" } };
}

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0) ?? ""}${lastName.charAt(0) ?? ""}`.toUpperCase();
}

@Injectable()
export class FacultyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: professors toggled visible on the site (name merged from Person). */
  async publicList() {
    const rows = await this.prisma.facultyProfile.findMany({
      where: { publicProfile: true },
      include: { person: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { person: { lastName: "asc" } },
    });
    return rows.map((r) => ({
      id: r.personId,
      name: `${r.person.firstName} ${r.person.lastName}`.trim(),
      initials: initials(r.person.firstName, r.person.lastName),
      title: r.title,
      dept: r.dept,
      bio: r.bio,
      interests: r.interests,
      scholar: r.scholar,
      photo: r.photoUrl,
    }));
  }

  /** Comms: every platform faculty (with or without a profile), for the manager. */
  async adminList() {
    const people = await this.prisma.person.findMany({
      where: facultyWhere(),
      include: { facultyProfile: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return people.map((p) => ({
      id: p.id,
      email: p.email,
      firstName: p.firstName,
      lastName: p.lastName,
      publicProfile: p.facultyProfile?.publicProfile ?? false,
      profile: p.facultyProfile
        ? {
            title: p.facultyProfile.title,
            dept: p.facultyProfile.dept,
            bio: p.facultyProfile.bio,
            interests: p.facultyProfile.interests,
            scholar: p.facultyProfile.scholar,
            photoUrl: p.facultyProfile.photoUrl,
          }
        : null,
    }));
  }

  private async mustFaculty(personId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, ...facultyWhere() },
    });
    if (!person) throw new NotFoundException("Faculty member not found");
    return person;
  }

  /** Comms: edit the name + profile fields (upserting the profile row). */
  async update(personId: string, input: FacultyProfileInput, actorId: string) {
    const person = await this.mustFaculty(personId);
    await this.prisma.$transaction([
      this.prisma.person.update({
        where: { id: person.id },
        data: { firstName: input.firstName, lastName: input.lastName },
      }),
      this.prisma.facultyProfile.upsert({
        where: { personId: person.id },
        create: {
          personId: person.id,
          title: input.title ?? null,
          dept: input.dept ?? null,
          bio: input.bio ?? null,
          interests: input.interests,
          scholar: safeLink(input.scholar ?? undefined) || null,
          photoUrl: safePhoto(input.photoUrl),
        },
        update: {
          title: input.title ?? null,
          dept: input.dept ?? null,
          bio: input.bio ?? null,
          interests: input.interests,
          scholar: safeLink(input.scholar ?? undefined) || null,
          photoUrl: safePhoto(input.photoUrl),
        },
      }),
    ]);
    await this.prisma.auditLog.create({
      data: { entity: "FacultyProfile", entityId: person.id, action: "faculty-profile-updated", actorId },
    });
    return { ok: true };
  }

  /** Comms: flip whether the professor appears on the public site. */
  async setVisibility(personId: string, visible: boolean, actorId: string) {
    const person = await this.mustFaculty(personId);
    await this.prisma.facultyProfile.upsert({
      where: { personId: person.id },
      create: { personId: person.id, publicProfile: visible },
      update: { publicProfile: visible },
    });
    await this.prisma.auditLog.create({
      data: { entity: "FacultyProfile", entityId: person.id, action: visible ? "faculty-made-public" : "faculty-made-private", actorId },
    });
    return { ok: true };
  }
}
