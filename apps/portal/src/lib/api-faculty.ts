"use client";

import { type MenuItem, request } from "@/lib/api";

// --- Course materials + class posts (faculty) ---
export interface SectionMaterial {
  id: string;
  sectionId: string;
  title: string;
  kind: string;
  fileUrl: string | null;
  fileName: string | null;
  published: boolean;
  createdAt: string;
}
export const getSectionMaterials = (sectionId: string) =>
  request<SectionMaterial[]>(`/academics/sections/${sectionId}/materials`);
export const createSectionMaterial = (
  sectionId: string,
  body: { title: string; kind: string; fileUrl?: string; fileName?: string },
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
