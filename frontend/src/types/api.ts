export enum OrganizationRole {
  Viewer = 1,
  Reviewer = 2,
  Operator = 3,
  Admin = 4,
  Owner = 5,
}

export enum DocumentType {
  Unknown = 0,
  Invoice = 1,
  PurchaseOrder = 2,
  Contract = 3,
  Receipt = 4,
  Other = 99,
}

export enum DocumentStatus {
  Uploaded = 1,
  Queued = 2,
  Processing = 3,
  Extracted = 4,
  PendingReview = 5,
  Approved = 6,
  Rejected = 7,
  Failed = 8,
}

export enum ValidationSeverity {
  Info = 1,
  Warning = 2,
  Error = 3,
}

export interface AuthResponse {
  accessToken: string;
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationSlug: string;
  role: OrganizationRole;
}

export interface UserMembershipDto {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
}

export interface RegisterOrganizationRequest {
  organizationName: string;
  organizationSlug: string;
  fullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  organizationSlug?: string;
}

export interface SwitchOrganizationRequest {
  organizationId: string;
}

export interface InviteMemberRequest {
  email: string;
  fullName: string;
  temporaryPassword: string;
  role: OrganizationRole;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface DocumentSummaryDto {
  id: string;
  title: string;
  documentType: DocumentType;
  status: DocumentStatus;
  currentVersionNumber: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface DocumentVersionDto {
  id: string;
  versionNumber: number;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  sha256Hash: string;
  createdAt: string;
}

export interface ExtractedFieldDto {
  id: string;
  fieldName: string;
  rawValue: string | null;
  normalizedValue: string | null;
  confidence: number;
  pageNumber: number | null;
  boundingBoxJson: string | null;
  isFinanciallySensitive: boolean;
  requiresReview: boolean;
  correctedValue: string | null;
  isValidated: boolean;
}

export interface ValidationIssueDto {
  id: string;
  ruleCode: string;
  fieldName: string | null;
  severity: ValidationSeverity;
  message: string;
  isResolved: boolean;
}

export interface DocumentDetailDto {
  id: string;
  title: string;
  documentType: DocumentType;
  status: DocumentStatus;
  currentVersionNumber: number;
  retryCount: number;
  lastError: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  versions: DocumentVersionDto[];
  extractedFields: ExtractedFieldDto[];
  validationIssues: ValidationIssueDto[];
}

export interface CorrectFieldRequest {
  correctedValue: string;
}

export interface ReviewDecisionRequest {
  notes?: string;
}

export interface RejectDocumentRequest {
  reason: string;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  detailsJson: string | null;
  occurredAt: string;
}

export interface ProblemDetails {
  status?: number;
  title?: string;
  detail?: string;
}

export interface HealthResponse {
  status: string;
  database: string;
}

/**
 * Mirrors backend PolicyNames in DocuFlow.API/Program.cs:
 * - RequireViewer: Viewer, Reviewer, Operator, Admin, Owner
 * - RequireReviewer: Reviewer, Admin, Owner
 * - RequireOperator: Operator, Admin, Owner
 * - RequireAdmin: Admin, Owner
 * - RequireOwner: Owner
 */
export const rolePermissions = {
  canUpload: (role: OrganizationRole) =>
    role === OrganizationRole.Operator ||
    role === OrganizationRole.Admin ||
    role === OrganizationRole.Owner,
  canReview: (role: OrganizationRole) =>
    role === OrganizationRole.Reviewer ||
    role === OrganizationRole.Admin ||
    role === OrganizationRole.Owner,
  canManageAdmin: (role: OrganizationRole) =>
    role === OrganizationRole.Admin || role === OrganizationRole.Owner,
  canAssignOwner: (role: OrganizationRole) => role === OrganizationRole.Owner,
};

