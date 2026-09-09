// Serializable status shared by the WhatsApp setup page (server) and its
// view (client). Contains no secrets — only presence flags and Meta metadata.

export interface WhatsAppSetupStatus {
  /** Which environment variables are present (values never leave the server). */
  env: {
    accessToken: boolean;
    phoneNumberId: boolean;
    businessAccountId: boolean;
    appId: boolean;
    appSecret: boolean;
    verifyToken: boolean;
    forwardUrl: string | null;
    forwardSenders: string[];
  };
  /** Callback URL this deployment expects Meta to call. */
  callbackUrl: string;
  token: {
    ok: boolean;
    error: string | null;
    appId: string | null;
    type: string | null;
    expiresAt: number | null;
    isValid: boolean;
    scopes: string[];
  };
  phone: {
    ok: boolean;
    error: string | null;
    id: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    codeVerificationStatus: string | null;
  };
  wabaId: string | null;
  webhook: {
    ok: boolean;
    error: string | null;
    /** Apps subscribed to the WABA and their per-WABA callback overrides. */
    apps: { id: string | null; name: string | null; overrideCallbackUri: string | null }[];
    /** App-level callback (what the Meta dashboard shows) when the app id + secret are known. */
    appCallbackUrl: string | null;
    appCallbackError: string | null;
    /** True when this deployment's callback URL is the active target for the WABA. */
    pointsHere: boolean;
  };
  templates: {
    ok: boolean;
    error: string | null;
    rows: {
      kind: string;
      name: string;
      language: string;
      status: string; // APPROVED | PENDING | REJECTED | PAUSED | MISSING | …
      rejectedReason: string | null;
      issues: string[];
    }[];
  };
}

export interface TemplateCreateOutcome {
  name: string;
  language: string;
  ok: boolean;
  status: string | null;
  error: string | null;
}
