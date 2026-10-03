import { createHash, randomBytes } from "node:crypto";
import { SecretStore, safeEqual } from "./security.js";

interface Pending {
  state: string;
  verifier: string;
  expiresAt: number;
  clientId: string;
}
interface Token {
  access_token: string;
  expiresAt: number;
}
export class SwiggyOAuth {
  private pending = new Map<string, Pending>();
  constructor(
    private store: SecretStore,
    readonly redirectUri: string,
    private base = "https://mcp.swiggy.com",
    private fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(base);
    if (
      url.protocol !== "https:" ||
      !["mcp.swiggy.com", "mcp-staging.swiggy.com"].includes(url.hostname)
    )
      throw new Error("Use an official Swiggy authorization server.");
    const redirect = new URL(redirectUri);
    if (
      redirect.pathname !== "/auth/swiggy/callback" ||
      (redirect.protocol !== "https:" &&
        !(redirect.protocol === "http:" && redirect.hostname === "localhost"))
    )
      throw new Error(
        "Use an HTTPS callback or http://localhost for development.",
      );
  }
  private endpoint(url: string) {
    const u = new URL(url);
    if (u.origin !== new URL(this.base).origin || u.protocol !== "https:")
      throw new Error("Untrusted OAuth endpoint.");
    return u.toString();
  }
  private async json(url: string, options?: RequestInit) {
    const response = await this.fetcher(this.endpoint(url), {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Swiggy authorization request failed (${response.status}).`,
      );
    return response.json() as Promise<any>;
  }
  async token() {
    const t = await this.store.get<Token>("swiggy-token");
    return t && t.expiresAt > Date.now() + 60000 ? t.access_token : null;
  }
  async status() {
    return { connected: !!(await this.token()), redirectUri: this.redirectUri };
  }
  async start() {
    for (const [id, p] of this.pending)
      if (p.expiresAt < Date.now()) this.pending.delete(id);
    if (this.pending.size >= 5)
      throw new Error(
        "Too many pending sign-ins. Complete or wait for an existing attempt.",
      );
    const meta = await this.json(
      `${this.base}/.well-known/oauth-authorization-server`,
    );
    for (const key of [
      "authorization_endpoint",
      "token_endpoint",
      "registration_endpoint",
    ])
      this.endpoint(meta[key]);
    let client = await this.store.get<{
      client_id: string;
      redirectUri: string;
    }>("swiggy-client");
    if (!client || client.redirectUri !== this.redirectUri) {
      const registered = await this.json(meta.registration_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "MealMint",
          redirect_uris: [this.redirectUri],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
        }),
      });
      if (!registered.client_id)
        throw new Error("Client registration returned no identifier.");
      client = {
        client_id: registered.client_id,
        redirectUri: this.redirectUri,
      };
      await this.store.set("swiggy-client", client);
    }
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    this.pending.set(state, {
      state,
      verifier,
      clientId: client.client_id,
      expiresAt: Date.now() + 10 * 60000,
    });
    const authorize = new URL(meta.authorization_endpoint);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: this.redirectUri,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state,
      scope: "mcp:tools",
      resource: `${this.base}/food`,
    }))
      authorize.searchParams.set(key, value);
    return { url: authorize.toString() };
  }
  async callback(code: string, state: string) {
    const p = this.pending.get(state);
    if (!p || !safeEqual(state, p.state) || p.expiresAt < Date.now())
      throw new Error("Sign-in expired or state is invalid. Start again.");
    this.pending.delete(state); // One use even if the exchange fails.
    if (!code || code.length > 4096)
      throw new Error("Missing or invalid authorization code.");
    const token = await this.json(`${this.base}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: p.clientId,
        code,
        code_verifier: p.verifier,
        redirect_uri: this.redirectUri,
        resource: `${this.base}/food`,
      }),
    });
    if (
      typeof token.access_token !== "string" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    )
      throw new Error("Invalid token response.");
    await this.store.set("swiggy-token", {
      access_token: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
  }
  async disconnect() {
    const token = await this.token();
    if (token) {
      try {
        await this.json(`${this.base}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } finally {
        await this.store.set("swiggy-token", null);
      }
    } else await this.store.set("swiggy-token", null);
  }
}
