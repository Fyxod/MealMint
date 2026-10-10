import { createHash } from "node:crypto";

export function cartData(raw: any): any {
  return raw?.data?.pricing ? raw.data : raw?.pricing ? raw :
    raw?.data?.data?.pricing ? raw.data.data : (raw?.data ?? raw);
}
export function cartFingerprint(raw: any) {
  const c = cartData(raw);
  return createHash("sha256").update(JSON.stringify({
    restaurant: c?.restaurant?.id ?? c?.restaurant?.restaurant_id ?? c?.restaurant?.restaurantId ?? null,
    // valid_addons is the catalog of possible extras, not selected cart food.
    // Swiggy can reorder/change it between successive reads. Selected addons,
    // variants, quantities, prices and stock remain part of the fingerprint.
    items: Array.isArray(c?.items) ? c.items.map(({ valid_addons, ...item }: any) => item) : c?.items ?? [],
    offers: c?.offers ?? null, total: c?.pricing?.to_pay ?? null,
  })).digest("hex");
}

// Bind a missing restaurant identity to the authoritative write request. Both
// receipt and concurrency checks compare selected cart state, excluding only
// the unused valid_addons catalog.
export function cartReceiptFingerprint(raw: any, restaurantId: string) {
  const c = cartData(raw);
  return cartFingerprint({ ...c,
    restaurant: { id: String(c?.restaurant?.id ?? c?.restaurant?.restaurant_id ?? c?.restaurant?.restaurantId ?? restaurantId) },
  });
}

// A confirmed coupon rejection can leave the attempted code as a zero-saving
// marker. Accept only that exact change, preserving every ordinary cart guard.
export function rejectedCouponMarkerOnly(before: any, after: any, code: string): boolean {
  const previous = cartData(before), current = cartData(after);
  if (!previous?.offers || !current?.offers || String(current.offers.coupon_applied ?? "").toUpperCase() !== code.toUpperCase() ||
      current.offers.coupon_discount !== 0 || Number(previous.offers.coupon_discount ?? 0) !== 0) return false;
  return cartFingerprint(before) === cartFingerprint({ ...current,
    offers: { ...current.offers, coupon_applied: previous.offers.coupon_applied },
  });
}
