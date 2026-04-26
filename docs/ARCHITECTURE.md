<p align="center">
  <img src="assets/banner-architecture.svg" alt="ARCHITECTURE" width="100%"/>
</p>

<p align="center">
  <strong>skillos_mini</strong> &nbsp;//&nbsp; software architecture &nbsp;//&nbsp; <code>v0.1.0</code>
</p>

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

> Companion to [`CLAUDE.md`](../CLAUDE.md). The CLAUDE.md is the *contract*
> (what we will and won't build). This file is the *map* (what's wired to
> what, with diagrams).

---

## ▸ §1 system overview

skillos_mini is an on-device, mobile-first agentic OS for tradespeople.
The app shell is a Svelte 5 + Capacitor application that orchestrates
domain-specific **cartridges** (sealed bundles of schemas + validators +
prompts + local data) through a **runtime** that runs entirely on the
user's phone.

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','clusterBorder':'#ff6b1a','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, SF Mono, Menlo, Consolas, monospace'}}}%%
flowchart LR
    subgraph Device["🔥 Device · user's Android phone"]
        UI["UI Shell · Svelte 5"]
        Runtime["Cartridge Runtime · TS port"]
        Providers["Provider Bundle<br/>Media · Storage · Share · Geo · Speech"]
        LLM["LLM Stack<br/>cloud · LiteRT · wllama"]
        IDB["IndexedDB<br/>files · projects · blackboards · meta"]
        FS["Filesystem<br/>photos · PDFs · model weights"]
    end

    subgraph Cartridges["💾 Cartridge bundles"]
        Sh["_shared schemas + agents"]
        Te["trade-electricista"]
        Tp["trade-plomero"]
        Tn["trade-pintor"]
    end

    subgraph External["📡 External · opt-in only"]
        WhatsApp((WhatsApp))
        Email((Email))
        Drive((Drive))
        ModelCDN[("Model CDN<br/>HuggingFace")]
        DataMan[("Cartridge data<br/>refresh manifest")]
        Cloud[("Optional cloud LLM<br/>Gemini / OpenRouter")]
    end

    UI --> Runtime
    UI --> Providers
    Runtime --> Cartridges
    Runtime --> LLM
    Runtime --> IDB
    Providers --> FS
    Providers --> IDB
    Providers -.-> WhatsApp
    Providers -.-> Email
    Providers -.-> Drive
    LLM -.-> Cloud
    LLM --> ModelCDN
    Cartridges --> DataMan
```

**The dotted lines are user-triggered traffic only.** Per CLAUDE.md §9.3
(privacy invariants), no outbound traffic carries blackboard contents
unless the user has tapped Share, configured a cloud LLM, or (post-v1.2)
opted into dataset contribution.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §2 the cartridge model

A cartridge is a directory under `cartridges/<name>/` with a fixed shape
the runtime understands. The trade cartridges all follow this layout:

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','clusterBorder':'#ff6b1a','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart TB
    Manifest["cartridge.yaml<br/>name · description · entry_intents<br/>flows · default_flow<br/>blackboard_schema · validators<br/>variables · ui · hooks"]
    Agents["agents/*.md<br/>frontmatter + body + &lt;produces&gt;"]
    Schemas["schemas/*.schema.json<br/>JSON Schema draft-07"]
    Validators["validators/*.py<br/>+ TS twin in validators_builtin.ts"]
    Flows["flows/*.flow.md<br/>step-by-step doc"]
    Data["data/*.json + *.md<br/>local materials, prices, codes"]

    Manifest --> Flows
    Manifest --> Schemas
    Manifest --> Validators
    Flows --> Agents
    Agents --> Schemas
    Agents --> Data
```

### what `ui:` and `hooks:` add

CLAUDE.md §4.1 introduced two additive optional blocks in
`cartridge.yaml`:

```yaml
ui:
  brand_color: "#2563EB"
  emoji: "⚡"
  primary_action:
    label: "Nuevo trabajo"
    flow: intervention
  secondary_actions:
    - { label: "Sólo presupuestar", flow: quote_only }
  library_default_mode: list   # or "portfolio"

hooks:
  on_quote_generated: [{ send_to_blackboard: client_message }]
  on_job_closed:
    - { generate_report: true }
    - { prompt_corpus_consent: false }
```

The **shell** consumes both. The cartridge knows nothing about Capacitor,
Svelte, or any mobile API — it's a portable bundle of declarative data.

### validators · source-of-truth in code, not prompt

