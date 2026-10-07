import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  ShoppingBag,
  Sparkles,
  Square,
  Utensils,
  X,
} from "lucide-react";
import type { Address, Conversation, UserDirective } from "../src/types";

const money = (n: number | null) =>
  n === null
    ? "Unknown"
    : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
// Keep model text as React text nodes; support emphasis without HTML or links.
const formatMessage = (text: string) =>
  text
    .split(/(\*\*[^*\n]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
export function App() {
  const [session, setSession] = useState<{
    signedIn: boolean;
    csrf?: string;
    tokenRequired?: boolean;
  } | null>(null);
  const [token, setToken] = useState(""),
    [error, setError] = useState("");
  const [chat, setChat] = useState<Conversation | null>(null),
    [addresses, setAddresses] = useState<Address[]>([]),
    [status, setStatus] = useState<any>(null);
  const [input, setInput] = useState(""),
    [stream, setStream] = useState(""),
    [working, setWorking] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const [settings, setSettings] = useState(false),
    [discard, setDiscard] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [directives, setDirectives] = useState<UserDirective[]>([]),
    [directiveText, setDirectiveText] = useState("");
  const [actionLink, setActionLink] = useState<{
    url: string;
    label: string;
  } | null>(null);
  const bottom = useRef<HTMLDivElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null);
  async function api(url: string, body?: unknown) {
    const r = await fetch(
      url,
      body !== undefined
        ? {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": session?.csrf ?? "",
            },
            body: JSON.stringify(body),
          }
        : { credentials: "same-origin" },
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Request failed.");
    return data;
  }
  const attempt = async (fn: () => Promise<any>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  async function signIn(value?: string) {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value ? { token: value } : {}),
    });
    const s = await r.json();
    if (!r.ok) throw new Error(s.error);
    setSession(s);
  }
  useEffect(() => {
    if (settings && session?.signedIn)
      void api("/api/directives")
        .then(setDirectives)
        .catch((e) => setError(e.message));
  }, [settings, chat?.busy]);
  useEffect(() => {
    let active = true;
    fetch("/api/session")
      .then((r) => r.json())
      .then(async (s) => {
        if (!active) return;
        if (!s.signedIn && !s.tokenRequired) await signIn();
        else setSession(s);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!session?.signedIn) return;
    let active = true;
    void attempt(async () => {
      const c = await api("/api/conversations", {});
      if (active) setChat(c);
    });
    const refresh = () =>
      void api("/api/status")
        .then((s) => {
          if (!active) return;
          setStatus(s);
          void api("/api/addresses")
            .then((a) => active && setAddresses(a))
            .catch(() => {});
        })
        .catch((e) => active && setError(e.message));
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session?.signedIn]);
  useEffect(() => {
    if (!chat?.id) return;
    const events = new EventSource(`/api/conversations/${chat.id}/events`);
    events.onmessage = (e) => {
      const v = JSON.parse(e.data);
      if (v.type === "state" && v.state) {
        setChat(v.state);
        if (!v.state.busy) {
          setStream("");
          setWorking("");
        }
      }
      if (v.type === "delta") setStream((s) => s + v.text);
      if (v.type === "status") setWorking(v.text);
      if (v.type === "error") setError(v.text);
    };
    return () => events.close();
  }, [chat?.id]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat?.messages.length, stream]);
  useEffect(() => {
    setSelected([]);
    setDiscard(false);
  }, [chat?.request.addressId, chat?.request.budget, chat?.request.diet]);
  async function send(text = input) {
    if (!chat || chat.busy || !text.trim()) return;
    await attempt(async () => {
      setInput("");
      setStream("");
      await api(`/api/conversations/${chat.id}/messages`, { text });
      const c = await api(`/api/conversations/${chat.id}`);
      setChat(c);
    });
  }
  async function connect(kind: "codex" | "swiggy") {
    setConnecting(true);
    await attempt(async () => {
      const response = await api(`/api/auth/${kind}`, {});
      setActionLink({
        url: response.url ?? response.authUrl,
        label:
          kind === "codex" ? "Finish Codex sign-in" : "Finish Swiggy sign-in",
      });
    });
    setConnecting(false);
  }
  const actualSelected = selected.filter((id) =>
    chat?.candidates.some((x) => x.id === id),
  );
  const source = status?.swiggy?.mode ?? "mock";
  if (!session?.signedIn)
    return (
      <div className="login">
        <div className="logo large">
          <Utensils />
        </div>
        <h1>MealMint</h1>
        <p>
          {session?.tokenRequired
            ? "Enter your personal app access token."
            : "Connecting to your personal workspace…"}
        </p>
        {session?.tokenRequired && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void attempt(() => signIn(token));
            }}
          >
            <input
              aria-label="App access token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
            />
            <button className="primary">
              Connect <ArrowRight size={18} />
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="logo">
            <Utensils size={20} />
          </span>
          <span>
            Meal<span className="brand-light">Mint</span>
            <small>YOUR PERSONAL ASSISTANT</small>
          </span>
        </a>
        <button
          className="new-chat"
          disabled={chat?.busy}
          onClick={() =>
            void attempt(async () => {
              setChat(
                await api(
                  "/api/conversations",
                  chat ? { replaceId: chat.id } : {},
                ),
              );
              setSelected([]);
            })
          }
        >
          <Plus size={18} /> New conversation
        </button>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active">
          <MessageCircle size={18} /> Find food <span className="nav-dot" />
        </div>
        <div className="sidebar-note">
          <span className="mini-bowl">
            <ShoppingBag size={25} />
          </span>
          <strong>
            Good food.
            <br />A smaller bill.
          </strong>
          <p>Tell me what you’re craving and what you want to spend.</p>
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setSettings(true)}>
            <Settings2 size={18} /> Connections
          </button>
          <div className="connection">
            <span
              className={
                status?.agent?.connected ? "status-dot" : "status-dot muted"
              }
            />
            <div>
              {status?.agent?.connected
                ? "Agent connected"
                : status
                  ? "Connect Codex"
                  : "Checking Codex…"}
              <small>{status?.agent?.model ?? "Codex · Luna max"}</small>
            </div>
          </div>
          <a
            href="https://github.com/Fyxod/MealMint"
            target="_blank"
            rel="noreferrer"
          >
            Open-source · MealMint <ArrowRight size={12} />
          </a>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">LET’S FIND SOMETHING GOOD</span>
            <h1>
              Food that fits your budget<span>.</span>
            </h1>
          </div>
          <div className="header-actions">
            <span className={`source-badge ${source === "mock" ? "" : "live"}`}>
              {source === "mock" ? "DEMO DATA" : "SWIGGY LIVE"}
            </span>
            <button
              className="icon-button"
              aria-label="Connection settings"
              onClick={() => setSettings(true)}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
        <div className="location-bar">
          <MapPin size={17} />
          <select
            aria-label="Delivery address"
            value={chat?.request.addressId ?? ""}
            onChange={(e) => {
              const addressId = e.target.value;
              if (addressId && chat)
                void attempt(async () =>
                  setChat(
                    await api(`/api/conversations/${chat.id}/address`, {
                      addressId,
                    }),
                  ),
                );
            }}
            disabled={chat?.busy}
          >
            <option value="">Choose delivery address</option>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
          <span className="location-caption">
            {source === "mock"
              ? "Synthetic restaurants, offers and prices"
              : "From your saved Swiggy addresses"}
          </span>
        </div>
        {(error || chat?.error) && (
          <div className="error" role="alert">
            <CircleHelp size={17} />
            <span>{error || chat?.error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="workspace">
          <section className="conversation">
            <div className="section-top">
              <span>
                <MessageCircle size={16} /> YOUR CONVERSATION
              </span>
              <span className="tiny">
                {chat?.busy ? "Working on it" : "Ready when you are"}
              </span>
            </div>
            <div className="messages">
              {!chat?.messages.length && (
                <div className="welcome">
                  <div className="welcome-icon">
                    <Sparkles size={27} />
                  </div>
                  <h2>What sounds good?</h2>
                  <p>
                    A craving, a budget, or just “anything filling.”
                    <br />
                    We’ll figure out the rest together.
                  </p>
                  <div className="suggestions">
                    {[
                      "₹150 max, vegetarian and filling",
                      "Chicken biryani under ₹250",
                      "Anything cheap, under ₹120 delivered",
                    ].map((text) => (
                      <button key={text} onClick={() => void send(text)}>
                        {text}
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  </div>
                  <div className="welcome-note">
                    <CheckCheck size={16} /> You approve cart checks. Ordering
                    stays with you.
                  </div>
                </div>
              )}
              {chat?.messages.map((m) => (
                <div className={`message ${m.role}`} key={m.id}>
                  {m.role === "assistant" && (
                    <span className="avatar">
                      <Sparkles size={15} />
                    </span>
                  )}
                  <div>
                    <span className="message-label">
                      {m.role === "user"
                        ? "YOU"
                        : status?.agent?.provider === "demo"
                          ? "OFFLINE WALKTHROUGH"
                          : "YOUR ASSISTANT"}
                    </span>
                    <div className="message-text">{formatMessage(m.text)}</div>
                  </div>
                </div>
              ))}
              {chat?.busy && (
                <div className="message assistant">
                  <span className="avatar">
                    <Sparkles size={15} />
                  </span>
                  <div>
                    {stream ? (
                      <div className="message-text">
                        {formatMessage(stream)}
                        <span className="cursor" />
                      </div>
                    ) : (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                        <small>{working || chat.status}</small>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={bottom} />
            </div>
            <form
              className="composer"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={textarea}
                aria-label="Message your food assistant"
                placeholder="Your budget, cravings, preferences…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={4000}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  {source === "mock"
                    ? status?.agent?.provider === "demo"
                      ? "Demo prices · scripted offline walkthrough"
                      : "Demo prices · real conversation with Codex"
                    : "Prices can change · refresh before checkout"}
                </span>
                {chat?.busy ? (
                  <button
                    type="button"
                    className="send"
                    aria-label="Stop search"
                    onClick={() =>
                      void attempt(() =>
                        api(`/api/conversations/${chat.id}/cancel`, {}),
                      )
                    }
                  >
                    <Square size={16} />
                  </button>
                ) : (
                  <button
                    className="send"
                    aria-label="Send message"
                    disabled={!input.trim() || !chat}
                  >
                    <ArrowRight size={20} />
                  </button>
                )}
              </div>
            </form>
          </section>
          <section className="results">
            <div className="section-top">
              <span>
                <ShoppingBag size={16} /> YOUR OPTIONS
              </span>
              <span className="result-count">
                {chat?.quotes.length || chat?.candidates.length || 0}
              </span>
            </div>
            <div className="request-strip">
              <span>
                {chat?.request.budget
                  ? `${money(chat.request.budget)} delivered`
                  : "Budget not set"}
              </span>
              <span>
                {chat?.request.diet === "veg"
                  ? "Vegetarian"
                  : chat?.request.diet === "nonveg"
                    ? "Non-vegetarian"
                    : "Any food"}
              </span>
              {chat && chat.request.quantity > 1 && (
                <span>Qty {chat.request.quantity}</span>
              )}
            </div>
            <div className="result-scroll">
              {!!chat?.quotes.length && (
                <>
                  <div className="results-intro">
                    <CheckCheck size={17} />
                    <div>
                      <strong>
                        {source === "mock"
                          ? "Demo totals checked"
                          : "Delivered totals checked"}
                      </strong>
                      <p>Lowest among your selected options.</p>
                    </div>
                  </div>
                  {chat.quotes.map((q, i) => (
                    <article
                      className={`quote ${q.withinBudget && i === 0 ? "best" : ""}`}
                      key={q.candidateId}
                    >
                      {q.withinBudget && i === 0 && (
                        <span className="best-label">LOWEST CHECKED TOTAL</span>
                      )}
                      <div className="quote-heading">
                        <div>
                          <h3>{q.name}</h3>
                          <p>
                            {q.restaurant} · {q.quantity}{" "}
                            {q.bundle ? "bundle(s)" : "item(s)"}
                          </p>
                        </div>
                        <strong>{money(q.total)}</strong>
                      </div>
                      <dl>
                        <div>
                          <dt>Items</dt>
                          <dd>{money(q.itemTotal)}</dd>
                        </div>
                        <div>
                          <dt>Delivery</dt>
                          <dd>{money(q.delivery)}</dd>
                        </div>
                        <div>
                          <dt>Taxes & other charges</dt>
                          <dd>{money(q.charges)}</dd>
                        </div>
                        {q.discount > 0 && (
                          <div className="savings">
                            <dt>{q.coupon}</dt>
                            <dd>−{money(q.discount)}</dd>
                          </div>
                        )}
                        {q.coupon && q.discount === 0 && (
                          <div>
                            <dt>Applied coupon</dt>
                            <dd>{q.coupon}</dd>
                          </div>
                        )}
                      </dl>
                      <div className="quote-bottom">
                        {q.withinBudget ? (
                          <span>
                            <Check size={13} /> Within budget
                          </span>
                        ) : (
                          <span className="over">Over budget</span>
                        )}
                        <small>
                          Checked{" "}
                          {new Date(q.checkedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                    </article>
                  ))}
                </>
              )}
              {!!chat?.candidates.length && (
                <>
                  <div className="results-intro">
                    <div>
                      <strong>
                        {chat.quotes.length
                          ? "Listed options"
                          : "Pick a few to compare"}
                      </strong>
                      <p>Listed prices exclude delivery and charges.</p>
                    </div>
                  </div>
                  {chat.candidates.map((c, i) => (
                    <button
                      className={`food-card ${actualSelected.includes(c.id) ? "selected" : ""}`}
                      key={c.id}
                      disabled={c.customizable || chat.busy}
                      onClick={() =>
                        setSelected((ids) =>
                          ids.includes(c.id)
                            ? ids.filter((x) => x !== c.id)
                            : ids.length < 3
                              ? [...ids, c.id]
                              : ids,
                        )
                      }
                      aria-pressed={actualSelected.includes(c.id)}
                    >
                      <span className="food-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="food-info">
                        <div className="food-title">
                          <span
                            className={`diet-mark ${c.isVeg ? "veg" : "nonveg"}`}
                          />
                          <h3>{c.name}</h3>
                        </div>
                        <p>{c.restaurant}</p>
                        <div className="food-meta">
                          <Clock3 size={12} /> {c.eta ?? "?"} min <span>·</span>{" "}
                          {c.rating ? `★ ${c.rating}` : "Rating unavailable"}
                        </div>
                        {c.offer && <div className="offer">{c.offer}</div>}
                        {c.lines && (
                          <small>
                            Item combination · quantities shown per bundle
                          </small>
                        )}
                        {c.dealHypothesis &&
                          chat.request.budget !== null &&
                          c.price! * chat.request.quantity >
                            chat.request.budget && (
                            <small className="deal-warning">
                              Subtotal exceeds budget · coupon savings
                              unverified
                            </small>
                          )}
                        {c.customizable && (
                          <small>Customization needed · browse in Swiggy</small>
                        )}
                      </div>
                      <div className="food-price">
                        <strong>{money(c.price)}</strong>
                        <span>listed</span>
                        <span className="check-box">
                          {actualSelected.includes(c.id) && <Check size={13} />}
                        </span>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {!chat?.candidates.length && !chat?.quotes.length && (
                <div className="empty-results">
                  <div className="outline-bowl">
                    <ShoppingBag size={34} />
                  </div>
                  <h3>Your next meal goes here.</h3>
                  <p>
                    Start a conversation to find options,
                    <br />
                    then compare what you’ll actually pay.
                  </p>
                  <div className="empty-lines">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
              {chat && chat.coverage.queries.length > 0 && (
                <div className="coverage">
                  Checked {chat.coverage.restaurants} restaurants across{" "}
                  {chat.coverage.queries.length} searches.
                  {chat.coverage.hasMore
                    ? " More results may be available."
                    : ""}{" "}
                  This is a shortlist, not the entire catalogue.
                </div>
              )}
            </div>
            {actualSelected.length > 0 && !chat?.busy && (
              <div className="compare-bar">
                <span>{actualSelected.length} selected</span>
                <button
                  className="primary"
                  onClick={() =>
                    void attempt(async () => {
                      setDiscard(false);
                      setChat(
                        await api(`/api/conversations/${chat!.id}/compare`, {
                          candidateIds: actualSelected,
                        }),
                      );
                    })
                  }
                >
                  Check totals <ArrowRight size={16} />
                </button>
              </div>
            )}
            <div className="results-footer">
              <span className="swiggy-word">Swiggy</span>
              <span>
                {source === "mock"
                  ? "MCP integration prototype"
                  : "Food data via official MCP"}
              </span>
            </div>
          </section>
        </div>
      </main>
      {chat?.approval?.status === "pending" && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-title"
          >
            <span className="modal-icon">
              <ShoppingBag size={24} />
            </span>
            <h2 id="approval-title">Check delivered prices?</h2>
            <p>
              This will temporarily change{" "}
              {source === "mock"
                ? "the synthetic demo cart"
                : "your Swiggy cart"}{" "}
              to check {chat.approval.candidateIds.length} selected option(s)
              and coupons. The test cart will be cleared afterward. No order
              will be placed.
            </p>
            <ul className="approval-plans">
              {chat.approval.plans.map((plan) => (
                <li key={plan.id}>
                  <strong>{plan.name}</strong>
                  <small>
                    {plan.restaurant} · {chat.request.quantity}{" "}
                    {plan.lines ? "bundle(s)" : "item(s)"} ·{" "}
                    {money(plan.price! * chat.request.quantity)} listed
                  </small>
                </li>
              ))}
            </ul>
            <p className="muted-text">
              {source === "mock"
                ? "This walkthrough uses synthetic prices and does not access your Swiggy account."
                : "Please leave your cart unchanged in Swiggy during the comparison."}
            </p>
            {chat.approval.discardExisting && (
              <label className="discard">
                <input
                  type="checkbox"
                  checked={discard}
                  onChange={(e) => setDiscard(e.target.checked)}
                />{" "}
                I agree to discard the items currently in my Swiggy cart.
              </label>
            )}
            <div className="modal-actions">
              <button
                onClick={() =>
                  void attempt(() =>
                    api(`/api/conversations/${chat.id}/cancel`, {}),
                  )
                }
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={chat.approval.discardExisting && !discard}
                onClick={() =>
                  void attempt(async () => {
                    await api(`/api/conversations/${chat.id}/approve`, {
                      approvalId: chat.approval!.id,
                      discardExisting: discard,
                    });
                    setChat(await api(`/api/conversations/${chat.id}`));
                  })
                }
              >
                Approve comparison <Check size={17} />
              </button>
            </div>
          </section>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal settings"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              aria-label="Close settings"
              onClick={() => setSettings(false)}
            >
              <X size={20} />
            </button>
            <h2 id="settings-title">Your connections</h2>
            <p>One assistant, available on the web and in Telegram.</p>
            <div className="setting-row">
              <div>
                <strong>Codex</strong>
                <small>{status?.agent?.detail ?? "Checking connection…"}</small>
              </div>
              <button
                disabled={connecting || status?.agent?.connected}
                onClick={() => void connect("codex")}
              >
                {status?.agent?.connected ? "Connected" : "Connect"}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Swiggy Food</strong>
                <small>{status?.swiggy?.detail ?? "Synthetic demo data"}</small>
              </div>
              <button
                disabled={connecting || source === "mock" || status?.swiggy?.connected}
                onClick={() => void connect("swiggy")}
              >
                {source === "mock" ? "Demo mode" : status?.swiggy?.connected ? "Connected" : "Connect"}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Telegram</strong>
                <small>
                  {status?.telegram?.configured
                    ? status.telegram.paired
                      ? "Account paired"
                      : "Ready to pair"
                    : "Add your BotFather token to .env"}
                </small>
              </div>
              <button
                disabled={!status?.telegram?.configured}
                onClick={() =>
                  void attempt(async () => {
                    const p = await api("/api/telegram/pair", {});
                    setActionLink({ url: p.url, label: "Pair in Telegram" });
                  })
                }
              >
                Pair
              </button>
            </div>
            {actionLink && (
              <a
                className="primary link-button"
                href={actionLink.url}
                target="_blank"
                rel="noreferrer"
              >
                {actionLink.label}
                <ArrowRight size={16} />
              </a>
            )}
            <section
              className="directive-section"
              aria-labelledby="directives-title"
            >
              <h3 id="directives-title">Saved directives</h3>
              <p>
                Shared across web and Telegram. The agent can save stable
                preferences; your current request takes priority.
              </p>
              {directives.length === 0 && (
                <small>
                  No preferences saved yet. Tell the assistant what to remember.
                </small>
              )}
              {directives.map((d) => (
                <div className="directive" key={d.id}>
                  <div>
                    <p>{d.text}</p>
                    <small>
                      {d.source === "user"
                        ? "Requested by you"
                        : "Inferred by the agent"}
                    </small>
                  </div>
                  <button
                    aria-label={`Forget directive: ${d.text}`}
                    onClick={() =>
                      void attempt(async () => {
                        await api(`/api/directives/${d.id}/delete`, {});
                        setDirectives(await api("/api/directives"));
                      })
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <form
                className="directive-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void attempt(async () => {
                    await api("/api/directives", { text: directiveText });
                    setDirectiveText("");
                    setDirectives(await api("/api/directives"));
                  });
                }}
              >
                <input
                  aria-label="New saved directive"
                  placeholder="E.g. I prefer vegetarian lunches"
                  maxLength={500}
                  value={directiveText}
                  onChange={(e) => setDirectiveText(e.target.value)}
                />
                <button className="primary" disabled={!directiveText.trim()}>
                  Save
                </button>
              </form>
            </section>
            <div className="settings-note">
              Swiggy demo mode is labelled throughout. Real account access is
              enabled after staging approval. Authentication credentials stay
              outside the public repository.
            </div>
            {error && (
              <p role="alert" className="settings-error">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
