// Shared types for the guest messaging module. Pure — safe to import from
// templates, tests and the back-office preview screen.
import type { BookingWithRelations } from "@/lib/bk/bookings";
import type { AllSettings } from "@/lib/bk/types";

export type MessageKind = "confirmation" | "pre_arrival" | "post_stay";
export type Channel = "email" | "whatsapp";
export type Locale = "en" | "ar";

export const MESSAGE_KINDS: readonly MessageKind[] = ["confirmation", "pre_arrival", "post_stay"];
export const CHANNELS: readonly Channel[] = ["email", "whatsapp"];

export interface DispatchSummary {
  picked: number;
  sent: number;
  failed: number;
  stubbed: number;
  skipped: number;
  errors: string[];
}

/** Links a template may point the guest to. All absolute URLs, never empty. */
export interface TemplateLinks {
  /** Guest booking page with its HMAC token (bookingUrl). */
  booking: string;
  /** Guest manage page (cancel / change request) with the same token. */
  manage: string;
  /** Google Maps directions (settings.contact.maps_link). */
  maps: string;
  /** Primary review link: Google → TripAdvisor → website. */
  review: string;
  google: string | null;
  tripadvisor: string | null;
  website: string;
  whatsapp: string;
}

export interface TemplateContext {
  booking: BookingWithRelations;
  settings: AllSettings;
  links: TemplateLinks;
}

export interface WhatsAppMessage {
  templateName: string;
  langCode: Locale;
  params: string[];
  /** The Meta template body with {{n}} substituted — what the guest reads. Used for logs / CRM inbox. */
  body: string;
}

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

export interface BuiltMessage {
  whatsapp: WhatsAppMessage;
  email: EmailMessage;
}

export type MessagePreview =
  | ({ channel: "whatsapp"; kind: MessageKind; locale: Locale } & WhatsAppMessage)
  | ({ channel: "email"; kind: MessageKind; locale: Locale } & EmailMessage);

export function isMessageKind(value: unknown): value is MessageKind {
  return typeof value === "string" && (MESSAGE_KINDS as readonly string[]).includes(value);
}

export function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && (CHANNELS as readonly string[]).includes(value);
}

export function toLocale(value: string | null | undefined): Locale {
  return value === "ar" ? "ar" : "en";
}
