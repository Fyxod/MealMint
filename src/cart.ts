import { createHash } from "node:crypto";

export function cartData(raw: any): any {
  return raw?.data?.pricing ? raw.data : raw?.pricing ? raw :
    raw?.data?.data?.pricing ? raw.data.data : (raw?.data ?? raw);
}
export function cartFingerprint(raw: any) {
  const c = cartData(raw);
  return createHash("sha256").update(JSON.stringify({
    restaurant: c?.restaurant?.id ?? c?.restaurant?.restaurant_id ?? c?.restaurant?.restaurantId ?? null,
    items: c?.items ?? [], offers: c?.offers ?? null, total: c?.pricing?.to_pay ?? null,
  })).digest("hex");
}
