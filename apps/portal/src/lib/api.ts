"use client";

import type {
  AccountBalanceSummary,
  AcademicCatalogDraft,
  AcademicCatalogLevel,
  AcademicCatalogProgram,
  AcademicNotYetGradedStanding,
  AcademicProgress,
  AcademicStanding,
  AcademicStandingRule,
  InstallmentDueState,
  InstallmentPaymentProgress,
  PaymentMethodsConfig,
  PaymentSubmissionSummary,
  ProofPaymentMethod,
  PublicProofMethodConfig,
  TranscriptView,
  ManagedUser,
  ManagedUserPage,
} from "@mydaust/shared";
import { parseSuccessfulApiResponse } from "./api-response";
export type {
  AccountBalanceSummary,
  AcademicCatalogDraft,
  AcademicCatalogLevel,
  AcademicCatalogProgram,
  AcademicNotYetGradedStanding,
  AcademicProgress,
  AcademicStanding,
  AcademicStandingRule,
  AccountStanding,
  InstallmentDueState,
  InstallmentPaymentProgress,
  PaymentMethodsConfig,
  PaymentSubmissionSummary,
  ProofPaymentMethod,
  PublicProofMethodConfig,
  TranscriptView,
  ManagedUser,
  ManagedUserPage,
} from "@mydaust/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** HTTP error carrying the status so callers can branch; `message` is always human-readable. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Friendly copy for statuses whose server body is jargon or empty. 4xx validation/conflict
// messages (e.g. "This ID is already assigned") are user-meaningful, so those are kept as-is.
const FRIENDLY: Record<number, string> = {
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  500: "Something went wrong on our end. Please try again.",
  502: "The server is unavailable right now. Please try again.",
  503: "The server is unavailable right now. Please try again.",
};

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let serverMsg = "";
  try {
    const body = JSON.parse(text);
    // ZodExceptionFilter answers {message:"Validation failed", issues:[{path,message}]}. Using
    // only `message` told the user something failed but never which field, which made a
    // validation error indistinguishable from a bug.
    const issues = Array.isArray(body?.issues)
      ? body.issues
          .map((i: { path?: string; message?: string }) =>
            i?.path ? `${i.path}: ${i.message ?? "invalid"}` : i?.message,
          )
          .filter(Boolean)
          .join("; ")
      : "";
    serverMsg =
      issues ||
      (typeof body?.message === "string"
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(", ")
          : typeof body?.error === "string"
            ? body.error
            : "");
  } catch {
    serverMsg = text;
  }
  const overrideWithFriendly =
    res.status >= 500 || res.status === 401 || res.status === 403;
  const message = overrideWithFriendly
    ? (FRIENDLY[res.status] ?? serverMsg ?? `Request failed (${res.status}).`)
    : serverMsg || FRIENDLY[res.status] || `Request failed (${res.status}).`;
  return new ApiError(res.status, message);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include", // send/receive the session cookie
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw await toApiError(res);
  const ct = res.headers.get("content-type") ?? "";
  return parseSuccessfulApiResponse<T>(await res.text(), ct);
}

async function multipartRequest<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<T>;
}

export { API_URL };

/** Resolve a stored relative upload URL (`/uploads/x`) to an absolute, fetchable URL. */
export const fileUrl = (path: string) =>
  path.startsWith("http") ? path : `${API_URL}${path}`;

// --- File upload (Track P: local disk now, S3 later) ---
export interface UploadResult {
  url: string;
  name: string;
  size: number;
}
export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/uploads`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<UploadResult>;
}
export async function uploadSiteVideo(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/uploads/site-video`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<UploadResult>;
}

// --- Site CMS (communications role) ---
import type { SiteOverrides } from "@mydaust/shared";
export const getSiteDraft = () =>
  request<{
    overrides: SiteOverrides;
    updatedAt: string | null;
    publishedAt: string | null;
  }>("/content/draft");
export const saveSiteDraft = (overrides: SiteOverrides) =>
  request<{ ok: boolean; updatedAt: string }>("/content/draft", {
    method: "PUT",
    body: JSON.stringify(overrides),
  });
export const publishSite = () =>
  request<{ ok: boolean; publishedAt: string | null }>("/content/publish", {
    method: "POST",
  });
export const previewSite = () =>
  request<{ token: string }>("/content/preview", { method: "POST" });

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  read: boolean;
  createdAt: string;
}
export const getContactMessages = () => request<ContactMessage[]>("/contact");
export const markContactRead = (id: string, read: boolean) =>
  request<ContactMessage>(`/contact/${id}/read`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });

import type { NewsArticleInput } from "@mydaust/shared";
export interface AdminNewsArticle {
  id: string;
  slug: string;
  titleEn: string;
  titleFr: string;
  excerptEn: string;
  excerptFr: string;
  bodyEn: string;
  bodyFr: string;
  imageUrl: string | null;
  externalUrl: string | null;
  tag: string | null;
  date: string;
  published: boolean;
  sortOrder: number;
}
export const getNewsAdmin = () => request<AdminNewsArticle[]>("/news/admin");
export const createNews = (input: NewsArticleInput) =>
  request<AdminNewsArticle>("/news", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateNews = (id: string, input: NewsArticleInput) =>
  request<AdminNewsArticle>(`/news/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const deleteNews = (id: string) =>
  request<{ ok: boolean }>(`/news/${id}`, { method: "DELETE" });

// --- Faculty profiles (public-site manager, communications/admin role) ---
import type {
  AdminFacultyItem,
  FacultyCreateInput,
  FacultyProvisionedLogin,
  FacultyProfileInput,
} from "@mydaust/shared";
export type { FacultyProvisionedLogin } from "@mydaust/shared";
export const getFacultyList = () => request<AdminFacultyItem[]>("/faculty");
export const updateFacultyProfile = (id: string, input: FacultyProfileInput) =>
  request<{ ok: boolean }>(`/faculty/${id}/profile`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const deleteFaculty = (id: string) =>
  request<{ ok: boolean }>(`/faculty/${id}`, { method: "DELETE" });
export const setFacultyVisibility = (id: string, visible: boolean) =>
  request<{ ok: boolean }>(`/faculty/${id}/visibility`, {
    method: "PUT",
    body: JSON.stringify({ visible }),
  });
export interface CreatedFaculty {
  id: string;
  email: string;
  tempPassword: string | null;
}
export const createFaculty = (input: FacultyCreateInput) =>
  request<CreatedFaculty>("/faculty", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const provisionFacultyLogin = (id: string) =>
  request<FacultyProvisionedLogin>(`/faculty/${id}/provision-login`, {
    method: "POST",
  });
export const provisionAllFacultyLogins = () =>
  request<{ count: number; credentials: FacultyProvisionedLogin[] }>(
    "/faculty/provision-logins",
    { method: "POST" },
  );

// --- Auth ---
export interface Me {
  personId: string;
  roles: string[];
  studentId?: string;
  email: string;
  name: string;
  mustChangePassword?: boolean;
}
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
export const login = (email: string, password: string) =>
  request<Me>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
export const logout = () =>
  request<{ ok: boolean }>("/auth/logout", { method: "POST" });

/** Sidebar badge counts + the identity line, both scoped to the caller's roles. */
export interface NavContext {
  badges: Record<string, string>;
  meta: string | null;
}
export const getNavContext = () => request<NavContext>("/nav/context");
export const getMe = () => request<Me>("/auth/me");

// --- Major selection (first-login prompt) ---
export interface AvailableProgram {
  code: string;
  name: string;
  degree: string | null;
  school: string | null;
}
export const getAvailablePrograms = () =>
  request<AvailableProgram[]>("/academics/my/available-programs");
export const getMajorStatus = () =>
  request<{ majorSelectionDone: boolean }>("/academics/my/major-status");
export const chooseMyMajor = (programCode: string | null) =>
  request<{ majorSelectionDone: true }>("/academics/my/major", {
    method: "POST",
    body: JSON.stringify({ programCode }),
  });

// --- Finance: student ---
export interface BillingInstallment {
  id: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  /** Additive derived fields; optional while older API tasks roll forward. */
  outstanding?: number;
  outstandingXof?: number;
  creditApplied?: number;
  creditAppliedXof?: number;
  effectiveSettledXof?: number;
  amountDueXof?: number;
  amountPaidXof?: number;
  paymentProgress?: InstallmentPaymentProgress;
  dueState?: InstallmentDueState;
  daysPastDue?: number;
  components?: {
    id: string;
    invoiceComponentId: string;
    componentKey: string;
    label: string;
    amountXof: number;
  }[];
}
export interface BillingPayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  providerRef?: string;
  transactionReference?: string | null;
  source?: string;
  initiatedByEmail?: string | null;
  settledAt?: string | null;
  recognizedOn?: string | null;
  dateBasis?: "settlement" | "source_as_of_balance" | null;
  refundedAt?: string | null;
  createdAt: string;
}
export interface WireTransferSummary {
  id: string;
  status: "submitted" | "approved" | "rejected";
  submittedAmountXof: number;
  confirmedAmountXof: number | null;
  contactEmail?: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}
export interface PublicWireConfig {
  enabled: boolean;
  bankName: string;
  beneficiary: string;
  accountNumber: string;
  iban: string;
  swift: string;
  branch: string;
  instructions: string;
}
export interface WireConfig extends PublicWireConfig {
  notificationRecipients: string[];
}
export interface BillingInvoice {
  id: string;
  /** Additive canonical tie-breaker; absent while an older API task drains. */
  createdAt?: string;
  /** Student-facing description; annual workbook baselines use the normal schedule label. */
  label?: string;
  description?: string | null;
  packageType?: InvoicePackageType;
  academicYearLabel?: string | null;
  term: string;
  total: number;
  paid: number;
  balance: number;
  summary?: AccountBalanceSummary;
  effectiveOutstandingXof?: number;
  effectiveStatus?: AccountBalanceSummary["standing"];
  status: string;
  installments: BillingInstallment[];
  payments: BillingPayment[];
  wireTransfers: WireTransferSummary[];
}
export const getMyBilling = () =>
  request<BillingInvoice[]>("/finance/my/billing");
export const getMyBillingSummary = () =>
  request<AccountBalanceSummary>("/finance/my/billing-summary");

// --- Annual billing profile ---
// The invoice remains the monetary authority. This view explains the annual
// service selections and adjustments that produced that invoice.
export interface BillingProfileServiceSelection {
  code: string;
  label: string;
  amountXof: number;
}

export interface BillingProfileAward {
  id: string;
  code: string;
  definitionKey: string;
  label: string;
  amountXof: number;
  effect: "discount" | "charge";
  basis: string;
  calculation: string;
  source: string;
  reason?: string | null;
}

export interface BillingProfileAdjustment {
  id: string;
  code: string;
  label: string;
  source: string;
  basis: string;
  calculation: string;
  amountXof: number;
  kind: "discount" | "charge";
  reason?: string | null;
}

export interface BillingProfileWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface BillingProfileView {
  id: string;
  studentId: string;
  academicYearLabel: string;
  revision: number;
  status: string;
  source: {
    kind: string;
    workbookRow: number | null;
    workbookFileHash?: string | null;
  } | null;
  housing: BillingProfileServiceSelection | null;
  cafeteria: BillingProfileServiceSelection | null;
  insurance: {
    selected: boolean;
    label?: string;
    amountXof: number;
  };
  caution: {
    selected: boolean;
    label?: string;
    amountXof: number;
    refundable: boolean;
  };
  awards: BillingProfileAward[];
  adjustments: BillingProfileAdjustment[];
  grossChargesXof: number;
  netBilledXof: number;
  paidXof: number;
  outstandingXof: number;
  accountCreditXof: number;
  warnings: BillingProfileWarning[];
}

export interface BillingProfileServiceOption {
  id: string;
  code: string;
  label: string;
  amountXof: number;
  percentageBasisPoints?: number | null;
  refundable: boolean;
  active: boolean;
}

export interface BillingProfileAwardDefinition {
  id: string;
  code: string;
  label: string;
  basis: string;
  calculation: string;
  value: number | null;
  stacking: string;
  effect: "discount" | "charge";
  requiresApproval: boolean;
  active: boolean;
}

export interface BillingProfileOptions {
  academicYearId: string;
  academicYearLabel: string;
  feeScheduleId: string | null;
  feeScheduleRevision: number;
  feeScheduleFingerprintSha256: string | null;
  billingCatalogFingerprintSha256: string | null;
  housingOptions: BillingProfileServiceOption[];
  cafeteriaOptions: BillingProfileServiceOption[];
  insuranceOption: BillingProfileServiceOption | null;
  cautionOption: BillingProfileServiceOption | null;
  awardDefinitions: BillingProfileAwardDefinition[];
}

export interface BillingProfileChangeInput {
  academicYearLabel: string;
  baseRevision: number;
  housingOptionCode: string;
  cafeteriaOptionCode: string;
  insuranceSelected: boolean;
  cautionSelected: boolean;
  awardDefinitionIds: string[];
  manualAdjustments?: {
    definitionId?: string;
    label: string;
    amountXof: number;
    reason: string;
  }[];
  reason: string;
}

export interface BillingProfileChangeResult {
  applied: boolean;
  request: ApprovalRequestRow;
  result: BillingProfileView | null;
}

export const getMyBillingProfile = () =>
  request<BillingProfileView | null>("/finance/my/billing-profile");
export const getBillingProfileOptions = (academicYearLabel?: string) =>
  request<BillingProfileOptions>(
    `/finance/billing-profile/options${academicYearLabel ? `?academicYearLabel=${encodeURIComponent(academicYearLabel)}` : ""}`,
  );
export const getAdminBillingProfile = (studentId: string) =>
  request<BillingProfileView | null>(
    `/finance/admin/students/${encodeURIComponent(studentId)}/billing-profile`,
  );
export const requestBillingProfileChange = (
  studentId: string,
  input: BillingProfileChangeInput,
) =>
  request<BillingProfileChangeResult>(
    `/finance/admin/students/${encodeURIComponent(studentId)}/billing-profile/requests`,
    { method: "POST", body: JSON.stringify(input) },
  );

export type BillingCatalogServiceKind =
  "housing" | "cafeteria" | "insurance" | "housing_caution";

export interface BillingCatalogServiceOption {
  id: string;
  academicYearLabel: string;
  kind: BillingCatalogServiceKind;
  code: string;
  label: string;
  description: string | null;
  calculation: "fixed" | "percentage_of_service";
  amountXof: number | null;
  percentageBasisPoints: number | null;
  basisServiceKind: BillingCatalogServiceKind | null;
  costCenterCode: string;
  refundable: boolean;
  defaultSelected: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCatalogAdjustmentDefinition {
  id: string;
  academicYearLabel: string;
  key: string;
  label: string;
  description: string | null;
  basis:
    | "tuition"
    | "housing"
    | "cafeteria"
    | "insurance"
    | "housing_caution"
    | "gross_charges"
    | "manual";
  calculation: "percentage" | "fixed" | "manual";
  stacking: "additive" | "sequential" | "exclusive";
  effect: "discount" | "charge";
  percentageBasisPoints: number | null;
  fixedAmountXof: number | null;
  requiresApproval: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingCatalogView {
  academicYearLabel: string;
  catalogFingerprint: string;
  serviceOptions: BillingCatalogServiceOption[];
  adjustmentDefinitions: BillingCatalogAdjustmentDefinition[];
}

export interface BillingCatalogYear {
  id: string;
  label: string;
  status: "draft" | "active" | "archived";
  startsOn: string | null;
  endsOn: string | null;
}

export type BillingCatalogServiceOptionInput = Omit<
  BillingCatalogServiceOption,
  "id" | "academicYearLabel" | "createdAt" | "updatedAt"
> & { id?: string };

export type BillingCatalogAdjustmentDefinitionInput = Omit<
  BillingCatalogAdjustmentDefinition,
  "id" | "academicYearLabel" | "createdAt" | "updatedAt"
> & { id?: string };

export interface BillingCatalogChangeInput {
  academicYearLabel: string;
  expectedCatalogFingerprint: string;
  serviceOptions: BillingCatalogServiceOptionInput[];
  adjustmentDefinitions: BillingCatalogAdjustmentDefinitionInput[];
  reason: string;
}

export const getBillingCatalog = (academicYearLabel?: string) =>
  request<BillingCatalogView>(
    `/finance/admin/billing-profile/catalog${academicYearLabel ? `?academicYearLabel=${encodeURIComponent(academicYearLabel)}` : ""}`,
  );

export const getBillingCatalogYears = () =>
  request<BillingCatalogYear[]>("/finance/admin/billing-profile/catalog-years");

export const requestBillingCatalogChange = (input: BillingCatalogChangeInput) =>
  request<FinanceChangeResult>("/finance/admin/billing-profile/catalog", {
    method: "PUT",
    body: JSON.stringify(input),
  });
// --- Resumable proof-based payments ---
export const getProofPaymentMethods = () =>
  request<PublicProofMethodConfig[]>("/finance/payment-methods");
export const listMyPaymentAttempts = () =>
  request<PaymentSubmissionSummary[]>("/finance/my/payment-attempts");
export const createMyPaymentAttempt = (input: {
  invoiceId: string;
  amountXof: number;
  method: ProofPaymentMethod;
}) =>
  request<PaymentSubmissionSummary>("/finance/my/payment-attempts", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const changeMyPaymentAttemptMethod = (
  id: string,
  method: ProofPaymentMethod,
) =>
  request<PaymentSubmissionSummary>(`/finance/my/payment-attempts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ method }),
  });
export function submitMyPaymentProof(id: string, proof: File) {
  const form = new FormData();
  form.append("proof", proof);
  return multipartRequest<PaymentSubmissionSummary>(
    `/finance/my/payment-attempts/${id}/proof`,
    form,
  );
}
export const getResumablePaymentAttempt = (token: string) =>
  request<PaymentSubmissionSummary>(
    `/finance/payment-attempts/resume/${encodeURIComponent(token)}`,
  );
export const changeResumablePaymentMethod = (
  token: string,
  id: string,
  method: ProofPaymentMethod,
) =>
  request<PaymentSubmissionSummary>(
    `/finance/payment-attempts/resume/${encodeURIComponent(token)}/${id}`,
    { method: "PATCH", body: JSON.stringify({ method }) },
  );
