"use client";

import { request } from "@/lib/api";

// --- International onboarding ---
export interface OnboardingTask {
  label: string;
  done: boolean;
}
export interface OnboardingCase {
  id: string;
  name: string;
  origin: string;
  kind: string;
  visaStatus: string; // Valid | Pending | Action needed
  arrivalDate: string | null;
  tasks: OnboardingTask[];
}
export const getInternationalCases = () => request<OnboardingCase[]>("/affairs/international");
export const toggleOnboardingTask = (id: string, index: number, done: boolean) =>
  request<OnboardingCase>(`/affairs/international/${id}/task`, {
    method: "POST",
    body: JSON.stringify({ index, done }),
  });

// --- Events board ---
export interface BoardEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  organizer: string | null;
  attendees: number | null;
  budgetXof: number | null;
  status: string; // planning | upcoming | past
  startsAt: string;
  endsAt: string | null;
}
export interface CreateBoardEventInput {
  title: string;
  category: string;
  location: string;
  organizer: string;
  attendees?: number;
  budgetXof?: number;
  startsAt: string;
  status: string;
}
export const getEventsBoard = () => request<BoardEvent[]>("/affairs/events-board");
export const createBoardEvent = (input: CreateBoardEventInput) =>
  request<BoardEvent>("/affairs/events-board", { method: "POST", body: JSON.stringify(input) });

// --- Study abroad ---
export interface AbroadProgram {
  id: string;
  name: string;
  kind: string; // Study abroad | Internship
  partner: string;
  seatsTotal: number;
  seatsTaken: number;
  deadline: string | null;
  status: string; // open | full | closed
}
export const getAbroadPrograms = () => request<AbroadProgram[]>("/affairs/abroad");
export const adjustAbroadSeat = (id: string, delta: 1 | -1) =>
  request<AbroadProgram>(`/affairs/abroad/${id}/seat`, { method: "POST", body: JSON.stringify({ delta }) });

// --- Maintenance ---
export interface MaintenanceTicket {
  id: string;
  hallId: string;
  hall: string;
  room: string | null;
  kind: string;
  note: string | null;
  severity: string; // low | med | high
  status: string; // open | resolved
  openedAt: string;
}
export interface CreateMaintenanceInput {
  hallId: string;
  room?: string;
  kind: string;
  note?: string;
  severity: string;
}
export const getMaintenanceTickets = () => request<MaintenanceTicket[]>("/affairs/maintenance");
export const createMaintenanceTicket = (input: CreateMaintenanceInput) =>
  request<MaintenanceTicket>("/affairs/maintenance", { method: "POST", body: JSON.stringify(input) });
export const resolveMaintenanceTicket = (id: string) =>
  request<MaintenanceTicket>(`/affairs/maintenance/${id}/resolve`, { method: "POST" });
