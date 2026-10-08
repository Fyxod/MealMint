import { randomBytes } from "node:crypto";
import type { FoodService } from "./service.js";
import type { Address, ChoiceRef, CustomizationDetails, Conversation } from "./types.js";
import { SecretStore, redact, safeEqual } from "./security.js";

export class TelegramBot {
  private offset = 0;
  private running = false;
  private owner: number | null = null;
  private code: { value: string; expiresAt: number } | null = null;
  private conversations = new Map<number, string>();
  private renderedAssistant = new Map<number, string>();
  private renderedOptions = new Map<number, string>();
  private renderedApproval = new Map<number, string>();
  private abort: AbortController | null = null;
  private username: string | null = null;
  private addressMenu: { nonce: string; choices: Address[]; expiresAt: number } | null = null;
  private customMenu: { nonce: string; conversationId: string; candidateId: string; name: string; details: CustomizationDetails; variants: ChoiceRef[]; addons: ChoiceRef[]; expiresAt: number; page: number; messageId?: number } | null = null;
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
    const chunks: string[] = [];
    for (let remaining = text; remaining.length;) {
      const boundary = remaining.length > 3900 ? remaining.lastIndexOf("\n", 3900) : remaining.length;
      const end = boundary > 100 ? boundary : Math.min(3900, remaining.length);
      chunks.push(remaining.slice(0, end)); remaining = remaining.slice(end).replace(/^\n/, "");
    }
    let result: any;
    for (let index = 0; index < chunks.length; index++) result = await this.api("sendMessage", {
      chat_id: chat, text: chunks[index],
      ...(buttons && index === chunks.length - 1 ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
    return result;
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
    try { await this.handleUpdate(update); }
    catch (e) {
      const message = update.message ?? update.callback_query?.message;
      const user = update.message?.from ?? update.callback_query?.from;
      if (message?.chat?.type === "private" && user?.id === this.owner && message.chat.id === user.id)
        await this.send(user.id, redact((e as Error).message));
    }
  }
  private async handleUpdate(update: any) {
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
        "Connected to MealMint, your personal food assistant. Use /addresses to choose a delivery address, then tell me your budget and preferences.",
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
      try {
      if (data.startsWith("customize:")) {
        if (c.busy) throw new Error("Wait for the current operation to finish.");
        const candidateId = data.slice(10);
        const options = await this.service.customizationOptions(c.id, candidateId);
        const current = c.candidates.find(x => x.id === candidateId)?.selection;
        this.customMenu = { ...options, nonce: randomBytes(6).toString("base64url"), conversationId: c.id, variants: current?.variants ?? [], addons: current?.addons ?? [], expiresAt: Date.now() + 300000, page: 0 };
        await this.renderCustom(chat);
      } else if (data.startsWith("choice:")) {
        const [, nonce, action, index, choiceIndex] = data.split(":");
        const menu = this.customMenu;
        if (!menu || menu.conversationId !== c.id || menu.expiresAt < Date.now() || !safeEqual(nonce ?? "", menu.nonce)) throw new Error("Customization choices expired. Open Customize again.");
        if (c.busy) throw new Error("Wait for the current operation to finish.");
        const groups = [...menu.details.variants.map(group => ({ kind: "variants" as const, group })), ...menu.details.addons.map(group => ({ kind: "addons" as const, group }))];
        if (action === "cancel") { this.customMenu = null; await this.send(chat, "Choices cancelled. Your cart was not changed."); return; }
        if (action === "save") {
          this.service.configure(c.id, menu.candidateId, { variants: menu.variants, addons: menu.addons });
          this.customMenu = null;
          await this.send(chat, "Choices saved. Check the delivered total before deciding.");
          await this.render(chat, c); return;
        }
        if (action === "page") {
          const page = Number(index);
          if (!Number.isInteger(page) || page < 0 || page >= groups.length) throw new Error("Invalid choice page.");
          if (menu.page === page) return;
          menu.page = page;
        } else if (action === "pick") {
          if (!/^\d+$/.test(index ?? "") || Number(index) !== menu.page) throw new Error("That group changed. Use the current choice buttons.");
          const { kind, group } = groups[menu.page];
          const choice = group.choices[Number(choiceIndex)];
          if (!/^\d+$/.test(choiceIndex ?? "") || !choice?.available) throw new Error("Choice unavailable.");
          const refs = menu[kind];
          const selected = refs.some(x => x.groupId === group.id && x.choiceId === choice.id);
          if (kind === "variants" && selected) return;
          if (kind === "addons" && !selected && group.max !== null && refs.filter(x => x.groupId === group.id).length >= group.max) throw new Error(`Choose at most ${group.max} in ${group.name}.`);
          menu[kind] = kind === "variants" ? [...refs.filter(x => x.groupId !== group.id), { groupId: group.id, choiceId: choice.id }]
            : selected ? refs.filter(x => x.groupId !== group.id || x.choiceId !== choice.id) : [...refs, { groupId: group.id, choiceId: choice.id }];
        } else throw new Error("Unknown choice action.");
        await this.renderCustom(chat);
      } else if (data.startsWith("address:")) {
        const [, nonce, index] = data.split(":");
        const menu = this.addressMenu;
        if (!menu || menu.expiresAt < Date.now() || !safeEqual(nonce ?? "", menu.nonce) || !/^\d+$/.test(index ?? "")) {
          await this.send(chat, "Address choices expired. Use /addresses again.");
          return;
        }
        const a = menu.choices[Number(index)];
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
      } else if (data.startsWith("approve:") || data.startsWith("discardapprove:")) {
        const discardExisting = data.startsWith("discardapprove:");
        const approvalId = data.slice(discardExisting ? 15 : 8);
        const wasBusy = c.busy;
        const operation = this.service.approve(c.id, approvalId, discardExisting)
          .then(result => ({ result, error: null }), error => ({ result: null, error }));
        if (!wasBusy && c.busy && c.approval?.id === approvalId && c.approval.status === "running")
          await this.send(chat, "Checking delivered totals. Please leave your Swiggy cart unchanged during the comparison.");
        void operation.then(({ error }) => error ? this.send(chat, redact(error.message)) : this.render(chat, c));
      } else if (data === "cancel") {
        await this.service.cancel(c.id);
        await this.send(chat, c.busy ? "Stopping the current operation. Please wait for cleanup to finish." : "Stopped. Ready for your next message.");
      }
      } catch (e) { await this.send(chat, redact((e as Error).message)); }
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
      const nonce = randomBytes(6).toString("base64url");
      this.addressMenu = { nonce, choices: addresses, expiresAt: Date.now() + 300000 };
      await this.send(
        chat,
        addresses.length
          ? "Choose a saved delivery address:"
          : "No saved addresses. Add one in Swiggy first.",
        addresses.map((a, i) => [
          { text: `${a.label}${a.display ? " — " + a.display : ""}`.slice(0, 100), callback_data: `address:${nonce}:${i}` },
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
      this.renderedAssistant.delete(chat);
      this.renderedOptions.delete(chat);
      this.renderedApproval.delete(chat);
      this.addressMenu = null;
      this.customMenu = null;
      await this.send(chat, "New conversation. Use /addresses first.");
      return;
    }
    if (text === "/cancel") {
      await this.service.cancel(c.id);
      await this.send(chat, c.busy ? "Stopping the current operation. Please wait for cleanup to finish." : "Stopped. Ready for your next message.");
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
  private async renderCustom(chat: number) {
    const menu = this.customMenu!;
    const groups = [...menu.details.variants.map(group => ({ kind: "variants" as const, group })), ...menu.details.addons.map(group => ({ kind: "addons" as const, group }))];
    const current = groups[menu.page];
    const buttons: any[] = current ? current.group.choices.map((choice, index) => [{
      text: `${menu[current.kind].some(x => x.groupId === current.group.id && x.choiceId === choice.id) ? "✓ " : ""}${choice.name}${choice.price === null ? "" : ` · ₹${choice.price}`}${choice.available ? "" : " · unavailable"}`.slice(0, 100),
      callback_data: `choice:${menu.nonce}:pick:${menu.page}:${index}`,
    }]) : [];
    if (groups.length > 1) buttons.push([
      ...(menu.page > 0 ? [{ text: "Previous group", callback_data: `choice:${menu.nonce}:page:${menu.page - 1}` }] : []),
      ...(menu.page < groups.length - 1 ? [{ text: "Next group", callback_data: `choice:${menu.nonce}:page:${menu.page + 1}` }] : []),
    ]);
    buttons.push([{ text: "Save choices", callback_data: `choice:${menu.nonce}:save` }, { text: "Cancel choices", callback_data: `choice:${menu.nonce}:cancel` }]);
    const text = `Customize ${menu.name}\n\n${current ? `${menu.page + 1}/${groups.length}: ${current.group.name}\n${current.group.conditionalMin ? `May require ${current.group.conditionalMin} for your meal variant` : current.group.min ? `Required: at least ${current.group.min}` : "Optional"}${current.group.max === null ? "" : ` · up to ${current.group.max}`}` : "No additional choices"}\n\n${menu.variants.length + menu.addons.length} choices selected. Listed option prices may not be additive. Final price and valid add-ons are checked in the cart after approval.`;
    if (menu.messageId) await this.api("editMessageText", { chat_id: chat, message_id: menu.messageId, text, reply_markup: { inline_keyboard: buttons } });
    else menu.messageId = (await this.send(chat, text, buttons)).message_id;
  }
  private async render(chat: number, c: Conversation) {
    const last = c.messages.at(-1);
    if (last?.role === "assistant" && this.renderedAssistant.get(chat) !== last.id) {
      await this.send(chat, last.text);
      this.renderedAssistant.set(chat, last.id);
    }
    if (c.error) await this.send(chat, c.error);
    const signature = JSON.stringify([c.candidates, c.quotes, c.comparison]);
    const changedOptions = this.renderedOptions.get(chat) !== signature;
    if (changedOptions && c.quotes.length)
      await this.send(
        chat,
        c.quotes
          .map(
            (q, i) =>
              `${i + 1}. ${q.name} · ${q.restaurant}\n₹${q.total.toFixed(2)} delivered for ${q.quantity} ${q.bundle ? "bundle(s)" : "item(s)"}${q.coupon ? ` · ${q.coupon}${q.discount > 0 ? `, saving ₹${q.discount}` : ""}` : ""}${q.withinBudget ? "" : " · over budget"}`,
          )
          .join("\n\n") +
          `\n\n${c.comparison && c.comparison.checked < c.comparison.requested ? `Partial comparison: ${c.comparison.checked}/${c.comparison.requested} options checked. ` : ""}Lowest among successfully checked options. Refresh before checkout.`,
      );
    else if (changedOptions && c.candidates.length)
      await this.send(
        chat,
        c.candidates
          .map(
            (x, i) =>
              `${i + 1}. ${x.name} · ${x.restaurant}\n${x.price === null ? "Price needs cart check" : `₹${x.price} listed`} · ${x.eta ?? "?"} min${x.lines ? " · quantities per bundle" : ""}${x.dealHypothesis ? " · coupon savings unverified" : ""}${x.customizable ? " · needs customization" : ""}`,
          )
          .join("\n\n"),
        c.candidates
          .slice(0, 6)
          .map((x, i) => [
            ...(x.selection ? [{ text: "Edit choices", callback_data: `customize:${x.id}` }] : []),
            {
              text: `${x.customizable ? "Customize" : "Check"} ${x.name}`.slice(0, 40),
              callback_data: `${x.customizable ? "customize" : "compare"}:${x.id}`,
            },
          ]),
      );
    this.renderedOptions.set(chat, signature);
    if (c.approval?.status === "pending" && this.renderedApproval.get(chat) !== c.approval.id) {
        await this.send(
          chat,
          (c.approval.discardExisting ? "Your Swiggy cart already has items. Approving will DISCARD those items.\n\n" : "") + "Check these exact options by temporarily changing your Swiggy cart?\n\n" +
            c.approval.plans
              .map(
                (x) =>
                  `${x.name} · ${x.restaurant}\n${c.approval!.request.quantity} ${x.lines ? "bundle(s)" : "item(s)"} · ${x.price === null ? "Subtotal needs cart check" : `₹${(x.price * c.approval!.request.quantity).toFixed(2)} listed subtotal`}`,
              )
              .join("\n\n") +
            "\n\nThe test cart will be cleared afterward. No orders will be placed.",
          [
            [
              {
                text: c.approval.discardExisting ? "Discard cart & approve" : "Approve comparison",
                callback_data: `${c.approval.discardExisting ? "discardapprove" : "approve"}:${c.approval.id}`,
              },
              { text: "Cancel", callback_data: "cancel" },
            ],
          ],
        );
        this.renderedApproval.set(chat, c.approval.id);
    }
  }
}
