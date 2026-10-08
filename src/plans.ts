import type { Candidate } from "./types.js";

// Use the frozen approval multiplier, not mutable conversation preferences.
export function cartPlanItems(plan: Candidate, multiplier: number) {
  return (plan.lines ?? [{ itemId: plan.itemId, name: plan.name, quantity: 1 }])
    .map(line => ({ itemId: line.itemId, name: line.name, quantity: line.quantity * multiplier }));
}

export function cartPlanLabel(plan: Candidate, multiplier: number) {
  return cartPlanItems(plan, multiplier).map(item => `${item.quantity} × ${item.name}`).join(" + ");
}
