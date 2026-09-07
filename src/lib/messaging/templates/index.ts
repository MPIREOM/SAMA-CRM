// Template registry. Pure — no database, no providers — so the back-office
// preview screen and the unit tests can call it directly.
import type { AllSettings } from "@/lib/bk/types";
import type { BuiltMessage, Channel, Locale, MessageKind, MessagePreview, TemplateContext } from "../types";
import { buildConfirmation } from "./confirmation";
import { buildPostStay } from "./post-stay";
import { buildPreArrival } from "./pre-arrival";
import { sampleContext } from "./context";

export { buildConfirmation, confirmationParams } from "./confirmation";
export { buildPreArrival, preArrivalParams } from "./pre-arrival";
export { buildPostStay, postStayParams, RETURNING_GUEST_CODE } from "./post-stay";
export { buildContext, buildLinks, sampleBooking, sampleContext, SAMPLE_BOOKING_ID } from "./context";
export { SAMPLE_SETTINGS } from "./sample-settings";
export {
  DEFAULT_TEMPLATE_NAMES,
  TEMPLATE_PARAM_COUNT,
  WHATSAPP_BODIES,
  cleanParam,
  renderWhatsAppBody,
} from "./whatsapp-bodies";
export { renderEmail, type Block, type EmailDocument } from "./email-shell";

const BUILDERS: Record<MessageKind, (ctx: TemplateContext, locale: Locale) => BuiltMessage> = {
  confirmation: buildConfirmation,
  pre_arrival: buildPreArrival,
  post_stay: buildPostStay,
};

/** Build both channels of one message kind for a booking. */
export function buildMessage(kind: MessageKind, ctx: TemplateContext, locale: Locale): BuiltMessage {
  return BUILDERS[kind](ctx, locale);
}

/**
 * Admin preview: render one kind × channel × locale with realistic sample
 * data. Pass real settings (`await getSettings()`) so contacts, links and
 * template names match production.
 */
export function renderPreview(
  kind: MessageKind,
  channel: Channel,
  locale: Locale,
  settings?: AllSettings
): MessagePreview {
  const built = buildMessage(kind, sampleContext(locale, settings), locale);
  if (channel === "whatsapp") return { channel, kind, locale, ...built.whatsapp };
  return { channel, kind, locale, ...built.email };
}