export function submitResumablePaymentProof(
  token: string,
  id: string,
  proof: File,
) {
  const form = new FormData();
  form.append("proof", proof);
  return multipartRequest<PaymentSubmissionSummary>(
    `/finance/payment-attempts/resume/${encodeURIComponent(token)}/${id}/proof`,
    form,
  );
}
export const createPaymentLinkAttempt = (
  token: string,
  input: { method: ProofPaymentMethod; contactEmail: string },
) =>
  request<PaymentSubmissionSummary>(
    `/finance/links/${encodeURIComponent(token)}/payment-attempts`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const listPaymentLinkAttempts = (token: string) =>
  request<PaymentSubmissionSummary[]>(
    `/finance/links/${encodeURIComponent(token)}/payment-attempts`,
  );
export const listPublicBillPaymentAttempts = (studentNo: string, dob: string) =>
  request<PaymentSubmissionSummary[]>(
    "/finance/public/bill/payment-attempts/history",
    {
      method: "POST",
      body: JSON.stringify({ studentNo, dob }),
    },
  );

// --- PI-SPI (BCEAO request-to-pay) ---
import type { PiSpiRequestSummary } from "@mydaust/shared";
export type { PiSpiRequestSummary };
export interface PiSpiAliasLookup {
  alias: string;
  name: string;
  country: string | null;
}
/** Whether the pay screens should offer instant payment at all. */
export const getPiSpiConfig = () =>
  request<{ enabled: boolean }>("/finance/pi-spi/config");
/** Resolve an alias to its owner, so the payer confirms who is being billed. */
export const verifyPiSpiAlias = (alias: string) =>
  request<PiSpiAliasLookup>("/finance/pi-spi/verify-alias", {
    method: "POST",
    body: JSON.stringify({ alias }),
  });
export const submitStudentPiSpi = (input: {
  invoiceId: string;
  alias: string;
  amountXof: number;
  saveAlias?: boolean;
}) =>
  request<PiSpiRequestSummary>("/finance/my/pi-spi", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const getMyPiSpiRequest = (txId: string) =>
  request<PiSpiRequestSummary>(
    `/finance/my/pi-spi/${encodeURIComponent(txId)}`,
  );
export const submitLinkPiSpi = (token: string, alias: string) =>
  request<PiSpiRequestSummary>(
    `/finance/links/${encodeURIComponent(token)}/pi-spi`,
    { method: "POST", body: JSON.stringify({ alias }) },
  );
export const getLinkPiSpiRequest = (token: string, txId: string) =>
  request<PiSpiRequestSummary>(
    `/finance/links/${encodeURIComponent(token)}/pi-spi/${encodeURIComponent(txId)}`,
  );
export const submitPublicBillPiSpi = (input: {
  studentNo: string;
  dob: string;
  alias: string;
  amountXof: number;
}) =>
  request<PiSpiRequestSummary>("/finance/public/bill/pi-spi", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const getPublicBillPiSpiRequest = (input: {
  studentNo: string;
  dob: string;
  txId: string;
}) =>
  request<PiSpiRequestSummary>("/finance/public/bill/pi-spi/status", {
    method: "POST",
    body: JSON.stringify(input),
  });
// --- Finance: admin ---
export interface CollectionSummary {
  currency: string;
  billed: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
  byMethod: { method: string; amount: number; count: number }[];
  invoicesByStatus: { status: string; count: number }[];
}
export const getAdminSummary = () =>
  request<CollectionSummary>("/finance/admin/summary");

export interface AdminPayment {
  id: string;
  student: string;
  studentNo: string;
  term: string;
  amount: number;
  method: string;
  status: string;
  providerRef: string;
  settledAt: string | null;
  recognizedOn: string | null;
  dateBasis: "settlement" | "source_as_of_balance" | null;
  refundedAt: string | null;
  createdAt: string;
}
export const getAdminPayments = (status?: string) =>
  request<AdminPayment[]>(
    `/finance/admin/payments${status ? `?status=${status}` : ""}`,
  );

// --- Academics ---
export interface Term {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}
export interface Section {
  id: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  /** Registration status set by the registrar: "open" | "closed". Independent of seats left. */
  status: string;
  capacity: number;
  seatsTaken: number;
  seatsLeft: number;
  schedule: string;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
  instructor: string | null;
  instructorId: string | null;
  termId: string;
  /** Staff-curated flag surfaced to students in the registration catalogue. */
  recommended: boolean;
  prerequisites: string[];
}
export interface MyEnrollment {
  enrollmentId: string;
  sectionId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  term: string;
  days: string;
  startTime: string;
  endTime: string;
  schedule: string;
  room: string | null;
}
export const getCurrentTerm = () => request<Term>("/academics/current-term");
export const getSections = (termId: string) =>
  request<Section[]>(`/academics/sections?termId=${termId}`);
export const getMyEnrollments = () =>
  request<MyEnrollment[]>("/academics/my/enrollments");
export interface StudentSchedule {
  term: Term | null;
  entries: MyEnrollment[];
}
export const getStudentSchedule = () =>
  request<StudentSchedule>("/academics/my/schedule");
export const enrollSection = (sectionId: string) =>
  request("/academics/my/enroll", {
    method: "POST",
    body: JSON.stringify({ sectionId }),
  });
export interface EnrollmentBundleResult {
  enrollmentIds: string[];
  sectionIds: string[];
}
export const enrollSectionBundle = (sectionIds: string[]) =>
  request<EnrollmentBundleResult>("/academics/my/enrollments/bundle", {
    method: "POST",
    body: JSON.stringify({ sectionIds }),
  });
export const dropEnrollment = (enrollmentId: string) =>
  request("/academics/my/drop", {
    method: "POST",
    body: JSON.stringify({ enrollmentId }),
  });

export interface TeachingSection {
  id: string;
  course: string;
  sectionCode: string;
  term: string;
  schedule: string;
  room: string | null;
  enrolled: number;
  capacity: number;
}
export interface Roster {
  course: string;
  sectionCode: string;
  students: {
    studentNo: string;
    name: string;
    grade: string | null;
    viaOverride: boolean;
  }[];
}
export const getTeaching = () =>
  request<TeachingSection[]>("/academics/teaching");

// --- Faculty dashboard + insights (teacher design) ---
export interface FacultyClass {
  sectionId: string;
  code: string;
  title: string;
  color: string;
  students: number;
  attendance: number | null;
  ungraded: number;
  room: string | null;
  days: string;
  startTime: string;
  endTime: string;
  term: string;
}
export interface FacultyOverview {
  kpis: {
    activeCourses: number;
    studentsTaught: number;
    itemsToGrade: number;
    avgAttendance: number | null;
  };
  classes: FacultyClass[];
  today: {
    sectionId: string;
    time: string;
    end: string;
    label: string;
    sub: string;
  }[];
  needsAttention: {
    label: string;
    meta: string;
    sectionId: string;
    tone: string;
  }[];
}
export const getFacultyOverview = () =>
  request<FacultyOverview>("/academics/teaching/overview");

export interface FacultyScheduleItem {
  sectionId: string;
  code: string;
  title: string;
  color: string;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
  term: string;
  termStartDate: string;
  termEndDate: string;
}
export const getFacultySchedule = () =>
  request<FacultyScheduleItem[]>("/academics/teaching/schedule");

export interface SectionInsights {
  course: string;
  sectionCode: string;
  kpis: {
    attendance: number | null;
    passRate: number | null;
    itemsToGrade: number;
    atRiskCount: number;
  };
  distribution: { label: string; count: number }[];
  trend: { date: string; pct: number }[];
  atRisk: {
    name: string;
    studentNo: string;
    reason: string;
    severity: string;
  }[];
}
export const getSectionInsights = (sectionId: string) =>
  request<SectionInsights>(`/academics/sections/${sectionId}/insights`);
export const getRoster = (sectionId: string) =>
  request<Roster>(`/academics/sections/${sectionId}/roster`);

// --- Gradebook + attendance (faculty) ---
export interface Gradebook {
  course: string;
  sectionCode: string;
  gradeOptions: string[];
  students: {
    enrollmentId: string;
    studentNo: string;
    name: string;
    grade: string | null;
    status: string;
  }[];
}
export const submitGrades = (
  sectionId: string,
  grades: { enrollmentId: string; grade: string | null }[],
  finalize: boolean,
) =>
  request(`/academics/sections/${sectionId}/grades`, {
    method: "POST",
    body: JSON.stringify({ grades, finalize }),
  });

export interface AttendanceSheet {
  date: string;
  /** False when this session has no roll call yet ΓÇö distinct from an all-present one. */
  recorded: boolean;
  students: {
    enrollmentId: string;
    studentNo: string;
    name: string;
    /** null when this student has no mark for the date. */
    status: string | null;
  }[];
}
export interface AttendanceSession {
  date: string;
  present: number;
  late: number;
  absent: number;
}
export const getAttendanceSessions = (sectionId: string) =>
  request<AttendanceSession[]>(
    `/academics/sections/${sectionId}/attendance/sessions`,
  );
export const getAttendance = (sectionId: string, date: string) =>
  request<AttendanceSheet>(
    `/academics/sections/${sectionId}/attendance?date=${date}`,
  );
export const markAttendance = (
  sectionId: string,
  date: string,
  records: { enrollmentId: string; status: string }[],
) =>
  request(`/academics/sections/${sectionId}/attendance`, {
    method: "POST",
    body: JSON.stringify({ date, records }),
  });

// --- Assignments + submissions (faculty) ---
export interface SectionAssignment {
  id: string;
  title: string;
  type: string;
  maxPoints: number;
  weight: number;
  dueDate: string;
  submitted: number;
  graded: number;
}
export interface SectionAssignments {
  enrolled: number;
  assignments: SectionAssignment[];
}
export const getSectionAssignments = (sectionId: string) =>
  request<SectionAssignments>(`/academics/sections/${sectionId}/assignments`);
export const createAssignment = (
  sectionId: string,
  body: {
    title: string;
    description?: string;
    type: string;
    maxPoints: number;
    weight: number;
    dueDate: string;
  },
) =>
  request(`/academics/sections/${sectionId}/assignments`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateAssignment = (
  sectionId: string,
  assignmentId: string,
  body: {
    title?: string;
    description?: string;
    type?: string;
    maxPoints?: number;
    weight?: number;
    dueDate?: string;
  },
) =>
  request(`/academics/sections/${sectionId}/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteAssignment = (sectionId: string, assignmentId: string) =>
  request(`/academics/sections/${sectionId}/assignments/${assignmentId}`, {
    method: "DELETE",
  });

export interface SubmissionRow {
  enrollmentId: string;
  studentNo: string;
  name: string;
  submissionId: string | null;
  status: string;
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
}
export interface AssignmentSubmissions {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    maxPoints: number;
    weight: number;
    dueDate: string;
    course: string;
    sectionId: string;
  };
  submissions: SubmissionRow[];
}
export const getAssignmentSubmissions = (assignmentId: string) =>
  request<AssignmentSubmissions>(
    `/academics/assignments/${assignmentId}/submissions`,
  );
export const gradeSubmission = (
  submissionId: string,
  /** null clears the grade and returns the row to "submitted". */
  score: number | null,
  /** Omit to leave the existing comment untouched. */
  feedback?: string,
) =>
  request(`/academics/submissions/${submissionId}/grade`, {
    method: "POST",
    body: JSON.stringify({ score, feedback }),
  });

// --- Assignments (student) ---
export interface MyAssignment {
  assignmentId: string;
  title: string;
  type: string;
  courseCode: string;
  sectionId: string;
  maxPoints: number;
  dueDate: string;
  status: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
  description: string | null;
  weight: number;
  /** What was already handed in ΓÇö the submit form doubles as the edit form. */
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
}
/** A material as a student sees it ΓÇö always published, always with a file. */
export interface StudentMaterial {
  id: string;
  title: string;
  kind: string;
  category: string;
  folderId: string | null;
  folder: { id: string; name: string; category: string } | null;
  fileUrl: string;
  fileName: string | null;
  createdAt: string;
}
export const getMySectionMaterials = (sectionId: string) =>
  request<StudentMaterial[]>(`/academics/my/sections/${sectionId}/materials`);

export interface MyCourse {
  enrollmentId: string;
  sectionId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  term: string;
  status: string;
  grade: string | null;
}
export const getMyCourses = () =>
  request<{ current: MyCourse[]; past: MyCourse[] }>("/academics/my/courses");

export const getMyAssignments = () =>
  request<MyAssignment[]>("/academics/my/assignments");
export const submitAssignment = (
  assignmentId: string,
  body: { text?: string; fileUrl?: string; fileName?: string },
) =>
  request(`/academics/my/assignments/${assignmentId}/submit`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export interface CourseDetail {
  overview: {
    courseCode: string;
    title: string;
    credits: number;
    description: string | null;
    term: string;
    instructor: string | null;
    schedule: string;
    room: string | null;
    prerequisites: string[];
    status: string;
    grade: string | null;
  };
  assignments: {
    assignmentId: string;
    title: string;
    type: string;
    maxPoints: number;
    weight: number;
    dueDate: string;
    status: string;
    score: number | null;
    feedback: string | null;
  }[];
}
export const getCourseDetail = (sectionId: string) =>
  request<CourseDetail>(`/academics/my/sections/${sectionId}`);

export interface MySummary {
  enrolledCourses: number;
  credits: number;
  gpa: number;
  completedCredits: number;
  academicProgress: AcademicProgress;
  academicStanding: AcademicStanding;
}
export interface GradeRow {
  courseCode: string;
  title: string;
  credits: number;
  term: string;
  grade: string | null;
  points: number | null;
  countsTowardGpa: boolean;
}
export const getMySummary = () => request<MySummary>("/academics/my/summary");
export const getMyGrades = () => request<GradeRow[]>("/academics/my/grades");

export interface AdminStats {
  totalStudents: number;
  totalEnrolled: number;
  /** Active students with at least one real hold record. */
  holdsCount: number;
  openApplications: number;
  byProgram: { code: string; name: string; students: number }[];
}
export interface AdminStudent {
  id: string;
  studentNo: string;
  name: string;
  email: string;
  photoUrl: string | null;
  program: string;
  programName: string | null;
  yearLevel: number | null;
  academicLevel: {
    code: string;
    name: string;
    minimumCredits: number;
    creditCeiling: number;
  } | null;
  academicStanding: AcademicStanding | null;
  cohort: string | null;
  gpa: number;
  completedCredits: number;
  balance: number;
  summary?: AccountBalanceSummary;
  status: string;
  hasLogin: boolean;
  mustChangePassword: boolean;
  // Free-text profile fields used by the roster's filter Selects. Null when
  // the registrar has not yet filled the Edit form.
  gender: string | null;
  nationality: string | null;
}
export interface AdminStudentDirectoryRow {
  id: string;
  studentNo: string;
  name: string;
  program: string;
  yearLevel: number | null;
  recordStatus: "active" | "archived";
}
export type AdminStudentRosterSort =
  "name" | "program" | "level" | "gpa" | "balance" | "status";
export type AdminStudentLoginFilter =
  "all" | "active" | "must_change" | "not_activated";
export interface AdminStudentRosterPage {
  items: AdminStudent[];
  page: number;
  pageSize: 25 | 50 | 100;
  total: number;
  allTotal: number;
  totalPages: number;
  missingLoginCount: number;
  programs: { code: string; name: string }[];
  // Distinct values currently present in the dataset, used to populate the
  // filter Selects. The server returns the list global to the roster
  // (intersected with other active filters' base WHERE), so each Select can
  // only contain values that can actually be selected.
  genders: string[];
  nationalities: string[];
}
export interface AdminStudentRosterParams {
  page?: number;
  pageSize?: 25 | 50 | 100;
  search?: string;
  program?: string;
  // `level` is a derived catalog code (S1, S2, ΓÇª) ΓÇö handled server-side by
  // fetching the full filtered set, deriving per-row, then filtering. The API
  // is uniform with the SQL-pushdown filters even though this one can't go
  // into WHERE.
  level?: string;
  gender?: string;
  nationality?: string;
  /** Approved-catalog standing code, for example `good_standing`. */
  standing?: string;
  login?: AdminStudentLoginFilter;
  sort?: AdminStudentRosterSort;
  direction?: "asc" | "desc";
}
export interface StudentActivationStart {
  accepted: true;
}
export const startStudentActivation = (input: {
  studentNo: string;
  dob: string;
  requestToken: string;
}) =>
  request<StudentActivationStart>("/student-activation/requests", {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify(input),
  });
export interface ProgramRow {
  code: string;
  name: string;
  department: string;
  students: number;
  degree: string | null;
  school: string | null;
  tuition: number | null;
  color: string | null;
}
export interface AdminPrograms {
  programs: ProgramRow[];
  courses: {
    code: string;
    title: string;
    credits: number;
    department: string;
    status: string;
    prereq: string | null;
  }[];
  departments: { id: string; code: string; name: string }[];
}
export const createProgram = (input: {
  code: string;
  name: string;
  departmentId: string;
  degree?: string | null;
  school?: string | null;
  tuition?: number | null;
  color?: string | null;
}) =>
  request<{ id: string }>("/academics/admin/programs", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const createCourse = (
  input: {
    code: string;
    title: string;
    credits: number;
    departmentId: string;
  } & CourseCatalogInput,
) =>
  request<{ id: string }>("/academics/admin/courses", {
    method: "POST",
    body: JSON.stringify(input),
  });

export interface ProgramDetail {
  code: string;
  name: string;
  department: string;
  degree: string | null;
  school: string | null;
  tuition: number | null;
  color: string | null;
  stats: {
    studentCount: number;
    billed: number;
    paid: number;
    revenue: number;
    yearDist: number[];
  };
  students: {
    id: string;
    studentNo: string;
    name: string;
    photoUrl: string | null;
    yearLevel: number | null;
    academicLevel: {
      code: string;
      name: string;
      minimumCredits: number;
      creditCeiling: number;
    } | null;
    academicStanding: AcademicStanding | null;
    gpa: number;
    completedCredits: number;
    balance: number;
    summary?: AccountBalanceSummary;
    status: string;
  }[];
  courses: { code: string; title: string; credits: number }[];
}
export const getProgramDetail = (code: string) =>
  request<ProgramDetail>(
    `/academics/admin/programs/${encodeURIComponent(code)}`,
  );
export interface UpdateProgramInput {
  name?: string;
  departmentId?: string;
  degree?: string | null;
  school?: string | null;
  tuition?: number | null;
  color?: string | null;
}
export const updateProgram = (code: string, input: UpdateProgramInput) =>
  request(`/academics/admin/programs/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export interface CourseSection {
  id: string;
  sectionCode: string;
  term: string;
  termId: string;
  instructor: string | null;
  instructorId: string | null;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
  capacity: number;
  seatsTaken: number;
}
export interface AdminCourseDetail {
  id: string;
  code: string;
  title: string;
  credits: number;
  status: string;
  description: string | null;
  semestersOffered: string[];
  department: string;
  departmentId: string;
  prerequisites: { code: string; title: string }[];
  corequisites: { code: string; title: string }[];
  sections: CourseSection[];
  allCourses: { code: string; title: string }[];
  departments: { id: string; code: string; name: string }[];
  terms: { id: string; name: string }[];
}

export interface CourseCatalogInput {
  title?: string;
  credits?: number;
  departmentId?: string;
  status?: "active" | "draft";
  description?: string | null;
  semestersOffered?: ("fall" | "spring" | "summer")[];
  prerequisiteCodes?: string[];
  corequisiteCodes?: string[];
}
export const deleteCourse = (code: string) =>
  request<{ ok: boolean }>(
    `/academics/admin/courses/${encodeURIComponent(code)}`,
    { method: "DELETE" },
  );
export const getAdminCourseDetail = (code: string) =>
  request<AdminCourseDetail>(
    `/academics/admin/courses/${encodeURIComponent(code)}`,
  );
export const updateCourse = (code: string, input: CourseCatalogInput) =>
  request(`/academics/admin/courses/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export interface SectionInput {
  courseCode: string;
  termId: string;
  sectionCode: string;
  instructorId?: string | null;
  capacity: number;
  days: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  recommended?: boolean;
}
export const createSection = (input: SectionInput) =>
  request<{ id: string }>("/academics/admin/sections", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateSection = (
  id: string,
  input: Partial<Omit<SectionInput, "courseCode">> & {
    status?: "open" | "closed";
  },
) =>
  request(`/academics/admin/sections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const deleteSection = (id: string) =>
  request<{ ok: boolean }>(`/academics/admin/sections/${id}`, {
    method: "DELETE",
  });
export const getAdminStats = () =>
  request<AdminStats>("/academics/admin/stats");
export const getAdminStudents = () =>
  request<AdminStudent[]>("/academics/admin/students");
export const getAdminStudentDirectory = () =>
  request<AdminStudentDirectoryRow[]>("/academics/admin/student-directory");
export const getAdminStudentRoster = (
  params: AdminStudentRosterParams,
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.program && params.program !== "all") {
    query.set("program", params.program);
  }
  // `level` is a free-text catalog code (S1, S2, ΓÇª). It is the registrar's
  // intent for a *single* level; passing "all" or an empty string clears it
  // on the server the same way the program filter does.
  if (params.level && params.level !== "all") {
    query.set("level", params.level);
  }
  if (params.gender && params.gender !== "all") {
    query.set("gender", params.gender);
  }
  if (params.nationality && params.nationality !== "all") {
    query.set("nationality", params.nationality);
  }
  if (params.standing && params.standing !== "all") {
    query.set("standing", params.standing);
  }
  if (params.login && params.login !== "all") {
    query.set("login", params.login);
  }
  if (params.sort) query.set("sort", params.sort);
  if (params.direction) query.set("direction", params.direction);
  return request<AdminStudentRosterPage>(
    `/academics/admin/student-roster?${query.toString()}`,
    { signal },
  );
};
export interface AdminStudentDetail {
  id: string;
  studentNo: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string | null;
  program: string | null;
  programCode: string | null;
  department: string | null;
  gpa: number;
  completedCredits: number;
  currentTermCredits: number;
  academicProgress: AcademicProgress;
  academicStanding: AcademicStanding;
  standingPolicy: {
    rules: AcademicStandingRule[];
    notYetGraded: AcademicNotYetGradedStanding;
    catalog: AcademicProgress["catalog"];
  };
  standing: string;
  status: string;
  recordStatus: "pending_payment" | "active" | "archived";
  balance: number;
  summary?: AccountBalanceSummary;
  billingProfile?: BillingProfileView | null;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  nationality: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  advisor: string | null;
  yearLevel: number | null;
  cohort: string | null;
  enrolledAt: string | null;
  preferredName: string | null;
  nationalId: string | null;
  maritalStatus: string | null;
  personalEmail: string | null;
  bloodType: string | null;
  allergies: string | null;
  insurance: string | null;
  physician: string | null;
  emergencyName2: string | null;
  emergencyPhone2: string | null;
  major: string | null;
  admitTerm: string | null;
  expectedGrad: string | null;
  enrollmentStatus: string | null;
  catalogYear: string | null;
  enrollments: {
    enrollmentId: string;
    courseCode: string;
    title: string;
    credits: number;
    term: string;
    sectionCode: string;
    instructor: string | null;
    status: string;
    grade: string | null;
  }[];
}
export const getAdminStudentDetail = (id: string) =>
  request<AdminStudentDetail>(`/academics/admin/students/${id}`);

// --- Registrar: student account management ---
export type StudentLoginAccountState =
  | "not_activated"
  | "setup_pending"
  | "must_change_password"
  | "active"
  | "suspended"
  | "archived"
  | "pending_payment";

export interface RegistrarStudentAccount {
  studentId: string;
  personId: string;
  loginEmail: string | null;
  contactEmail: string | null;
  accountState: StudentLoginAccountState;
  eligibleForCredentialAction: boolean;
  credentialBlockReason: string | null;
  hasLogin: boolean;
  mustChangePassword: boolean;
  accountCreatedAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  pendingCredential: {
    purpose: "first_time" | "password_reset";
    expiresAt: string;
  } | null;
}

export type StudentCredentialMethod = "temporary_password" | "setup_link";

export type StudentCredentialResult =
  | {
      method: "temporary_password";
      loginEmail: string;
      temporaryPassword: string;
    }
  | {
      method: "setup_link";
      loginEmail: string;
      setupUrl: string;
      expiresAt: string;
    };

export const getRegistrarStudentAccount = (studentId: string) =>
  request<RegistrarStudentAccount>(`/registrar/students/${studentId}/account`);

export const updateRegistrarStudentContactEmail = (
  studentId: string,
  contactEmail: string | null,
) =>
  request<RegistrarStudentAccount>(
    `/registrar/students/${studentId}/account/contact-email`,
    {
      method: "PATCH",
      body: JSON.stringify({ contactEmail }),
    },
  );

export const issueRegistrarStudentCredential = (
  studentId: string,
  method: StudentCredentialMethod,
) =>
  request<StudentCredentialResult>(
    `/registrar/students/${studentId}/account/credentials`,
    {
      method: "POST",
      body: JSON.stringify({ method }),
    },
  );

export const signOutRegistrarStudentSessions = (studentId: string) =>
  request<{ ok: boolean }>(
    `/registrar/students/${studentId}/account/sign-out-all`,
    { method: "POST" },
  );

// --- Registrar: canonical transcript ledger ---
export type TranscriptEntrySource =
  "legacy_import" | "approved_enrollment" | "manual";

export interface TranscriptActor {
  firstName: string;
  lastName: string;
  email: string;
}

export interface TranscriptEntryRow {
  id: string;
  courseId: string | null;
  termId: string | null;
  courseCode: string;
  title: string;
  credits: number;
  earnedCredits: number;
  term: string;
  termSortKey: string | null;
  grade: string;
  points: number | null;
  countsTowardGpa: boolean;
  countsTowardCredits: boolean;
  requirementCategory: string | null;
  source: TranscriptEntrySource;
  sourceRow: number | null;
  matched: boolean;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: TranscriptActor | null;
  updatedBy: TranscriptActor | null;
  voidedBy: TranscriptActor | null;
}

export interface TranscriptEntryInput {
  courseId?: string | null;
  termId?: string | null;
  courseCode: string;
  courseTitle: string;
  termLabel: string;
  termSortKey?: string | null;
  grade: string;
  credits: number;
  earnedCredits?: number;
  gradePoints?: number | null;
  countsTowardGpa?: boolean;
  countsTowardCredits?: boolean;
  requirementCategory?: string | null;
  note?: string | null;
}

export const getRegistrarTranscript = (
  studentId: string,
  includeVoided = true,
) =>
  request<TranscriptEntryRow[]>(
    `/registrar/students/${studentId}/transcript?includeVoided=${includeVoided}`,
  );
export const getMyTranscriptView = () =>
  request<TranscriptView>("/academics/my/transcript/view");
export const getRegistrarTranscriptView = (studentId: string) =>
  request<TranscriptView>(`/registrar/students/${studentId}/transcript/view`);

async function transcriptPdf(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/api${path}`, {
    credentials: "include",
  });
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export const getMyTranscriptPdf = () =>
  transcriptPdf("/academics/my/transcript/pdf");
export const getRegistrarTranscriptPdf = (studentId: string) =>
  transcriptPdf(`/registrar/students/${studentId}/transcript/pdf`);
export const createTranscriptEntry = (
  studentId: string,
  input: TranscriptEntryInput,
) =>
  request<unknown>(`/registrar/students/${studentId}/transcript`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateTranscriptEntry = (
  entryId: string,
  input: Partial<TranscriptEntryInput> & { reason: string },
) =>
  request<unknown>(`/registrar/transcript/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const voidTranscriptEntry = (entryId: string, reason: string) =>
  request<unknown>(`/registrar/transcript/${entryId}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const restoreTranscriptEntry = (entryId: string, reason: string) =>
  request<unknown>(`/registrar/transcript/${entryId}/restore`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export interface StudentActivity {
  type: string;
  title: string;
  detail: string;
  at: string;
}
export const getAdminStudentActivity = (id: string) =>
  request<StudentActivity[]>(`/academics/admin/students/${id}/activity`);
export interface UpdateStudentInput {
  fullName?: string;
  programCode?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  nationality?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  guardianPhone?: string | null;
  advisor?: string | null;
  yearLevel?: number | null;
  cohort?: string | null;
  preferredName?: string | null;
  nationalId?: string | null;
  maritalStatus?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  insurance?: string | null;
  physician?: string | null;
  emergencyName2?: string | null;
  emergencyPhone2?: string | null;
  major?: string | null;
  admitTerm?: string | null;
  expectedGrad?: string | null;
  enrollmentStatus?: string | null;
  catalogYear?: string | null;
}
export const updateStudent = (id: string, input: UpdateStudentInput) =>
  request<AdminStudentDetail>(`/academics/admin/students/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const setStudentStandingOverride = (
  id: string,
  input: { standingCode: string; reason: string; expiresAt?: string | null },
) =>
  request(`/academics/admin/students/${id}/standing-override`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
export const clearStudentStandingOverride = (id: string, reason: string) =>
  request(`/academics/admin/students/${id}/standing-override`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
export const adminDropEnrollment = (enrollmentId: string) =>
  request(`/academics/admin/enrollments/${enrollmentId}/drop`, {
    method: "POST",
  });

export interface SectionRosterEntry {
  enrollmentId: string;
  studentId: string;
  studentNo: string;
  name: string;
  email: string;
  program: string | null;
  recordStatus: string;
  status: "enrolled" | "dropped" | "completed";
  grade: string | null;
  enrolledAt: string;
  /** Server's own reason the row cannot be removed; null when removal is safe. */
  removalBlockedReason: string | null;
}
export interface SectionRoster {
  section: {
    id: string;
    courseCode: string;
    courseTitle: string;
    credits: number;
    sectionCode: string;
    status: string;
    capacity: number;
    seatsTaken: number;
    days: string;
    schedule: string;
    room: string | null;
    instructor: string | null;
    termName: string;
    addDeadline: string | null;
    dropDeadline: string | null;
    addDeadlinePassed: boolean;
    dropDeadlinePassed: boolean;
  };
  enrollments: SectionRosterEntry[];
}
export const getSectionRoster = (sectionId: string) =>
  request<SectionRoster>(`/academics/admin/sections/${sectionId}/enrollments`);
export const addSectionEnrollment = (
  sectionId: string,
  studentId: string,
  reason: string,
) =>
  request<{ enrollmentId: string; status: string; waivedGates: string[] }>(
    `/academics/admin/sections/${sectionId}/enrollments`,
    { method: "POST", body: JSON.stringify({ studentId, reason }) },
  );
export const getAdminPrograms = () =>
  request<AdminPrograms>("/academics/admin/programs");

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  audience: string;
  author: string | null;
  createdAt: string;
}
export const getAnnouncements = () =>
  request<Announcement[]>("/comms/announcements");
export const createAnnouncement = (body: {
  title: string;
  body: string;
  category: string;
  audience: string;
}) =>
  request("/comms/announcements", {
    method: "POST",
    body: JSON.stringify(body),
  });

// --- Messaging ---
export interface MessageAttachment {
  url: string;
  name: string;
  size?: number;
}
export interface ThreadSummary {
  id: string;
  subject: string | null;
  who: string;
  role: string;
  initials: string;
  preview: string;
  time: string;
  unread: number;
}
export interface ThreadMessage {
  id: string;
  body: string;
  me: boolean;
  sender: string;
  time: string;
  attachments?: MessageAttachment[];
}
export interface ThreadDetail {
  id: string;
  subject: string | null;
  who: string;
  role: string;
  initials: string;
  messages: ThreadMessage[];
}
export interface Contact {
  id: string;
  name: string;
  role: string;
  initials: string;
}
export const getThreads = () => request<ThreadSummary[]>("/comms/threads");
export const getThread = (id: string) =>
  request<ThreadDetail>(`/comms/threads/${id}`);
export const getContacts = () => request<Contact[]>("/comms/contacts");
export const sendThreadMessage = (
  id: string,
  body: string,
  attachments?: MessageAttachment[],
) =>
  request<{ id: string }>(`/comms/threads/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ body, attachments }),
  });
export const startThread = (body: {
  recipientIds: string[];
  subject?: string;
  body: string;
  attachments?: MessageAttachment[];
}) =>
  request<{ threadId: string | null; sent: number }>("/comms/threads", {
    method: "POST",
    body: JSON.stringify(body),
  });
/** Message every enrolled student in one of your own sections, as individual threads. */
export const broadcastToSection = (
  sectionId: string,
  body: string,
  subject?: string,
  attachments?: MessageAttachment[],
) =>
  request<{ sent: number; course: string }>(
    `/comms/sections/${sectionId}/broadcast`,
    {
      method: "POST",
      body: JSON.stringify({ body, subject, attachments }),
    },
  );

// --- Campus: events + library ---

// --- Dining ---
export interface DiningPass {
  token: string;
  studentNo: string;
  name: string;
  plan: string;
  active: boolean;
}
export type DiningPlanCode = "none" | "half" | "full";
export interface DiningPlanOptions {
  academicYearLabel: string;
  currentOptionCode: DiningPlanCode;
  options: {
    code: DiningPlanCode;
    label: string;
    description: string | null;
    amountXof: number;
  }[];
  pendingRequest: {
    id: string;
    status: "pending";
    requestedOptionCode: DiningPlanCode | null;
    createdAt: string;
  } | null;
}
export const getDiningPass = () => request<DiningPass>("/dining/my/pass");
export const getDiningPlanOptions = () =>
  request<DiningPlanOptions>("/dining/my/plan-options");
export const chooseMealPlan = (type: DiningPlanCode) =>
  request<FinanceChangeResult>("/dining/my/plan", {
    method: "POST",
    body: JSON.stringify({ type }),
  });

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  priceXof: number;
  imageUrl: string | null;
  available: boolean;
}
export const getMenu = () => request<MenuItem[]>("/dining/menu");

export interface DiningOrder {
  id: string;
  status: string;
  totalXof: number;
  createdAt: string;
  items: { name: string; qty: number; priceXof: number }[];
}
export const getMyDiningOrders = () =>
  request<DiningOrder[]>("/dining/my/orders");
export const createDiningOrder = (
  items: { menuItemId: string; qty: number }[],
) =>
  request<{ id: string }>("/dining/my/orders", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
export const payDiningOrder = (id: string, method: ProofPaymentMethod) =>
  request<PaymentSubmissionSummary>(`/dining/my/orders/${id}/pay`, {
    method: "POST",
    body: JSON.stringify({ method }),
  });

export type DiningVerdictCode =
  | "OK"
  | "INVALID"
  | "UNKNOWN"
  | "NO_PLAN"
  | "UNPAID"
  | "NOT_COVERED"
  | "SERVED";

/** The station's result overlay. `photoUrl` is the actual anti-sharing control. */
export interface ScanResult {
  result: "served" | "turned_away";
  code: DiningVerdictCode;
  reason: string | null;
  overridable: boolean;
  name: string | null;
  studentNo: string | null;
  photoUrl: string | null;
  plan: string | null;
  program: string | null;
  period: string | null;
}
export const diningScan = (token: string, period: string) =>
  request<ScanResult>("/dining/scan", {
    method: "POST",
    body: JSON.stringify({ token, period }),
  });
export const diningScanOverride = (studentNo: string, period: string) =>
  request<ScanResult>("/dining/scan/override", {
    method: "POST",
    body: JSON.stringify({ studentNo, period }),
  });

export interface DiningToday {
  scannedPeriods: string[];
  mealWindows: {
    breakfast: MealWindow;
    lunch: MealWindow;
    dinner: MealWindow;
  };
  weekendOrdering: boolean;
  orderCutoff: string;
}
export const getDiningToday = () => request<DiningToday>("/dining/my/today");

export interface DiningEligibility {
  period: string;
  code: DiningVerdictCode;
  reason: string;
  serve: boolean;
  overridable: boolean;
}
export const getDiningEligibility = (period: string) =>
  request<DiningEligibility>(`/dining/my/eligibility?period=${period}`);
export interface LiveScans {
  period: string;
  served: number;
  turnedAway: number;
  recent: {
    name: string;
    studentNo: string;
    result: string;
    reason: string | null;
    time: string;
  }[];
}
export const getLiveScans = (period: string) =>
  request<LiveScans>(`/dining/scans?period=${period}`);

export interface DiningOverview {
  periods: { period: string; served: number; turnedAway: number }[];
  activePlans: number;
  planMix: { type: string; count: number }[];
  openOrders: number;
  weekendRevenue: number;
}
export const getDiningOverview = () =>
  request<DiningOverview>("/dining/admin/overview");
export interface AdminDiningOrder {
  id: string;
  student: string;
  status: string;
  totalXof: number;
  items: string[];
  createdAt: string;
}
export const getAdminDiningOrders = () =>
  request<AdminDiningOrder[]>("/dining/admin/orders");
export const advanceDiningOrder = (id: string, status: string) =>
  request(`/dining/admin/orders/${id}/advance`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
export const getDiningSettlement = () =>
  request<{ orders: number; revenue: number; settledTo: string }>(
    "/dining/admin/settlement",
  );
export const getAdminMenu = () => request<MenuItem[]>("/dining/admin/menu");
export const createMenuItem = (body: {
  name: string;
  description?: string;
  category: string;
  priceXof: number;
  imageUrl?: string;
}) =>
  request("/dining/admin/menu", { method: "POST", body: JSON.stringify(body) });
export const toggleMenuItem = (id: string) =>
  request(`/dining/admin/menu/${id}/toggle`, { method: "POST" });
export const setMenuItemImage = (id: string, imageUrl: string) =>
  request(`/dining/admin/menu/${id}/image`, {
    method: "POST",
    body: JSON.stringify({ imageUrl }),
  });

export interface DiningStudent {
  studentId: string;
  name: string;
  studentNo: string;
  plan: string;
  active: boolean;
  term: string;
  scansToday: number;
}
export const getDiningStudents = () =>
  request<DiningStudent[]>("/dining/admin/students");

export interface DiningReports {
  last7days: { date: string; served: number; turnedAway: number }[];
  planMix: { type: string; count: number }[];
  weekendRevenue: number;
  topItems: { name: string; qty: number }[];
}
export const getDiningReports = () =>
  request<DiningReports>("/dining/admin/reports");

export interface DiningFinances {
  planRevenue: number;
  weekendRevenue: number;
  revenue: number;
  outstanding: number;
  servedMeals: number;
  costPerMealXof: number;
  foodCost: number;
  margin: number;
  marginPct: number;
  byMonth: { month: string; plan: number; weekend: number }[];
  settledTo: string;
}
export const getDiningFinances = () =>
  request<DiningFinances>("/dining/admin/finances");

export interface DiningTransaction {
  id: string;
  kind: "plan" | "weekend" | "refund";
  student: string;
  amountXof: number;
  status: string;
  when: string;
}
export const getDiningTransactions = () =>
  request<DiningTransaction[]>("/dining/admin/transactions");

export interface MealWindow {
  start: string;
  end: string;
}
export interface DiningSettings {
  mealWindows: { breakfast: MealWindow; lunch: MealWindow; dinner: MealWindow };
  costPerMealXof: number;
  weekendOrdering: boolean;
  orderCutoff: string;
  enforcePayment: boolean;
  blockSecondScan: boolean;
}
export const getDiningSettings = () =>
  request<DiningSettings>("/dining/admin/settings");
export const updateDiningSettings = (body: DiningSettings) =>
  request<DiningSettings>("/dining/admin/settings", {
    method: "PUT",
    body: JSON.stringify(body),
  });

// --- Student Affairs ---
export interface AffairsDashboard {
  occupancy: { beds: number; filled: number; pct: number };
  pendingAssignments: number;
  openConductCases: number;
  budget: { allocated: number; spent: number; pct: number };
}
export const getAffairsDashboard = () =>
  request<AffairsDashboard>("/affairs/dashboard");

export interface Hall {
  id: string;
  name: string;
  kind: string;
  beds: number;
  filled: number;
  color: string;
}
export const getHalls = () => request<Hall[]>("/affairs/halls");

export interface HousingRow {
  assignmentId: string;
  studentId: string;
  studentNo: string;
  name: string;
  program: string;
  hall: string;
  room: string;
  status: string;
}
export const getHousingRoster = () =>
  request<HousingRow[]>("/affairs/housing/roster");
export interface HousingRequest {
  assignmentId: string;
  studentId: string;
  name: string;
  studentNo: string;
  need: string;
}
export const getHousingRequests = () =>
  request<HousingRequest[]>("/affairs/housing/requests");
export const assignRoom = (
  assignmentId: string,
  hallId: string,
  room: string,
  feeXof?: number,
) =>
  request(`/affairs/housing/${assignmentId}/assign`, {
    method: "POST",
    body: JSON.stringify({ hallId, room, feeXof }),
  });

export interface RoommateMatches {
  subject: { name: string; prefs: Record<string, string> };
  matches: {
    studentId: string;
    name: string;
    hall: string;
    room: string;
    score: number;
    shared: string[];
    diff: string[];
  }[];
}
export const getRoommateSubjects = () =>
  request<{ studentId: string; name: string }[]>("/affairs/roommate/subjects");
export const getRoommateMatches = (studentId: string) =>
  request<RoommateMatches>(`/affairs/roommate/matches?studentId=${studentId}`);

export interface ConductCase {
  id: string;
  subject: string;
  type: string;
  stage: string;
  severity: string;
  officer: string | null;
  openedAt: string;
  slaDueAt: string | null;
  overdue: boolean;
}
export const getConductCases = () => request<ConductCase[]>("/affairs/conduct");
export const createConductCase = (body: {
  subject: string;
  type: string;
  severity: string;
}) =>
  request("/affairs/conduct", { method: "POST", body: JSON.stringify(body) });
export const advanceConduct = (id: string, stage: string) =>
  request(`/affairs/conduct/${id}/advance`, {
    method: "POST",
    body: JSON.stringify({ stage }),
  });

export interface Club {
  id: string;
  name: string;
  category: string;
  members: number;
  budgetXof: number;
  status: string;
  lead: string | null;
}
export const getClubs = () => request<Club[]>("/affairs/clubs");
export const setClubStatus = (id: string, status: string) =>
  request(`/affairs/clubs/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });

export interface CoCurricularLine {
  line: string;
  allocated: number;
  spent: number;
  pct: number;
  color: string;
}
export const getCoCurricularBudget = () =>
  request<CoCurricularLine[]>("/affairs/budget");

// --- Innovation ---
export interface RoadmapPhase {
  id: string;
  name: string;
  short: string;
  status: string;
}
export interface MyProject {
  id: string;
  name: string;
  description: string | null;
  phase: string;
  advisor: string | null;
  status: string;
  grade: string | null;
  roadmap: RoadmapPhase[];
  members: { name: string; role: string }[];
  tasks: {
    id: string;
    title: string;
    phase: string;
    status: string;
    dueDate: string | null;
  }[];
  submissions: {
    id: string;
    title: string;
    kind: string;
    status: string;
    grade: string | null;
    feedback: string | null;
    fileName: string | null;
    createdAt: string;
  }[];
}
export const getMyProject = () =>
  request<MyProject | null>("/innovation/my/project");
export const toggleProjectTask = (id: string) =>
  request(`/innovation/tasks/${id}/toggle`, { method: "POST" });
export const submitProjectWork = (
  projectId: string,
  body: { title: string; kind: string; fileUrl?: string; fileName?: string },
) =>
  request(`/innovation/projects/${projectId}/submit`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export interface InnovationOverview {
  total: number;
  pendingReviews: number;
  phases: { id: string; name: string; count: number }[];
}
export const getInnovationOverview = () =>
  request<InnovationOverview>("/innovation/admin/overview");
export interface AdminProject {
  id: string;
  name: string;
  phase: string;
  advisor: string | null;
  status: string;
  grade: string | null;
  members: string[];
  pendingReviews: number;
}
export const getAdminProjects = () =>
  request<AdminProject[]>("/innovation/admin/projects");
export interface ReviewItem {
  id: string;
  project: string;
  projectId: string;
  title: string;
  kind: string;
  fileName: string | null;
  fileUrl: string | null;
  createdAt: string;
}
export const getReviewQueue = () =>
  request<ReviewItem[]>("/innovation/admin/review-queue");
export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  phase: string;
  advisor: string | null;
  status: string;
  grade: string | null;
  roadmap: RoadmapPhase[];
  members: { personId: string; name: string; role: string }[];
  submissions: {
    id: string;
    title: string;
    kind: string;
    status: string;
    grade: string | null;
    feedback: string | null;
    fileName: string | null;
    fileUrl: string | null;
  }[];
}
export const getProjectDetail = (id: string) =>
  request<ProjectDetail>(`/innovation/admin/projects/${id}`);
export const advanceProjectPhase = (id: string) =>
  request(`/innovation/admin/projects/${id}/advance`, { method: "POST" });
export const gradeProjectSubmission = (
  id: string,
  grade: string,
  feedback?: string,
) =>
  request(`/innovation/admin/submissions/${id}/grade`, {
    method: "POST",
    body: JSON.stringify({ grade, feedback }),
  });
export const addProjectMember = (
  projectId: string,
  email: string,
  role?: string,
) =>
  request<{ ok: boolean; name: string }>(
    `/innovation/admin/projects/${projectId}/members`,
    { method: "POST", body: JSON.stringify({ email, role }) },
  );
export const removeProjectMember = (projectId: string, personId: string) =>
  request(`/innovation/admin/projects/${projectId}/members/${personId}`, {
    method: "DELETE",
  });
export const setProjectAdvisor = (projectId: string, advisor: string) =>
  request(`/innovation/admin/projects/${projectId}/advisor`, {
    method: "POST",
    body: JSON.stringify({ advisor }),
  });

// --- HR-lite ---
export interface Payslip {
  id: string;
  period: string;
  gross: number;
  deductions: number;
  net: number;
  isEstimate: boolean;
}
export const getPayslips = () => request<Payslip[]>("/hr/my/payslips");
export interface LeaveRequest {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: string;
}
export const getMyLeave = () => request<LeaveRequest[]>("/hr/my/leave");
export const requestLeave = (body: {
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
}) => request("/hr/my/leave", { method: "POST", body: JSON.stringify(body) });
export interface RoomBooking {
  id: string;
  room: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string | null;
  status: string;
}
export const getMyBookings = () => request<RoomBooking[]>("/hr/my/bookings");
export const bookRoom = (body: {
  room: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose?: string;
}) =>
  request("/hr/my/bookings", { method: "POST", body: JSON.stringify(body) });

// --- Bursar: accounts, overdue, reconcile, plan config ---
export interface AccountInstallment {
  id: string;
  sequence: number;
  label: string | null;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  /** Additive derived fields; optional while older API tasks roll forward. */
  outstanding?: number;
  outstandingXof?: number;
  creditApplied?: number;
  creditAppliedXof?: number;
  effectiveSettledXof?: number;
  amountDueXof?: number;
  amountPaidXof?: number;
  paymentProgress?: InstallmentPaymentProgress;
  dueState?: InstallmentDueState;
  daysPastDue?: number;
  components?: {
    id: string;
    invoiceComponentId: string;
    componentKey: string;
    label: string;
    amountXof: number;
  }[];
}
export type InvoicePackageType =
  "standard_full" | "standard_tuition_legacy" | "custom" | "credit";
export type AccountPlanType =
  "global_standard" | "individual_override" | "legacy" | "custom" | "credit";
export interface AccountSpecialStatus {
  isSpecial: boolean;
  hasIndividualPlan: boolean;
  hasIndividualComponents?: boolean;
  hasPendingPlanChange: boolean;
  reasons: {
    code:
      | "individual_plan_override"
      | "individual_component_override"
      | "pending_plan_change"
      | "legacy_package"
      | "custom_charge"
      | "account_credit";
    label: string;
    invoiceId: string;
  }[];
}

export interface AccountInvoice {
  id: string;
  /** Canonical cash-application tie-breaker for mixed-version fallback clients. */
  createdAt?: string;
  term: string;
  description: string | null;
  packageType: InvoicePackageType;
  academicYearLabel: string | null;
  feeScheduleId?: string | null;
  feeScheduleRevision: number | null;
  planType?: AccountPlanType;
  isIndividualPlanOverride?: boolean;
  hasIndividualComponentOverride?: boolean;
  componentOverrides?: {
    id: string;
    componentKey: string;
    included: boolean;
    createdAt: string;
    updatedAt: string;
  }[];
  hasPendingPlanChange?: boolean;
  profileManaged?: boolean;
  billingProfileId?: string | null;
  pendingChanges?: PendingFinanceChange[];
  total: number;
  paid: number;
  balance: number;
  remaining?: number;
  remainingXof?: number;
  summary?: AccountBalanceSummary;
  effectiveOutstandingXof?: number;
  effectiveStatus?: AccountBalanceSummary["standing"];
  status: string;
  hasPlan: boolean;
  /** Annual package charges. These are the billing source of truth; installments
   * are the dated split of their combined amount. */
  components?: InvoiceFeeComponent[];
  /** Approved institution-wide component catalog for this invoice's year. */
  availableComponents?: AvailableFeeComponent[];
  installments: AccountInstallment[];
  payments: BillingPayment[];
  wireTransfers: WireTransferSummary[];
}

export interface InvoiceFeeComponent {
  id: string;
  key: string;
  /** Compatibility name used by invoices created before fee-component catalogs. */
  kind: string;
  label: string;
  costCenterCode: string;
  amountXof: number;
  grossAmountXof?: number;
  netAmountXof?: number;
  adjustments?: {
    id: string;
    label: string;
    effect: "discount" | "charge";
    amountXof: number;
    reason?: string | null;
  }[];
  /** Cash already allocated to this component; removal cannot erase it. */
  allocatedXof: number;
  selected: boolean;
  scheduleComponentId: string | null;
}

export interface AvailableFeeComponent {
  id: string | null;
  key: string;
  label: string;
  description: string | null;
  costCenterCode: string;
  annualAmountXof: number;
  defaultSelected: boolean;
  sortOrder: number;
  selected: boolean;
  invoiceComponentId: string | null;
  allocatedXof: number;
}
export interface StudentAccount {
  student: { studentNo: string; name: string; program: string; email: string };
  totals: {
    billed: number;
    paid: number;
    balance: number;
    remaining?: number;
    remainingXof?: number;
  };
  summary?: AccountBalanceSummary;
  billingBridge?: AccountBillingBridge;
  specialAccount?: AccountSpecialStatus;
  /** Selected by the API's due-date-first cash-application algorithm. */
  payableTarget?: {
    invoiceId: string;
    installmentId: string | null;
    outstandingXof: number;
    invoicePayableXof: number;
  } | null;
  activeHolds?: {
    id: string;
    type: string;
    reason: string | null;
    placedAt: string;
  }[];
  billingProfile?: BillingProfileView | null;
  pendingChanges?: PendingFinanceChange[];
  invoices: AccountInvoice[];
}

export interface PendingFinanceChange {
  id: string;
  kind:
    | "payment_plan"
    | "billing_profile"
    | "custom_charge"
    | "charge_removal"
    | "discount"
    | "scholarship";
  label: string;
  reason: string;
  academicYearLabel?: string | null;
  requestedAt: string;
}

export interface AccountBillingBridge {
  grossChargesXof: number;
  adjustmentsXof: number;
  netBillXof: number;
  paidXof: number;
  outstandingXof: number;
}
export const getStudentAccount = (studentId: string) =>
  request<StudentAccount>(`/finance/admin/students/${studentId}/account`);

export type StaffRecordedPaymentMethod = "cash" | "wave" | "orange_money";

export interface RecordStudentPaymentInput {
  amountXof: number;
  method: StaffRecordedPaymentMethod;
  transactionReference?: string;
  idempotencyKey: string;
}

export interface RecordStudentPaymentResult {
  ok: boolean;
  paymentId: string;
  receipt: Receipt;
}

export const recordStudentPayment = (
  studentId: string,
  input: RecordStudentPaymentInput,
) =>
  request<RecordStudentPaymentResult>(
    `/finance/admin/students/${encodeURIComponent(studentId)}/payments`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

export const assignStandardPackage = (studentId: string) =>
  request<{
    created: boolean;
    invoiceId: string;
    feeScheduleId: string;
    feeScheduleRevision: number;
  }>(`/finance/admin/students/${studentId}/standard-package`, {
    method: "POST",
  });

// --- Standalone billing admin: all accounts with derived balances ---
export interface StudentAccountRow {
  id: string;
  studentNo: string;
  name: string;
  program: string | null;
  photoUrl: string | null;
  billed: number;
  paid: number;
  balance: number;
  remaining?: number;
  remainingXof?: number;
  summary?: AccountBalanceSummary;
  billingBridge?: AccountBillingBridge;
  openCharges: number;
  overdue: boolean;
  status: string; // paid | due | overdue
  recordStatus?: string;
  hasActiveHold?: boolean;
  activeHoldCount?: number;
  activeHolds?: {
    id: string;
    type: string;
    reason: string | null;
    placedAt: string;
  }[];
  invoiceId: string | null;
  billingNumber: string | null;
  billingDescription: string | null;
  packageType: InvoicePackageType | null;
  academicYearLabel: string | null;
  feeScheduleRevision: number | null;
  planType?: AccountPlanType | null;
  specialAccount?: AccountSpecialStatus;
  profileManaged?: boolean;
  pendingChanges?: PendingFinanceChange[];
}
export const listStudentAccounts = () =>
  request<StudentAccountRow[]>("/finance/admin/accounts");

// Registrar student provisioning (design flow): creates the record + account + a
// student record, and bills nothing (money stays in the Finance portal).
export interface RegistrarStudentInput {
  studentNo: string;
  firstName: string;
  lastName?: string;
  email: string;
  dateOfBirth?: string | null;
  programCode?: string | null;
  gender?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  nationality?: string | null;
  preferredName?: string | null;
  nationalId?: string | null;
  maritalStatus?: string | null;
  personalEmail?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  insurance?: string | null;
  physician?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  emergencyName2?: string | null;
  emergencyPhone2?: string | null;
  advisor?: string | null;
  yearLevel?: number | null;
  cohort?: string | null;
  major?: string | null;
  admitTerm?: string | null;
  expectedGrad?: string | null;
  enrollmentStatus?: string | null;
  catalogYear?: string | null;
}
export const createRegistrarStudent = (input: RegistrarStudentInput) =>
  request<{
    id: string;
    studentNo: string;
    email: string;
    inviteExpiresAt: string;
  }>("/registrar/students", { method: "POST", body: JSON.stringify(input) });

// Student "Documents on file": six typed PDF slots + an open "other" list.
export interface StudentDocumentRow {
  id: string;
  slot: string;
  name: string | null;
  url: string;
  uploadedAt: string;
}
export const getStudentDocuments = (studentId: string) =>
  request<StudentDocumentRow[]>(`/registrar/students/${studentId}/documents`);
export const addStudentDocument = (
  studentId: string,
  input: { slot: string; url: string; name?: string | null },
) =>
  request<StudentDocumentRow>(`/registrar/students/${studentId}/documents`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const removeStudentDocument = (documentId: string) =>
  request<{ ok: boolean }>(`/registrar/student-documents/${documentId}`, {
    method: "DELETE",
  });

// Standalone billing admin: create students + add/remove ad-hoc charges (single or bulk).
export const createStudent = (input: {
  fullName: string;
  dateOfBirth: string;
  studentNo?: string;
  email?: string;
  programCode?: string;
}) =>
  request<{ id: string; studentNo: string }>("/finance/admin/students", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const addCharge = (input: {
  studentIds: string[];
  description: string;
  amountXof: number;
  costCenterCode?: string;
  dueDate?: string;
  installments?: {
    dueDate: string;
    amountXof: number;
    label?: string | null;
  }[];
  requestReason: string;
}) =>
  request<FinanceChangeResult>("/finance/admin/charges", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const removeCharge = (invoiceId: string, reason: string) =>
  request<FinanceChangeResult>(`/finance/admin/charges/${invoiceId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
export const applyDiscount = (input: {
  studentId: string;
  label: string;
  amountXof: number;
  kind?: "discount" | "scholarship";
  costCenterCode?: string;
  requestReason: string;
}) =>
  request<FinanceChangeResult>("/finance/admin/discounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updatePaymentPlan = (
  invoiceId: string,
  installments: {
    id: string;
    dueDate: string;
    amountDue: number;
    label?: string | null;
    components?: {
      invoiceComponentId: string;
      amountXof: number;
    }[];
  }[],
  requestReason: string,
) =>
  request<FinanceChangeResult>(`/finance/admin/plans/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({ installments, requestReason }),
  });
export const replacePaymentPlan = (
  invoiceId: string,
  installments: {
    id?: string;
    sequence: number;
    dueDate: string;
    amountDue: number;
    label?: string | null;
    components?: {
      invoiceComponentId: string;
      amountXof: number;
    }[];
  }[],
  requestReason: string,
) =>
  request<FinanceChangeResult>(`/finance/admin/plans/${invoiceId}`, {
    method: "PUT",
    body: JSON.stringify({ installments, requestReason }),
  });
export const restoreStandardPaymentPlan = (
  invoiceId: string,
  requestReason: string,
) =>
  request<FinanceChangeResult>(
    `/finance/admin/plans/${invoiceId}/restore-standard`,
    {
      method: "POST",
      body: JSON.stringify({ requestReason }),
    },
  );

export const addInvoiceFeeComponent = (
  invoiceId: string,
  componentKey: string,
  requestReason: string,
) =>
  request<FinanceChangeResult>(`/finance/admin/plans/${invoiceId}/components`, {
    method: "POST",
    body: JSON.stringify({ componentKey, requestReason }),
  });

export const removeInvoiceFeeComponent = (
  invoiceId: string,
  componentKey: string,
  requestReason: string,
) =>
  request<FinanceChangeResult>(
    `/finance/admin/plans/${invoiceId}/components/${encodeURIComponent(componentKey)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ requestReason }),
    },
  );

export interface AdminWireTransfer extends WireTransferSummary {
  source: string;
  student: string;
  studentNo: string | null;
  purpose: string;
  invoiceId: string | null;
  paymentLinkId: string | null;
  proofFileName: string;
  proofMimeType: string;
  proofSize: number;
  bankReference: string | null;
  confirmationNote: string | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
}
export const getAdminWireConfig = () =>
  request<WireConfig>("/finance/admin/wire-config");
export const updateAdminWireConfig = (config: WireConfig) =>
  request<WireConfig>("/finance/admin/wire-config", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
export const listWireTransfers = (status?: string) =>
  request<AdminWireTransfer[]>(
    `/finance/admin/wire-transfers${status ? `?status=${status}` : ""}`,
  );
export async function getWireProof(id: string) {
  const res = await fetch(
    `${API_URL}/api/finance/admin/wire-transfers/${id}/proof`,
    { credentials: "include" },
  );
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}
export const approveWireTransfer = (
  id: string,
  input: {
    confirmedAmountXof: number;
    bankReference?: string;
    confirmationNote?: string;
  },
) =>
  request<{ ok: boolean }>(`/finance/admin/wire-transfers/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const rejectWireTransfer = (id: string, reason: string) =>
  request<{ ok: boolean }>(`/finance/admin/wire-transfers/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export interface AdminPaymentSubmission extends Omit<
  PaymentSubmissionSummary,
  "method" | "details"
> {
  method: ProofPaymentMethod | StaffRecordedPaymentMethod;
  details:
    | PublicProofMethodConfig
    | {
        method: "cash";
        enabled: false;
        label: "Cash";
        instructions: string;
      };
  target: string;
  purpose: string;
  hasPayerProof: boolean;
  hasVerificationProof: boolean;
}
export const getAdminPaymentMethods = () =>
  request<PaymentMethodsConfig>("/finance/admin/payment-methods");
export const updateAdminPaymentMethods = (config: PaymentMethodsConfig) =>
  request<PaymentMethodsConfig>("/finance/admin/payment-methods", {
    method: "PATCH",
    body: JSON.stringify(config),
  });
export function uploadPaymentMethodQr(
  method: "wave" | "orange_money",
  qr: File,
) {
  const form = new FormData();
  form.append("qr", qr);
  return multipartRequest<{ objectKey: string; fileName: string }>(
    `/finance/admin/payment-methods/${method}/qr`,
    form,
  );
}
export const listPaymentSubmissions = (status?: string) =>
  request<AdminPaymentSubmission[]>(
    `/finance/admin/payment-submissions${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  );
export async function getPaymentSubmissionFile(
  id: string,
  kind: "payer" | "verification",
) {
  const res = await fetch(
    `${API_URL}/api/finance/admin/payment-submissions/${id}/files/${kind}`,
    { credentials: "include" },
  );
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}
export function verifyPaymentSubmission(
  id: string,
  input: { transactionReference: string; note?: string },
  verificationProof: File,
) {
  const form = new FormData();
  form.append("transactionReference", input.transactionReference);
  if (input.note) form.append("note", input.note);
  form.append("verificationProof", verificationProof);
  return multipartRequest<{ ok: boolean }>(
    `/finance/admin/payment-submissions/${id}/verify`,
    form,
  );
}
export const rejectPaymentSubmission = (id: string, reason: string) =>
  request<{ ok: boolean }>(`/finance/admin/payment-submissions/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export interface OverdueRow {
  installmentId: string;
  student: string;
  studentNo: string;
  term: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
}
export const getOverdue = () => request<OverdueRow[]>("/finance/admin/overdue");

export interface ArAging {
  buckets: {
    key: string;
    label: string;
    amount: number;
    /** Unpaid schedule lines in the bucket, including a synthetic unscheduled line. */
    count: number;
    accountCount?: number;
    installmentCount?: number;
  }[];
  totalOutstanding: number;
  accountCount?: number;
  installmentCount?: number;
  accountCounts?: {
    onTime: number;
    overdue: number;
    cleared: number;
    credit: number;
    noBilling: number;
    unscheduled: number;
  };
  activeHoldAccountCount?: number;
  summary?: AccountBalanceSummary;
  rows: {
    studentId: string;
    student: string;
    studentNo: string;
    term: string;
    invoiceId: string;
    installmentId: string | null;
    sequence: number | null;
    dueDate: string | null;
    dueState: "unscheduled" | "not_yet_due" | "due_today" | "overdue";
    amountDue: number;
    amountPaid: number;
    daysOverdue: number;
    outstanding: number;
  }[];
}
export const getArAging = () => request<ArAging>("/finance/admin/aging");

export interface CollectionsTimelinePoint {
  date: string;
  expectedCumulativeXof: number;
  actualCumulativeXof: number | null;
  forecastCumulativeXof: number | null;
}

export interface CollectionsTimeline {
  academicYear: string;
  asOfDate: string;
  currency: "XOF";
  summary: {
    scheduledXof: number;
    collectedXof: number;
    varianceXof: number;
    collectibleBalanceXof: number;
    unscheduledDebtXof: number;
  };
  balanceReconciliation: {
    paymentCount: number;
    amountXof: number;
    sourceAsOfDates: string[];
    dateBasis: "source_as_of";
  };
  forecast: {
    status: "trailing_30_days" | "academic_year_to_date" | "insufficient_data";
    dailyRateXof: number | null;
    settlementDayCount: number;
    cappedAtXof: number;
  };
  points: CollectionsTimelinePoint[];
}

export const getCollectionsTimeline = (academicYear?: string) =>
  request<CollectionsTimeline>(
    `/finance/admin/collections-timeline${academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ""}`,
  );

export type ApprovalRequestKind =
  | "academic_catalog"
  | "global_fee_schedule"
  | "custom_charge"
  | "charge_removal"
  | "payment_plan"
  | "discount"
  | "scholarship"
  | "operating_budget"
  | "management_actual"
  | "student_enrollment_override"
  | "billing_profile"
  | "billing_catalog";
export type ApprovalRequestStatus =
  "pending" | "approved" | "rejected" | "cancelled" | "stale";

export interface ApprovalPresentationChange {
  label: string;
  type: "create" | "update" | "remove" | "unchanged";
  previous?: string | null;
  proposed?: string | null;
  detail?: string | null;
}

export interface ApprovalPresentation {
  subject: string;
  summary: string;
  changes: ApprovalPresentationChange[];
  canApprove: boolean;
  blockingMessage?: string | null;
}

export interface ApprovalRequestRow {
  id: string;
  kind: ApprovalRequestKind;
  status: ApprovalRequestStatus;
  targetType: string;
  targetId: string | null;
  academicYearLabel: string | null;
  reason: string;
  beforeJson: unknown;
  afterJson: unknown;
  baseRevision: number;
  requester: { name: string; email: string } | null;
  reviewer: { name: string; email: string } | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
  events?: unknown[];
  presentation: ApprovalPresentation;
}

export const listApprovalRequests = (
  view: "pending" | "history" | "mine",
  search?: string,
) =>
  request<ApprovalRequestRow[]>(
    `/approvals?view=${view}${search?.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
  );

export const approveApprovalRequest = (id: string, note?: string) =>
  request<{
    ok: boolean;
    id: string;
    status: ApprovalRequestStatus;
    reason?: string;
  }>(`/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });

export const rejectApprovalRequest = (id: string, reason: string) =>
  request<{ ok: boolean; id: string; status: ApprovalRequestStatus }>(
    `/approvals/${id}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );

export const cancelApprovalRequest = (id: string, note?: string) =>
  request<{ ok: boolean; id: string; status: ApprovalRequestStatus }>(
    `/approvals/${id}/cancel`,
    { method: "POST", body: JSON.stringify({ note }) },
  );

// Director-side approval for an enrollment override. Distinct from approveApprovalRequest
// because the registrar must pick which gates to waive -- there is no single "approve"
// without that choice.
export const approveEnrollmentOverride = (
  id: string,
  body: { waivedGates: string[]; note?: string },
) =>
  request<{
    id: string;
    status: string;
    enrollmentId?: string;
  }>(`/academics/enrollment-overrides/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export type DirectorWidgetKey =
  | "people"
  | "academics"
  | "admissions"
  | "approvals"
  | "holds"
  | "receivables"
  | "collections"
  | "cost_centers";

export interface DirectorPortalOverview {
  generatedAt: string;
  people: { activeStudents: number; faculty: number; staff: number };
  academics: { programs: number };
  admissions: { applicants: number };
  approvals: { pending: number };
  holds: { activeStudents: number };
  receivables: {
    overdueAccounts: number;
    overdueXof: number;
    outstandingXof: number;
  };
  collections: {
    collectedXof: number;
    expensesXof: number;
    netCashXof: number;
  };
  costCenters: {
    code: string;
    name: string;
    revenueXof: number;
    expenseXof: number;
    netXof: number;
  }[];
}

export interface DirectorWidgetPreferences {
  available: {
    key: DirectorWidgetKey;
    label: string;
    description: string;
  }[];
  selected: DirectorWidgetKey[];
}

export const getDirectorPortalOverview = () =>
  request<DirectorPortalOverview>("/director/overview");
export const getDirectorWidgets = () =>
  request<DirectorWidgetPreferences>("/director/widgets");
export const updateDirectorWidgets = (widgetKeys: DirectorWidgetKey[]) =>
  request<DirectorWidgetPreferences>("/director/widgets", {
    method: "PUT",
    body: JSON.stringify({ widgetKeys }),
  });

export interface DirectorPaymentVerification {
  kind: "manual" | "system" | "legacy";
  id: string;
  method: string;
  status: string;
  auditStatus: string;
  amountXof: number;
  confirmedAmountXof: number | null;
  target: string;
  purpose: string;
  verifiedByName: string | null;
  verifiedByEmail: string | null;
  verifiedAt: string | null;
  transactionReference?: string | null;
  createdAt: string;
  hasPayerProof?: boolean;
  hasVerificationProof?: boolean;
  auditNote?: string | null;
}
export const listDirectorPaymentVerifications = () =>
  request<DirectorPaymentVerification[]>("/director/payment-verifications");
export const getDirectorUnauditedPaymentCount = () =>
  request<{ count: number }>("/director/payment-verifications/unaudited-count");
export interface DirectorStandingOverride {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  program: { code: string; name: string } | null;
  standingCode: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string; email: string } | null;
}
export const getDirectorStandingOverrides = () =>
  request<DirectorStandingOverride[]>("/academics/director/standing-overrides");
export const auditDirectorPayment = (
  id: string,
  outcome: "reviewed" | "flagged",
  note?: string,
) =>
  request<{ ok: boolean; auditStatus: string }>(
    `/director/payment-verifications/${id}/audit`,
    { method: "POST", body: JSON.stringify({ outcome, note }) },
  );
export async function getDirectorPaymentFile(
  id: string,
  kind: "payer" | "verification",
) {
  const res = await fetch(
    `${API_URL}/api/director/payment-verifications/${id}/files/${kind}`,
    { credentials: "include" },
  );
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export interface FinanceReports {
  collections: CollectionSummary;
  aging: ArAging;
  paymentsByMethod: { method: string; amount: number; count: number }[];
  revenueByTerm: { term: string; amount: number }[];
  cashByCostCenter: {
    code: string;
    name: string;
    revenue: number;
    expense: number;
    net: number;
  }[];
  budgetVsActual: {
    code: string;
    name: string;
    allocated: number;
    spent: number;
    pct: number;
  }[];
  recentPayments: AdminPayment[];
  totals: {
    moneyIn: number;
    moneyOut: number;
    net: number;
    cashPosition: number;
  };
}
export const getFinanceReports = () =>
  request<FinanceReports>("/finance/admin/reports");

export interface Receipt {
  id: string;
  student: string;
  studentNo: string;
  email: string;
  term: string;
  amount: number;
  method: string;
  status: string;
  providerRef: string;
  transactionReference?: string | null;
  paidAt: string | null;
  recognizedOn: string | null;
  dateBasis: "settlement" | "source_as_of_balance" | null;
  refundedAt?: string | null;
  source?: string;
  initiatedByEmail?: string | null;
  allocations: { sequence: number; amount: number }[];
}
export const getReceipt = (paymentId: string) =>
  request<Receipt>(`/finance/admin/payments/${paymentId}/receipt`);
export const refundPayment = (paymentId: string, reason?: string) =>
  request<{ ok: boolean; refundedAmount: number; gatewayRefund: boolean }>(
    `/finance/admin/payments/${paymentId}/refund`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
export interface StalePayment {
  id: string;
  student: string;
  studentNo: string;
  term: string;
  amount: number;
  method: string;
  providerRef: string;
  createdAt: string;
  ageMinutes: number;
}
export const reconcilePayments = () =>
  request<{ stale: StalePayment[] }>("/finance/admin/reconcile", {
    method: "POST",
  });
export const confirmPayment = (id: string) =>
  request(`/finance/admin/payments/${id}/confirm`, { method: "POST" });
export const cancelPayment = (id: string) =>
  request(`/finance/admin/payments/${id}/cancel`, { method: "POST" });

export interface PlanInstallmentInput {
  sequence: number;
  dueDate: string;
  amount: number;
}
export const createPaymentPlan = (
  invoiceId: string,
  installments: PlanInstallmentInput[],
) =>
  request("/finance/admin/plans", {
    method: "POST",
    body: JSON.stringify({ invoiceId, installments }),
  });

// --- Director money-in/out, expenses, budgets ---
export interface DirectorOverview {
  fiscalYear: string;
  totals: {
    moneyIn: number;
    moneyOut: number;
    net: number;
    cashPosition: number;
  };
  centers: {
    code: string;
    name: string;
    type: string;
    revenue: number;
    expense: number;
    net: number;
  }[];
  groups: {
    code: string;
    name: string;
    revenue: number;
    expense: number;
    net: number;
  }[];
  budget: {
    code: string;
    name: string;
    allocated: number;
    spent: number;
    pct: number;
  }[];
}
export const getDirectorOverview = () =>
  request<DirectorOverview>("/finance/admin/director-overview");

// --- Finance operating budget (AugustΓÇôJuly) ---
export type OperatingBudgetKind = "income" | "expense";
export type OperatingBudgetStatus =
  "draft" | "pending" | "approved" | "rejected" | "superseded";

export interface OperatingBudgetAcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface OperatingBudgetMonth {
  /** Stable calendar key, for example `2026-08`. */
  key: string;
  label: string;
}

export interface OperatingBudgetCategory {
  key: string;
  label: string;
  kind: OperatingBudgetKind;
  sortOrder: number;
}

export interface OperatingBudgetMatrixRow {
  categoryKey: string;
  label: string;
  kind: OperatingBudgetKind;
  months: Record<string, number>;
  totalXof: number;
}

export interface OperatingBudgetMatrix {
  rows: OperatingBudgetMatrixRow[];
  monthTotalsXof: Record<string, number>;
  totalXof: number;
}

export interface OperatingBudgetDeviationRow extends OperatingBudgetMatrixRow {
  variancePercentByMonth: Record<string, number | null>;
  unbudgetedByMonth: Record<string, boolean>;
  annualVariancePercent: number | null;
  annualUnbudgeted: boolean;
}

export interface OperatingBudgetDeviationMatrix extends Omit<
  OperatingBudgetMatrix,
  "rows"
> {
  rows: OperatingBudgetDeviationRow[];
}

export interface OperatingBudgetRevision {
  id: string;
  revision: number;
  contentVersion: number;
  status: OperatingBudgetStatus;
  openingBalanceXof: number;
  reason: string;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
}

export interface OperatingBudgetCashflowMonth {
  month: string;
  plannedIncomeXof: number;
  plannedExpenseXof: number;
  actualIncomeXof: number;
  actualExpenseXof: number;
  plannedBalanceXof: number;
  actualBalanceXof: number | null;
  forecastIncomeXof?: number | null;
  forecastExpenseXof?: number | null;
  forecastBalanceXof: number | null;
}

export interface OperatingBudgetView {
  academicYear: OperatingBudgetAcademicYear;
  months: OperatingBudgetMonth[];
  categories: OperatingBudgetCategory[];
  availableAcademicYears?: OperatingBudgetAcademicYear[];
  revision: OperatingBudgetRevision | null;
  pendingApprovalId?: string | null;
  defaultOpeningBalanceXof: number;
  openingBalanceXof: number;
  openingBalanceSource: "approved_override" | "carry_forward" | "zero";
  integrityWarnings: {
    code:
      | "unclassified_expenses"
      | "unclassified_collections"
      | "source_as_of_balance_reconciliations"
      | "ambiguous_legacy_payment_dates";
    count: number;
    amountXof: number;
    message: string;
  }[];
  summary: {
    openingBalanceXof: number;
    actualIncomeXof: number;
    actualExpenseXof: number;
    actualClosingBalanceXof: number;
    plannedClosingBalanceXof: number;
  };
  budget: {
    income: OperatingBudgetMatrix;
    expense: OperatingBudgetMatrix;
  };
  actual: {
    income: OperatingBudgetMatrix;
    expense: OperatingBudgetMatrix;
  };
  deviation: {
    income: OperatingBudgetDeviationMatrix;
    expense: OperatingBudgetDeviationMatrix;
  };
  cashflow: OperatingBudgetCashflowMonth[];
}

export interface OperatingBudgetLineInput {
  categoryKey: string;
  month: string;
  amountXof: number;
}

export interface OperatingBudgetForecastMonth {
  month: string;
  incomeXof: number;
  expenseXof: number;
  balanceXof: number;
  source: "actual" | "forecast";
}

export interface OperatingBudgetForecast {
  scenario: "conservative" | "base" | "optimistic";
  collectionRatePercent: number;
  expenseGrowthPercent: number;
  metadata: {
    asOfDate: string;
    actualThroughMonth: string | null;
    forecastStatus: "ready" | "insufficient_data";
    basisStatus: "approved";
    basisRevision: number;
  };
  months: OperatingBudgetForecastMonth[];
  projectedClosingBalanceXof: number;
}

export interface OperatingBudgetActualEntry {
  id: string;
  source:
    | "bursar"
    | "payment"
    | "balance_reconciliation"
    | "legacy_payment"
    | "expense"
    | "manual_income"
    | "adjustment"
    | "refund"
    | "unallocated_credit";
  kind: OperatingBudgetKind;
  categoryKey: string;
  categoryLabel?: string;
  costCenterCode: string | null;
  costCenterName?: string | null;
  occurredOn: string;
  amountXof: number;
  description: string | null;
  payee?: string | null;
  isEstimate?: boolean;
  status: string;
  approvalRequestId?: string | null;
}

export interface OperatingBudgetActualEntries {
  items: OperatingBudgetActualEntry[];
  nextCursor: string | null;
  total: number;
  totalXof: number;
  excludedEstimateXof: number;
}

export const getOperatingBudget = (academicYear?: string) =>
  request<OperatingBudgetView>(
    `/finance/admin/operating-budget${academicYear ? `?academicYear=${encodeURIComponent(academicYear)}` : ""}`,
  );

export const updateOperatingBudget = (input: {
  academicYear: string;
  action: "save" | "submit";
  reason: string;
  openingBalanceXof?: number;
  lines: OperatingBudgetLineInput[];
  expectedBudgetId: string | null;
  expectedContentVersion: number | null;
}) =>
  request<OperatingBudgetView | FinanceChangeResult>(
    "/finance/admin/operating-budget",
    { method: "PUT", body: JSON.stringify(input) },
  );

export const forecastOperatingBudget = (input: {
  academicYear: string;
  scenario: "conservative" | "base" | "optimistic";
  collectionRatePercent?: number;
  expenseGrowthPercent?: number;
}) =>
  request<OperatingBudgetForecast>("/finance/admin/operating-budget/forecast", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getOperatingBudgetActuals = (filters: {
  academicYear: string;
  kind?: OperatingBudgetKind;
  categoryKey?: string;
  month?: string;
  costCenterCode?: string;
  source?: OperatingBudgetActualEntry["source"] | "bursar";
  cursor?: string;
}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return request<OperatingBudgetActualEntries>(
    `/finance/admin/operating-budget/actuals?${params.toString()}`,
  );
};

export const createOperatingBudgetManualIncome = (input: {
  academicYear: string;
  categoryKey: string;
  costCenterCode: string;
  amountXof: number;
  occurredOn: string;
  description?: string;
  reason: string;
}) =>
  request<FinanceChangeResult>(
    "/finance/admin/operating-budget/manual-income",
    { method: "POST", body: JSON.stringify(input) },
  );

export const createOperatingBudgetExpense = (input: {
  academicYear: string;
  categoryKey: string;
  costCenterCode: string;
  amountXof: number;
  occurredOn: string;
  description?: string;
  payee?: string;
  isEstimate?: boolean;
  reason: string;
}) =>
  request<FinanceChangeResult>("/finance/admin/operating-budget/expenses", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateOperatingBudgetExpense = (
  id: string,
  input: Partial<{
    categoryKey: string;
    costCenterCode: string;
    amountXof: number;
    occurredOn: string;
    description: string;
    payee: string;
    isEstimate: boolean;
  }> & { reason: string },
) =>
  request<FinanceChangeResult>(
    `/finance/admin/operating-budget/expenses/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );

export const voidOperatingBudgetExpense = (id: string, reason: string) =>
  request<FinanceChangeResult>(
    `/finance/admin/operating-budget/expenses/${id}`,
    { method: "DELETE", body: JSON.stringify({ reason }) },
  );

export const updateOperatingBudgetActualEntry = (
  id: string,
  input: Partial<{
    academicYear: string;
    categoryKey: string;
    costCenterCode: string;
    amountXof: number;
    occurredOn: string;
    description: string;
  }> & { reason: string },
) =>
  request<FinanceChangeResult>(
    `/finance/admin/operating-budget/actual-entries/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );

export const voidOperatingBudgetActualEntry = (id: string, reason: string) =>
  request<FinanceChangeResult>(
    `/finance/admin/operating-budget/actual-entries/${id}`,
    { method: "DELETE", body: JSON.stringify({ reason }) },
  );

export const createOperatingBudgetAdjustment = (input: {
  academicYear: string;
  kind: OperatingBudgetKind;
  categoryKey: string;
  costCenterCode: string;
  month: string;
  requestedActualXof: number;
  reason: string;
  description?: string;
}) =>
  request<FinanceChangeResult>("/finance/admin/operating-budget/adjustments", {
    method: "POST",
    body: JSON.stringify(input),
  });

export interface CostCenter {
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
}
export const getCostCenters = () =>
  request<CostCenter[]>("/finance/admin/cost-centers");

export interface Expense {
  id: string;
  costCenter: string;
  category: string;
  payee: string | null;
  description: string | null;
  amount: number;
  isEstimate: boolean;
  incurredOn: string;
}
export const getExpenses = () => request<Expense[]>("/finance/admin/expenses");
export const createExpense = (body: {
  costCenterCode: string;
  category: string;
  description?: string;
  payee?: string;
  amount: number;
  isEstimate: boolean;
  incurredOn: string;
}) =>
  request("/finance/admin/expenses", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const updateExpense = (
  id: string,
  patch: Partial<{
    costCenterCode: string;
    category: string;
    description: string;
    payee: string;
    amount: number;
    isEstimate: boolean;
    incurredOn: string;
  }>,
) =>
  request(`/finance/admin/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
export const deleteExpense = (id: string) =>
  request(`/finance/admin/expenses/${id}`, { method: "DELETE" });
export const setBudget = (
  costCenterCode: string,
  fiscalYear: string,
  allocated: number,
) =>
  request("/finance/admin/budgets", {
    method: "POST",
    body: JSON.stringify({ costCenterCode, fiscalYear, allocated }),
  });

// --- Admissions, staff, users ---
export interface Applicant {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  program: string;
  stage: string;
  score: number | null;
  country: string | null;
  feePaid: boolean;
  submittedAt: string;
  onboarding: ApplicantOnboardingSummary | null;
}
export type ApplicantOnboardingStatus =
  "not_started" | "payment_pending" | "enrolled" | "cancelled";
export type ApplicantProofStatus =
  | "none"
  | "awaiting_proof"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled";
export type ApplicantInstallmentStatus =
  "pending" | "partial" | "paid" | "overdue";
export interface ApplicantOnboardingSummary {
  status: ApplicantOnboardingStatus;
  /** Internal Student primary key, used only for staff record links. */
  studentId: string | null;
  /** Permanent, payer-facing Student ID such as S202631AD. */
  studentNo: string | null;
  requiredCashXof: number;
  paidCashXof: number;
  remainingCashXof: number;
  dueDate: string | null;
  proofStatus: ApplicantProofStatus;
  enrolledAt: string | null;
}
export interface Admissions {
  funnel: { stage: string; count: number }[];
  applicants: Applicant[];
}
export const getAdmissions = () =>
  request<Admissions>("/academics/admin/applicants");
/** The full application form; only name + email are required to create an entry. */
export interface ApplicantInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  programCode?: string | null;
  country?: string | null;
  score?: number | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  city?: string | null;
  origin?: "high-school" | "transfer" | null;
  school?: string | null;
  priorGpa?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  allergies?: string | null;
  source?: string | null;
  essay?: string | null;
  term?: string | null;
}
export const createApplicant = (
  input: ApplicantInput & {
    firstName: string;
    lastName: string;
    email: string;
  },
) =>
  request<{ id: string }>("/admissions/applicants", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateApplicant = (id: string, input: ApplicantInput) =>
  request<{ id: string }>(`/admissions/applicants/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const setApplicantStage = (id: string, stage: string) =>
  request(`/admissions/applicants/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  });
export interface ApplicantFirstInstallment {
  amountDue: number;
  amountPaid: number;
  remainingAmount: number;
  dueDate: string;
  status: ApplicantInstallmentStatus;
}
export interface ApplicantOnboardingView {
  status: ApplicantOnboardingStatus;
  /** Internal Student primary key. */
  studentId: string | null;
  /** Permanent Student ID displayed to applicants and entered on payment.daust.net. */
  studentNo: string | null;
  academicYear: { id: string; label: string } | null;
  acceptedAt: string | null;
  paymentPendingAt: string | null;
  enrolledAt: string | null;
  cancelledAt: string | null;
  requiredCashXof: number | null;
  invoiceId: string | null;
  firstInstallment: ApplicantFirstInstallment | null;
  proofStatus: ApplicantProofStatus;
  paymentLink: {
    id: string;
    status: "active" | "paid" | "cancelled" | "expired";
    url: string;
  } | null;
  acceptanceEmailSentAt: string | null;
  statusUrl?: string;
  paymentUrl?: string;
  emailDelivery?: "sent" | "not_sent" | "not_requested";
}
export type ApplicantOnboardingActionResult = {
  onboarding: ApplicantOnboardingView;
};
export interface ApplicantBillingProfileInput {
  academicYearId: string;
  academicYearLabel: string;
  feeScheduleId: string;
  feeScheduleRevision: number;
  feeScheduleFingerprintSha256: string;
  billingCatalogFingerprintSha256: string;
  housingOptionCode: string;
  cafeteriaOptionCode: string;
  insuranceSelected: boolean;
  cautionSelected: boolean;
  awardDefinitionIds?: string[];
}

export const acceptApplicant = (
  id: string,
  billingProfile: ApplicantBillingProfileInput,
) =>
  request<ApplicantOnboardingActionResult>(
    `/admissions/applicants/${id}/accept`,
    {
      method: "POST",
      body: JSON.stringify({
        academicYearId: billingProfile.academicYearId,
        academicYearLabel: billingProfile.academicYearLabel,
        billingProfile: {
          feeScheduleId: billingProfile.feeScheduleId,
          feeScheduleRevision: billingProfile.feeScheduleRevision,
          feeScheduleFingerprintSha256:
            billingProfile.feeScheduleFingerprintSha256,
          billingCatalogFingerprintSha256:
            billingProfile.billingCatalogFingerprintSha256,
          housingOptionCode: billingProfile.housingOptionCode,
          cafeteriaOptionCode: billingProfile.cafeteriaOptionCode,
          insuranceSelected: billingProfile.insuranceSelected,
          cautionSelected: billingProfile.cautionSelected,
          awardDefinitionIds: billingProfile.awardDefinitionIds ?? [],
        },
      }),
    },
  );
export const rotateApplicantOnboardingLink = (id: string) =>
  request<ApplicantOnboardingActionResult>(
    `/admissions/applicants/${id}/onboarding-link/rotate`,
    { method: "POST", body: "{}" },
  );
export const resendApplicantAcceptanceEmail = (id: string) =>
  request<ApplicantOnboardingActionResult>(
    `/admissions/applicants/${id}/acceptance-email/resend`,
    { method: "POST", body: "{}" },
  );
export interface ApplicantDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  programCode: string | null;
  program: string | null;
  stage: string;
  score: number | null;
  country: string | null;
  feePaid: boolean;
  appFee: number;
  submittedAt: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  city: string | null;
  origin: string | null;
  school: string | null;
  priorGpa: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  allergies: string | null;
  source: string | null;
  essay: string | null;
  term: string | null;
  onboarding: ApplicantOnboardingView | null;
}
export const getApplicant = (id: string) =>
  request<ApplicantDetail>(`/admissions/applicants/${id}`);
export const getApplicantBillingProfileOptions = (id: string) =>
  request<BillingProfileOptions>(
    `/admissions/applicants/${encodeURIComponent(id)}/billing-profile-options`,
  );
export const cancelApplicantOnboarding = (id: string, reason: string) =>
  request<ApplicantDetail>(`/admissions/applicants/${id}/onboarding/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
// --- Per-applicant notes thread (admissions / admin only) ---
export interface ApplicantNote {
  id: string;
  applicantId: string;
  authorId: string;
  author: { id: string; firstName: string; lastName: string };
  kind: "general" | "financial" | "academic" | "followup";
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
}
export const listApplicantNotes = (applicantId: string) =>
  request<ApplicantNote[]>(`/admissions/applicants/${applicantId}/notes`);
export const createApplicantNote = (
  applicantId: string,
  input: { kind?: ApplicantNote["kind"]; body: string },
) =>
  request<ApplicantNote>(`/admissions/applicants/${applicantId}/notes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateApplicantNote = (
  applicantId: string,
  noteId: string,
  input: { body?: string; kind?: ApplicantNote["kind"]; pinned?: boolean },
) =>
  request<ApplicantNote>(
    `/admissions/applicants/${applicantId}/notes/${noteId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
export const deleteApplicantNote = (applicantId: string, noteId: string) =>
  request<{ deleted: string }>(
    `/admissions/applicants/${applicantId}/notes/${noteId}`,
    { method: "DELETE" },
  );

export interface PublicApplicationStatus {
  onboardingStatus: ApplicantOnboardingStatus;
  readOnly: boolean;
  applicant: {
    name: string;
    programCode: string | null;
    program: string | null;
    academicYear: { id: string; label: string } | null;
  };
  studentNo: string | null;
  firstInstallment: ApplicantFirstInstallment;
  proofStatus: ApplicantProofStatus;
  payment: {
    canPay: boolean;
    paymentUrl: string | null;
    publicBillUrl: string | null;
  };
}
export const getPublicApplicationStatus = (token: string) =>
  request<PublicApplicationStatus>(
    `/applications/status/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  kind: string;
  roles: string[];
}
export const getStaff = () => request<StaffMember[]>("/academics/admin/staff");

// --- Director-configurable money settings ---
export interface FeeItem {
  key: string;
  label: string;
  minXof: number;
  maxXof: number | null;
  period: string;
  note: string | null;
  sortOrder: number;
  /** Package components are edited through the approved fee schedule, never here. */
  editable?: boolean;
  managedBy?: "fee_schedule" | "settings";
}
export const getFeeConfig = () => request<FeeItem[]>("/config/fees");
export const updateFeeItem = (
  key: string,
  patch: Partial<
    Pick<FeeItem, "label" | "minXof" | "maxXof" | "period" | "note">
  >,
) =>
  request(`/config/fees/${key}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const getNotificationRecipients = () =>
  request<{ recipients: string[] }>("/config/notification-recipients");
export const updateNotificationRecipients = (recipients: string[]) =>
  request<{ recipients: string[] }>("/config/notification-recipients", {
    method: "PATCH",
    body: JSON.stringify({ recipients }),
  });

import type { EmailTemplatesInput } from "@mydaust/shared";
export const getEmailTemplates = () =>
  request<EmailTemplatesInput>("/config/email-templates");
export const updateEmailTemplates = (templates: EmailTemplatesInput) =>
  request<EmailTemplatesInput>("/config/email-templates", {
    method: "PATCH",
    body: JSON.stringify(templates),
  });

export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
}
export const updateUserRoles = (personId: string, roles: string[]) =>
  request(`/users/${personId}/roles`, {
    method: "PATCH",
    body: JSON.stringify({ roles }),
  });

// --- Directory administration (director: admin / it_admin) ---
export const listManagedUsers = (
  query: Record<string, string | number | undefined>,
) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  return request<ManagedUserPage>(`/users?${qs.toString()}`);
};
export const createManagedUser = (body: unknown) =>
  request<{ id: string; email: string; tempPassword: string | null }>(
    "/users",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
export const updateManagedUser = (id: string, body: unknown) =>
  request<{ id: string; email: string | null }>(`/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const resetManagedUserPassword = (id: string) =>
  request<{ id: string; name: string; email: string; tempPassword: string }>(
    `/users/${id}/reset-password`,
    { method: "POST" },
  );
export const suspendManagedUser = (id: string, reason?: string) =>
  request<{ id: string; status: string }>(`/users/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const restoreManagedUser = (id: string) =>
  request<{ id: string; status: string }>(`/users/${id}/restore`, {
    method: "POST",
  });
export const getUsers = () => request<AppUser[]>("/academics/admin/users");

// --- Payment links (bursar-generated; public pay page at /pay/[token]) ---
export interface PaymentLinkRow {
  id: string;
  token: string;
  url: string;
  amountXof: number;
  purpose: string;
  payeeName: string;
  payeeMeta: string | null;
  studentId: string | null;
  invoiceId: string | null;
  costCenterCode: string;
  dueDate: string | null;
  expiresAt: string | null;
  status: string;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
  expired: boolean;
}
export interface PublicPaymentLink {
  ref: string;
  amountXof: number;
  purpose: string;
  payeeName: string;
  payeeMeta: string | null;
  dueDate: string | null;
  expiresAt: string | null;
  status: string; // active | paid | expired
  method: string | null;
  paidAt: string | null;
  wireTransfer: WireTransferSummary | null;
}
export const getPaymentLinks = () =>
  request<PaymentLinkRow[]>("/finance/admin/links");
export const createPaymentLink = (input: {
  payeeName: string;
  payeeMeta?: string;
  studentId?: string;
  invoiceId?: string;
  amountXof: number;
  purpose: string;
  costCenterCode?: string;
  dueDate?: string;
  expiresAt?: string;
}) =>
  request<PaymentLinkRow>("/finance/admin/links", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const cancelPaymentLink = (id: string) =>
  request<PaymentLinkRow>(`/finance/admin/links/${id}/cancel`, {
    method: "POST",
  });
export const getPublicPaymentLink = (token: string) =>
  request<PublicPaymentLink>(`/finance/links/${token}`);

// --- Public bill portal (payment.daust.net): pay a real student account by ID + DOB ---
export interface BillCharge {
  label: string;
  dueDate: string | null;
  amountXof: number;
  /** Cash actually posted against the charge. */
  paidXof: number;
  /** Additive canonical position fields; optional for a rolling API deployment. */
  creditAppliedXof?: number;
  effectiveSettledXof?: number;
  outstandingXof?: number;
  paymentProgress?: InstallmentPaymentProgress;
  dueState?: InstallmentDueState;
  daysPastDue?: number;
  status: string; // pending | partial | paid | overdue
}
export interface BillLookup {
  studentName: string;
  studentNo: string;
  program: string | null;
  term: string | null;
  balanceXof: number;
  /** Canonical account amount remaining after credits. */
  outstandingXof?: number;
  /** Normal payable target, or the refund-net enrollment cash remainder while pending. */
  payableXof?: number;
  summary?: AccountBalanceSummary;
  creditXof: number;
  dueDate: string | null;
  charges: BillCharge[];
  pendingWires: WireTransferSummary[];
  enrollmentGate: {
    status: "payment_pending" | "enrolled";
    requiredCashXof: number;
    paidCashXof: number;
    remainingCashXof: number;
    dueDate: string | null;
    pendingProof: boolean;
  } | null;
}
export const lookupBill = (studentNo: string, dob: string) =>
  request<BillLookup>("/finance/public/bill/lookup", {
    method: "POST",
    body: JSON.stringify({ studentNo, dob }),
  });
export const checkoutBill = (input: {
  studentNo: string;
  dob: string;
  amountXof: number;
  method: ProofPaymentMethod;
}) =>
  request<PaymentSubmissionSummary>("/finance/public/bill/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
// --- Parent portal (guardian access) ---
export interface ChildSummary {
  studentId: string;
  studentNo: string;
  name: string;
  program: string;
  yearLevel: number | null;
  photoUrl: string | null;
  relation: string | null;
  gpa: number;
  completedCredits: number;
  standing: string;
  balance: number;
  summary?: AccountBalanceSummary;
  /** Credits the programme requires, summed from its requirement categories. */
  requiredCredits: number | null;
  academicProgress: AcademicProgress;
  /** Percentage; a late counts as half a present. Null when nothing is recorded. */
  attendanceRate: number | null;
}
export const getMyChildren = () => request<ChildSummary[]>("/parent/children");

export type ChildTranscript = TranscriptView;
export const getChildGrades = (studentId: string) =>
  request<ChildTranscript>(`/parent/children/${studentId}/grades`);

export interface ChildAttendance {
  overall: number | null;
  rows: {
    code: string;
    title: string;
    present: number;
    late: number;
    absent: number;
    pct: number | null;
  }[];
}
export const getChildAttendance = (studentId: string) =>
  request<ChildAttendance>(`/parent/children/${studentId}/attendance`);

export const getChildAccount = (studentId: string) =>
  request<StudentAccount>(`/parent/children/${studentId}/account`);

export const getChildBillingProfile = (studentId: string) =>
  request<BillingProfileView | null>(
    `/parent/children/${encodeURIComponent(studentId)}/billing-profile`,
  );

export const getChildPaymentAttempts = (studentId: string) =>
  request<PaymentSubmissionSummary[]>(
    `/parent/children/${encodeURIComponent(studentId)}/payment-attempts`,
  );

export const initiateChildPayment = (
  studentId: string,
  invoiceId: string,
  amount: number,
  method: ProofPaymentMethod,
) =>
  request<PaymentSubmissionSummary>(
    `/parent/children/${encodeURIComponent(studentId)}/payments`,
    {
      method: "POST",
      body: JSON.stringify({ invoiceId, amount, method }),
    },
  );

export interface ChildPaymentStatus {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  status: string;
  providerRef: string;
  source?: string;
  settledAt?: string | null;
  recognizedOn?: string | null;
  dateBasis?: "settlement" | "source_as_of_balance" | null;
  refundedAt?: string | null;
  createdAt: string;
}

export const getChildPaymentStatus = (studentId: string, paymentId: string) =>
  request<ChildPaymentStatus>(
    `/parent/children/${encodeURIComponent(studentId)}/payments/${encodeURIComponent(paymentId)}/status`,
  );

export const getChildReceipt = (studentId: string, paymentId: string) =>
  request<Receipt>(
    `/parent/children/${encodeURIComponent(studentId)}/payments/${encodeURIComponent(paymentId)}/receipt`,
  );

export const submitChildPiSpi = (input: {
  studentId: string;
  invoiceId: string;
  alias: string;
  amountXof: number;
}) =>
  request<PiSpiRequestSummary>(
    `/parent/children/${encodeURIComponent(input.studentId)}/pi-spi`,
    {
      method: "POST",
      body: JSON.stringify({
        invoiceId: input.invoiceId,
        alias: input.alias,
        amountXof: input.amountXof,
      }),
    },
  );

export const getChildPiSpiRequest = (studentId: string, txId: string) =>
  request<PiSpiRequestSummary>(
    `/parent/children/${encodeURIComponent(studentId)}/pi-spi/${encodeURIComponent(txId)}`,
  );

// --- Registrar: guardian administration ---
export interface GuardianRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  hasLogin: boolean;
  mustChangePassword: boolean;
  status:
    | "active"
    | "contact-only"
    | "not-provisioned"
    | "invited"
    | "invite-expired";
  children: {
    studentId: string;
    studentNo: string;
    name: string;
    relation: string | null;
  }[];
}
export interface StudentGuardianLink {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  relation: string | null;
  hasLogin: boolean;
  mustChangePassword: boolean;
  status:
    | "active"
    | "contact-only"
    | "not-provisioned"
    | "invited"
    | "invite-expired";
}
/** Public: a student or guardian redeeming their single-use password-setup invite. */
export const redeemAccountInvite = (token: string, password: string) =>
  request<{ ok: boolean; email: string }>("/guardian-invites/redeem", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
export const getGuardians = () => request<GuardianRow[]>("/guardians");
export const getStudentGuardians = (studentId: string) =>
  request<StudentGuardianLink[]>(
    `/guardians/students/${encodeURIComponent(studentId)}`,
  );
export const linkStudentGuardian = (
  studentId: string,
  input: { guardianId: string; relation?: string | null },
) =>
  request<{ ok: boolean }>(
    `/guardians/students/${encodeURIComponent(studentId)}/link`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const createStudentGuardian = (
  studentId: string,
  input: {
    fullName: string;
    email?: string;
    phone?: string;
    address?: string;
    relation?: string;
    sendInvite?: boolean;
  },
) =>
  request<{
    id: string;
    email: string | null;
    inviteExpiresAt: string | null;
    inviteDelivery: "sent" | "not_sent" | "not_requested";
  }>(`/guardians/students/${encodeURIComponent(studentId)}/create`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const unlinkStudentGuardian = (studentId: string, guardianId: string) =>
  request<{ ok: boolean }>(
    `/guardians/students/${encodeURIComponent(studentId)}/${encodeURIComponent(guardianId)}`,
    { method: "DELETE" },
  );
export const createGuardian = (input: {
  fullName: string;
  email?: string;
  phone?: string;
  address?: string;
  studentIds: string[];
  relation?: string;
}) =>
  request<{
    id: string;
    email: string | null;
    inviteExpiresAt: string | null;
    inviteDelivery: "sent" | "not_sent" | "not_needed" | "not_requested";
  }>("/guardians", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const resendGuardianInvite = (id: string) =>
  request<{
    ok: boolean;
    inviteLink: string;
    inviteExpiresAt: string;
    inviteDelivery: "sent" | "not_sent";
  }>(`/guardians/${id}/resend-invite`, { method: "POST" });
export const setGuardianChildren = (id: string, studentIds: string[]) =>
  request<{ ok: boolean }>(`/guardians/${id}/children`, {
    method: "PATCH",
    body: JSON.stringify({ studentIds }),
  });
export const updateGuardian = (
  id: string,
  input: {
    fullName?: string;
    email?: string;
    phone?: string | null;
    address?: string | null;
  },
) =>
  request<{
    id: string;
    name: string;
    email: string | null;
    inviteDelivery: "sent" | "not_sent" | null;
    inviteExpiresAt: string | null;
  }>(`/guardians/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const deleteGuardian = (id: string) =>
  request<{ ok: boolean }>(`/guardians/${id}`, { method: "DELETE" });
export interface GuardianProvisionedLogin {
  guardianId: string;
  name: string;
  email: string;
  tempPassword: string;
}
export const provisionGuardianLogin = (id: string) =>
  request<GuardianProvisionedLogin>(`/guardians/${id}/provision-login`, {
    method: "POST",
  });
export const provisionAllGuardianLogins = () =>
  request<{ count: number; credentials: GuardianProvisionedLogin[] }>(
    "/guardians/provision-logins",
    { method: "POST" },
  );

// --- Institution fee schedule (the DAUST payment-plan sheet) ---
export interface FeePlanRow {
  id: string;
  academicYearLabel: string;
  semester: string;
  label: string;
  sequence: number;
  dueOn: string | null;
  amountFullXof: number;
  amountTuitionXof: number;
  amountHousingXof: number;
  amountCafeteriaXof: number;
}
export interface FeePlanComponent {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  costCenterCode: string;
  annualAmountXof: number;
  defaultSelected: boolean;
  sortOrder: number;
}
export interface FeePlan {
  scheduleId?: string | null;
  academicYearLabel: string | null;
  revision?: number | null;
  status?: "draft" | "approved" | "superseded" | null;
  rows: FeePlanRow[];
  /** Annual charges selected by default for the standard package. */
  components?: FeePlanComponent[];
  packageTotalXof?: number;
  totals: { full: number; tuition: number; housing: number; cafeteria: number };
}
export const getFeePlan = (year?: string) =>
  request<FeePlan>(
    `/finance/admin/fee-plan${year ? `?year=${encodeURIComponent(year)}` : ""}`,
  );
export const updateFeePlanRow = (
  id: string,
  input: {
    label?: string;
    dueOn?: string;
    amountFullXof?: number;
    amountTuitionXof?: number;
    amountHousingXof?: number;
    amountCafeteriaXof?: number;
    requestReason: string;
  },
) =>
  request<FinanceChangeResult>(`/finance/admin/fee-plan/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export interface FinanceChangeResult {
  applied: boolean;
  request: ApprovalRequestRow;
  result: unknown;
}

export const replaceFeePlan = (input: {
  academicYearLabel?: string;
  reason: string;
  rows: {
    id: string;
    label: string;
    dueOn: string;
    /** Accepted by older API tasks during a rolling deployment. */
    amountFullXof?: number;
    amountTuitionXof?: number;
    amountHousingXof?: number;
    amountCafeteriaXof?: number;
  }[];
  components?: {
    id?: string;
    key: string;
    label: string;
    description?: string;
    costCenterCode: string;
    annualAmountXof: number;
    defaultSelected?: boolean;
    sortOrder?: number;
  }[];
}) =>
  request<FinanceChangeResult>("/finance/admin/fee-plan", {
    method: "PUT",
    body: JSON.stringify(input),
  });

// --- Student: registration, degree audit, attendance ---
export interface RegistrationSection {
  sectionId: string;
  courseId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  status: string;
  instructor: string | null;
  room: string | null;
  days: string;
  startTime: string;
  endTime: string;
  schedule: string;
  seatsTaken: number;
  capacity: number;
  seatsLeft: number;
  /** Staff-curated flag; renders an orange "Recommended" pill when true. */
  recommended: boolean;
  /** Null when the student may register; otherwise the single clearest reason they cannot. */
  blockedReason: string | null;
}
export type RegistrationSemester = "Fall" | "Spring" | "Summer";
export type RegistrationClosedReason =
  | "closed_by_registrar"
  | "configuration_invalid"
  | "no_term_available"
  | "term_ended"
  | "add_deadline_passed"
  | null;
export type RecommendationStatus =
  | "disabled"
  | "ready"
  | "missing_program"
  | "missing_catalog_year"
  | "missing_approved_catalog"
  | "missing_curriculum"
  | "unmapped_term"
  | "missing_plan_position";
export type RecommendationBasis =
  | "student_year_level"
  | "catalog_chronology"
  | "earliest_incomplete_same_semester";
export type RecommendationKind =
  | "scheduled"
  | "catch_up"
  | "prerequisite"
  /** The academic office's hand-written plan, served when derivation yields nothing. */
  | "curated";
export type RecommendationReadiness = "ready" | "conditional" | "blocked";
export type RecommendationAvailability =
  "available" | "blocked" | "not_offered";
export interface RegistrationRecommendationRequirement {
  courseId: string;
  courseCode: string;
  minGrade: string | null;
  status: "satisfied" | "in_progress" | "missing";
}
export interface RegistrationRecommendationCorequisite {
  courseId: string;
  courseCode: string;
  status: "satisfied" | "enrolled" | "recommended" | "missing";
}
export interface RegistrationRecommendation {
  courseId: string;
  courseCode: string;
  title: string;
  credits: number;
  kind: RecommendationKind;
  rank: number;
  plannedYearIndex: number | null;
  plannedSemester: RegistrationSemester | null;
  reason: string;
  unlocks: string[];
  readiness: RecommendationReadiness;
  prerequisites: RegistrationRecommendationRequirement[];
  corequisites: RegistrationRecommendationCorequisite[];
  sectionIds: string[];
  availableSectionIds: string[];
  availability: RecommendationAvailability;
}
export interface RegistrationCatalog {
  term: {
    id: string;
    name: string;
    status: string | null;
    semester: RegistrationSemester | null;
    academicYearId: string | null;
    academicYearLabel: string | null;
    startDate: string;
    endDate: string;
    addDeadline: string | null;
    dropDeadline: string | null;
  } | null;
  registration: {
    mode: "legacy" | "configured";
    open: boolean;
    closedReason: RegistrationClosedReason;
    recommendationsEnabled: boolean;
  };
  recommendationContext: {
    status: RecommendationStatus;
    basis: RecommendationBasis | null;
    targetYearIndex: number | null;
    semester: RegistrationSemester | null;
    catalogAcademicYearId: string | null;
    catalogLabel: string | null;
    catalogRevision: number | null;
  };
  recommendations: RegistrationRecommendation[];
  maxCredits: number;
  currentCredits: number;
  holds: { type: string; reason: string | null }[];
  catalogYear: string | null;
  sections: RegistrationSection[];
}
export const getRegistrationCatalog = (termId?: string) =>
  request<RegistrationCatalog>(
    `/academics/my/registration${termId ? `?termId=${encodeURIComponent(termId)}` : ""}`,
  );

export interface DegreeCategory {
  category: string;
  required: number;
  done: number;
  inProgress: number;
  remaining: number;
  pct: number;
  status: string;
}
export interface DegreeAudit {
  program: string | null;
  catalogYear?: string | null;
  categories: DegreeCategory[];
  completed: number;
  inProgress: number;
  remaining: number;
  total: number;
  pctComplete: number;
  academicProgress: AcademicProgress;
}
export const getDegreeAudit = () =>
  request<DegreeAudit>("/academics/my/degree");

export interface MyAttendance {
  overall: number | null;
  rows: {
    code: string;
    title: string;
    term: string;
    present: number;
    late: number;
    absent: number;
    pct: number | null;
    /** The individual class days behind the percentage, newest first. */
    sessions: { date: string; status: string }[];
  }[];
}
export const getMyAttendance = () =>
  request<MyAttendance>("/academics/my/attendance");

export interface MyProfile {
  name: string;
  studentNo: string;
  email: string;
  program: string | null;
  gpa: number;
  completedCredits: number;
  academicProgress: AcademicProgress;
  academicStanding: AcademicStanding;
  standing: string;
  guardians: {
    name: string;
    relation: string | null;
    email: string | null;
    phone: string | null;
  }[];
  /** Saved PI-SPI payment alias, prefilled on the billing screen. */
  piSpiAlias: string | null;
  personal: Record<string, string | null>;
  contact: Record<string, string | null>;
  academic: Record<string, string | number | null>;
  emergency: Record<string, string | null>;
}
export const getMyProfile = () => request<MyProfile>("/academics/my/profile");

export type MyHousing =
  | { assigned: false }
  | {
      assigned: true;
      building: string | null;
      kind: string | null;
      room: string | null;
      status: string;
      note: string | null;
      roommates: string[];
    };
export const getMyHousing = () => request<MyHousing>("/academics/my/housing");

// --- Registrar: academic structure, policy and student success ---
export interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  head: string | null;
  programs: number;
  courses: number;
}
export const getDepartments = () =>
  request<DepartmentRow[]>("/registrar/departments");
export const upsertDepartment = (input: {
  id?: string;
  code: string;
  name: string;
  head?: string | null;
}) =>
  request<DepartmentRow>("/registrar/departments", {
    method: "POST",
    body: JSON.stringify(input),
  });

export interface AcademicYearRow {
  id: string;
  label: string;
  status: "draft" | "active" | "archived";
  startsOn: string | null;
  endsOn: string | null;
  _count: { terms: number };
}
export const getAcademicYears = () =>
  request<AcademicYearRow[]>("/registrar/academic-years");
export const createAcademicYear = (label: string) =>
  request<AcademicYearRow>("/registrar/academic-years", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
export const activateAcademicYear = (id: string) =>
  request<{ ok: boolean }>(`/registrar/academic-years/${id}/activate`, {
    method: "POST",
  });

export type HousingAssignmentStatus = "pending" | "assigned" | "unassigned";
export interface HousingOperationsAssignment {
  id: string;
  academicYearLabel: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  studentRecordStatus: "active" | "pending_payment" | "archived";
  billedOption: {
    id: string;
    code: string;
    label: string;
    amountXof: number;
    active: boolean;
  } | null;
  status: HousingAssignmentStatus;
  hallId: string | null;
  hallName: string | null;
  room: string | null;
  roomCapacity: 1 | 2 | null;
  roomOccupants: number;
  note: string | null;
  updatedAt: string;
  warnings: string[];
}
export interface HousingOperationsHall {
  id: string;
  name: string;
  kind: string;
  beds: number;
  occupiedBeds: number;
  availableBeds: number;
}
export interface HousingOperationsView {
  academicYearLabel: string;
  assignments: HousingOperationsAssignment[];
  halls: HousingOperationsHall[];
}
export const getHousingOperations = (academicYearLabel?: string) =>
  request<HousingOperationsView>(
    `/registrar/housing${academicYearLabel ? `?academicYearLabel=${encodeURIComponent(academicYearLabel)}` : ""}`,
  );
export const assignHousingRoom = (
  assignmentId: string,
  input: {
    academicYearLabel: string;
    expectedUpdatedAt: string;
    hallId: string;
    room: string;
    reason: string;
  },
) =>
  request<HousingOperationsAssignment>(
    `/registrar/housing/${encodeURIComponent(assignmentId)}/assign`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const releaseHousingRoom = (
  assignmentId: string,
  input: {
    academicYearLabel: string;
    expectedUpdatedAt: string;
    reason: string;
  },
) =>
  request<HousingOperationsAssignment>(
    `/registrar/housing/${encodeURIComponent(assignmentId)}/release`,
    { method: "POST", body: JSON.stringify(input) },
  );

export interface AcademicCatalogRevisionView {
  id: string;
  academicYearId: string;
  revision: number;
  status:
    "draft" | "pending" | "approved" | "rejected" | "cancelled" | "superseded";
  yearLabel: string;
  startsOn: string | null;
  endsOn: string | null;
  defaultLevels: AcademicCatalogLevel[];
  defaultStandingRules: AcademicStandingRule[];
  notYetGradedStanding: AcademicNotYetGradedStanding;
  programs: AcademicCatalogProgram[];
  reason: string | null;
  activateYear: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvalRequestId: string | null;
}

export interface AcademicCatalogWorkspace {
  year: {
    id: string;
    label: string;
    status: AcademicYearRow["status"];
    startsOn: string | null;
    endsOn: string | null;
  };
  effective: AcademicCatalogRevisionView;
  editable: AcademicCatalogRevisionView | null;
  hasApprovedRevision: boolean;
  draftSeedPrograms: AcademicCatalogProgram[];
  courses: { id: string; code: string; title: string; credits: number }[];
  levelBands: Array<AcademicCatalogLevel & { minimumCredits: number }>;
  history: Array<
    AcademicCatalogRevisionView & {
      requester: { name: string; email: string } | null;
      reviewer: { name: string; email: string } | null;
    }
  >;
}

export const getAcademicCatalog = (academicYearId: string) =>
  request<AcademicCatalogWorkspace>(
    `/registrar/academic-catalogs/${encodeURIComponent(academicYearId)}`,
  );

export const saveAcademicCatalogDraft = (
  academicYearId: string,
  input: AcademicCatalogDraft,
) =>
  request<AcademicCatalogRevisionView>(
    `/registrar/academic-catalogs/${encodeURIComponent(academicYearId)}/draft`,
    { method: "PUT", body: JSON.stringify(input) },
  );

export const submitAcademicCatalog = (academicYearId: string) =>
  request<{ requestId: string; revision: number; status: "pending" }>(
    `/registrar/academic-catalogs/${encodeURIComponent(academicYearId)}/submit`,
    { method: "POST" },
  );

export interface GradingSchemeRow {
  id: string;
  key: string;
  name: string;
  isDefault: boolean;
  rows: {
    id: string;
    grade: string;
    points: number | null;
    minScore: number | null;
    maxScore: number | null;
    countsTowardGpa: boolean;
    countsTowardCredits: boolean;
  }[];
}
export const getGradingSchemes = () =>
  request<GradingSchemeRow[]>("/registrar/grading-schemes");

export interface CourseRuleRow {
  courseId: string;
  code: string;
  title: string;
  credits: number;
  prerequisites: { code: string; minGrade: string | null }[];
  corequisites: string[];
  standingRequired: string | null;
  majorRestriction: string | null;
  capacity: number | null;
  waitlistEnabled: boolean;
}
export const getCourseRules = () =>
  request<CourseRuleRow[]>("/registrar/rules");
export const setCourseRule = (
  courseId: string,
  input: {
    standingRequired?: string | null;
    majorRestriction?: string | null;
    capacity?: number | null;
    waitlistEnabled?: boolean;
  },
) =>
  request<unknown>(`/registrar/rules/${courseId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
/** Replace a course's prerequisite (with min grade) and corequisite lists. */
export const setCourseRequisites = (
  courseId: string,
  input: {
    prerequisites: { code: string; minGrade?: string | null }[];
    corequisites: string[];
  },
) =>
  request<{ ok: boolean }>(`/registrar/rules/${courseId}/requisites`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

export interface GradeApprovalRow {
  id: string;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  note: string | null;
  course: string;
  sectionCode: string;
  term: string;
  instructor: string | null;
  students: number;
  graded: number;
  grades: { name: string; grade: string | null }[];
}
export const getGradeApprovals = () =>
  request<GradeApprovalRow[]>("/registrar/grade-approvals");
export const decideGradeApproval = (
  id: string,
  decision: "approved" | "returned",
  note?: string,
) =>
  request<unknown>(`/registrar/grade-approvals/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });

export interface FlaggedStudent {
  studentId: string;
  studentNo: string;
  name: string;
  program: string | null;
  gpa: number;
  attendance: number | null;
  flags: string[];
  level: "warning" | "critical";
  watching: boolean;
  lastWarnedAt: string | null;
}
export interface StudentSuccess {
  thresholds: { minGpa: number; minAttendance: number };
  total: number;
  atRisk: number;
  watch: number;
  warningsSent: number;
  flagged: FlaggedStudent[];
}
export const getStudentSuccess = () =>
  request<StudentSuccess>("/registrar/student-success");
export const warnStudent = (
  studentId: string,
  reason: string,
  level?: "warning" | "critical",
) =>
  request<unknown>("/registrar/student-success/warn", {
    method: "POST",
    body: JSON.stringify({ studentId, reason, level }),
  });

export interface WatchedStudent {
  studentId: string;
  studentNo: string;
  name: string;
  program: string | null;
}
export const getWatching = () =>
  request<WatchedStudent[]>("/registrar/student-success/watching");
export const watchStudent = (studentId: string) =>
  request<{ ok: boolean }>(`/registrar/student-success/watch/${studentId}`, {
    method: "POST",
  });
export const unwatchStudent = (studentId: string) =>
  request<{ ok: boolean }>(`/registrar/student-success/watch/${studentId}`, {
    method: "DELETE",
  });

export interface WarningRow {
  id: string;
  name: string;
  studentNo: string;
  reason: string;
  level: string;
  warnedAt: string | null;
}
export const getWarnings = () =>
  request<WarningRow[]>("/registrar/student-success/warnings");

export interface CalendarEventRow {
  id: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn: string | null;
  note: string | null;
}
export const getAcademicCalendar = () =>
  request<CalendarEventRow[]>("/registrar/calendar");
export const createCalendarEvent = (input: {
  academicYearId: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn?: string;
  note?: string;
}) =>
  request<CalendarEventRow>("/registrar/calendar", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateCalendarEvent = (
  id: string,
  input: {
    title?: string;
    type?: string;
    startsOn?: string;
    endsOn?: string | null;
    note?: string | null;
  },
) =>
  request<CalendarEventRow>(`/registrar/calendar/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const deleteCalendarEvent = (id: string) =>
  request<{ ok: boolean }>(`/registrar/calendar/${id}`, { method: "DELETE" });

// --- Registrar: grading-scheme rows ---
export const addGradeRow = (
  schemeId: string,
  input: {
    grade: string;
    points: number | null;
    minScore: number | null;
    maxScore: number | null;
    countsTowardGpa: boolean;
    countsTowardCredits: boolean;
  },
) =>
  request<unknown>(`/registrar/grading-schemes/${schemeId}/rows`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const updateGradeRow = (
  rowId: string,
  input: {
    grade?: string;
    points?: number | null;
    minScore?: number | null;
    maxScore?: number | null;
    countsTowardGpa?: boolean;
    countsTowardCredits?: boolean;
  },
) =>
  request<unknown>(`/registrar/grading-schemes/rows/${rowId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const deleteGradeRow = (rowId: string) =>
  request<{ ok: boolean }>(`/registrar/grading-schemes/rows/${rowId}`, {
    method: "DELETE",
  });

// --- Registrar: terms (calendar term cards) ---
export interface TermRow {
  id: string;
  name: string;
  status: string | null;
  semester: string | null;
  academicYearId: string | null;
  startDate: string;
  endDate: string;
  addDeadline: string | null;
  dropDeadline: string | null;
  academicYear: string | null;
}
export const getTerms = () => request<TermRow[]>("/registrar/terms");
export const updateTerm = (
  id: string,
  input: {
    status?: "active" | "planning" | "draft";
    startDate?: string;
    endDate?: string;
    addDeadline?: string | null;
    dropDeadline?: string | null;
  },
) =>
  request<TermRow>(`/registrar/terms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

// --- Registrar: curriculum (programme x catalogue-year course map) ---
export interface CurriculumEntryRow {
  yearIndex: number;
  semester: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
}
export interface CurriculumData {
  programCode: string;
  academicYearId: string;
  entries: CurriculumEntryRow[];
  allCourses: { id: string; code: string; title: string; credits: number }[];
}
export const getCurriculum = (programCode: string, academicYearId: string) =>
  request<CurriculumData>(
    `/registrar/curriculum?programCode=${encodeURIComponent(programCode)}&academicYearId=${academicYearId}`,
  );
export const saveCurriculum = (
  programCode: string,
  academicYearId: string,
  entries: { yearIndex: number; semester: string; courseCode: string }[],
) =>
  request<{ ok: boolean }>("/registrar/curriculum", {
    method: "PUT",
    body: JSON.stringify({ programCode, academicYearId, entries }),
  });

// --- Registrar: department delete ---
export const deleteDepartment = (id: string) =>
  request<{ ok: boolean }>(`/registrar/departments/${id}`, {
    method: "DELETE",
  });

// --- Registrar: broadcast composer ---
export interface BroadcastRow {
  id: string;
  audienceType: string;
  audienceValue: string | null;
  subject: string;
  body: string;
  recipientCount: number;
  createdAt: string;
}
export const getBroadcasts = () => request<BroadcastRow[]>("/comms/broadcasts");
export const sendBroadcast = (input: {
  audienceType: "individual" | "year" | "program" | "all";
  audienceValue?: string;
  subject: string;
  body: string;
  attachments?: MessageAttachment[];
}) =>
  request<{ id: string; sent: number }>("/comms/broadcasts", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const previewBroadcast = (
  audienceType: "individual" | "year" | "program" | "all",
  audienceValue?: string,
) => {
  const qs = new URLSearchParams({
    audienceType,
    ...(audienceValue ? { audienceValue } : {}),
  });
  return request<{ count: number }>(
    `/comms/broadcasts/preview?${qs.toString()}`,
  );
};

// --- In-app notifications (no email path by design) ---
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}
export const getNotifications = () =>
  request<AppNotification[]>("/notifications");
export const markNotificationsRead = () =>
  request<{ marked: number }>("/notifications/read-all", { method: "POST" });

// --- Course evaluations ---
export interface PendingEvaluation {
  windowId: string;
  kind: "midterm" | "final";
  sectionId: string;
  course: string;
  instructor: string | null;
  closesAt: string;
}
export const getPendingEvaluations = () =>
  request<PendingEvaluation[]>("/evaluations/my/pending");
export const submitEvaluation = (
  sectionId: string,
  body: {
    windowId: string;
    overall: number;
    clarity: number;
    workload: number;
    comment?: string;
  },
) =>
  request<{ ok: boolean }>(`/evaluations/my/sections/${sectionId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export type EvaluationResults =
  | {
      windowId: string;
      kind: string;
      responseCount: number;
      visible: true;
      overall: number | null;
      clarity: number | null;
      workload: number | null;
      comments: string[];
    }
  | {
      windowId: string;
      kind: string;
      responseCount: number;
      visible: false;
      reason: "not_released" | "too_few_responses" | "grades_not_approved";
    };
export const getSectionEvaluations = (sectionId: string) =>
  request<EvaluationResults[]>(`/evaluations/sections/${sectionId}/results`);

// --- Course evaluations: director ---
export interface EvaluationWindow {
  id: string;
  termId: string;
  term?: { name: string };
  kind: "midterm" | "final";
  status: "draft" | "open" | "closed";
  boundsOpenAt: string;
  boundsCloseAt: string;
  minResponsesToRelease: number;
}
export interface EvaluationWindowResults {
  window: EvaluationWindow;
  totalResponses: number;
  sections: {
    sectionId: string;
    course: string;
    sectionCode: string;
    instructor: string | null;
    responseCount: number;
    meetsFloor: boolean;
    overall: number | null;
    clarity: number | null;
    workload: number | null;
    comments: string[];
  }[];
}
export const getEvaluationWindows = () =>
  request<EvaluationWindow[]>("/evaluations/windows");
export const upsertEvaluationWindow = (body: {
  termId: string;
  kind: "midterm" | "final";
  status?: "draft" | "open" | "closed";
  boundsOpenAt: string;
  boundsCloseAt: string;
  minResponsesToRelease?: number;
}) =>
  request<EvaluationWindow>("/evaluations/windows", {
    method: "PUT",
    body: JSON.stringify(body),
  });
export const getEvaluationWindowResults = (windowId: string) =>
  request<EvaluationWindowResults>(`/evaluations/windows/${windowId}/results`);
export const releaseEvaluationWindow = (windowId: string, released: boolean) =>
  request<EvaluationWindow>(`/evaluations/windows/${windowId}/release`, {
    method: "POST",
    body: JSON.stringify({ released }),
  });

// ΓöÇΓöÇΓöÇ Infirmary ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export interface InfirmarySettings {
  clinic_name: string;
  clinic_address: string;
  clinic_phone: string;
  clinic_email: string;
  notifications_enabled: string;
  appointment_duration: string;
  working_hours_start: string;
  working_hours_end: string;
}

export interface InfirmaryStudent {
  id: string;
  name: string;
  initials: string;
  program: string;
  year: string;
  status: string;
  lastVisit: string;
  allergies: string[];
  concern: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  bloodType?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  medicalHistory?: string[];
  height?: string;
  weight?: string;
}

export interface InfirmaryConsultation {
  id: string;
  studentId: string;
  studentName: string;
  reason: string;
  visitType: string;
  clinicalNotes: string;
  status: string;
  date: string;
  time: string;
  followUpRequired: boolean;
  vitals?: {
    temperature?: string;
    bloodPressure?: string;
    heartRate?: string;
    weight?: string;
  };
  diagnosis?: string;
  treatmentPlan?: string;
}

export interface InfirmaryPrescription {
  id: string;
  consultationId?: string;
  studentId: string;
  studentName: string;
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  status: string;
  date: string;
  prescribedBy: string;
}

export interface InfirmaryMedication {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  minStock: number;
  expiryDate: string;
  supplier: string;
  lastRestocked: string;
  status: string;
}

export interface InfirmaryAppointment {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  time: string;
  type: string;
  reason: string;
  status: string;
  notes: string;
}

export interface InfirmaryDocument {
  id: string;
  studentId: string;
  studentName: string;
  name: string;
  type: string;
  date: string;
  uploadedBy: string;
  notes: string;
}

export interface InfirmaryFollowUp {
  id: string;
  studentId: string;
  studentName: string;
  reason: string;
  dueDate: string;
  status: string;
  priority: string;
  notes: string;
  createdAt: string;
}

export interface InfirmaryFormQ {
  id: string;
  text: string;
  type: "text" | "multiple_choice" | "yes_no" | "rating";
  options?: string[];
  required: boolean;
}

export interface InfirmaryForm {
  id: string;
  name: string;
  description: string;
  questions: InfirmaryFormQ[];
  responses: number;
  completion: number;
  status: string;
  updated: string;
  shareLink?: string;
}

export interface InfirmaryFormResponse {
  id: string;
  formId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, string>;
  submittedAt: string;
}

export interface InfirmaryAnalytics {
  totalStudents: number;
  consultationsThisMonth: number;
  totalConsultations: number;
  activePrescriptions: number;
  totalMedications: number;
  lowStockMedications: number;
  upcomingAppointments: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  totalFormResponses: number;
  documentsThisMonth: number;
  monthlyConsultations: { label: string; count: number }[];
}

// Settings
export const getInfirmarySettings = () =>
  request<InfirmarySettings>("/infirmary/settings");
export const updateInfirmarySettings = (data: Partial<InfirmarySettings>) =>
  request<InfirmarySettings>("/infirmary/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });

// Students
export const getInfirmaryStudents = () =>
  request<InfirmaryStudent[]>("/infirmary/students");

// Consultations
export const getInfirmaryConsultations = () =>
  request<InfirmaryConsultation[]>("/infirmary/consultations");
export const createInfirmaryConsultation = (
  data: Partial<InfirmaryConsultation>,
) =>
  request<InfirmaryConsultation>("/infirmary/consultations", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Sick-flag flow: flag a consultation as sick (or emergency) and notify faculty + admin.
export const flagInfirmaryConsultationSick = (
  consultationId: string,
  input: { isEmergency?: boolean; notes?: string },
) =>
  request<{ updated: { id: string }; recipientCount: number }>(
    `/infirmary/consultations/${consultationId}/flag-sick`,
    { method: "POST", body: JSON.stringify(input) },
  );
export const clearInfirmaryConsultationSick = (consultationId: string) =>
  request<{ cleared: { id: string }; removedAttendanceRows: boolean }>(
    `/infirmary/consultations/${consultationId}/flag-sick`,
    { method: "DELETE" },
  );
export interface FlaggedConsultationRow {
  id: string;
  reason: string;
  visitedAt: string;
  sickFlaggedAt: string | null;
  student: { id: string; name: string };
  flaggedBy: string | null;
}
export const getInfirmaryFlaggedToday = () =>
  request<FlaggedConsultationRow[]>("/infirmary/consultations/flagged");
export const updateInfirmaryConsultation = (
  id: string,
  data: Partial<InfirmaryConsultation>,
) =>
  request<InfirmaryConsultation>(`/infirmary/consultations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryConsultation = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/consultations/${id}`, {
    method: "DELETE",
  });

// Prescriptions
export const getInfirmaryPrescriptions = () =>
  request<InfirmaryPrescription[]>("/infirmary/prescriptions");
export const createInfirmaryPrescription = (
  data: Partial<InfirmaryPrescription>,
) =>
  request<InfirmaryPrescription>("/infirmary/prescriptions", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateInfirmaryPrescription = (
  id: string,
  data: Partial<InfirmaryPrescription>,
) =>
  request<InfirmaryPrescription>(`/infirmary/prescriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryPrescription = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/prescriptions/${id}`, {
    method: "DELETE",
  });

// Medications
export const getInfirmaryMedications = () =>
  request<InfirmaryMedication[]>("/infirmary/medications");
export const createInfirmaryMedication = (data: Partial<InfirmaryMedication>) =>
  request<InfirmaryMedication>("/infirmary/medications", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateInfirmaryMedication = (
  id: string,
  data: Partial<InfirmaryMedication>,
) =>
  request<InfirmaryMedication>(`/infirmary/medications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryMedication = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/medications/${id}`, {
    method: "DELETE",
  });

// Appointments
export const getInfirmaryAppointments = () =>
  request<InfirmaryAppointment[]>("/infirmary/appointments");
export const createInfirmaryAppointment = (
  data: Partial<InfirmaryAppointment>,
) =>
  request<InfirmaryAppointment>("/infirmary/appointments", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateInfirmaryAppointment = (
  id: string,
  data: Partial<InfirmaryAppointment>,
) =>
  request<InfirmaryAppointment>(`/infirmary/appointments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryAppointment = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/appointments/${id}`, {
    method: "DELETE",
  });

// Documents
export const getInfirmaryDocuments = () =>
  request<InfirmaryDocument[]>("/infirmary/documents");
export const createInfirmaryDocument = (data: Partial<InfirmaryDocument>) =>
  request<InfirmaryDocument>("/infirmary/documents", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateInfirmaryDocument = (
  id: string,
  data: Partial<InfirmaryDocument>,
) =>
  request<InfirmaryDocument>(`/infirmary/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryDocument = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/documents/${id}`, { method: "DELETE" });

// Follow-ups
export const getInfirmaryFollowUps = () =>
  request<InfirmaryFollowUp[]>("/infirmary/follow-ups");
export const createInfirmaryFollowUp = (data: Partial<InfirmaryFollowUp>) =>
  request<InfirmaryFollowUp>("/infirmary/follow-ups", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateInfirmaryFollowUp = (
  id: string,
  data: Partial<InfirmaryFollowUp>,
) =>
  request<InfirmaryFollowUp>(`/infirmary/follow-ups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryFollowUp = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/follow-ups/${id}`, { method: "DELETE" });

// Forms
export const getInfirmaryForms = () =>
  request<InfirmaryForm[]>("/infirmary/forms");
export const getInfirmaryForm = (id: string) =>
  request<InfirmaryForm & { responses: InfirmaryFormResponse[] }>(
    `/infirmary/forms/${id}`,
  );
export const createInfirmaryForm = (data: Partial<InfirmaryForm>) =>
  request<InfirmaryForm>("/infirmary/forms", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateInfirmaryForm = (id: string, data: Partial<InfirmaryForm>) =>
  request<InfirmaryForm>(`/infirmary/forms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryForm = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/forms/${id}`, { method: "DELETE" });

// Form Responses
export const getInfirmaryFormResponses = (formId: string) =>
  request<InfirmaryFormResponse[]>(`/infirmary/forms/${formId}/responses`);
export const createInfirmaryFormResponse = (
  formId: string,
  data: {
    studentId: string;
    studentName: string;
    answers: Record<string, string>;
  },
) =>
  request<InfirmaryFormResponse>(`/infirmary/forms/${formId}/responses`, {
    method: "POST",
    body: JSON.stringify(data),
  });
export const deleteInfirmaryFormResponse = (id: string) =>
  request<{ ok: boolean }>(`/infirmary/responses/${id}`, { method: "DELETE" });

// Analytics
export const getInfirmaryAnalytics = () =>
  request<InfirmaryAnalytics>("/infirmary/analytics");
// Enrollment override: student-initiated request after enroll() rejected them.
export type EnrollmentOverrideGate =
  | "prerequisite"
  | "corequisite"
  | "capacity"
  | "holds"
  | "credit_cap"
  | "standing"
  | "major_restriction"
  | "record_status"
  | "add_deadline";

export type EnrollmentOverrideFailure =
  | {
      gate: "prerequisite";
      courses: { code: string; minGrade: string | null }[];
    }
  | { gate: "corequisite"; courses: string[] }
  | { gate: "capacity"; taken: number; capacity: number }
  | { gate: "holds"; kinds: string[] }
  | {
      gate: "credit_cap";
      currentCredits: number;
      afterAdd: number;
      ceiling: number;
    }
  | { gate: "standing"; required: string; actual: number }
  | { gate: "major_restriction"; required: string }
  | { gate: "record_status"; status: string }
  | { gate: "add_deadline"; closedOn: string };

export interface EnrollmentOverrideRequestResponse {
  id: string;
  status: string;
  failures: EnrollmentOverrideFailure[];
}

export const submitEnrollmentOverride = (body: {
  sectionId: string;
  reason: string;
  requestedWaivers: EnrollmentOverrideGate[];
}) =>
  request<EnrollmentOverrideRequestResponse>(
    "/academics/enrollment-overrides",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );

export interface MyOverrideRequest {
  id: string;
  status: string;
  reason: string;
  targetId: string | null;
  decisionNote: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  afterJson: {
    sectionId: string;
    studentId: string;
    requestedWaivers: EnrollmentOverrideGate[];
    failures: EnrollmentOverrideFailure[];
  } | null;
}

export const myOverrideRequests = () =>
  request<MyOverrideRequest[]>("/academics/enrollment-overrides/mine");

export const cancelOverrideRequest = (id: string) =>
  request<{ id: string; status: string }>(
    `/academics/enrollment-overrides/${id}/cancel`,
    { method: "POST", body: JSON.stringify({}) },
  );

export type FacultyWaivableGate =
  | "prerequisite"
  | "corequisite"
  | "capacity"
  | "credit_cap"
  | "major_restriction"
  | "add_deadline";

export const FACULTY_WAIVABLE_GATES: FacultyWaivableGate[] = [
  "prerequisite",
  "corequisite",
  "capacity",
  "credit_cap",
  "major_restriction",
  "add_deadline",
];

export interface FacultyOverrideRequest {
  id: string;
  status: string;
  reason: string;
  targetId: string | null;
  decisionNote: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  requestedBy: {
    firstName: string;
    lastName: string;
    email: string;
    student: { studentNo: string } | null;
  } | null;
  afterJson: {
    sectionId: string;
    studentId: string;
    requestedWaivers: EnrollmentOverrideGate[];
    failures: EnrollmentOverrideFailure[];
  } | null;
}

export const facultyOverrideRequests = () =>
  request<FacultyOverrideRequest[]>("/academics/enrollment-overrides/faculty");

export const facultyDecideOverride = (
  id: string,
  body: {
    waive: boolean;
    waivedGates?: EnrollmentOverrideGate[];
    note?: string;
  },
) =>
  request<{ id: string; status: string; enrollmentId?: string }>(
    `/academics/enrollment-overrides/${id}/faculty-decide`,
    { method: "POST", body: JSON.stringify(body) },
  );
// --- Custom Forms (registrar + respondent) ---

export interface FormListItem {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published" | "closed";
  requiresAuth: boolean;
  publishedAt: string | null;
  closesAt: string | null;
  maxResponses: number | null;
  responseCount: number;
  createdAt: string;
}

export interface FormFieldDef {
  id: string;
  type: string;
  label: string;
  required: boolean;
  sortOrder: number;
  optionsJson: { label: string; value: string }[] | null;
  conditionJson: unknown;
}

export interface FormSectionDef {
  id: string;
  title: string;
  sortOrder: number;
  conditionJson: unknown;
  fields: FormFieldDef[];
}

export interface FormDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  requiresAuth: boolean;
  publishedAt: string | null;
  closesAt: string | null;
  maxResponses: number | null;
  responseCount: number;
  publicToken: string | null;
  createdAt: string;
  sections: FormSectionDef[];
}

export interface FormResponseRow {
  id: string;
  formId: string;
  personId: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
  submittedAt: string;
  updatedAt: string;
  answers: { fieldId: string; value: unknown }[];
}

export interface FormInputSection {
  title: string;
  sortOrder: number;
  conditionJson?: unknown;
  fields: FormInputField[];
}

export interface FormInputField {
  type: string;
  label: string;
  required: boolean;
  sortOrder: number;
  optionsJson?: { label: string; value: string }[];
  conditionJson?: unknown;
}

export const listForms = () => request<FormListItem[]>("/forms");

export const getFormDetail = (id: string) =>
  request<FormDetail>(`/forms/${id}`);

export const createForm = (body: {
  title: string;
  description?: string;
  requiresAuth?: boolean;
  closesAt?: string;
  maxResponses?: number;
  sections: FormInputSection[];
}) =>
  request<FormDetail>("/forms", { method: "POST", body: JSON.stringify(body) });

export const updateForm = (
  id: string,
  body: {
    title: string;
    description?: string;
    requiresAuth?: boolean;
    closesAt?: string;
    maxResponses?: number;
    sections: FormInputSection[];
  },
) =>
  request<FormDetail>(`/forms/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const publishForm = (id: string) =>
  request<FormDetail>(`/forms/${id}/publish`, { method: "POST" });

export const closeForm = (id: string) =>
  request<FormDetail>(`/forms/${id}/close`, { method: "POST" });

export const deleteForm = (id: string) =>
  request<{ deleted: boolean }>(`/forms/${id}`, { method: "DELETE" });

export const listFormResponses = (formId: string) =>
  request<FormResponseRow[]>(`/forms/${formId}/responses`);

export const getFormResponse = (formId: string, responseId: string) =>
  request<FormResponseRow>(`/forms/${formId}/responses/${responseId}`);

export const exportFormCsv = (formId: string) =>
  `${API_URL}/api/forms/${formId}/export`;

export const getPublicForm = (token: string) =>
  request<FormDetail>(`/forms/public/${token}`);

export const submitPublicForm = (
  token: string,
  body: {
    respondentName: string;
    respondentEmail: string;
    answers: { fieldId: string; value: unknown }[];
  },
) =>
  request<FormResponseRow>(`/forms/public/${token}/respond`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const getFormForRespondent = (formId: string) =>
  request<{ form: FormDetail; existingResponse: FormResponseRow | null }>(
    `/forms/${formId}/respond`,
  );

export const submitAuthForm = (
  formId: string,
  body: {
    answers: { fieldId: string; value: unknown }[];
  },
) =>
  request<FormResponseRow>(`/forms/${formId}/respond`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// --- Helpdesk (in-app support tickets) ---
// Native tickets cover admissions / academics / student affairs / IT / portal
// requests. The IT backlog (it_portal) is part of the categories but remains a
// queue decision, not a separate workflow. See packages/shared/src/helpdesk.ts
// for the canonical enum + transition map re-exported below.
import {
  HELPDESK_CATEGORIES,
  HELPDESK_PRIORITIES,
  HELPDESK_ROUTING_TYPES,
  HELPDESK_STATUSES,
  HELPDESK_STATUS_TRANSITIONS,
  HELP_DESK_CATEGORY_LABELS,
  HELP_DESK_PRIORITY_LABELS,
  HELP_DESK_ROUTING_LABELS,
  HELP_DESK_STATUS_LABELS,
  isValidHelpdeskStatusTransition,
  type CreateHelpdeskCommentInput,
  type CreateHelpdeskTicketInput,
  type HelpdeskAttachmentSummary,
  type HelpdeskCategory,
  type HelpdeskCommentSummary,
  type HelpdeskPriority,
  type HelpdeskQueueItem,
  type HelpdeskRoutingType,
  type HelpdeskStatus,
  type HelpdeskTicketDetail,
  type HelpdeskTicketSummary,
  type UpdateHelpdeskTicketInput,
} from "@mydaust/shared";
export {
  HELPDESK_CATEGORIES,
  HELPDESK_PRIORITIES,
  HELPDESK_ROUTING_TYPES,
  HELPDESK_STATUSES,
  HELPDESK_STATUS_TRANSITIONS,
  HELP_DESK_CATEGORY_LABELS,
  HELP_DESK_PRIORITY_LABELS,
  HELP_DESK_ROUTING_LABELS,
  HELP_DESK_STATUS_LABELS,
  isValidHelpdeskStatusTransition,
  CreateHelpdeskCommentInput,
  CreateHelpdeskTicketInput,
  HelpdeskAttachmentSummary,
  HelpdeskCategory,
  HelpdeskCommentSummary,
  HelpdeskPriority,
  HelpdeskQueueItem,
  HelpdeskRoutingType,
  HelpdeskStatus,
  HelpdeskTicketDetail,
  HelpdeskTicketSummary,
  UpdateHelpdeskTicketInput,
};

/** Body returned by the GitHub re-sync endpoint ΓÇö keeps the staff view honest. */
export interface HelpdeskGithubSyncResult {
  state: "pending" | "linked" | "failed";
  issueNumber?: number;
  issueUrl?: string;
  /** True when the helpdesk is configured without a GitHub token/repo. */
  disabled?: boolean;
}

/** Public-facing read of a single ticket attachment. */
export interface HelpdeskAttachment extends HelpdeskAttachmentSummary {}

/** Tickets the caller is allowed to see (own tickets + parent-linked children). */
export const getMyHelpdeskTickets = () =>
  request<HelpdeskTicketSummary[]>("/helpdesk/mine");

/** Open a new ticket. Student/parent `studentId` enforcement happens server-side. */
export const createHelpdeskTicket = (input: CreateHelpdeskTicketInput) =>
  request<HelpdeskTicketDetail>("/helpdesk/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });

/** Read a single ticket ΓÇö returns staff fields only to staff callers. */
export const getHelpdeskTicket = (id: string) =>
  request<HelpdeskTicketDetail>(`/helpdesk/tickets/${id}`);

/** Post a comment. `isInternal` is honored only for staff callers. */
export const addHelpdeskComment = (
  id: string,
  input: CreateHelpdeskCommentInput,
) =>
  request<HelpdeskTicketDetail>(`/helpdesk/tickets/${id}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });

/** Shared staff queue. Caller MUST hold a queue role (API returns 403 otherwise). */
export const getHelpdeskQueue = (
  filter: {
    status?: HelpdeskStatus;
    category?: HelpdeskCategory;
    priority?: HelpdeskPriority;
    routingType?: HelpdeskRoutingType;
    assigneeId?: string;
    mineOnly?: boolean;
    q?: string;
  } = {},
) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, v === true ? "true" : v === false ? "false" : String(v));
  }
  const tail = qs.toString();
  return request<HelpdeskQueueItem[]>(
    `/helpdesk/queue${tail ? `?${tail}` : ""}`,
  );
};

/**
 * Staff-side patch. `baseRevision` MUST be the ticket `version` the editor
 * showed on load ΓÇö the API returns 409 on a mismatch so concurrent edits
 * surface as a recoverable error rather than a silent overwrite.
 */
export const updateHelpdeskTicket = (
  id: string,
  input: Omit<UpdateHelpdeskTicketInput, "baseRevision"> & {
    baseRevision: number;
  },
) =>
  request<HelpdeskTicketDetail>(`/helpdesk/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

/**
 * Retry / trigger GitHub sync on a staff-routed engineering ticket. Returns
 * the new sync state so the queue row can refresh in place.
 */
export const retryHelpdeskGithubSync = (id: string) =>
  request<HelpdeskGithubSyncResult>(`/helpdesk/tickets/${id}/github-sync`, {
    method: "POST",
  });

/**
 * Upload a screenshot/attachment for a ticket. The file goes through the same
 * magic-byte validator the existing `/uploads` route uses; this endpoint
 * additionally checks ticket-scoped read authorization. Use
 * `helpdeskAttachmentUrl(id)` to resolve the returned attachment id to an
 * absolute URL ΓÇö it streams through the authorized `/helpdesk/attachments/:id`
 * route, never the public `/uploads/:filename` link.
 */
export async function uploadHelpdeskAttachment(
  ticketId: string,
  file: File,
  name?: string,
): Promise<HelpdeskAttachment> {
  const form = new FormData();
  form.append("file", file);
  form.append("data", JSON.stringify({ ticketId, name: name ?? file.name }));
  const res = await fetch(`${API_URL}/api/helpdesk/attachments`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<HelpdeskAttachment>;
}

/**
 * Authorized read URL for a helpdesk attachment. Hits the controller's
 * `GET /helpdesk/attachments/:id` route, which validates that the caller is
 * the ticket owner, the parent of the linked student, or a member of the
 * support staff before streaming the bytes. Returns a URL that travels the
 * session cookie ΓÇö do not embed this in a mailto or share it externally.
 */
export function helpdeskAttachmentUrl(attachmentId: string): string {
  return `${API_URL}/api/helpdesk/attachments/${encodeURIComponent(attachmentId)}`;
}
