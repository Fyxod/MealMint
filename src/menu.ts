// The live gateway supports both flat menus and category/subcategory pages.
// Deduplicate only identical item IDs: similarly named promotional and regular
// listings must remain distinct so the agent can compare their eligibility.
export function menuItems(raw: any): any[] {
  const items: any[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.items)) items.push(...node.items);
    for (const key of ["categories", "subcategories"])
      if (Array.isArray(node[key])) node[key].forEach(visit);
  };
  visit(raw);
  const seen = new Set<string>();
  return items.filter(item => {
    const id = item?.menu_item_id ?? item?.id;
    if (id === undefined || id === null) return false;
    if (seen.has(String(id))) return false;
    seen.add(String(id));
    return true;
  });
}

export function menuTruncated(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  return raw.truncated === true || raw.hasMore === true || raw.hasMoreItems === true ||
    ["categories", "subcategories"].some(key => Array.isArray(raw[key]) && raw[key].some(menuTruncated));
}

export function restaurantOpen(restaurant: any): boolean {
  if (!restaurant || restaurant.isOpen === false ||
      (typeof restaurant.availabilityStatus === "string" && restaurant.availabilityStatus !== "OPEN")) return false;
  return restaurant.availabilityStatus === "OPEN" || restaurant.isOpen === true;
}
