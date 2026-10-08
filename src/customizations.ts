import type { ChoiceGroup, ChoiceRef, CustomizationDetails, ItemSelection } from "./types.js";

const identifier = (value: unknown) => {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value) || String(value).length > 100)
    throw new Error("Incomplete customization identifiers. Refresh the menu.");
  return String(value);
};
function group(raw: any, variant: boolean): ChoiceGroup {
  const choices = raw.choices ?? raw.variations ?? raw.addons;
  if (!Array.isArray(choices) || !choices.length || choices.length > 100)
    throw new Error("Unsupported customization choices. Refresh the menu.");
  const min = variant ? 1 : raw.minAddons ?? 0;
  const limit = variant ? 1 : raw.maxAddons;
  const max = limit === undefined || limit === 0 || limit === -1 ? null : limit;
  if (!Number.isInteger(min) || min < 0 || (max !== null && (!Number.isInteger(max) || max < min)))
    throw new Error("Unsupported customization limits.");
  const result = {
    id: identifier(raw.groupId ?? raw.group_id),
    name: String(raw.groupName ?? raw.group_name ?? raw.name ?? "Choices").slice(0, 150),
    min, max,
    choices: choices.map((c: any) => ({
      id: identifier(c.id ?? c.choice_id ?? c.choiceId),
      name: String(c.name ?? "Choice").slice(0, 150),
      price: typeof c.price === "number" && Number.isFinite(c.price) && c.price >= 0 ? c.price : null,
      available: c.inStock !== 0 && c.inStock !== false && c.in_stock !== false && c.in_stock !== 0,
      isDefault: c.default === 1 || c.default === true,
      isVeg: typeof c.isVeg === "boolean" ? c.isVeg : c.isVeg === 1 ? true : c.isVeg === 0 ? false : null,
    })),
  };
  if (new Set(result.choices.map(c => c.id)).size !== result.choices.length)
    throw new Error("Ambiguous customization choices.");
  return result;
}
export function customizationDetails(item: any): CustomizationDetails {
  const legacy = item.variations ?? [], modern = item.variantsV2 ?? [];
  if (!Array.isArray(legacy) || !Array.isArray(modern) || (legacy.length && modern.length))
    throw new Error("Unsupported variant format. Refresh the menu.");
  const grouped = new Map<string, any>();
  for (const choice of legacy) {
    const id = identifier(choice.groupId ?? choice.group_id);
    const g = grouped.get(id) ?? { groupId: id, name: choice.groupName ?? "Variant", variations: [] };
    g.variations.push(choice); grouped.set(id, g);
  }
  const variants = (modern.length ? modern : [...grouped.values()]).map(x => group(x, true));
  let addons: ChoiceGroup[] = (item.addons ?? []).map((x: any) => group(x, false));
  if (new Set(addons.map(x => x.id)).size !== addons.length)
    throw new Error("Ambiguous customization groups.");
  // Some live menus flatten add-on groups from every meal variant. Fixed
  // zero-price "Selected ..." choices represent the item itself, not extras.
  // The server decides which fixed choice belongs to the approved variant.
  const normalizedName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const baseName = normalizedName(String(item.name ?? ""));
  const fixed = variants.length ? addons.filter(g => g.min === 1 && g.max === 1 &&
    g.choices.length === 1 && g.choices[0].available && g.choices[0].price === 0 &&
    (/^selected\b/i.test(g.choices[0].name) ||
      (/^selected\b/i.test(g.name) && baseName.length >= 6 && normalizedName(g.choices[0].name) === baseName))) : [];
  const bootstrap = fixed.map(g => ({ groupId: g.id, choiceId: g.choices[0].id }));
  if (bootstrap.length > 3) throw new Error("Unsupported fixed variant choices. Use another dish.");
  if (bootstrap.length) addons = addons.filter(g => !fixed.includes(g)).map(g => ({ ...g, conditionalMin: g.min, min: 0 }));
  if (variants.length + addons.length + bootstrap.length > 30 || (item.hasVariants && !variants.length) || (item.hasAddons && !addons.length && !bootstrap.length))
    throw new Error("Swiggy did not return complete customization choices. Refresh this dish.");
  if (new Set(variants.map(x => x.id)).size !== variants.length || new Set(addons.map((x: ChoiceGroup) => x.id)).size !== addons.length)
    throw new Error("Ambiguous customization groups.");
  return { format: modern.length ? "variantsV2" : legacy.length ? "variants" : null, variants, addons,
    ...(bootstrap.length ? { bootstrap } : {}) };
}
function validateGroups(groups: ChoiceGroup[], refs: ChoiceRef[]) {
  if (new Set(refs.map(x => `${x.groupId}:${x.choiceId}`)).size !== refs.length)
    throw new Error("Choose each option once.");
  for (const ref of refs) {
    const g = groups.find(x => x.id === ref.groupId);
    if (!g?.choices.some(x => x.id === ref.choiceId && x.available))
      throw new Error("A selected option is unavailable. Refresh the choices.");
  }
  for (const g of groups) {
    const count = refs.filter(x => x.groupId === g.id).length;
    if (count < g.min || (g.max !== null && count > g.max))
      throw new Error(`${g.name}: choose ${g.min === g.max ? g.min : `at least ${g.min}${g.max === null ? "" : ` and at most ${g.max}`}`} option(s).`);
  }
}
export function selectCustomizations(details: CustomizationDetails, variants: ChoiceRef[], addons: ChoiceRef[]): ItemSelection {
  validateGroups(details.variants, variants); validateGroups(details.addons, addons);
  const sort = (refs: ChoiceRef[]) => [...refs].sort((a,b) => `${a.groupId}:${a.choiceId}`.localeCompare(`${b.groupId}:${b.choiceId}`));
  return {
    format: details.format, variants: sort(variants), addons: sort(addons),
    ...(details.bootstrap ? { bootstrap: details.bootstrap } : {}),
    summary: [...variants.map(ref => details.variants.find(g => g.id === ref.groupId)!.choices.find(c => c.id === ref.choiceId)!.name),
      ...addons.map(ref => details.addons.find(g => g.id === ref.groupId)!.choices.find(c => c.id === ref.choiceId)!.name),
      ...(details.bootstrap ? ["Swiggy verifies the required fixed item choice"] : []),
      ...(!addons.length && details.addons.length ? ["No optional add-ons"] : [])],
  };
}
export function selectionPayload(selection: ItemSelection | undefined, includeAddons = true) {
  if (!selection) return {};
  return {
    ...(selection.format && selection.variants.length ? {
      [selection.format]: selection.variants.map(x => ({ group_id: x.groupId, variation_id: x.choiceId })),
    } : {}),
    ...(includeAddons && selection.addons.length ? {
      addons: selection.addons.map(x => ({ group_id: x.groupId, choice_id: x.choiceId })),
    } : {}),
  };
}
function cartRefs(raw: any, expected: ChoiceRef[]) {
  if (!Array.isArray(raw)) throw new Error("Unsupported cart customization response.");
  return raw.map(x => {
    const id = identifier(x.variation_id ?? x.variationId ?? x.choice_id ?? x.choiceId ?? x.id);
    const matches = expected.filter(ref => ref.choiceId === id);
    const gid = x.group_id ?? x.groupId ?? (matches.length === 1 ? matches[0].groupId : undefined);
    return { groupId: identifier(gid), choiceId: id };
  });
}
export function sameChoices(a: ChoiceRef[], b: ChoiceRef[]) {
  const key = (refs: ChoiceRef[]) => JSON.stringify(refs.map(x => [x.groupId, x.choiceId]).sort());
  return key(a) === key(b);
}
export function variantsMatch(selection: ItemSelection, item: any) {
  // Swiggy includes an internal default variant even for items whose menu exposes
  // no variant group. Only explicit menu choices have IDs the user can select.
  if (selection.format === null && selection.variants.length === 0) return true;
  try { return sameChoices(selection.variants, cartRefs(item.variants ?? item.variantsV2 ?? [], selection.variants)); }
  catch { return false; }
}
export function selectionsMatch(selection: ItemSelection, item: any) {
  try {
    const refs = cartRefs(item.addons ?? [], [...selection.addons, ...(selection.bootstrap ?? [])]);
    const explicit = refs.filter(ref => !selection.bootstrap?.some(x => x.groupId === ref.groupId && x.choiceId === ref.choiceId));
    return variantsMatch(selection, item) && sameChoices(selection.addons, explicit);
  }
  catch { return false; }
}
export function validateCartAddons(selection: ItemSelection, valid: any) {
  if (!Array.isArray(valid)) {
    if (selection.addons.length) throw new Error("Selected add-ons could not be verified for this variant.");
    return;
  }
  const groups = valid.map(x => group(x, false)).filter(g => !selection.bootstrap?.some(x => x.groupId === g.id));
  // For flattened variant menus, minAddons belongs to all variants. A successful
  // cart response validates the actual variant's minimums; enforce IDs/max here.
  validateGroups(selection.bootstrap?.length ? groups.map(g => ({ ...g, min: 0 })) : groups, selection.addons);
}
