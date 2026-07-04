"use client";

import { type ScanResult, request } from "@/lib/api";

// --- Student home hub ---

export interface DiningToday {
  scannedPeriods: string[];
}
export const getDiningToday = () => request<DiningToday>("/dining/my/today");

// --- Scanner: manual override ---

export const diningScanOverride = (studentNo: string, period: string) =>
  request<ScanResult>("/dining/scan/override", {
    method: "POST",
    body: JSON.stringify({ studentNo, period }),
  });

// --- Admin: students roster ---

export interface DiningStudent {
  studentId: string;
  name: string;
  studentNo: string;
  plan: string;
  active: boolean;
  term: string;
  scansToday: number;
}
export const getDiningStudents = () => request<DiningStudent[]>("/dining/admin/students");

// --- Admin: reports ---

export interface DiningReports {
  last7days: { date: string; served: number; turnedAway: number }[];
  planMix: { type: string; count: number }[];
  weekendRevenue: number;
  topItems: { name: string; qty: number }[];
}
export const getDiningReports = () => request<DiningReports>("/dining/admin/reports");

// --- Admin: menu images ---

export const createMenuItemWithImage = (body: {
  name: string;
  description?: string;
  category: string;
  priceXof: number;
  imageUrl?: string;
}) => request("/dining/admin/menu", { method: "POST", body: JSON.stringify(body) });

export const setMenuItemImage = (id: string, imageUrl: string) =>
  request(`/dining/admin/menu/${id}/image`, { method: "POST", body: JSON.stringify({ imageUrl }) });
