<script lang="ts">
  import { onMount, tick } from "svelte";

  // ────────────────────────────────────────────────────────────────────────
  // Types
  // ────────────────────────────────────────────────────────────────────────

  interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
    /** When true, content is still accumulating via LLM deltas. */
    streaming?: boolean;
    /** Optional metadata for structured cartridge events. */
    meta?: {
      type?: "routing" | "step" | "result" | "validator" | "error";
      cartridge?: string;
      flow?: string;
      agent?: string;
      ok?: boolean;
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────────────────

  let messages = $state<ChatMessage[]>([]);
  let inputValue = $state("");
  let inputEl: HTMLTextAreaElement;
  let scrollEl: HTMLDivElement;
  let busy = $state(false);

  /** Blackboard from last cartridge run — enables follow-up turns. */
  let lastBlackboard = $state<Record<string, unknown> | null>(null);
  let lastCartridge = $state<string | null>(null);
  let lastFlow = $state<string | null>(null);

  let messageCounter = 0;

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  function nextId(): string {
    return `msg-${++messageCounter}-${Date.now()}`;
  }

  function addMessage(
    role: ChatMessage["role"],
    content: string,
    meta?: ChatMessage["meta"],
  ): ChatMessage {
    const msg: ChatMessage = {
      id: nextId(),
      role,
      content,
      timestamp: Date.now(),
      meta,
    };
    messages = [...messages, msg];
    scrollToBottom();
    return msg;
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    messages = messages.map((m) =>
      m.id === id ? { ...m, ...patch } : m,
    );
    scrollToBottom();
  }

  function appendDelta(id: string, delta: string) {
    messages = messages.map((m) =>
      m.id === id ? { ...m, content: m.content + delta } : m,
    );
    scrollToBottom();
  }

  async function scrollToBottom() {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Core: handle user send
  // ────────────────────────────────────────────────────────────────────────

  async function handleSend() {
    const raw = inputValue.trim();
    if (!raw || busy) return;

    inputValue = "";
    addMessage("user", raw);
    busy = true;

    try {
      if (lastBlackboard && looksLikeFollowUp(raw)) {
        await handleFollowUp(raw);
      } else {
        await handleRoute(raw);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addMessage("assistant", `Something went wrong: ${msg}`, { type: "error" });
    } finally {
      busy = false;
      await tick();
      inputEl?.focus();
    }
  }

  /** Simple heuristic: short messages or those without trade keywords are follow-ups. */
  function looksLikeFollowUp(text: string): boolean {
    const words = text.split(/\s+/).length;
    // Very short replies are almost always follow-ups to a prior run.
    if (words <= 6) return true;
    // If the text starts with question words or references prior output, treat as follow-up.
    const lower = text.toLowerCase();
    const followUpStarters = [
      "why", "how", "what", "explain", "can you", "tell me",
      "more", "also", "and", "but", "thanks", "ok",
    ];
    return followUpStarters.some((s) => lower.startsWith(s));
  }

  // ────────────────────────────────────────────────────────────────────────
  // Route goal → cartridge execution
  // ────────────────────────────────────────────────────────────────────────

  async function handleRoute(goal: string) {
    // Lazy-load all heavy modules (same pattern as TerminalShell).
    const { CartridgeRegistry } = await import("$lib/cartridge/registry");
    const { CartridgeRunner } = await import("$lib/cartridge/runner");
    const { routeGoal } = await import("$lib/routing/goal_router");
    const { buildProvider } = await import("$lib/llm/build_provider");
    const { loadProviderConfig } = await import("$lib/state/provider_config");
    const { loadLibrary, library } = await import("$lib/state/library.svelte");

    // Ensure library is hydrated for catalog building.
    await loadLibrary();

    const registry = new CartridgeRegistry();
    await registry.init();
    const cartridges = registry.list();

    // Build router catalog from loaded cartridges + library skills.
    const skills: Array<{ cartridge: string; skill: (typeof library.cartridges)[number]["skills"][number] }> = [];
    for (const c of library.cartridges) {
      for (const s of c.skills) skills.push({ cartridge: c.name, skill: s });
    }
    const catalog = { cartridges, skills };

    // Build LLM provider.
    const cfg = await loadProviderConfig("_terminal") ?? {
      providerId: "gemini" as const,
    };
    const provider = await buildProvider(cfg);

    // Route the goal.
    addMessage("system", "Routing...", { type: "routing" });
    const decision = await routeGoal(goal, catalog, provider);

    if (decision.mode === "cartridge") {
      addMessage("system", `Matched: ${decision.cartridge}`, {
        type: "routing",
        cartridge: decision.cartridge,
      });
      await runCartridge(registry, provider, decision.cartridge, goal, decision.flow);
    } else if (decision.mode === "ad-hoc") {
      addMessage("system", `Matched skills in ${decision.cartridge}: ${decision.skills.join(", ")}`, {
        type: "routing",
        cartridge: decision.cartridge,
      });
      await runCartridge(registry, provider, decision.cartridge, goal);
    } else if (decision.mode === "synthesize") {
      addMessage("assistant",
        `I don't have a cartridge for that yet. ${decision.reason}\n\n` +
        `Suggestion: "${decision.suggestedName}" — ${decision.description}`
      );
    } else {
      addMessage("assistant",
        "I'm not sure how to help with that. Could you rephrase or be more specific about what trade or task you need?"
      );
    }
  }

  async function runCartridge(
    registry: import("$lib/cartridge/registry").CartridgeRegistry,
    provider: import("$lib/llm/provider").LLMProvider,
    cartridgeName: string,
    goal: string,
    flow?: string,
  ) {
    const { CartridgeRunner } = await import("$lib/cartridge/runner");
    const runner = new CartridgeRunner(registry, provider);

    // Track the current streaming message for LLM deltas.
    let streamingMsgId: string | null = null;

    const result = await runner.run(cartridgeName, goal, {
      flow,
      onEvent: (ev) => {
        const e = ev as Record<string, unknown>;

        if (ev.type === "run-start") {
          addMessage("system", `Running ${e.cartridge} / ${e.flow}...`, {
            type: "step",
            cartridge: String(e.cartridge),
            flow: String(e.flow),
          });
          streamingMsgId = null;
        } else if (ev.type === "step-start") {
          addMessage("system", `Step: ${e.agent}`, {
            type: "step",
            agent: String(e.agent),
          });
          streamingMsgId = null;
        } else if (ev.type === "llm-turn" && e.delta) {
          if (!streamingMsgId) {
            const msg = addMessage("assistant", String(e.delta));
            msg.streaming = true;
            streamingMsgId = msg.id;
          } else {
            appendDelta(streamingMsgId, String(e.delta));
          }
        } else if (ev.type === "blackboard-put") {
          // Finalize any streaming message first.
          if (streamingMsgId) {
            updateMessage(streamingMsgId, { streaming: false });
            streamingMsgId = null;
          }
          addMessage("assistant", `[${e.ok ? "ok" : "fail"}] ${e.key}: ${e.message}`, {
            type: "result",
            ok: Boolean(e.ok),
          });
        } else if (ev.type === "validator") {
          addMessage("system", `${e.ok ? "Pass" : "Fail"}: ${e.message}`, {
            type: "validator",
            ok: Boolean(e.ok),
          });
        } else if (ev.type === "run-end") {
          // Finalize streaming.
          if (streamingMsgId) {
            updateMessage(streamingMsgId, { streaming: false });
            streamingMsgId = null;
          }
        }
        scrollToBottom();
      },
    });

    // Save blackboard for follow-up.
    lastBlackboard = result.blackboard as Record<string, unknown>;
    lastCartridge = result.cartridge;
    lastFlow = result.flow;

    // Summary message.
    const status = result.ok ? "Completed successfully." : "Completed with issues.";
    const summary = result.final_summary
      ? `${status}\n\n${result.final_summary}`
      : status;
    addMessage("assistant", summary, {
      type: "result",
      cartridge: result.cartridge,
      flow: result.flow,
      ok: result.ok,
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Follow-up: use blackboard context for conversational turns
  // ────────────────────────────────────────────────────────────────────────

  async function handleFollowUp(message: string) {
    const { buildProvider } = await import("$lib/llm/build_provider");
    const { loadProviderConfig } = await import("$lib/state/provider_config");

    const cfg = await loadProviderConfig("_terminal") ?? {
      providerId: "gemini" as const,
    };
    const provider = await buildProvider(cfg);

    // Build a context string from the blackboard.
    const contextLines: string[] = [
      `Previous run: cartridge=${lastCartridge}, flow=${lastFlow}`,
      "",
      "Blackboard state:",
    ];
    if (lastBlackboard) {
      for (const [key, entry] of Object.entries(lastBlackboard)) {
        if (entry && typeof entry === "object" && "value" in entry) {
          const e = entry as { value: unknown; description?: string };
          const val = typeof e.value === "string"
            ? e.value.slice(0, 500)
            : JSON.stringify(e.value).slice(0, 500);
          contextLines.push(`- ${key}: ${val}`);
        }
      }
    }

    const systemPrompt = [
      "You are a helpful trade assistant. The user previously ran a cartridge and is now asking a follow-up question.",
      "Use the blackboard context below to answer accurately. Be concise and practical.",
      "",
      ...contextLines,
    ].join("\n");

    const streamMsg = addMessage("assistant", "");
    streamMsg.streaming = true;
    const msgId = streamMsg.id;

    try {
      const result = await provider.chat(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        { stream: false, maxTokens: 1024 },
      );
      updateMessage(msgId, { content: result.content, streaming: false });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateMessage(msgId, {
        content: `Could not generate follow-up: ${errMsg}`,
        streaming: false,
        meta: { type: "error" },
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Input handling
  // ────────────────────────────────────────────────────────────────────────

  function onKeydown(e: KeyboardEvent) {
    // Enter sends (Shift+Enter for newline).
    if (e.key === "Enter" && !e.shiftKey && !busy) {
      e.preventDefault();
      handleSend();
    }
  }

  function autoResize() {
    if (!inputEl) return;
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  }

  onMount(() => {
    addMessage("system", "How can I help? Describe what you need in natural language.");
    inputEl?.focus();
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="chat" role="application" aria-label="Chat">
  <div class="header">
    <span class="title">trade</span>
    <span class="status">{busy ? "thinking..." : "ready"}</span>
  </div>

  <div class="messages" bind:this={scrollEl}>
    {#each messages as msg (msg.id)}
      {#if msg.role === "system"}
        <div class="msg-row system">
          <div class="msg-system">
            <span class="msg-text">{msg.content}</span>
            {#if msg.meta?.ok === true}
              <span class="badge ok">pass</span>
            {/if}
            {#if msg.meta?.ok === false}
              <span class="badge fail">fail</span>
            {/if}
          </div>
        </div>
      {:else if msg.role === "user"}
        <div class="msg-row user">
          <div class="msg-bubble user-bubble">
            <pre class="msg-text">{msg.content}</pre>
            <span class="msg-time">{formatTime(msg.timestamp)}</span>
          </div>
        </div>
      {:else}
        <div class="msg-row assistant">
          <div class="msg-bubble assistant-bubble" class:streaming={msg.streaming}>
            <pre class="msg-text">{msg.content}{#if msg.streaming}<span class="cursor">|</span>{/if}</pre>
            {#if !msg.streaming}
              <span class="msg-time">{formatTime(msg.timestamp)}</span>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <div class="input-bar">
    <textarea
      bind:this={inputEl}
      bind:value={inputValue}
      onkeydown={onKeydown}
      oninput={autoResize}
      disabled={busy}
      placeholder={busy ? "Thinking..." : "Describe what you need..."}
      rows="1"
      spellcheck="true"
      autocomplete="off"
    ></textarea>
    <button
      class="send-btn"
      onclick={handleSend}
      disabled={busy || !inputValue.trim()}
      aria-label="Send"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 2 11 13"/>
        <path d="M22 2 15 22 11 13 2 9z"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a0a0a;
    color: #e4e4e7;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: #141414;
    border-bottom: 1px solid #262626;
    flex-shrink: 0;
  }

  .title {
    font-weight: 600;
    color: #a1a1aa;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status {
    font-size: 12px;
    color: #52525b;
  }

  /* ── Messages area ── */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    -webkit-overflow-scrolling: touch;
  }

  .msg-row {
    display: flex;
    max-width: 100%;
  }

  .msg-row.user {
    justify-content: flex-end;
  }

  .msg-row.assistant {
    justify-content: flex-start;
  }

  .msg-row.system {
    justify-content: center;
  }

  /* ── Bubbles ── */
  .msg-bubble {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 12px;
    position: relative;
  }

  .user-bubble {
    background: #1a1a2e;
    border: 1px solid #262640;
    border-bottom-right-radius: 4px;
  }

  .assistant-bubble {
    background: transparent;
    border-bottom-left-radius: 4px;
  }

  .assistant-bubble.streaming {
    border-left: 2px solid #ff6b1a;
    padding-left: 10px;
  }

  .msg-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
    font-size: inherit;
    line-height: 1.5;
  }

  .user-bubble .msg-text {
    color: #e4e4e7;
  }

  .assistant-bubble .msg-text {
    color: #a1a1aa;
  }

  .msg-time {
    display: block;
    font-size: 10px;
    color: #52525b;
    margin-top: 4px;
    text-align: right;
  }

  .cursor {
    color: #ff6b1a;
    animation: blink 0.8s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* ── System messages ── */
  .msg-system {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    font-size: 12px;
    color: #6366f1;
    background: rgba(99, 102, 241, 0.08);
    border-radius: 8px;
    max-width: 90%;
  }

  .msg-system .msg-text {
    color: inherit;
    font-size: inherit;
  }

  .badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .badge.ok {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
  }

  .badge.fail {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* ── Input bar ── */
  .input-bar {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 12px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    background: #141414;
    border-top: 1px solid #262626;
    flex-shrink: 0;
  }

  textarea {
    flex: 1;
    background: #1c1c1c;
    border: 1px solid #262626;
    border-radius: 20px;
    color: #fafafa;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.4;
    padding: 8px 14px;
    resize: none;
    outline: none;
    min-height: 36px;
    max-height: 120px;
    overflow-y: auto;
  }

  textarea::placeholder {
    color: #3f3f46;
  }

  textarea:focus {
    border-color: #3f3f46;
  }

  textarea:disabled {
    opacity: 0.5;
  }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #ff6b1a;
    color: #0a0a0a;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .send-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .send-btn:not(:disabled):active {
    opacity: 0.8;
  }

  /* ── Scrollbar ── */
  .messages::-webkit-scrollbar {
    width: 4px;
  }
  .messages::-webkit-scrollbar-track {
    background: transparent;
  }
  .messages::-webkit-scrollbar-thumb {
    background: #262626;
    border-radius: 2px;
  }
</style>
