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

// The write and read endpoints can return different unselected add-on catalogs.
// Keep the full selected cart state, prices and offers in this receipt, excluding
// only valid_addons (which lists possibilities, not what is in the cart).
export function cartReceiptFingerprint(raw: any, restaurantId: string) {
  const c = cartData(raw);
  return cartFingerprint({ ...c,
    restaurant: { id: String(c?.restaurant?.id ?? c?.restaurant?.restaurant_id ?? c?.restaurant?.restaurantId ?? restaurantId) },
    items: (c?.items ?? []).map(({ valid_addons, ...item }: any) => item),
  });
}
