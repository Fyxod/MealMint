import { randomBytes } from "node:crypto";
import type { FoodService } from "./service.js";
import type { Conversation } from "./types.js";
import { SecretStore, redact, safeEqual } from "./security.js";

export class TelegramBot {
  private offset = 0;
  private running = false;
  private owner: number | null = null;
  private code: { value: string; expiresAt: number } | null = null;
  private conversations = new Map<number, string>();
  private abort: AbortController | null = null;
  private username: string | null = null;
  constructor(
    private token: string,
    private service: FoodService,
    private store: SecretStore,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async api(
    method: string,
    data: unknown,
    signal?: AbortSignal,
  ): Promise<any> {
    const response = await this.fetcher(
      `https://api.telegram.org/bot${this.token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: signal ?? AbortSignal.timeout(15000),
      },
    );
    const raw: any = await response.json();
    if (!raw.ok)
      throw new Error(`Telegram ${method} failed (${response.status}).`);
    return raw.result;
  }
  async status() {
    return {
      configured: !!this.token,
      paired: this.owner !== null,
      username: this.username,
    };
  }
  async pairCode() {
    if (!this.token)
      throw new Error("Set TELEGRAM_BOT_TOKEN in .env and restart first.");
    if (!this.username) {
      const me = await this.api("getMe", {});
      this.username = me.username;
    }
    this.code = {
      value: randomBytes(18).toString("base64url"),
      expiresAt: Date.now() + 300000,
    };
    return {
      url: `https://t.me/${this.username}?start=${this.code.value}`,
      expiresAt: this.code.expiresAt,
    };
  }
  async start() {
    if (!this.token || this.running) return;
    const saved = await this.store.get<{ id: number }>("telegram-owner");
    this.owner = saved?.id ?? null;
    this.running = true;
    void this.poll();
  }
  stop() {
    this.running = false;
    this.abort?.abort();
  }
  private async poll() {
    while (this.running) {
      try {
        this.abort = new AbortController();
        const timeout = setTimeout(() => this.abort?.abort(), 55000);
        let updates: any[];
        try {
          updates = await this.api(
            "getUpdates",
            {
              offset: this.offset,
              timeout: 45,
              allowed_updates: ["message", "callback_query"],
            },
            this.abort.signal,
          );
        } finally {
          clearTimeout(timeout);
        }
        for (const update of updates) {
          this.offset = update.update_id + 1;
          try {
            await this.handle(update);
          } catch {
            /* No raw Telegram payload logging. */
          }
        }
      } catch {
        if (this.running)
          await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    }
  }
  private async send(chat: number, text: string, buttons?: any[]) {
    return this.api("sendMessage", {
      chat_id: chat,
      text: text.slice(0, 4000),
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }
  private conversation(chat: number) {
    const id = this.conversations.get(chat);
    if (id) {
      try {
        return this.service.get(id);
      } catch {}
    }
    const c = this.service.create("telegram");
    this.conversations.set(chat, c.id);
    return c;
  }
  async handle(update: any) {
    const message = update.message ?? update.callback_query?.message,
      user = update.message?.from ?? update.callback_query?.from;
    if (
      !message ||
      !user ||
      message.chat.type !== "private" ||
      message.chat.id !== user.id
    )
      return;
    const chat = message.chat.id,
      text: string = update.message?.text ?? "";
    if (
      text.startsWith("/start ") &&
      this.code &&
      this.code.expiresAt > Date.now() &&
      safeEqual(text.slice(7).trim(), this.code.value)
    ) {
      this.owner = user.id;
      this.code = null;
      await this.store.set("telegram-owner", { id: user.id });
      await this.send(
        chat,
        "Connected to your personal food assistant. Use /addresses to choose a delivery address, then tell me your budget and preferences.",
      );
      return;
    }
    if (user.id !== this.owner) return; // No account information to unpaired chats.
    const c = this.conversation(chat);
    if (update.callback_query) {
      await this.api("answerCallbackQuery", {
        callback_query_id: update.callback_query.id,
      });
      const data: string = update.callback_query.data ?? "";
      if (data.startsWith("address:")) {
        const addresses = await this.service.addresses();
        const a = addresses[Number(data.slice(8))];
        if (!a) return;
        await this.service.selectAddress(c.id, a.id);
        await this.send(
          chat,
          `Delivery address: ${a.label}. Tell me your budget including delivery and food preferences.`,
        );
      } else if (data.startsWith("compare:")) {
        try {
          await this.service.requestComparison(c.id, [data.slice(8)]);
          await this.render(chat, c);
        } catch (e) {
          await this.send(chat, redact((e as Error).message));
        }
      } else if (data.startsWith("approve:")) {
        const approvalId = data.slice(8);
        await this.send(
          chat,
          "Checking delivered totals. Please leave your Swiggy cart unchanged during the comparison.",
        );
        void this.service
          .approve(c.id, approvalId)
          .then(() => this.render(chat, c))
          .catch((e) => this.send(chat, redact(e.message)));
      } else if (data === "cancel") {
        await this.service.cancel(c.id);
        await this.send(chat, "Stopped.");
      }
      return;
    }
    if (text === "/start" || text === "/help") {
      await this.send(
        chat,
        "Tell me your budget and preferences naturally. /addresses chooses location, /new starts fresh, /cancel stops a search. Data source: " +
          (this.service.gateway.mode === "mock"
            ? "synthetic demo catalogue."
            : "Swiggy Food MCP."),
      );
      return;
    }
    if (text === "/addresses") {
      const addresses = await this.service.addresses();
      await this.send(
        chat,
        addresses.length
          ? "Choose a saved delivery address:"
          : "No saved addresses. Add one in Swiggy first.",
        addresses.map((a, i) => [
          { text: a.label, callback_data: `address:${i}` },
        ]),
      );
      return;
    }
    if (text === "/new") {
      if (c.busy) {
        await this.send(
          chat,
          "Use /cancel, then wait for the operation to finish before starting fresh.",
        );
        return;
      }
      this.service.remove(c.id);
      this.conversations.delete(chat);
      await this.send(chat, "New conversation. Use /addresses first.");
      return;
    }
    if (text === "/cancel") {
      await this.service.cancel(c.id);
      await this.send(chat, "Stopping the current operation.");
      return;
    }
    if (!text.trim()) {
      await this.send(chat, "Text chat is supported in this version.");
      return;
    }
    if (c.busy) {
      await this.send(chat, "A reply is in progress. Use /cancel to stop it.");
      return;
    }
    await this.send(chat, "Looking for options…");
    void this.service
      .chat(c.id, text)
      .then(() => this.render(chat, c))
      .catch((e) => this.send(chat, redact(e.message)));
  }
  private async render(chat: number, c: Conversation) {
    const last = c.messages.at(-1);
    if (last?.role === "assistant") await this.send(chat, last.text);
    if (c.error) await this.send(chat, c.error);
    if (c.quotes.length)
      await this.send(
        chat,
        c.quotes
          .map(
            (q, i) =>
              `${i + 1}. ${q.name} · ${q.restaurant}\n₹${q.total.toFixed(2)} delivered for ${q.quantity} ${q.bundle ? "bundle(s)" : "item(s)"}${q.coupon ? ` · ${q.coupon}${q.discount > 0 ? `, saving ₹${q.discount}` : ""}` : ""}${q.withinBudget ? "" : " · over budget"}`,
          )
          .join("\n\n") +
          "\n\nLowest among checked options. Refresh before checkout.",
      );
    else if (c.candidates.length)
      await this.send(
        chat,
        c.candidates
          .map(
            (x, i) =>
              `${i + 1}. ${x.name} · ${x.restaurant}\n₹${x.price} listed · ${x.eta ?? "?"} min${x.lines ? " · quantities per bundle" : ""}${x.dealHypothesis ? " · coupon savings unverified" : ""}${x.customizable ? " · needs customization" : ""}`,
          )
          .join("\n\n"),
        c.candidates
          .filter((x) => !x.customizable)
          .slice(0, 6)
          .map((x, i) => [
            {
              text: `Check ${x.name}`.slice(0, 40),
              callback_data: `compare:${x.id}`,
            },
          ]),
      );
    if (c.approval?.status === "pending") {
      if (c.approval.discardExisting)
        await this.send(
          chat,
          "Your Swiggy cart already has items. Empty it in Swiggy if you want to compare, then request a new comparison here.",
        );
      else
        await this.send(
          chat,
          "Check these exact options by temporarily changing your Swiggy cart?\n\n" +
            c.approval.plans
              .map(
                (x) =>
                  `${x.name} · ${x.restaurant}\n${c.approval!.request.quantity} ${x.lines ? "bundle(s)" : "item(s)"} · ₹${((x.price ?? 0) * c.approval!.request.quantity).toFixed(2)} listed subtotal`,
              )
              .join("\n\n") +
            "\n\nThe test cart will be cleared afterward. No orders will be placed.",
          [
            [
              {
                text: "Approve comparison",
                callback_data: `approve:${c.approval.id}`,
              },
              { text: "Cancel", callback_data: "cancel" },
            ],
          ],
        );
    }
  }
}