Every regulated check ships as a `.py` file (canonical, reviewable like
any code) + a TS port in `mobile/src/lib/cartridge/validators_builtin.ts`
keyed by filename. The mobile runtime indexes the registry at runtime.

Example — `repair_safety.py` (electricista):

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart LR
    BB[Blackboard state] --> RS["repair_safety.py<br/>RS1: live circuit ⇒ power_off_documented<br/>RS2: wet room ⇒ rcd_post_repair<br/>RS3: tablero principal ⇒ matriculado<br/>RS4: completed step ⇒ documented notes"]
    RS -- ok --> Pass([accept])
    RS -- violation --> Fail([reject + show msg])
```

A rule update (e.g. new IEC edition) is a Python diff, not a prompt
rewrite — and it's reviewable like any other code change.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §3 layered architecture

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','clusterBorder':'#ff6b1a','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart TB
    subgraph L1["L1 · Provider abstractions"]
        MP[MediaProvider]
        SP[StorageProvider]
        ShP[ShareProvider]
        GP[GeoProvider]
        SpP[SpeechProvider]
    end

    subgraph L2["L2 · Cartridge runtime"]
        Reg[CartridgeRegistry]
        Run[CartridgeRunner]
        BBClass[Blackboard]
        Vals[validators_builtin]
    end

    subgraph L3["L3 · LLM stack"]
        Build[buildProvider]
        Cloud[LLMClient · cloud OpenAI-compat]
        Local[LocalLLMClient]
        WlB[WllamaBackend]
        LtB[LiteRTBackend]
        Vision[runVisionDiagnoser]
    end

    subgraph L4["L4 · Report pipeline"]
        ReportPDF[buildClientReportPDF]
        QuotePDF[buildQuotePDF]
    end

    subgraph L5["L5 · State stores · Svelte 5 runes"]
        ActiveC[active_cartridge]
        Profile[professional_profile]
        Job[job_store]
        Library[library]
    end

    subgraph L6["L6 · Components"]
        Home[HomeScreen]
        TBan[TradeBanner]
        Flow[TradeFlowSheet]
        Cap[PhotoCapture]
        ProfSh[ProfessionalProfileSheet]
        JobsLi[JobsList]
        Settings[SettingsSheet]
        Onb[Onboarding]
    end

    Run --> Reg
    Run --> BBClass
    Run --> Vals
    Vision --> Build
    Build --> Cloud
    Build --> Local
    Local --> WlB
    Local --> LtB
    LtB -.->|images| Plugin[("native plugin<br/>@skillos/capacitor-litert-lm")]

    Job --> SP
    ReportPDF --> SP
    QuotePDF --> SP
    Flow --> Cap
    Flow --> ReportPDF
    Flow --> QuotePDF
    Flow --> Vision
    Flow --> Job
    Flow --> ProfSh
    Cap --> MP
    Home --> TBan
    Home --> JobsLi
    Home --> Flow
    Settings --> Profile
    Settings --> ActiveC
    ProfSh --> Profile
    JobsLi --> Job
    Onb --> ActiveC
```

The strict rule (CLAUDE.md §4.3): **layers 2-6 never import `@capacitor/*`
directly.** They go through Layer 1 provider interfaces. The Capacitor
adapter is the *only* Capacitor consumer.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §4 the trade-app loop · sequence

