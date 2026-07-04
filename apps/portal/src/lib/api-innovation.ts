"use client";

import { request } from "@/lib/api";

// --- Global tasks ("program passes" every project must complete) ---

export interface GlobalTaskStatus {
  projectId: string;
  projectName: string;
  done: boolean;
}

export interface AdminGlobalTask {
  id: string;
  title: string;
  kind: string;
  dueDate: string | null;
  done: number;
  total: number;
  statuses: GlobalTaskStatus[];
}

export interface ProjectPass {
  taskId: string;
  title: string;
  kind: string;
  dueDate: string | null;
  done: boolean;
}

export const getGlobalTasks = () => request<AdminGlobalTask[]>("/innovation/admin/global-tasks");

export const createGlobalTask = (body: { title: string; kind?: string; dueDate?: string }) =>
  request<{ id: string }>("/innovation/admin/global-tasks", { method: "POST", body: JSON.stringify(body) });

export const getProjectGlobalTasks = (projectId: string) =>
  request<ProjectPass[]>(`/innovation/admin/projects/${projectId}/global-tasks`);

export const toggleGlobalTask = (taskId: string, projectId: string) =>
  request<{ done: boolean }>(`/innovation/admin/global-tasks/${taskId}/projects/${projectId}/toggle`, { method: "POST" });

export const getMyGlobalTasks = () => request<ProjectPass[]>("/innovation/my/project/global-tasks");
