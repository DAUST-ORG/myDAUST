"use client";

import { type Gradebook, type MenuItem, request } from "@/lib/api";

// --- Final-grade submission status (GradeSubmission, approved by the registrar) ---
export type GradeSubmissionStatus = "draft" | "submitted" | "approved" | "returned";
export interface FacultyGradebook extends Gradebook {
  status: GradeSubmissionStatus;
  statusNote: string | null;
}
export const getFacultyGradebook = (sectionId: string) =>
  request<FacultyGradebook>(`/academics/sections/${sectionId}/gradebook`);

// --- Course materials + class posts (faculty) ---
export type MaterialCategory = "syllabus" | "lecture_notes" | "assignments" | "quizzes" | "resources";

export interface SectionMaterial {
  id: string;
  sectionId: string;
  title: string;
  kind: string;
  category: MaterialCategory;
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
  body: { title: string; kind: string; category?: MaterialCategory; fileUrl?: string; fileName?: string },
) =>
  request<SectionMaterial>(`/academics/sections/${sectionId}/materials`, {
    method: "POST",
    body: JSON.stringify(body),
  });
export const deleteSectionMaterial = (materialId: string) =>
  request<{ ok: boolean }>(`/academics/materials/${materialId}`, { method: "DELETE" });
export const reorderSectionMaterials = (sectionId: string, orderedIds: string[]) =>
  request<SectionMaterial[]>(`/academics/sections/${sectionId}/materials/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ orderedIds }),
  });
export const toggleSectionMaterial = (materialId: string) =>
  request<SectionMaterial>(`/academics/materials/${materialId}/toggle`, { method: "POST" });


// --- Dining menu (faculty view of the shared cafeteria menu) ---
export const getFacultyDiningMenu = () => request<MenuItem[]>("/dining/menu");
