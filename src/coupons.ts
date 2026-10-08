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
