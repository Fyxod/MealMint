import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import path from "node:path";
import { z } from "zod";
import { CodexProvider, DemoProvider } from "./codex.js";
import { LiveFoodGateway } from "./food.js";
import { MockFoodGateway } from "./mock.js";
import { FoodService, preferencesSchema } from "./service.js";
import { SecretStore, redact, safeEqual } from "./security.js";
import { SwiggyOAuth } from "./oauth.js";
import { TelegramBot } from "./telegram.js";
import { DirectiveStore } from "./directives.js";

export interface AppOptions {
  service?: FoodService;
  host?: string;
  port?: number;
  accessToken?: string;
  origin?: string;
  dataDir?: string;
  telegramToken?: string;
  provider?: "codex" | "demo";
  mode?: "mock" | "live";
}
export async function createApp(options: AppOptions = {}) {
  const host = options.host ?? process.env.HOST ?? "127.0.0.1",
    port = options.port ?? Number(process.env.PORT ?? 3000);
  const local = ["127.0.0.1", "localhost", "::1"].includes(host),
    accessToken = options.accessToken ?? process.env.APP_ACCESS_TOKEN ?? "";
  const origin =
    options.origin ?? process.env.APP_ORIGIN ?? `http://localhost:${port}`;
  if (
    (!local || origin.startsWith("https://")) &&
    (!accessToken || accessToken.length < 24 || !origin.startsWith("https://"))
  )
    throw new Error(
      "Hosted use requires HTTPS APP_ORIGIN and an APP_ACCESS_TOKEN of at least 24 characters.",
    );
  const app = Fastify({ logger: false, bodyLimit: 16384, trustProxy: !local });
  const store = new SecretStore(
    options.dataDir ?? path.resolve(".local/secrets"),
  );
  const endpoint = process.env.SWIGGY_MCP_URL ?? "https://mcp.swiggy.com/food";
  const oauth = new SwiggyOAuth(
    store,
    process.env.SWIGGY_REDIRECT_URI ??
      `http://localhost:${port}/auth/swiggy/callback`,
    new URL(endpoint).origin,
  );
  const agent =
    options.service?.agent ??
    ((options.provider ?? process.env.AGENT_PROVIDER) === "demo"
      ? new DemoProvider()
      : new CodexProvider({
          bin: process.env.CODEX_BIN,
          model: process.env.CODEX_MODEL || "gpt-6-luna",
          effort: process.env.CODEX_EFFORT || "max",
        }));
  const service =
    options.service ??
    new FoodService(
      (options.mode ?? process.env.SWIGGY_MODE ?? "mock") === "live"
        ? new LiveFoodGateway(endpoint, () => oauth.token())
        : new MockFoodGateway(),
      agent,
      {
        liveQuotesValidated:
          process.env.SWIGGY_LIVE_QUOTES_VALIDATED === "true",
        cartItemIdField: process.env.SWIGGY_CART_ITEM_ID_FIELD,
        directives: new DirectiveStore(store),
      },
    );
  const telegram = new TelegramBot(
    options.telegramToken ?? process.env.TELEGRAM_BOT_TOKEN ?? "",
    service,
    store,
  );
  const sessions = new Map<string, { csrf: string; expiresAt: number }>();
  const allowedOrigins = new Set([
    origin,
    ...(local
      ? [
          `http://localhost:${port}`,
          `http://127.0.0.1:${port}`,
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ]
      : []),
  ]);
  let streams = 0;
  const streamResponses = new Set<ServerResponse>();
  const session = (req: any) => {
    const cookie = String(req.headers.cookie ?? "")
      .split(";")
      .map((s: string) => s.trim())
      .find((s: string) => s.startsWith("mealmint_session="))
      ?.slice("mealmint_session=".length);
    const s = cookie ? sessions.get(cookie) : null;
    return s && s.expiresAt > Date.now() ? s : null;
  };
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      );
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    const bearer =
      accessToken &&
      safeEqual(
        String(req.headers.authorization ?? ""),
        `Bearer ${accessToken}`,
      );
    if (req.url.split("?")[0] === "/api/session") {
      if (
        req.method === "POST" &&
        req.headers.origin &&
        !allowedOrigins.has(req.headers.origin)
      )
        return reply.code(403).send({ error: "Origin not allowed." });
      return;
    }
    const s = session(req);
    if (!bearer && !s)
      return reply
        .code(401)
        .send({ error: "Sign in to your personal app first." });
    if (!["GET", "HEAD"].includes(req.method) && !bearer) {
      if (
        !req.headers.origin ||
        !allowedOrigins.has(req.headers.origin) ||
        !safeEqual(String(req.headers["x-csrf-token"] ?? ""), s!.csrf)
      )
        return reply
          .code(403)
          .send({ error: "Invalid request origin or CSRF token." });
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    const message =
      error instanceof z.ZodError
        ? "Invalid request. Check the fields and try again."
        : redact(error instanceof Error ? error.message : "Request failed.");
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : 400;
    reply
      .code(
        Number.isInteger(status) && status >= 400 && status <= 599
          ? status
          : 400,
      )
      .send({ error: message });
  });
  app.get("/health", async () => ({ ok: true, version: "0.1.0" }));
  app.get("/api/session", async (req) => ({
    signedIn: !!session(req),
    csrf: session(req)?.csrf ?? null,
    local,
    tokenRequired: !!accessToken,
  }));
  app.post("/api/session", async (req, reply) => {
    const body = z
      .object({ token: z.string().max(512).optional() })
      .parse(req.body ?? {});
    if (accessToken && !safeEqual(body.token ?? "", accessToken))
      return reply.code(401).send({ error: "Invalid access token." });
    for (const [id, s] of sessions)
      if (s.expiresAt < Date.now()) sessions.delete(id);
    if (sessions.size >= 20)
      return reply.code(429).send({ error: "Too many active sessions." });
    const id = randomBytes(32).toString("base64url"),
      csrf = randomBytes(24).toString("base64url");
    sessions.set(id, { csrf, expiresAt: Date.now() + 8 * 60 * 60000 });
    reply.header(
      "Set-Cookie",
      `mealmint_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${origin.startsWith("https://") ? "; Secure" : ""}`,
    );
    return { signedIn: true, csrf };
  });
  app.get("/api/status", async () => ({
    agent: await agent.status(),
    swiggy:
      service.gateway.mode === "mock"
        ? {
            connected: true,
            mode: "mock",
            detail: "Synthetic catalogue. No real account or prices.",
          }
        : {
            ...(await oauth.status()),
            mode: "live",
            detail: "Official Swiggy Food MCP",
          },
    telegram: await telegram.status(),
  }));
  app.get("/api/addresses", async () => service.addresses());
  app.get("/api/directives", async () => service.directives.list());
  app.post("/api/directives", async (req) => {
    const { text } = z
      .object({ text: z.string().trim().min(1).max(500) })
      .strict()
      .parse(req.body);
    return service.directives.save({ text, source: "user" });
  });
  app.post("/api/directives/:id/delete", async (req) =>
    service.directives.remove(
      z.object({ id: z.string().uuid() }).parse(req.params).id,
    ),
  );
  app.post("/api/conversations", async (req) => {
    const { replaceId } = z
      .object({ replaceId: z.string().uuid().optional() })
      .strict()
      .parse(req.body ?? {});
    if (replaceId) service.remove(replaceId);
    return service.create();
  });
  app.get("/api/conversations/:id", async (req) =>
    service.snapshot(z.object({ id: z.string().uuid() }).parse(req.params).id),
  );
  app.post("/api/conversations/:id/address", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      { addressId } = z
        .object({ addressId: z.string().max(200) })
        .parse(req.body);
    return service.selectAddress(id, addressId);
  });
  app.post("/api/conversations/:id/preferences", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const c = service.get(id);
    if (c.busy) throw new Error("Wait for the current operation.");
    service.updatePreferences(id, preferencesSchema.parse(req.body));
    return service.snapshot(id);
  });
  app.post("/api/conversations/:id/messages", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      { text } = z
        .object({ text: z.string().trim().min(1).max(4000) })
        .parse(req.body);
    const c = service.get(id);
    if (c.busy) throw new Error("A reply is already in progress.");
    void service.chat(id, text).catch(() => {});
    return reply.code(202).send({ accepted: true });
  });
  app.post("/api/conversations/:id/compare", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      { candidateIds } = z
        .object({ candidateIds: z.array(z.string()).min(1).max(3) })
        .parse(req.body);
    const c = service.get(id);
    if (c.busy) throw new Error("Wait for the reply to finish.");
    await service.requestComparison(id, candidateIds);
    return service.snapshot(id);
  });
  app.post("/api/conversations/:id/approve", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params),
      { approvalId, discardExisting } = z
        .object({
          approvalId: z.string().uuid(),
          discardExisting: z.boolean().optional(),
        })
        .parse(req.body);
    const c = service.get(id);
    if (
      c.busy ||
      c.approval?.id !== approvalId ||
      c.approval.status !== "pending"
    )
      throw new Error("Comparison cannot be approved now.");
    if (c.approval.discardExisting && !discardExisting)
      throw new Error("Confirm discarding the existing cart first.");
    void service.approve(id, approvalId, discardExisting).catch((e) => {
      c.error = redact(e.message);
      service.emit("event", { type: "state", conversationId: id });
    });
    return reply.code(202).send({ accepted: true });
  });
  app.post("/api/conversations/:id/cancel", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await service.cancel(id);
    return service.snapshot(id);
  });
  app.get("/api/conversations/:id/events", async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    service.get(id);
    if (streams >= 10) throw new Error("Too many open chat streams.");
    streams++;
    reply.hijack();
    streamResponses.add(reply.raw);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: any) => {
      if (!reply.raw.destroyed)
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: "state", state: service.snapshot(id) });
    const listener = (event: any) => {
      if (event.conversationId === id)
        send(
          event.type === "state"
            ? { ...event, state: service.snapshot(id) }
            : event,
        );
    };
    service.on("event", listener);
    const timer = setInterval(() => reply.raw.write(": keepalive\n\n"), 15000);
    reply.raw.on("close", () => {
      clearInterval(timer);
      service.off("event", listener);
      streamResponses.delete(reply.raw);
      streams--;
    });
  });
  app.post("/api/auth/codex", async () => {
    if (!(agent instanceof CodexProvider))
      throw new Error("Switch AGENT_PROVIDER=codex to enable sign-in.");
    return agent.login();
  });
  app.post("/api/auth/swiggy", async () => {
    if (service.gateway.mode === "mock")
      throw new Error(
        "Mock mode uses synthetic data. Set SWIGGY_MODE=live after access approval.",
      );
    return oauth.start();
  });
  app.post("/api/auth/swiggy/disconnect", async () => {
    await oauth.disconnect();
    await service.gateway.close();
    return { disconnected: true };
  });
  app.post("/api/telegram/pair", async () => telegram.pairCode());
  app.get("/auth/swiggy/callback", async (req, reply) => {
    const q = z
      .object({
        code: z.string().min(1).max(4096),
        state: z.string().min(20).max(200),
      })
      .parse(req.query);
    await oauth.callback(q.code, q.state);
    await service.gateway.close();
    return reply
      .header("Cache-Control", "no-store")
      .type("text/html")
      .send(
        "<!doctype html><title>Swiggy connected</title><h1>Swiggy connected</h1><p>Return to your food assistant. You can close this window.</p>",
      );
  });
  const root = path.resolve("dist/web");
  if (existsSync(root)) {
    await app.register(fastifyStatic, { root, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/auth/"))
        return reply.code(404).send({ error: "Not found." });
      return reply.sendFile("index.html");
    });
  }
  app.addHook("preClose", async () => {
    for (const response of streamResponses) response.end();
    telegram.stop();
    await service.close();
  });
  return { app, service, telegram, oauth, host, port };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const runtime = await createApp();
  await runtime.app.listen({ host: runtime.host, port: runtime.port });
  await runtime.telegram.start();
  console.log(
    `Food assistant API: http://${runtime.host}:${runtime.port} · ${runtime.service.gateway.mode} Swiggy data · ${process.env.AGENT_PROVIDER ?? "codex"} agent`,
  );
  const shutdown = () => {
    void runtime.app.close().then(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