This is the killer flow Daniel (electricista), Mauricio (plomero) and
Verónica (pintora) asked for in the simulated interviews.

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','actorBkg':'#1a0500','actorBorder':'#ff2d00','actorTextColor':'#ffd9c2','actorLineColor':'#ff6b1a','signalColor':'#ff6b1a','signalTextColor':'#ffd9c2','labelBoxBkgColor':'#1a0500','labelBoxBorderColor':'#ff2d00','labelTextColor':'#ffd9c2','noteBkgColor':'#001a24','noteTextColor':'#bff7ff','noteBorderColor':'#00d4ff','activationBkgColor':'#ff2d00','sequenceNumberColor':'#000000','background':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
sequenceDiagram
    actor Trade as Tradesperson
    participant Home as HomeScreen
    participant Flow as TradeFlowSheet
    participant Cap as PhotoCapture
    participant MP as MediaProvider
    participant SP as StorageProvider
    participant Vision as runVisionDiagnoser
    participant LLM as LLM Provider
    participant PDF as buildClientReportPDF
    participant ShP as ShareProvider
    participant WA as WhatsApp

    Trade->>Home: Tap "Nuevo trabajo"
    Home->>Flow: open(manifest, action)
    Flow->>Cap: render PhotoCapture role="before"
    Trade->>Cap: tap shutter (3×)
    Cap->>MP: capturePhoto({role,with_geo})
    MP->>SP: saveBlob(photoBytes,"photos")
    MP-->>Cap: PhotoRef{uri, taken_at, role}
    Cap->>Flow: oncapture(ref) ×3
    Flow->>SP: saveJob(state)

    Trade->>Flow: tap Continuar
    Flow->>Trade: Review step
    Trade->>Flow: tap "Auto-diagnóstico"
    Flow->>Vision: runVisionDiagnoser({manifest,uris,cfg})
    Vision->>SP: getBlob(uri) ×3
    SP-->>Vision: Blob ×3
    Vision->>Vision: blob → data URL ×3
    Vision->>LLM: chat([sys,user{images}])
    LLM-->>Vision: "<produces>{...}</produces>"
    Vision->>Vision: parseDiagnosis()
    Vision-->>Flow: DiagnosisEntry
    Flow->>Trade: textareas filled

    Trade->>Flow: edit + tap "Generar reporte"
    Flow->>Flow: setDiagnosis + defaultClientReport(profile)
    Flow->>PDF: buildClientReportPDF(report,{branding,vars})
    PDF->>SP: getBlob(photoUri) ×3
    PDF->>SP: getBlob(logoUri)
    PDF->>SP: saveBlob(pdfBytes,"pdf")
    PDF-->>Flow: {uri, blob}

    Trade->>Flow: tap "Compartir por WhatsApp"
    Flow->>ShP: sharePDF(uri,{channel:"whatsapp"})
    ShP->>WA: system share sheet
    WA-->>Trade: "Mensaje enviado"
    Flow->>SP: setJob(finalized=true)
```

Notes:
- **No backend.** The only outbound traffic is whatever the user sends
  through WhatsApp (their choice) and (optionally) the LLM call to a
  cloud provider they configured per-project.
- **Resumable.** `saveJob` runs at every state change, so dropping the
  app mid-flow and reopening on the Job Library re-enters at the right
  step (`resumeStepFor`).

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §5 the vision pipeline · CLAUDE.md §7.3

Two paths share the same call site. Whichever provider the user
configured per-project is what runs.

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart LR
    User[User taps Auto-diagnóstico] --> Run[runVisionDiagnoser]
    Run --> Storage[StorageProvider.getBlob]
    Storage --> Encode[Blob → data URL]
    Encode --> Msg["ChatMessage<br/>{role:user,<br/>content,<br/>images: data URL[]}"]
    Msg --> Build[buildProvider]

    Build --> Branch{providerCfg.providerId}
    Branch -- "gemini / openrouter-*" --> CloudPath[LLMClient cloud]
    Branch -- "litert-local" --> LocalPath[LocalLLMClient · LiteRTBackend]
    Branch -- "wllama-local" --> Drop[wllama drops images<br/>warn upstream]

    CloudPath --> Serialize["serializeMessage<br/>content array shape"]
    Serialize --> CloudAPI[("Gemini OpenAI compat<br/>OpenRouter GPT-4V<br/>Claude via OpenRouter")]

    LocalPath --> Strip["extractImagePayloads<br/>strip data: prefix"]
    Strip --> Plugin[("native Android plugin<br/>@skillos/capacitor-litert-lm")]
    Plugin --> Kotlin[LiteRTLMPlugin.kt]
    Kotlin --> SessionAPI["LlmInferenceSession<br/>+ enableVisionModality"]
    SessionAPI --> Bitmap[Base64 → Bitmap → MPImage]
    Bitmap --> Generate[generateResponseAsync]
    Generate --> Tokens[token events]

    CloudAPI --> Parse["parseDiagnosis<br/>tagged · fenced · bare-JSON"]
    Tokens --> Parse
    Parse --> Result[DiagnosisEntry]
```

### what unlocks each path

| Path | Model | Where vision runs | Photos leave the device? |
|---|---|---|---|
| Cloud | Gemini 3.x / GPT-4V / Claude | Provider's GPU | **Yes** (encrypted to provider only) |
| Local | Gemma 4 E2B / E4B (.litertlm) | Phone NPU/GPU/CPU | **No** |
| WASM | wllama (text only) | Phone CPU | N/A — images dropped |

