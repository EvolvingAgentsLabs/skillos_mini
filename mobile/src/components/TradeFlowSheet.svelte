<script lang="ts">
  /**
   * TradeFlowSheet — end-to-end trade job loop, additive sheet on top of
   * the existing app shell. Three phases (CLAUDE.md §5.2 → §5.3 → §5.4):
   *
   *   1. capture   — PhotoCapture in a loop (≥1 photo to advance)
   *   2. review    — read-only timeline + manual diagnosis textarea
   *                  (this is where the LLM agents will hook in once §7.3
   *                  vision pipeline lands; today the trade types it).
   *   3. report    — render client_report PDF on-device + share
   *                  via ShareProvider.
   *
   * Persists progress to IndexedDB via job_store on every transition so a
   * dropped session resumes cleanly. The sheet does NOT import Capacitor
   * directly — providers and the cartridge runtime do all platform work.
   */
  import type { CartridgeManifest, CartridgeUIAction } from "$lib/cartridge/types";
  import type { PhotoRef, ProviderBundle } from "$lib/providers/types";
  import { getProviders } from "$lib/providers";
  import {
    addPhoto,
    defaultClientReport,
    defaultQuote,
    finalize,
    isQuoteOnlyFlow,
    loadJob,
    newJob,
    recalcQuote,
    resumeQuoteStepFor,
    resumeStepFor,
    saveJob,
    setClientReport,
    setDiagnosis,
    setQuote,
    type JobState,
  } from "$lib/state/job_store.svelte";
  import {
    isProfileComplete,
    loadProfessionalProfile,
    professionalProfile,
  } from "$lib/state/professional_profile.svelte";
  import { buildClientReportPDF, type ClientReport, type ProfessionalInfo } from "$lib/report/pdf";
  import { buildQuotePDF, type Quote, type QuoteLineItem } from "$lib/report/quote_pdf";
  import { runVisionDiagnoser } from "$lib/llm/vision_diagnose";
  import { loadProviderConfig } from "$lib/state/provider_config";
  import PhotoCapture from "$components/PhotoCapture.svelte";
  import ProfessionalProfileSheet from "$components/ProfessionalProfileSheet.svelte";

  type Step = "capture" | "review" | "report" | "quote" | "share";

  interface Props {
    open: boolean;
    manifest: CartridgeManifest;
    project_id: string;
    action: CartridgeUIAction | null;
    /** Optional: when set, hydrate from an existing JobState instead of newJob. */
    resume_job_id?: string | null;
    onclose: () => void;
  }

  let { open, manifest, project_id, action, resume_job_id = null, onclose }: Props = $props();

  let step = $state<Step>("capture");
  let job = $state<JobState | null>(null);
  let providers = $state<ProviderBundle | null>(null);
  let busy = $state(false);
  let lastError = $state<string | null>(null);
  let pdfUri = $state<string | null>(null);
  let pdfPreviewUrl = $state<string | null>(null);
  let profileSheetOpen = $state(false);
  const profileStore = professionalProfile();

  // Diagnosis-step inputs (manual until §7.3 vision agent lands).
  let diagSummary = $state("");
  let diagClientExpl = $state("");
  let diagSeverity = $state(3);

  // Voice annotation state.
  let voiceAvailable = $state(false);
  let voiceListening = $state<"summary" | "client" | null>(null);

  // Auto-diagnóstico (LLM vision) state.
  let providerConfigured = $state(false);
  let autoDiagnosing = $state(false);

  // Quote-step working copy. Mutating recalcs totals via recalcQuote.
  let quoteDraft = $state<Quote | null>(null);

  const isQuoteFlow = $derived(isQuoteOnlyFlow(action?.flow ?? ""));

  // Initialize once `open` flips true.
  $effect(() => {
    if (open && !job) {
      void initJob();
    }
    if (!open) {
      cleanup();
    }
  });

  async function initJob(): Promise<void> {
    void getProviders().then(async (p) => {
      providers = p;
      voiceAvailable = await p.speech.isAvailable();
    });
    void loadProfessionalProfile();
    void loadProviderConfig(project_id).then((cfg) => {
      providerConfigured = Boolean(cfg);
    });
    if (resume_job_id) {
      const existing = await loadJob(resume_job_id);
      if (existing) {
        job = existing;
        // Seed inputs from the resumed diagnosis so editing is sticky.
        if (existing.diagnosis) {
          diagSummary = existing.diagnosis.summary ?? "";
          diagClientExpl = existing.diagnosis.client_explanation ?? "";
          diagSeverity = existing.diagnosis.severity ?? 3;
        }
        const quoteOnly = isQuoteOnlyFlow(existing.flow);
        if (quoteOnly) {
          step = quoteStepToSheetStep(resumeQuoteStepFor(existing));
          quoteDraft = existing.quote
            ? recalcQuote(existing.quote)
            : defaultQuote(existing, manifest.variables);
          if (step === "share" && existing.quote) {
            await renderQuotePdf(existing.quote);
          }
        } else {
          step = resumeStepFor(existing);
          if (step === "report" && existing.client_report) {
            await renderReportPdf(existing.client_report);
          }
        }
        return;
      }
      // Resume requested but the row vanished — fall through to fresh job.
    }
    const flowName = action?.flow ?? manifest.default_flow;
    const j = newJob({
      project_id,
      cartridge: manifest.name,
      flow: flowName,
    });
    job = j;
    await saveJob(j);
  }

  function cleanup(): void {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    pdfPreviewUrl = null;
    pdfUri = null;
    job = null;
    step = "capture";
    diagSummary = "";
    diagClientExpl = "";
    diagSeverity = 3;
    quoteDraft = null;
    busy = false;
    lastError = null;
  }

  async function handleCapture(ref: PhotoRef): Promise<void> {
    if (!job) return;
    job = addPhoto(job, {
      uri: ref.uri,
      taken_at: ref.taken_at,
      role: ref.role,
      byte_size: ref.byte_size,
      width: ref.width,
      height: ref.height,
    });
    await saveJob(job);
  }

  async function advance(to: Step): Promise<void> {
    lastError = null;
    if (to === "capture") {
      step = "capture";
      return;
    }

    // Quote-only path: capture → quote → share.
    if (to === "quote") {
      if (!job || job.photos.length === 0) {
        lastError = "Sacá al menos una foto antes de continuar.";
        return;
      }
      if (!quoteDraft) {
        quoteDraft = job.quote ? recalcQuote(job.quote) : defaultQuote(job, manifest.variables);
      }
      step = "quote";
      return;
    }
    if (to === "share") {
      if (!job || !quoteDraft) return;
      if (!isProfileComplete(profileStore.profile)) {
        profileSheetOpen = true;
        return;
      }
      // Persist the quote, then render PDF.
      const fresh = recalcQuote(quoteDraft);
      job = setQuote(job, fresh);
      await saveJob(job);
      step = "share";
      await renderQuotePdf(fresh);
      return;
    }

    // Work-loop path: capture → review → report.
    if (to === "review") {
      if (!job || job.photos.length === 0) {
        lastError = "Sacá al menos una foto antes de continuar.";
        return;
      }
      step = "review";
      return;
    }
    if (to === "report") {
      if (!job) return;
      if (!isProfileComplete(profileStore.profile)) {
        profileSheetOpen = true;
        return;
      }
      job = setDiagnosis(job, {
        trade: manifest.name.replace(/^trade-/, ""),
        severity: diagSeverity,
        problem_categories: ["manual"],
        summary: diagSummary || undefined,
        client_explanation: diagClientExpl || undefined,
      });
      const report = defaultClientReport(
        job,
        {
          "cartridge.warranty_default": stringVar(manifest.variables, "warranty_default"),
          "cartridge.professional_disclaimer": stringVar(manifest.variables, "professional_disclaimer"),
        },
        profileStore.profile,
      );
      job = setClientReport(job, report);
      await saveJob(job);
      step = "report";
      await renderReportPdf(report);
      return;
    }
  }

  async function renderReportPdf(report: ClientReport): Promise<void> {
    if (!providers) providers = await getProviders();
    busy = true;
    lastError = null;
    try {
      const result = await buildClientReportPDF(report, {
        providers,
        branding: {
          brand_color: manifest.ui?.brand_color,
          accent_color: manifest.ui?.accent_color,
          emoji: manifest.ui?.emoji,
          trade_label: prettyName(manifest.name),
        },
        title: `Reporte ${prettyName(manifest.name)}`,
      });
      pdfUri = result.uri;
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      pdfPreviewUrl = URL.createObjectURL(result.blob);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  async function renderQuotePdf(quote: Quote): Promise<void> {
    if (!providers) providers = await getProviders();
    busy = true;
    lastError = null;
    try {
      const result = await buildQuotePDF(quote, {
        providers,
        branding: {
          brand_color: manifest.ui?.brand_color,
          accent_color: manifest.ui?.accent_color,
          emoji: manifest.ui?.emoji,
          trade_label: `Presupuesto ${prettyName(manifest.name)}`,
        },
        professional: profileStore.profile
          ? profileToInfo(profileStore.profile)
          : undefined,
        title: `Presupuesto ${prettyName(manifest.name)}`,
      });
      pdfUri = result.uri;
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      pdfPreviewUrl = URL.createObjectURL(result.blob);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function profileToInfo(p: NonNullable<typeof profileStore.profile>): ProfessionalInfo {
    return {
      name: p.name,
      business_name: p.business_name,
      matriculation_id: p.matriculation_id,
      matriculated: p.matriculated,
      phone: p.phone,
      rut: p.rut,
      logo_uri: p.logo_uri,
    };
  }

  function quoteStepToSheetStep(s: "capture" | "quote" | "share"): Step {
    return s;
  }

  function addQuoteLine(): void {
    if (!quoteDraft) return;
    const newLine: QuoteLineItem = {
      kind: "material",
      name: "",
      qty: 1,
      unit: "u",
      unit_price: 0,
      total: 0,
    };
    quoteDraft = recalcQuote({
      ...quoteDraft,
      line_items: [...quoteDraft.line_items, newLine],
    });
  }

  function removeQuoteLine(idx: number): void {
    if (!quoteDraft) return;
    if (quoteDraft.line_items.length <= 1) return; // schema requires ≥1
    quoteDraft = recalcQuote({
      ...quoteDraft,
      line_items: quoteDraft.line_items.filter((_, i) => i !== idx),
    });
  }

  function updateQuoteLine(idx: number, patch: Partial<QuoteLineItem>): void {
    if (!quoteDraft) return;
    const next = quoteDraft.line_items.map((li, i) => (i === idx ? { ...li, ...patch } : li));
    quoteDraft = recalcQuote({ ...quoteDraft, line_items: next });
  }

  function updateQuoteField(patch: Partial<Quote>): void {
    if (!quoteDraft) return;
    quoteDraft = recalcQuote({ ...quoteDraft, ...patch });
  }

  async function shareReport(): Promise<void> {
    if (!providers || !pdfUri || !job) return;
    busy = true;
    try {
      const isQuote = isQuoteFlow || step === "share";
      const titleText = isQuote
        ? `Presupuesto ${prettyName(manifest.name)}`
        : `Reporte ${prettyName(manifest.name)}`;
      const messageText = isQuote
        ? job.quote?.description ?? "Presupuesto de trabajo"
        : job.client_report?.summary ?? "Reporte de trabajo";
      await providers.share.sharePDF(pdfUri, {
        title: titleText,
        message: messageText,
        channel: "whatsapp",
      });
      // Only mark "finalized" when it's the closing artifact (final report).
      // A quote share doesn't end the job — the trade may still execute later.
      if (!isQuote) {
        job = finalize(job);
        await saveJob(job);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function close(): void {
    onclose();
  }

  /**
   * Send the captured photos through the configured LLM (vision-capable
   * cloud provider, or local LiteRT once §7.3 vision API lands) and fill
   * the diagnosis textareas with the model's output.
   *
   * Gated on `providerConfigured` — never auto-runs cloud LLMs (§12).
   * The provider is per-project, configured by the user.
   */
  async function runAutoDiagnose(): Promise<void> {
    if (!job || autoDiagnosing) return;
    if (job.photos.length === 0) {
      lastError = "Sacá al menos una foto para que el modelo pueda mirar.";
      return;
    }
    autoDiagnosing = true;
    lastError = null;
    try {
      const cfg = await loadProviderConfig(project_id);
      if (!cfg) {
        lastError = "Configurá un proveedor de LLM antes de usar Auto-diagnóstico.";
        return;
      }
      const result = await runVisionDiagnoser({
        manifest,
        photo_uris: job.photos.map((p) => p.uri),
        providerCfg: cfg,
      });
      if (result.summary) diagSummary = appendChunk(diagSummary, result.summary);
      if (result.client_explanation) {
        diagClientExpl = appendChunk(diagClientExpl, result.client_explanation);
      }
      if (typeof result.severity === "number") diagSeverity = result.severity;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      autoDiagnosing = false;
    }
  }

  /**
   * Open the mic, transcribe in es-UY (default), append the result to one
   * of the diagnosis textareas. Removes the typing-in-front-of-client
   * friction Daniel called out in the simulated interviews.
   */
  async function listenInto(target: "summary" | "client"): Promise<void> {
    if (!providers || voiceListening) return;
    if (typeof providers.speech.listen !== "function") return;
    voiceListening = target;
    lastError = null;
    try {
      const result = await providers.speech.listen({
        language: "es-UY",
        max_duration_ms: 12_000,
      });
      const text = (result.text ?? "").trim();
      if (text) {
        if (target === "summary") {
          diagSummary = appendChunk(diagSummary, text);
        } else {
          diagClientExpl = appendChunk(diagClientExpl, text);
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      voiceListening = null;
    }
  }

  function appendChunk(existing: string, chunk: string): string {
    const trimmedExisting = existing.replace(/\s+$/, "");
    if (!trimmedExisting) return chunk;
    return `${trimmedExisting} ${chunk}`;
  }

  async function onProfileClose(saved: boolean): Promise<void> {
    profileSheetOpen = false;
    if (saved) {
      // Profile complete now — proceed to the Report step.
      await advance("report");
    }
  }

  function stringVar(vars: Record<string, unknown>, key: string): string {
    const v = vars?.[key];
    return typeof v === "string" ? v : "";
  }

  function prettyName(name: string): string {
    return name.replace(/^trade-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  const brand = $derived(manifest.ui?.brand_color ?? "#374151");
  const photoCount = $derived(job?.photos.length ?? 0);
</script>

{#if open}
  <div class="sheet" role="dialog" aria-modal="true" style="--brand: {brand}">
    <header class="head">
      <button class="ghost" onclick={close} aria-label="Cerrar">✕</button>
      <div class="title">
        <span class="emoji" aria-hidden="true">{manifest.ui?.emoji ?? "🧩"}</span>
        <span>{action?.label ?? prettyName(manifest.name)}</span>
      </div>
      <div class="step-pill">{stepLabel(step)}</div>
    </header>

    <main class="body">
      {#if step === "capture"}
        <div class="capture-wrap">
          <PhotoCapture
            role="before"
            brand_color={brand}
            with_geo={false}
            oncapture={(r) => handleCapture(r)}
            oncancel={close}
          />
        </div>
        <footer class="bar">
          <div class="bar-info">{photoCount} {photoCount === 1 ? "foto" : "fotos"}</div>
          <button
            class="primary"
            disabled={photoCount === 0}
            onclick={() => advance(isQuoteFlow ? "quote" : "review")}
          >
            Continuar
          </button>
        </footer>
      {:else if step === "quote" && quoteDraft}
        <section class="scroll">
          <h2>Presupuesto</h2>
          <p class="muted">
            Editá los items y los precios. El total se recalcula automáticamente.
          </p>

          <label>
            <span>Descripción para el cliente</span>
            <textarea
              rows="3"
              value={quoteDraft.description}
              oninput={(e) => updateQuoteField({ description: (e.currentTarget as HTMLTextAreaElement).value })}
              placeholder="Qué incluye el trabajo, cómo se ejecuta…"
            ></textarea>
          </label>

          <h2>Items ({quoteDraft.line_items.length})</h2>
          <div class="quote-items">
            {#each quoteDraft.line_items as li, i (i)}
              <div class="quote-line">
                <div class="quote-line-row">
                  <select
                    value={li.kind ?? "material"}
                    onchange={(e) =>
                      updateQuoteLine(i, {
                        kind: (e.currentTarget as HTMLSelectElement).value as QuoteLineItem["kind"],
                      })}
                  >
                    <option value="labor">Mano de obra</option>
                    <option value="material">Material</option>
                    <option value="fee">Cargo</option>
                    <option value="discount">Descuento</option>
                  </select>
                  <input
                    type="text"
                    value={li.name}
                    placeholder="Descripción"
                    oninput={(e) => updateQuoteLine(i, { name: (e.currentTarget as HTMLInputElement).value })}
                  />
                  <button
                    class="ghost"
                    type="button"
                    onclick={() => removeQuoteLine(i)}
                    disabled={quoteDraft.line_items.length <= 1}
                    aria-label="Quitar item"
                  >
                    ✕
                  </button>
                </div>
                <div class="quote-line-row">
                  <input
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    value={li.qty}
                    placeholder="Cantidad"
                    oninput={(e) =>
                      updateQuoteLine(i, { qty: Number((e.currentTarget as HTMLInputElement).value) || 0 })}
                  />
                  <input
                    type="text"
                    value={li.unit}
                    placeholder="Unidad"
                    oninput={(e) => updateQuoteLine(i, { unit: (e.currentTarget as HTMLInputElement).value })}
                  />
                  <input
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    value={li.unit_price}
                    placeholder="Precio"
                    oninput={(e) =>
                      updateQuoteLine(i, {
                        unit_price: Number((e.currentTarget as HTMLInputElement).value) || 0,
                      })}
                  />
                  <span class="quote-line-total">{li.total.toFixed(2)}</span>
                </div>
              </div>
            {/each}
          </div>
          <button type="button" class="ghost add-line" onclick={addQuoteLine}>
            + Agregar item
          </button>

          <h2>Totales</h2>
          <div class="totals">
            <div><span>Subtotal</span><span>{quoteDraft.subtotal.toFixed(2)}</span></div>
            <div>
              <span>IVA ({((quoteDraft.tax_rate ?? 0) * 100).toFixed(0)}%)</span>
              <span>{(quoteDraft.tax ?? 0).toFixed(2)}</span>
            </div>
            <div class="totals-grand">
              <span>Total {quoteDraft.currency ?? "UYU"}</span>
              <span>{quoteDraft.total.toFixed(2)}</span>
            </div>
          </div>

          <label>
            <span>Validez (fecha)</span>
            <input
              type="date"
              value={quoteDraft.valid_until}
              onchange={(e) => updateQuoteField({ valid_until: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>

          {#if lastError}
            <p class="error" role="alert">{lastError}</p>
          {/if}
        </section>
        <footer class="bar">
          <button class="ghost" onclick={() => (step = "capture")}>Atrás</button>
          <button class="primary" onclick={() => advance("share")}>Generar presupuesto</button>
        </footer>
      {:else if step === "review"}
        <section class="scroll">
          <h2>Diagnóstico</h2>
          <p class="muted">
            Escribí, dictá o usá Auto-diagnóstico. Sale en el PDF que le mandás al cliente.
          </p>

          {#if providerConfigured}
            <button
              type="button"
              class="auto-btn"
              class:listening={autoDiagnosing}
              disabled={autoDiagnosing || !job || job.photos.length === 0}
              onclick={runAutoDiagnose}
            >
              {autoDiagnosing ? "● Analizando fotos…" : "✨ Auto-diagnóstico"}
            </button>
          {/if}
          <label>
            <span class="field-label">
              Resumen técnico
              {#if voiceAvailable}
                <button
                  type="button"
                  class="mic-btn"
                  class:listening={voiceListening === "summary"}
                  disabled={voiceListening !== null && voiceListening !== "summary"}
                  onclick={() => listenInto("summary")}
                  aria-label="Dictar resumen"
                >
                  {voiceListening === "summary" ? "● Escuchando…" : "🎤 Hablar"}
                </button>
              {/if}
            </span>
            <textarea bind:value={diagSummary} rows="3" placeholder="Lo que viste y por qué importa…"></textarea>
          </label>
          <label>
            <span class="field-label">
              Explicación al cliente
              {#if voiceAvailable}
                <button
                  type="button"
                  class="mic-btn"
                  class:listening={voiceListening === "client"}
                  disabled={voiceListening !== null && voiceListening !== "client"}
                  onclick={() => listenInto("client")}
                  aria-label="Dictar explicación"
                >
                  {voiceListening === "client" ? "● Escuchando…" : "🎤 Hablar"}
                </button>
              {/if}
            </span>
            <textarea
              bind:value={diagClientExpl}
              rows="3"
              placeholder="2-3 oraciones en lenguaje llano"
            ></textarea>
          </label>
          <label>
            <span>Severidad: {diagSeverity}</span>
            <input type="range" min="1" max="5" bind:value={diagSeverity} />
          </label>

          <h2>Fotos ({photoCount})</h2>
          <div class="thumbs">
            {#each job?.photos ?? [] as p, i (p.uri + i)}
              <div class="thumb" title={p.role}>
                <span class="role">{roleLabel(p.role)}</span>
              </div>
            {/each}
          </div>

          {#if lastError}
            <p class="error" role="alert">{lastError}</p>
          {/if}
        </section>
        <footer class="bar">
          <button class="ghost" onclick={() => (step = "capture")}>Atrás</button>
          <button class="primary" onclick={() => advance("report")}>Generar reporte</button>
        </footer>
      {:else}
        {@const isShareStep = step === "share"}
        <section class="scroll">
          <h2>{isShareStep ? "Presupuesto" : "Reporte"}</h2>
          {#if busy}
            <p class="muted">Generando PDF…</p>
          {:else if pdfPreviewUrl}
            <div class="preview">
              <iframe title={isShareStep ? "Presupuesto" : "Reporte"} src={pdfPreviewUrl}></iframe>
            </div>
          {:else if lastError}
            <p class="error" role="alert">{lastError}</p>
          {/if}
        </section>
        <footer class="bar">
          <button
            class="ghost"
            onclick={() => (step = isShareStep ? "quote" : "review")}
          >
            Editar
          </button>
          <button
            class="primary"
            disabled={busy || !pdfUri}
            onclick={shareReport}
          >
            Compartir por WhatsApp
          </button>
        </footer>
      {/if}
    </main>

    {#if profileSheetOpen}
      <ProfessionalProfileSheet
        open={profileSheetOpen}
        require_complete={true}
        brand_color={brand}
        onclose={onProfileClose}
      />
    {/if}
  </div>
{/if}

<script lang="ts" module>
  import type { PhotoRole } from "$lib/providers/types";
  function stepLabel(s: "capture" | "review" | "report" | "quote" | "share"): string {
    if (s === "capture") return "1 · Fotos";
    if (s === "review") return "2 · Diagnóstico";
    if (s === "report") return "3 · Reporte";
    if (s === "quote") return "2 · Presupuesto";
    return "3 · Compartir";
  }
  function roleLabel(r: PhotoRole): string {
    if (r === "before") return "Antes";
    if (r === "during") return "Durante";
    if (r === "after") return "Después";
    return "Detalle";
  }
</script>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    background: var(--bg, #fff);
    color: var(--fg, #111);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border, #e5e7eb);
    background: var(--brand);
    color: #fff;
  }
  .ghost {
    background: transparent;
    border: 0;
    color: inherit;
    font-size: 18px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
  }
  .emoji {
    font-size: 18px;
  }
  .step-pill {
    background: rgba(255, 255, 255, 0.18);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .capture-wrap {
    flex: 1;
    min-height: 0;
  }
  .scroll {
    flex: 1;
    overflow: auto;
    padding: 16px;
  }
  .scroll h2 {
    margin: 16px 0 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--brand);
  }
  .scroll h2:first-child {
    margin-top: 0;
  }
  .scroll label {
    display: block;
    margin-bottom: 12px;
  }
  .scroll label > span {
    display: block;
    font-size: 12px;
    color: var(--fg-dim, #6b7280);
    margin-bottom: 4px;
  }
  textarea,
  input[type="range"] {
    width: 100%;
    box-sizing: border-box;
  }
  textarea {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    padding: 8px;
    font: inherit;
  }
  .thumbs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
  }
  .thumb {
    aspect-ratio: 1 / 1;
    background: var(--bg-3, #f3f4f6);
    border-radius: 8px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 4px;
    font-size: 11px;
    color: var(--fg-dim, #6b7280);
  }
  .role {
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
  }
  .preview {
    width: 100%;
    height: 60vh;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px;
    overflow: hidden;
  }
  .preview iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-2, #f9fafb);
    border-top: 1px solid var(--border, #e5e7eb);
  }
  .bar-info {
    color: var(--fg-dim, #6b7280);
    font-size: 13px;
  }
  .primary {
    background: var(--brand);
    color: #fff;
    border: 0;
    padding: 10px 16px;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .muted {
    color: var(--fg-dim, #6b7280);
    margin-bottom: 12px;
  }
  .error {
    color: #b91c1c;
    margin-top: 12px;
    font-size: 13px;
  }

  /* Quote editor */
  .quote-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .quote-line {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    padding: 8px;
    background: var(--bg-2, #f9fafb);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .quote-line-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .quote-line-row input,
  .quote-line-row select {
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 6px;
    font: inherit;
    box-sizing: border-box;
  }
  .quote-line-row > .ghost {
    flex: 0 0 auto;
    background: transparent;
    border: 0;
    color: var(--fg-dim, #6b7280);
    cursor: pointer;
    padding: 6px 8px;
  }
  .quote-line-row > .ghost:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .quote-line-total {
    flex: 0 0 80px;
    text-align: right;
    font-feature-settings: "tnum";
    font-weight: 600;
  }
  .add-line {
    width: 100%;
    margin-top: 8px;
    padding: 10px;
    border: 1px dashed var(--border, #e5e7eb);
    background: transparent;
    border-radius: 10px;
    cursor: pointer;
    color: var(--fg-dim, #6b7280);
    font: inherit;
  }
  .totals {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    background: var(--bg-2, #f9fafb);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 10px;
    margin-bottom: 12px;
  }
  .totals > div {
    display: flex;
    justify-content: space-between;
    font-feature-settings: "tnum";
  }
  .totals-grand {
    font-weight: 700;
    color: var(--brand);
    border-top: 1px solid var(--border, #e5e7eb);
    padding-top: 6px;
    font-size: 16px;
  }

  /* Voice annotation */
  .field-label {
    display: flex !important;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .mic-btn {
    background: transparent;
    border: 1px solid var(--brand);
    color: var(--brand);
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font: inherit;
  }
  .mic-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .mic-btn.listening {
    background: var(--brand);
    color: #fff;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .auto-btn {
    width: 100%;
    margin-bottom: 12px;
    padding: 10px 14px;
    background: var(--brand);
    color: #fff;
    border: 0;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    font: inherit;
  }
  .auto-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .auto-btn.listening {
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.65; }
  }
</style>
