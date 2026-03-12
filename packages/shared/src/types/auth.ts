export interface AuthState {
  isAuthenticated: boolean;
  email?: string;
  userId?: string;
  sessionExpired?: boolean;
  orgId?: string;   // active organization (undefined = personal mode, no collaboration)
}

export type OrgRole = 'member' | 'admin';

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
}

export interface OrganizationMemberListItem {
  userId?: string;
  invitationId?: string;
  email: string | null;
  role: OrgRole;
  joinedAt?: string;
  invitedAt?: string;
  status: 'active' | 'pending';
}

export interface OrganizationInvitationResult {
  id?: string;
  userId?: string;
  email: string;
  role: OrgRole;
  status: 'pending' | 'active';
}

export interface OrganizationInvitationAcceptanceResult {
  joined: number;
}

export type AuthFlow = 'sign-in' | 'sign-up';

export type AuthProvider = 'google' | 'github' | 'gitlab';

export type AuthIntent =
  | 'sign-in-email-password'
  | 'sign-up-email-password'
  | 'oauth-google'
  | 'oauth-github'
  | 'oauth-gitlab';

export type AuthContinuationStrategy =
  | 'email_code'
  | 'phone_code'
  | 'totp'
  | 'reset_password_email_code'
  | 'reset_password_phone_code'
  | 'new_password';

export type AuthResultStatus =
  | 'complete'
  | 'needs_second_factor'
  | 'needs_new_password'
  | 'missing_requirements'
  | 'oauth_redirect'
  | 'error';

export interface AuthPendingStep {
  attemptId: string;
  flow: AuthFlow;
  strategy: AuthContinuationStrategy;
  message: string;
  email?: string;
  emailAddressId?: string;
  missingFields?: string[];
  phoneNumberId?: string;
}

export interface AuthSubmissionRequest {
  intent: AuthIntent;
  email?: string;
  password?: string;
}

export interface AuthContinuationRequest {
  attemptId: string;
  emailAddressId?: string;
  flow: AuthFlow;
  strategy: AuthContinuationStrategy;
  code?: string;
  fields?: Record<string, string | boolean>;
  newPassword?: string;
  phoneNumberId?: string;
}

export interface AuthActionResult {
  status: AuthResultStatus;
  email?: string;
  message?: string;
  step?: AuthPendingStep;
}

export interface AuthCompletePayload {
  email?: string;
}

export interface AuthErrorPayload {
  message: string;
  step?: AuthPendingStep;
}

export interface AuthSignedOutPayload {}
