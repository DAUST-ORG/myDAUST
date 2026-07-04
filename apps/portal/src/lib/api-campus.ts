import { type LibraryResource, request } from "@/lib/api";

export interface NewLibraryItem {
  title: string;
  author?: string;
  kind: string;
  subject?: string;
  callNumber?: string;
}

export const addLibraryItem = (input: NewLibraryItem) =>
  request<LibraryResource>("/campus/library", { method: "POST", body: JSON.stringify(input) });

export const toggleLibraryItem = (id: string) =>
  request<LibraryResource>(`/campus/library/${id}/toggle`, { method: "POST" });
