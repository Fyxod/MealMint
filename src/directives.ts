import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { UserDirective } from "./types.js";
import type { SecretStore } from "./security.js";

export const directiveSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    source: z.enum(["user", "inferred"]),
  })
  .strict();

// One owner's durable preferences, independent of conversation history. Serialize
// updates because web and Telegram may remember something at the same time.
export class DirectiveStore {
  private queue: Promise<unknown> = Promise.resolve();
  private volatile: UserDirective[] = [];
  constructor(private secrets?: SecretStore) {}
  private async read() {
    return this.secrets
      ? ((await this.secrets.get<UserDirective[]>("user-directives")) ?? [])
      : this.volatile;
  }
  private async write(items: UserDirective[]) {
    if (this.secrets) await this.secrets.set("user-directives", items);
    else this.volatile = items;
  }
  async list() {
    await this.queue;
    return structuredClone(await this.read());
  }
  private update<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  save(input: unknown) {
    const value = directiveSchema.parse(input);
    // Credentials are never useful food preferences. Reject recognizable secrets
    // rather than retaining them in agent context; ordinary directives remain text.
    if (
      /Bearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+\b|\b\d{6,}:[\w-]{20,}\b|\b(?:access_token|refresh_token|api_key|password)\s*[:=]/i.test(
        value.text,
      )
    )
      throw new Error("Store preferences, not credentials.");
    return this.update(async () => {
      const items = await this.read();
      const duplicate = items.find(
        (x) => x.text.toLocaleLowerCase() === value.text.toLocaleLowerCase(),
      );
      if (duplicate) {
        if (value.source === "user" && duplicate.source !== "user") {
          duplicate.source = "user";
          await this.write(items);
        }
        return structuredClone(duplicate);
      }
      if (items.length >= 30)
        throw new Error(
          "Saved directives are full. Remove an outdated one in settings first.",
        );
      const item: UserDirective = {
        id: randomUUID(),
        ...value,
        createdAt: new Date().toISOString(),
      };
      await this.write([...items, item]);
      return item;
    });
  }
  remove(id: string) {
    z.string().uuid().parse(id);
    return this.update(async () => {
      const items = await this.read();
      await this.write(items.filter((x) => x.id !== id));
      return { removed: items.some((x) => x.id === id) };
    });
  }
}
