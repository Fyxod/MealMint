import type { Quote } from "./types.js";

// Use explicit redeemable codes, never Swiggy's internal UUID offer identifiers.
export function couponCode(offer: any): string | null {
  const valid = (value: unknown): value is string => typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,50}$/.test(value) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if (valid(offer?.code)) return offer.code;
  const match = typeof offer?.description === "string"
    ? offer.description.match(/\buse\s+code\s+([A-Za-z0-9_-]{1,50})(?=\s|[&.,!;:]|$)/i) : null;
  if (match && valid(match[1])) return match[1];
  if (valid(offer?.title)) return offer.title;
  return valid(offer?.id) ? offer.id : null;
}

// Inspect offer restrictions, not serialized property names or arbitrary words
// such as "card" inside a coupon identifier. COD compatibility may be explicit.
function paymentOnly(offer: any, section: any): boolean {
  if (offer?.requiresOnlinePayment === true || offer?.paymentOnly === true ||
      /PAYMENT|BANK/i.test(String(section?.type ?? ""))) return true;
  const text = [offer?.title, offer?.subtitle, offer?.description,
    ...(Array.isArray(offer?.terms_and_conditions?.bullet_texts) ? offer.terms_and_conditions.bullet_texts : [])]
    .filter(x => typeof x === "string").join(" ");
  const restricted = /(?:only|exclusively)\s+(?:(?:on|with|for|via)\s+)?(?:online|card|bank|upi)|(?:online|card|bank|upi)\s+(?:payments?\s+)?only|(?:requires?|must use)\s+(?:an?\s+)?(?:online|card|bank|upi)|not\s+(?:valid|applicable|available)\s+(?:on|for|with)\s+(?:COD|cash on delivery)/i.test(text);
  if (restricted) return true;
  if (/\bCOD\b|cash on delivery|all payment (?:modes|methods)/i.test(text)) return false;
  return /\b(?:cards?|online|bank|upi)\b/i.test(text);
}

export function couponTrialPlan(raw: any, limit = 5) {
  const sections = Array.isArray(raw?.coupon_sections) ? raw.coupon_sections : [];
  const entries = sections.flatMap((section: any) =>
    (Array.isArray(section?.coupons) ? section.coupons : []).map((offer: any) => ({ offer, section })));
  const codes: string[] = [];
  for (const { offer, section } of entries) {
    const code = couponCode(offer);
    const status = String(offer?.applicabilityStatus ?? "").toUpperCase();
    if (!code || offer?.applicable === false || status === "NOT_APPLICABLE" ||
        !(offer?.applicable === true || status === "APPLICABLE" || status === "APPLIED") || paymentOnly(offer, section)) continue;
    if (!codes.some(previous => previous.toUpperCase() === code.toUpperCase())) codes.push(code);
  }
  return {
    visible: entries.length,
    eligible: codes.length,
    codes: codes.slice(0, limit),
    untried: codes.slice(limit),
    scope: /COD/i.test(String(raw?.summary?.filter_applied ?? "")) ? "cod-only" as const : "visible" as const,
  };
}

export function couponCheckSummary(quote: Quote): string | null {
  const checks = quote.couponChecks;
  if (!checks) return null;
  if (checks.status === "pending") return "Coupon check incomplete; this is a verified cart price only.";
  if (checks.requested?.length) return `Tested ${checks.attempted.length}/${checks.considered ?? checks.eligible} coupon codes, including your requested ${checks.requested.join(", ")}${checks.rejected.length ? `; ${checks.rejected.join(", ")} rejected by Swiggy MCP` : ""}${checks.untried.length ? `; ${checks.untried.length} not tested` : ""}. Only a lower verified payable total counts as savings.`;
  if (!checks.visible) return `No ${checks.scope === "cod-only" ? "COD-compatible " : ""}coupons returned for this cart; other app offers may be absent.`;
  if (!checks.eligible) return `${checks.visible} offers returned; none confirmed eligible for a non-payment coupon trial.`;
  return `Tested ${checks.attempted.length}/${checks.eligible} eligible coupon codes${checks.rejected.length ? `; ${checks.rejected.length} rejected` : ""}${checks.untried.length ? `; ${checks.untried.length} not tested` : ""}.`;
}