The trade picks per-project (Settings → Provider). The default is **off**
— no cloud LLM auto-runs (CLAUDE.md §12). Gemma 4 local is the privacy-
preserving recommendation; cloud is a fallback for older devices.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §6 data flow · what's persisted where

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','clusterBorder':'#ff6b1a','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart TB
    subgraph Memory["⚡ In-memory only"]
        Stores["Svelte 5 rune stores<br/>active_cartridge · professional_profile · projects · library"]
        Sessions[LLM sessions / inference handles]
    end

    subgraph IDB["💾 IndexedDB"]
        Files[("files<br/>cartridge YAML, agents, schemas, data")]
        Projects[("projects<br/>{id, cartridge, name}")]
        Boards[("blackboards<br/>{id, project_id, snapshot}<br/>= Job state")]
        Meta[("meta<br/>active_cartridge, professional_profile,<br/>onboarding_seen")]
        Secrets[("secrets<br/>provider:{projectId} = {apiKey, model}")]
        ModelBlobs[("modelBlobs<br/>downloaded GGUF/LiteRT weights")]
    end

    subgraph FS["📁 Capacitor Filesystem"]
        Photos[("skillos/photos/*<br/>JPEG bytes")]
        PDFs[("skillos/pdf/*<br/>generated reports + quotes")]
        Voice[("skillos/voice/*<br/>audio annotations · v2")]
    end

    Stores -.-> Meta
    Stores -.-> Boards
    Sessions -.-> ModelBlobs

    Photos --> Boards
    PDFs --> Boards
    Voice --> Boards
```

The mapping `Job ↔ BlackboardRecord`:

| JobState field | Snapshot key | Schema |
|---|---|---|
| `photos[]` | `photo_set.photos` | `photo_set.schema.json` |
| `diagnosis` | `diagnosis` | `diagnosis.schema.json` |
| `quote` | `quote` | `quote.schema.json` |
| `client_report` | `client_report` | `client_report.schema.json` |
| `finalized` | `finalized` | bool |
| `updated_at` | `updated_at` | ISO datetime |

Photos are **refs** (`uri: "capacitor-fs://skillos/photos/<id>"`). The
Filesystem is the source of truth for bytes; IndexedDB only stores
references and metadata.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §7 state machine · the trade flow

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
stateDiagram-v2
    [*] --> Capture: open(action)

    Capture --> Capture: capturePhoto
    Capture --> Review: continue (work flow)
    Capture --> Quote: continue (quote_only)

    Review --> Capture: back
    Review --> ProfileGate: continue
    Quote --> Capture: back
    Quote --> ProfileGate: continue

    ProfileGate --> Profile: profile incomplete
    Profile --> ProfileGate: saved
    ProfileGate --> Report: profile ok (work flow)
    ProfileGate --> Share: profile ok (quote flow)

    Report --> Review: edit
    Report --> Sharing: share
    Share --> Quote: edit
    Share --> Sharing: share

    Sharing --> Finalized: success (work flow)
    Sharing --> Quote: success (quote flow — not finalizing)
    Sharing --> Report: error
    Sharing --> Share: error
    Finalized --> [*]
```

`ProfileGate` is the rule "no PDF until you have a credible footer"
(CLAUDE.md §14 Q3). It opens `ProfessionalProfileSheet` with
`require_complete=true` if `name|business + phone` is missing.

The quote share **does not** finalize — the trade can return later, do
the work, and ship a final report from the same job.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §8 build pipeline

### web dev

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart LR
    NPM[npm run dev] --> Predev[scripts/seed-build.mjs]
    Predev --> Manifest[("public/seed/<br/>manifest.json + files")]
    NPM --> Vite[Vite dev server]
    Vite --> Browser[Chrome localhost:5173]
    Browser --> Seed[seedIfNeeded · IndexedDB]
    Seed --> Manifest
```

The `seed-build.mjs` script walks `cartridges/` + `system/` + selected
`projects/` and produces `public/seed/manifest.json` + the bundled file
contents. The Vite dev server serves it; `seedIfNeeded()` reads it on
first load and writes everything into IndexedDB so the runtime sees
files-on-disk semantics.

### android apk

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart LR
    Cap1[npx cap sync android] --> Copy["copy mobile/dist/<br/>+ capacitor-plugins/litert-lm<br/>into android/app/"]
    Copy --> Resolve[Gradle resolves<br/>litertlm:0.2.0 + tasks-vision:0.10.16]
    Resolve --> Compile[Kotlin compile<br/>LiteRTLMPlugin.kt]
    Compile --> APK[APK signed]
    APK --> Distribute["Firebase App Distribution<br/>or Play Store closed-track"]

    NPMI[npm run build] -.-> Cap1
    Plugin["mobile/capacitor-plugins/<br/>litert-lm/"] -.-> Cap1
```

CLAUDE.md §3.3 keeps iOS off the table for now; the iOS plugin is a
stub.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §9 cross-cutting invariants

