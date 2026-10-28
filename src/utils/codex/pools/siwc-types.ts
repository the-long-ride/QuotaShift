export interface SiwcAccountView {
  id: string;
  email: string;
  subject: string;
  clientId: string;
  isRoutable: boolean;
  linkedCodexAccountId?: string | null;
}

export interface SiwcModelView {
  slug: string;
  displayName: string;
}

export interface SiwcSignInStatus {
  pending: boolean;
  registrationId?: string | null;
  linkedCodexAccountId?: string | null;
  lastError?: string | null;
}
