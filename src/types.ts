export type Diet = "any" | "veg" | "nonveg";
export interface MealRequest {
  budget: number | null;
  diet: Diet;
  quantity: number;
  maxMinutes: number | null;
  excluded: string[];
  addressId: string | null;
}
export interface Address {
  id: string;
  label: string;
  display: string;
}
export interface Candidate {
  id: string;
  itemId: string;
  restaurantId: string;
  name: string;
  restaurant: string;
  price: number | null;
  isVeg: boolean | null;
  eta: number | null;
  rating: number | null;
  available: boolean;
  customizable: boolean;
  offer: string | null;
  source: "mock" | "live";
  lines?: { itemId: string; name: string; quantity: number }[];
  dealHypothesis?: boolean;
}
export interface UserDirective {
  id: string;
  text: string;
  source: "user" | "inferred";
  createdAt: string;
}
export interface Quote {
  candidateId: string;
  name: string;
  restaurant: string;
  quantity: number;
  itemTotal: number;
  delivery: number | null;
  charges: number | null;
  discount: number;
  coupon: string | null;
  total: number;
  checkedAt: string;
  withinBudget: boolean;
  source: "mock" | "live";
  bundle?: boolean;
}
export interface Approval {
  id: string;
  candidateIds: string[];
  plans: Candidate[];
  expiresAt: number;
  request: MealRequest;
  fingerprint: string;
  status: "pending" | "running" | "done" | "cancelled";
  discardExisting: boolean;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}
export interface Conversation {
  id: string;
  channel: "web" | "telegram";
  request: MealRequest;
  messages: Message[];
  candidates: Candidate[];
  quotes: Quote[];
  approval: Approval | null;
  busy: boolean;
  error: string | null;
  status: string;
  coverage: { queries: string[]; restaurants: number; hasMore: boolean };
  updatedAt: number;
}
export type AgentEvent = {
  type: "status" | "delta" | "message" | "state" | "error";
  text?: string;
  conversationId?: string;
};
export interface ToolSpec {
  type: "function";
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface AgentProvider {
  status(): Promise<{
    connected: boolean;
    provider: string;
    model?: string;
    detail?: string;
  }>;
  turn(
    conversationId: string,
    text: string,
    tools: ToolSpec[],
    dispatch: (name: string, args: unknown) => Promise<unknown>,
    emit: (event: AgentEvent) => void,
  ): Promise<string>;
  cancel(conversationId: string): Promise<void>;
  forget?(conversationId: string): Promise<void>;
  close(): Promise<void>;
}
export interface FoodGateway {
  mode: "mock" | "live";
  call(name: string, args: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}
export const defaultRequest = (): MealRequest => ({
  budget: null,
  diet: "any",
  quantity: 1,
  maxMinutes: null,
  excluded: [],
  addressId: null,
});
