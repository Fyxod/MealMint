import type { FoodGateway } from "./types.js";

// All names, addresses, prices and offers here are synthetic demonstration data.
export const restaurants = [
  {
    id: "r1",
    name: "Everyday Kitchen",
    avgRating: 4.3,
    deliveryTimeMinutes: 24,
    availabilityStatus: "OPEN",
    offer: "SAVE20: 20% off over ₹120",
    delivery: 24,
  },
  {
    id: "r2",
    name: "Roll & Rice",
    avgRating: 4.1,
    deliveryTimeMinutes: 30,
    availabilityStatus: "OPEN",
    offer: "FLAT40: ₹40 off over ₹180",
    delivery: 18,
  },
  {
    id: "r3",
    name: "Dosa Corner",
    avgRating: 4.5,
    deliveryTimeMinutes: 18,
    availabilityStatus: "OPEN",
    offer: "No coupon needed",
    delivery: 32,
  },
  {
    id: "r4",
    name: "Bowl Theory",
    avgRating: 4.4,
    deliveryTimeMinutes: 35,
    availabilityStatus: "OPEN",
    offer: "SAVE20: 20% off over ₹120",
    delivery: 15,
  },
  {
    id: "r5",
    name: "Pocket Pizza",
    avgRating: 4.0,
    deliveryTimeMinutes: 28,
    availabilityStatus: "OPEN",
    offer: "CARD100: payment-specific offer",
    delivery: 29,
  },
  {
    id: "r6",
    name: "Night Biryani",
    avgRating: 4.2,
    deliveryTimeMinutes: 42,
    availabilityStatus: "CLOSED",
    offer: null,
    delivery: 22,
  },
];
export const dishes = [
  { id: "i1", r: "r1", name: "Veg thali", price: 129, veg: true, stock: true },
  {
    id: "i2",
    r: "r1",
    name: "Dal rice bowl",
    price: 89,
    veg: true,
    stock: true,
  },
  {
    id: "i3",
    r: "r1",
    name: "Chicken rice bowl",
    price: 149,
    veg: false,
    stock: true,
  },
  { id: "i4", r: "r2", name: "Aloo roll", price: 69, veg: true, stock: true },
  { id: "i5", r: "r2", name: "Egg roll", price: 89, veg: false, stock: true },
  {
    id: "i6",
    r: "r2",
    name: "Chicken biryani",
    price: 189,
    veg: false,
    stock: true,
  },
  { id: "i7", r: "r3", name: "Plain dosa", price: 59, veg: true, stock: true },
  {
    id: "i8",
    r: "r3",
    name: "Idli with sambar",
    price: 49,
    veg: true,
    stock: true,
  },
  { id: "i9", r: "r3", name: "Masala dosa", price: 79, veg: true, stock: true },
  {
    id: "i10",
    r: "r4",
    name: "Paneer rice bowl",
    price: 139,
    veg: true,
    stock: true,
  },
  {
    id: "i11",
    r: "r4",
    name: "Veg biryani",
    price: 119,
    veg: true,
    stock: true,
  },
  {
    id: "i12",
    r: "r4",
    name: "Rajma rice bowl",
    price: 99,
    veg: true,
    stock: false,
  },
  {
    id: "i13",
    r: "r5",
    name: "Margherita pizza",
    price: 159,
    veg: true,
    stock: true,
  },
  {
    id: "i14",
    r: "r5",
    name: "Custom pizza",
    price: 99,
    veg: true,
    stock: true,
    custom: true,
  },
  {
    id: "i15",
    r: "r6",
    name: "Budget chicken biryani",
    price: 79,
    veg: false,
    stock: true,
  },
];
export class MockFoodGateway implements FoodGateway {
  readonly mode = "mock" as const;
  private cart: {
    restaurantId: string;
    items: { id: string; quantity: number }[];
    coupon: string | null;
  } | null = null;
  async close() {}
  private pricing(addressId: string) {
    const r = restaurants.find((x) => x.id === this.cart?.restaurantId);
    const items = (this.cart?.items ?? []).map((x) => {
      const d = dishes.find((d) => d.id === x.id)!;
      return {
        menu_item_id: d.id,
        name: d.name,
        quantity: x.quantity,
        subtotal: d.price * x.quantity,
        total: d.price * x.quantity,
        final_price: d.price,
        in_stock: true,
      };
    });
    const item_total = items.reduce((sum, x) => sum + x.total, 0);
    const delivery_charge = r
      ? r.delivery + (addressId === "mock-office" ? 12 : 0)
      : 0;
    const taxes_and_charges = item_total
      ? Math.round(item_total * 0.05 * 100) / 100 + 8
      : 0;
    const discount =
      this.cart?.coupon === "SAVE20" && item_total >= 120
        ? Math.min(50, Math.round(item_total * 20) / 100)
        : this.cart?.coupon === "FLAT40" && item_total >= 180
          ? 40
          : 0;
    return {
      data: {
        cart_id: this.cart ? "mock-cart" : undefined,
        restaurant: r ? { id: r.id, name: r.name } : null,
        items,
        item_count: items.length,
        pricing: {
          item_total,
          delivery_charge,
          taxes_and_charges,
          to_pay:
            Math.round(
              (item_total + delivery_charge + taxes_and_charges - discount) *
                100,
            ) / 100,
        },
        offers: {
          coupon_applied: this.cart?.coupon,
          coupon_discount: discount,
        },
      },
      addressId,
    };
  }
  async call(name: string, args: Record<string, any>) {
    if (name === "get_addresses")
      return [
        {
          id: "mock-home",
          label: "Home",
          display: "Demo neighbourhood · synthetic address",
        },
        {
          id: "mock-office",
          label: "Office",
          display: "Demo business district · synthetic address",
        },
      ];
    if (name === "flush_food_cart") {
      this.cart = null;
      return { success: true };
    }
    if (!["mock-home", "mock-office"].includes(args.addressId))
      throw new Error("Choose a saved address first.");
    if (name === "search_restaurants" || name === "search_menu") {
      const q = String(args.query ?? "").toLowerCase();
      const terms = q
        .split(/\s+/)
        .filter(
          (t: string) =>
            t.length > 2 &&
            ![
              "cheap",
              "budget",
              "food",
              "anything",
              "meal",
              "filling",
              "under",
            ].includes(t),
        );
      const matches = dishes.filter(
        (x) =>
          (!terms.length ||
            terms.some((t: string) => x.name.toLowerCase().includes(t))) &&
          (!args.restaurantIdOfAddedItem ||
            x.r === args.restaurantIdOfAddedItem) &&
          (args.vegFilter !== 1 || x.veg) &&
          (args.collection !== "STORE_99" || x.price <= 99),
      );
      const offset = Number(args.offset ?? 0),
        page = matches.slice(offset, offset + 6);
      const results = page.map((d) => {
        const r = restaurants.find((r) => r.id === d.r)!;
        return {
          id: d.id,
          menu_item_id: d.id,
          name: d.name,
          price: d.price,
          isVeg: d.veg,
          inStock: d.stock ? 1 : 0,
          hasVariants: !!d.custom,
          restaurant_id: r.id,
          restaurantId: r.id,
          restaurant_name: r.name,
          restaurantName: r.name,
          deliveryTimeMinutes: r.deliveryTimeMinutes,
        };
      });
      return {
        restaurants: restaurants.filter((r) =>
          matches.some((x) => x.r === r.id),
        ),
        dishes: results,
        items: results,
        totalItems: matches.length,
        query: args.query,
        hasMore: offset + 6 < matches.length,
        nextOffset: offset + 6 < matches.length ? offset + 6 : undefined,
      };
    }
    if (name === "get_restaurant_menu") {
      const r = restaurants.find((x) => x.id === args.restaurantId);
      if (!r) throw new Error("Restaurant unavailable.");
      return {
        restaurant: {
          ...r,
          isOpen: r.availabilityStatus === "OPEN",
          deliveryTime: r.deliveryTimeMinutes,
        },
        items: dishes
          .filter((x) => x.r === r.id)
          .map((d) => ({
            id: d.id,
            name: d.name,
            price: d.price,
            isVeg: d.veg,
            inStock: d.stock ? 1 : 0,
            hasVariants: !!d.custom,
            categories: ["Meals"],
          })),
        truncated: false,
      };
    }
    if (name === "get_food_cart") return this.pricing(args.addressId);
    if (name === "update_food_cart") {
      const r = restaurants.find((x) => x.id === args.restaurantId);
      if (r?.availabilityStatus !== "OPEN")
        throw new Error("Restaurant is closed.");
      const items = args.cartItems.map((x: any) => ({
        id: x.menuItemId,
        quantity: x.quantity,
      }));
      for (const x of items) {
        const d = dishes.find((d) => d.id === x.id && d.r === r.id);
        if (!d?.stock || d.custom)
          throw new Error("Item unavailable or requires customization.");
        if (!Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 10)
          throw new Error("Invalid quantity.");
      }
      this.cart = { restaurantId: r.id, items, coupon: null };
      return this.pricing(args.addressId);
    }
    if (name === "fetch_food_coupons") {
      const total =
        this.cart?.restaurantId === args.restaurantId
          ? this.pricing(args.addressId).data.pricing.item_total
          : 0;
      return {
        coupon_sections: [
          {
            title: "Restaurant offers",
            coupons: [
              {
                id: "SAVE20",
                title: "20% off",
                subtitle: "Minimum ₹120 · maximum ₹50",
                applicable: total >= 120,
                applicabilityStatus:
                  total >= 120 ? "APPLICABLE" : "NOT_APPLICABLE",
                terms_and_conditions: {
                  bullet_texts: ["Valid for COD", "Minimum order ₹120"],
                },
              },
              {
                id: "FLAT40",
                title: "₹40 off",
                subtitle: "Minimum ₹180",
                applicable: total >= 180,
                applicabilityStatus:
                  total >= 180 ? "APPLICABLE" : "NOT_APPLICABLE",
              },
            ],
          },
          {
            title: "Payment offers",
            coupons: [
              {
                id: "CARD100",
                title: "₹100 with eligible card",
                subtitle:
                  "Requires online/card payment; not verified by this prototype",
                applicable: false,
                applicabilityStatus: "NOT_APPLICABLE",
              },
            ],
          },
        ],
        summary: {
          total_coupons: 3,
          applicable_coupons: Number(total >= 120) + Number(total >= 180),
          sections_count: 2,
          filter_applied: "COD-compatible verification only",
        },
      };
    }
    if (name === "apply_food_coupon") {
      if (!this.cart) throw new Error("Cart is empty.");
      if (!["SAVE20", "FLAT40"].includes(args.couponCode))
        throw new Error("Coupon not supported.");
      this.cart.coupon = args.couponCode;
      return this.pricing(args.addressId);
    }
    throw new Error("Tool is not allowed.");
  }
}
