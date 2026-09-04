/** Canonical faculty course destination used by dashboard and global search. */
export function facultyMaterialsHref(sectionId: string): string {
  return `/faculty/materials?section=${encodeURIComponent(sectionId)}`;
}

/**
 * Accept a URL selection only when it is one of the signed-in teacher's sections.
 * An absent or stale bookmark falls back to the first assigned section.
 */
export function resolveFacultyMaterialsSectionId(
  sections: ReadonlyArray<{ id: string }>,
  requestedSectionId: string | null,
): string {
  if (
    requestedSectionId &&
    sections.some((section) => section.id === requestedSectionId)
  ) {
    return requestedSectionId;
  }
  return sections[0]?.id ?? "";
}
