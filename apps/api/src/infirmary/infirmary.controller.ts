import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { Roles } from "../auth/decorators.js";
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
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.svc.updateSettings(body);
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
  createConsultation(@Body() body: Record<string, unknown>) {
    return this.svc.createConsultation(body);
  }

  @Patch("consultations/:id")
  updateConsultation(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateConsultation(id, body);
  }

  @Delete("consultations/:id")
  deleteConsultation(@Param("id") id: string) {
    return this.svc.deleteConsultation(id);
  }

  // ─── Prescriptions ───────────────────────────────────────────
  @Get("prescriptions")
  listPrescriptions() {
    return this.svc.listPrescriptions();
  }

  @Post("prescriptions")
  createPrescription(@Body() body: Record<string, unknown>) {
    return this.svc.createPrescription(body);
  }

  @Patch("prescriptions/:id")
  updatePrescription(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updatePrescription(id, body);
  }

  @Delete("prescriptions/:id")
  deletePrescription(@Param("id") id: string) {
    return this.svc.deletePrescription(id);
  }

  // ─── Medications ─────────────────────────────────────────────
  @Get("medications")
  listMedications() {
    return this.svc.listMedications();
  }

  @Post("medications")
  createMedication(@Body() body: Record<string, unknown>) {
    return this.svc.createMedication(body);
  }

  @Patch("medications/:id")
  updateMedication(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateMedication(id, body);
  }

  @Delete("medications/:id")
  deleteMedication(@Param("id") id: string) {
    return this.svc.deleteMedication(id);
  }

  // ─── Appointments ────────────────────────────────────────────
  @Get("appointments")
  listAppointments() {
    return this.svc.listAppointments();
  }

  @Post("appointments")
  createAppointment(@Body() body: Record<string, unknown>) {
    return this.svc.createAppointment(body);
  }

  @Patch("appointments/:id")
  updateAppointment(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateAppointment(id, body);
  }

  @Delete("appointments/:id")
  deleteAppointment(@Param("id") id: string) {
    return this.svc.deleteAppointment(id);
  }

  // ─── Documents ───────────────────────────────────────────────
  @Get("documents")
  listDocuments() {
    return this.svc.listDocuments();
  }

  @Post("documents")
  createDocument(@Body() body: Record<string, unknown>) {
    return this.svc.createDocument(body);
  }

  @Patch("documents/:id")
  updateDocument(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateDocument(id, body);
  }

  @Delete("documents/:id")
  deleteDocument(@Param("id") id: string) {
    return this.svc.deleteDocument(id);
  }

  // ─── Follow-ups ──────────────────────────────────────────────
  @Get("follow-ups")
  listFollowUps() {
    return this.svc.listFollowUps();
  }

  @Post("follow-ups")
  createFollowUp(@Body() body: Record<string, unknown>) {
    return this.svc.createFollowUp(body);
  }

  @Patch("follow-ups/:id")
  updateFollowUp(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateFollowUp(id, body);
  }

  @Delete("follow-ups/:id")
  deleteFollowUp(@Param("id") id: string) {
    return this.svc.deleteFollowUp(id);
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
  createForm(@Body() body: Record<string, unknown>) {
    return this.svc.createForm(body);
  }

  @Patch("forms/:id")
  updateForm(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.updateForm(id, body);
  }

  @Delete("forms/:id")
  deleteForm(@Param("id") id: string) {
    return this.svc.deleteForm(id);
  }

  // ─── Form Responses ──────────────────────────────────────────
  @Get("forms/:formId/responses")
  listFormResponses(@Param("formId") formId: string) {
    return this.svc.listFormResponses(formId);
  }

  @Post("forms/:formId/responses")
  createFormResponse(
    @Param("formId") formId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.createFormResponse({ ...body, formId });
  }

  @Delete("responses/:id")
  deleteFormResponse(@Param("id") id: string) {
    return this.svc.deleteFormResponse(id);
  }

  // ─── Analytics ───────────────────────────────────────────────
  @Get("analytics")
  getAnalytics() {
    return this.svc.getAnalytics();
  }
}