These are CLAUDE.md §9.3 made operational.

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart LR
    AppOpen[App open] -.->|allowed| ModelCDN[("HF model CDN<br/>cacheable static")]
    AppOpen -.->|allowed| DataMan[("Cartridge data<br/>refresh manifest")]
    AppOpen --x|forbidden| AnyCloud[Any other outbound]

    UserShare[User taps Share] --> WAOK[WhatsApp / Email / Drive]
    UserCloud[User configured cloud LLM] --> CloudOK[Provider endpoint]
    UserDataset[User opted into v1.2 dataset] --> DatasetOK[Cloudflare R2 bucket]
```

The invariants the test suite enforces:
- `MockShareProvider.shared[]` only fills when explicit `sharePDF` calls
  it.
- `extractImagePayloads()` rejects `http(s)` URLs (privacy gate when the
  cloud serializer encounters a remote URL).
- `professional_profile.svelte.ts` normalizes/trims so empty fields
  never leak into a PDF footer the user never reviewed.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §10 test coverage map

```mermaid
%%{init: {'theme':'base', 'themeVariables': {'primaryColor':'#1a0500','primaryTextColor':'#ffd9c2','primaryBorderColor':'#ff2d00','lineColor':'#ff6b1a','secondaryColor':'#001a24','tertiaryColor':'#0a0408','background':'#0a0408','mainBkg':'#1a0500','clusterBkg':'#0a0408','clusterBorder':'#ff6b1a','edgeLabelBackground':'#0a0408','fontFamily':'ui-monospace, monospace'}}}%%
flowchart TB
    subgraph Unit["Pure logic"]
        T1[trade_validators · 24]
        T2[trade_schemas · 25]
        T3[providers_mock · 13]
        T4[active_cartridge · 6]
        T5[job_store · 8]
        T6[job_resume · 8]
        T7[professional_profile · 8]
        T8[quote · 13]
        T9[speech · 10]
        T10[litert_vision · 12]
    end

    subgraph Integration["Integration"]
        I1[cartridge_ui_hooks · 3]
        I2[report_pdf · 5]
        I3[vision_diagnose · 14]
        I4[runner · 3]
        I5[runner_fallback · 2]
    end

    subgraph Legacy["Pre-existing"]
        L1[registry · 6]
        L2[validators_builtin · 9]
        L3[llm_client · 4]
        L4[18 more older suites]
    end

    Unit --> Total["278 / 278 ✓"]
    Integration --> Total
    Legacy --> Total
```

Total: **37 spec files, 278 cases.** New cases this milestone: **150+**
(the trade-app vertical from scratch).

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §11 decision log · architecture-level

These are the architectural calls that shaped what's above. CLAUDE.md
§13 has the full list; here are the ones that surface as topology.

| Decision | Why |
|---|---|
| Cartridge model with deterministic validators | The only differentiator after Anthropic + Google shipped Agent Skills (Apr 2026) |
| Provider abstraction (no direct Capacitor in shell) | Future iOS / desktop ports without app rewrite |
| No backend in MVP | PDF + WhatsApp share = full delivery loop, zero infra cost |
| `.py` validators with TS twins | `.py` is reviewable + portable; TS is what runs in-browser |
| ChatMessage.images additive | Cloud + LiteRT + wllama all use the same call site |
| Schema-driven UI (`ui-hints.json` planned) | One form renderer for all cartridges |
| Filesystem for blobs, IndexedDB for refs | IndexedDB quota issues on photos > 50MB; FS is the right primitive |

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

## ▸ §12 what's not here yet

- **iOS path** — the LiteRT iOS plugin is a stub. Capacitor camera/share
  work but no on-device vision. Off-roadmap until the SDK lands.
- **Local audio transcription** — speech_recognition plugin only does
  live mic. Pre-recorded audio (voice memos attached to photos) needs
  on-device Whisper or similar; left as future work.
- **Multi-tenant / cloud sync** — the device IS the account (CLAUDE.md
  §3.3). Backup to user's own Google Drive is planned for v1.1.
- **Dataset upload pipeline** — designed in CLAUDE.md §10, schemas
  ready, builds in v1.2.

These are *intentionally* not built yet. The CLAUDE.md §3.3 list is the
authoritative contract on scope.

<p align="center">
  <img src="assets/divider.svg" alt="" width="100%"/>
</p>

<p align="center">
  <img src="assets/mark.svg" alt="" width="48"/>
</p>

<p align="center">
  <sub><code>// ARCH.MAP // 12 SECTIONS · 9 DIAGRAMS · 278 TESTS</code></sub>
</p>
