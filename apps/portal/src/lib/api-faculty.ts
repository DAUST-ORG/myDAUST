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
export const toggleSectionMaterial = (materialId: string) =>
  request<SectionMaterial>(`/academics/materials/${materialId}/toggle`, { method: "POST" });

export interface SectionPost {
  id: string;
  sectionId: string;
  title: string;
  body: string;
  author: string | null;
  pinned: boolean;
  createdAt: string;
}
export const getSectionPosts = (sectionId: string) =>
  request<SectionPost[]>(`/academics/sections/${sectionId}/posts`);
export const createSectionPost = (sectionId: string, body: { title: string; body: string }) =>
  request<SectionPost>(`/academics/sections/${sectionId}/posts`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// --- Dining menu (faculty view of the shared cafeteria menu) ---
export const getFacultyDiningMenu = () => request<MenuItem[]>("/dining/menu");
