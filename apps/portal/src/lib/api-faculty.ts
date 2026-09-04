"use client";

import { type Gradebook, type MenuItem, request } from "@/lib/api";

// --- Final-grade submission status (GradeSubmission, approved by the registrar) ---
export type GradeSubmissionStatus =
  "draft" | "submitted" | "approved" | "returned";
export interface FacultyGradebook extends Gradebook {
  status: GradeSubmissionStatus;
  statusNote: string | null;
}
export const getFacultyGradebook = (sectionId: string) =>
  request<FacultyGradebook>(`/academics/sections/${sectionId}/gradebook`);

// --- Course materials + class posts (faculty) ---
export type MaterialCategory =
  "syllabus" | "lecture_notes" | "assignments" | "quizzes" | "resources";

export interface SectionMaterialFolder {
  id: string;
  sectionId: string;
  category: MaterialCategory;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SectionMaterial {
  id: string;
  sectionId: string;
  title: string;
  kind: string;
  category: MaterialCategory;
  folderId: string | null;
  folder: Pick<SectionMaterialFolder, "id" | "name" | "category"> | null;
  fileUrl: string | null;
  fileName: string | null;
  published: boolean;
  sortOrder: number;
  createdAt: string;
}
export const getSectionMaterials = (sectionId: string) =>
  request<SectionMaterial[]>(`/academics/sections/${sectionId}/materials`);
export const createSectionMaterial = (
  sectionId: string,
  body: {
    title: string;
    kind: string;
    category?: MaterialCategory;
    folderId?: string;
    fileUrl?: string;
    fileName?: string;
  },
) =>
  request<SectionMaterial>(`/academics/sections/${sectionId}/materials`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const deleteSectionMaterial = (materialId: string) =>
  request<{ ok: boolean }>(`/academics/materials/${materialId}`, {
    method: "DELETE",
  });
export const reorderSectionMaterials = (
  sectionId: string,
  category: MaterialCategory,
  folderId: string | null,
  orderedIds: string[],
) =>
  request<SectionMaterial[]>(
    `/academics/sections/${sectionId}/materials/reorder`,
    {
      method: "PATCH",
      body: JSON.stringify({ category, folderId, orderedIds }),
    },
  );
export const toggleSectionMaterial = (materialId: string) =>
  request<SectionMaterial>(`/academics/materials/${materialId}/toggle`, {
    method: "POST",
  });

export const getSectionMaterialFolders = (sectionId: string) =>
  request<SectionMaterialFolder[]>(
    `/academics/sections/${sectionId}/material-folders`,
  );
export const createSectionMaterialFolder = (
  sectionId: string,
  body: { category: MaterialCategory; name: string },
) =>
  request<SectionMaterialFolder>(
    `/academics/sections/${sectionId}/material-folders`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
export const renameSectionMaterialFolder = (folderId: string, name: string) =>
  request<SectionMaterialFolder>(`/academics/material-folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
export const deleteSectionMaterialFolder = (folderId: string) =>
  request<{ ok: boolean; unfiledMaterialCount: number }>(
    `/academics/material-folders/${folderId}`,
    { method: "DELETE" },
  );
export const moveSectionMaterialToFolder = (
  materialId: string,
  folderId: string | null,
) =>
  request<SectionMaterial>(`/academics/materials/${materialId}/folder`, {
    method: "PATCH",
    body: JSON.stringify({ folderId }),
  });

// --- Dining menu (faculty view of the shared cafeteria menu) ---
export const getFacultyDiningMenu = () => request<MenuItem[]>("/dining/menu");
