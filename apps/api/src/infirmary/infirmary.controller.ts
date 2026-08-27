import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import {
  CreateConsultationInput,
  UpdateConsultationInput,
  CreatePrescriptionInput,
  UpdatePrescriptionInput,
  CreateMedicationInput,
  UpdateMedicationInput,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  CreateDocumentInput,
  UpdateDocumentInput,
  CreateFollowUpInput,
  UpdateFollowUpInput,
  CreateFormInput,
  UpdateFormInput,
  CreateFormResponseInput,
  UpdateSettingsInput,
} from "@mydaust/shared";
import { Roles } from "../auth/decorators.js";
import { CurrentUser, type AuthUser } from "../auth/current-user.js";
import { InfirmaryService } from "./infirmary.service.js";

@Controller("infirmary")
@Roles("infirmary", "admin")
export class InfirmaryController {
  constructor(private readonly svc: InfirmaryService) {}

  // ─── Settings ────────────────────────────────────────────────
  @Get("settings")
  getSettings() {
    return this.svc.getSettings();
  }

  @Patch("settings")
  updateSettings(@Body() body: unknown) {
    return this.svc.updateSettings(UpdateSettingsInput.parse(body) as Record<string, unknown>);
  }

  // ─── Students ────────────────────────────────────────────────
  @Get("students")
  listStudents() {
    return this.svc.listStudents();
  }

  // ─── Consultations ───────────────────────────────────────────
  @Get("consultations")
  listConsultations() {
    return this.svc.listConsultations();
  }

  @Post("consultations")
  createConsultation(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createConsultation(CreateConsultationInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("consultations/:id")
  updateConsultation(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updateConsultation(id, UpdateConsultationInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("consultations/:id")
  deleteConsultation(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteConsultation(id, user.personId);
  }

  // ─── Prescriptions ───────────────────────────────────────────
  @Get("prescriptions")
  listPrescriptions() {
    return this.svc.listPrescriptions();
  }

  @Post("prescriptions")
  createPrescription(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createPrescription(CreatePrescriptionInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("prescriptions/:id")
  updatePrescription(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updatePrescription(id, UpdatePrescriptionInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("prescriptions/:id")
  deletePrescription(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deletePrescription(id, user.personId);
  }

  // ─── Medications ─────────────────────────────────────────────
  @Get("medications")
  listMedications() {
    return this.svc.listMedications();
  }

  @Post("medications")
  createMedication(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createMedication(CreateMedicationInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("medications/:id")
  updateMedication(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updateMedication(id, UpdateMedicationInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("medications/:id")
  deleteMedication(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteMedication(id, user.personId);
  }

  // ─── Appointments ────────────────────────────────────────────
  @Get("appointments")
  listAppointments() {
    return this.svc.listAppointments();
  }

  @Post("appointments")
  createAppointment(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createAppointment(CreateAppointmentInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("appointments/:id")
  updateAppointment(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updateAppointment(id, UpdateAppointmentInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("appointments/:id")
  deleteAppointment(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteAppointment(id, user.personId);
  }

  // ─── Documents ───────────────────────────────────────────────
  @Get("documents")
  listDocuments() {
    return this.svc.listDocuments();
  }

  @Post("documents")
  createDocument(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createDocument(CreateDocumentInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("documents/:id")
  updateDocument(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updateDocument(id, UpdateDocumentInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("documents/:id")
  deleteDocument(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteDocument(id, user.personId);
  }

  // ─── Follow-ups ──────────────────────────────────────────────
  @Get("follow-ups")
  listFollowUps() {
    return this.svc.listFollowUps();
  }

  @Post("follow-ups")
  createFollowUp(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createFollowUp(CreateFollowUpInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("follow-ups/:id")
  updateFollowUp(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updateFollowUp(id, UpdateFollowUpInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("follow-ups/:id")
  deleteFollowUp(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteFollowUp(id, user.personId);
  }

  // ─── Forms ───────────────────────────────────────────────────
  @Get("forms")
  listForms() {
    return this.svc.listForms();
  }

  @Get("forms/:id")
  getForm(@Param("id") id: string) {
    return this.svc.getForm(id);
  }

  @Post("forms")
  createForm(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.createForm(CreateFormInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Patch("forms/:id")
  updateForm(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: AuthUser) {
    return this.svc.updateForm(id, UpdateFormInput.parse(body) as Record<string, unknown>, user.personId);
  }

  @Delete("forms/:id")
  deleteForm(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteForm(id, user.personId);
  }

  // ─── Form Responses ──────────────────────────────────────────
  @Get("forms/:formId/responses")
  listFormResponses(@Param("formId") formId: string) {
    return this.svc.listFormResponses(formId);
  }

  @Post("forms/:formId/responses")
  createFormResponse(
    @Param("formId") formId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = CreateFormResponseInput.parse(body);
    return this.svc.createFormResponse({ ...parsed, formId } as Record<string, unknown>, user.personId);
  }

  @Delete("responses/:id")
  deleteFormResponse(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteFormResponse(id, user.personId);
  }

  // ─── Analytics ───────────────────────────────────────────────
  @Get("analytics")
  getAnalytics() {
    return this.svc.getAnalytics();
  }
}
