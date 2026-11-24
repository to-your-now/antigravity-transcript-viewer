# Project Architecture — Antigravity Transcript Viewer

> **For AI coding agents & developers:** Read this document completely at the start of any session before inspecting or modifying files. Keep it updated whenever architecture, invariants, or module boundaries change.

## 1. Design Philosophy & Stack
- **Zero External Dependencies:** Pure Python 3.10+ stdlib backend (`http.server.ThreadingHTTPServer` in `server.py`) + Vanilla HTML/CSS/JS frontend (`static/`). Never introduce `pip` dependencies or Node/npm build steps unless explicitly requested.
- **No Build Step:** Edits to `static/index.html`, `static/style.css`, and `static/app.js` take effect immediately on browser `Ctrl + F5`; changes to `server.py` require restarting the server process (do NOT start infinite server daemons autonomously — ask the user).
- **Non-Blocking Log Observation:** Antigravity writes actively to `transcript_full.jsonl`. On Windows especially, holding open file handles breaks writers — all reads are short `open("rb") -> read -> close` bursts.

---

## 2. Repository Layout

```text
transcript_viewer/
├── server.py               # Local HTTP server, JSONL tailer/SSE, file/dir/media endpoints, Win32 paste helper
├── run.bat / run.sh        # Native launchers (Windows / Linux & macOS)
├── README.md               # User-facing English documentation (keep free of implementation internals)
├── README.ru.md            # User-facing Russian documentation (keep free of implementation internals)
├── PROJECT_ARCHITECTURE.md # This engineering & AI agent architectural guide
├── tests/
│   └── test_viewer_features.mjs # Zero-dependency Node unit tests for parsers, model tracking & deep links
└── static/
    ├── index.html          # App shell, toolbar, feed stage, minimap, modals, prompt composer
    ├── style.css           # Dark/Day themes, virtual-scroll geometry, gutters, single-scrollbox rules
    └── app.js              # Virtual scroller, LRU cache, SSE tailing, parsers, Markdown/diff/linkifiers, UI
```

---

## 3. Backend Architecture (`server.py`)

### Transcript Discovery & Context Detection
- **`--brain-dir` / `BRAIN_DIR`:** Defaults to `~/.gemini/antigravity/brain`. Discovery scans `<conv_id>/.system_generated/logs/transcript_full.jsonl` (falling back to `transcript.jsonl`) and extracts metadata (`title`, `project`, `mtime`, `size`, `lines`).
- **`_detect_project_context()`:** Scans transcript content using Windows & POSIX regexes (filtering out internal agent/account directories) to infer `project_root` and `project_files` for clickable short project filenames (e.g. `server.py`).
- **Runtime Capabilities (`get_platform_capabilities()`):** Returned in `/api/transcripts` (`is_windows`, `antigravity_paste`, `folder_os`, `file_os`, `open_notepadpp`) so `static/app.js` (`applyCapabilitiesUI()`) adapts automatically on Linux/macOS (clipboard composer mode, hiding Windows-only Explorer/TotalCmd choices on non-Windows hosts) and exposes Notepad++ editing when `_find_notepadpp_exe()` detects an installation.
- **Formatted HTML File Endpoints (`/api/file`):** Both Markdown (`_send_markdown_html()`) and formatted code (`_send_formatted_code_html()`) views include a top bar with `📄 Исходник (Raw)` and (when available) `📝 Notepad++`.

### Lock-Free JSONL Reading & Live SSE
- **`read_jsonl_range(path, offset)`:** Opens file in `"rb"` mode, detects truncation (`st.st_size < offset` -> `was_reset = True, offset = 0`), reads only up to the last `b"\n"` (partial-line guard while Antigravity is mid-write), closes handle immediately, parses complete lines, and synthesizes a visible `ERROR_MESSAGE` record if a line is malformed JSON.
- **`GET /api/stream/<conv_id>?offset=...`:** Polls `t_path.stat()` (`st_size` / `st_mtime_ns`) every `0.5s` without holding an open file handle. Emits `event: steps` payloads `{ reset, offset, steps }` and `15s` keep-alive `: ping` comments.

### Local Files, Folders & Media Endpoints
- **`_resolve_user_path()`:** Expands `<appDataDir>`, `<conversation-id>`, `%USERPROFILE%`, `$HOME`, `~`, and preserves leading `/` on POSIX `file:///home/...` URIs.
- **`GET /api/file?path=...&conv=...&root=...`:**
  - Default / `fmt=1`: serves formatted HTML views (`_send_dir_html` for directories, `_send_markdown_html` for `.md`, `_send_formatted_code_html` for JSON/code/text).
  - `raw=1`: serves plain unrendered text (`text/plain`).
- **`GET /api/media`:** Resolves path and strictly enforces `relative_to(BRAIN_DIR.resolve())`.
- **`POST /api/open-folder` & `POST /api/open-file`:** Opens local folders (`explorer` / `totalcmd` on Windows; `xdg-open` / `open` on POSIX) and files via `os.startfile` / `xdg-open` / `open` (`mode: "system"`) or directly in Notepad++ (`mode: "notepadpp"`, rejecting directories).

### Win32 `Antigravity.exe` Paste Integration
- Guarded behind `IS_WINDOWS = sys.platform == "win32"`.
- Locates target `Antigravity.exe` window matching active session/project, briefly ensures EN keyboard layout for synthetic `Ctrl+I`, restores prior layout, writes Unicode text to `CF_UNICODETEXT` clipboard, and sends `Ctrl+V` **without pressing `Enter`**.

---

## 4. Frontend Architecture (`static/app.js` & `static/style.css`)

### Section Map of `static/app.js`
- **Lines 1–290 (`State`, `WeakMap`s, Scroll Guard, Batch Checks):** Global `state`, `WeakMap` caches, `attachInnerScrollGuard()`, `scheduleEditScroll()` / `applyInitialEditScrolls()`, `registerOverflowCheck()` / `scheduleCardOverflowCheck()`.
- **Lines 293–455 (`Viewport Scroll Anchor Preservation`):** `isAnchorVisible()`, `captureScrollAnchor()`, `restoreScrollAnchor()`, `preserveScrollAnchor()`.
- **Lines 450–1083 (`Helpers`):** `unescapeNewlines()`, `computeLineDiff()` (LCS diff), `renderToolArgsStructured()`, `renderCodeWithGutter()`, `renderMarkdownWithGutter()`, `parseGenericOutput()`, `isCommandErrorStep()`, timezone calibration (`calibrateUserTimezone()`).
- **Lines 1084–1299 (`Lightweight XSS-safe Markdown Renderer`):** Escapes HTML first, handles code fences, tables, links, inline formatting.
- **Lines 1300–3929 (`Step Parsing & Virtual Scroller Engine`):** `linkifyElement()`, `renderGenericContent()`, `pairToolOutputs()`, `parseUserInputEnvelope()`, `estimateCardHeight()`, `buildStepElement()`, `_lruMap` & `_runPrewarmLruSlice()`, `vResizeObserver`, `syncVirtualWindow()`, `jumpToStep()`.
- **Lines 3930–4995 (`Feed & Totals`):** `renderCacheMapAndToc()`, `renderFullFeed()`, `refreshTocNowIfNeeded()`, `appendNewSteps()`, `scrollToTop()`, `scrollToBottom()`.
- **Lines 4997–5305 (`Sidebar, SSE & Event Listeners`):** `startStream()`, `flushPendingSseSteps()`, `selectTranscript()`, filter/expand/collapse handlers.
- **Lines 5307–5938 (`Minimap, Scroll UI & Inner-Scroll Routing`):** `syncMinimapPositions()`, `updateActiveMinimapNotch()`, `renderPromptMinimap()`, `updateScrollUiOnFrame()`, `scrollbarDragging`, `fileOpenModal`, `PgDn`/`PgUp`/`Home`/`End` key routing.
- **Lines 5940–6610 (`Theme, Raw Toggle, Tooltips, Command Map, Composer, Init`):** `applyTheme()`, `toggleInlineRaw()`, delayed `1.2s` tooltips, `renderCommandMapModal()`, composer resize/submit/status.

---

### Core Subsystems & How They Interact

#### A. Windowed Virtual Scroller & Detached LRU Pre-Renderer
Modeled after TanStack Virtual / Virtuoso so 70,000+ step logs never blow up Chrome Style/Layout/Composite:
- **Pure-JS Index (`_vItems[]`):** Holds all currently filtered feed entries `{ idx, kind ("step"|"expand"), step, attached, attachedCount, stepKey, hasErr, bytes, estHeight, height, measured, offsetY, el, cfgKey }`, indexed by `_vStepToItemMap`.
- **DOM Window (`#vListBox` -> `#vSpacerTop` + `#vWindow` + `#vSpacerBottom`):** `#vWindow` mounts **at most ~42 live nodes** (`overscan = 950px`, shrunk to `450px` during fast drags/flicks).
- **`updateVSpacers()` Collapse Guard (CRITICAL):** Whenever `_vItems.length > 0` and `_winEnd < _winStart` (window unmounted during rebuild or `clearVWindowDom()`), `_vSpacerBottom` MUST be set to `_vTotalHeight` instead of `0px` — otherwise Chrome sees `scrollHeight ≈ 0` and immediately clamps `#feedWrap.scrollTop = 0`!
- **Detached LRU & Idle Prewarm:** `_lruMap` retains up to `CARD_LRU_MAX = 96` detached card DOM nodes across scrollbacks/filter toggles. `_runPrewarmLruSlice()` builds `PREWARM_SIDE_BYTES` (`±1 MB`) around the viewport center via `requestIdleCallback` completely off-DOM (in `<6ms` slices, paused during typing or scrolling).
- **Drag Skeletons:** During scrollbar thumb drags (`_scrollbarDragging`) or high-velocity flicks (`dy`/`pxPerSec`), uncached items mount as `0.1ms` `.step-drag-skeleton` placeholders matching exact `item.height` and upgrade viewport-first within `65ms` after motion settles (`settledDrag: true`).
- **Height Measurement (`vResizeObserver`) & Priority Locks:**
  - Observes mounted real cards in `#vWindow` with zero forced reflow and maintains three explicit priority locks (cleared on user `wheel`/`touchstart`/`mousedown`/non-suppressed `scroll`):
    1. `keepPinnedBottom`: active when `followToggle.checked && !state.userScrolledUp` (or `_pinBottomLockUntil`), **only if** neither `jumpLockValid` nor `anchorLockValid` is active.
    2. `jumpLockValid` (`_activeJumpLock`): holds target step at `desiredTop` after `jumpToStep()`.
    3. `anchorLockValid` (`_activeAnchorLock`): holds clicked/viewed element steady during `preserveScrollAnchor()` across async neighbor card measurements (without disabling `canCompensate` via `_suppressRoScrollCompUntil`).
    4. Fallback `scrollAdjust`: compensates `scrollTop += diff` for cards above `viewTopInList + 8` when `canCompensate` is true.

#### B. Live SSE Stability (`appendNewSteps()` & `startStream()`)
- **UI Jitter Deferral:** `startStream()` buffers incoming SSE steps into `_pendingSseSteps` if the user typed within `400ms` (`_lastComposerTypeMs`) or scrolled within `240ms` (`_lastUserScrollMs`), flushing via `flushPendingSseSteps()`.
- **Non-Collapsing `GENERIC` Pairing Backwalk:** When `GENERIC`/`SYSTEM_MESSAGE`/`ERROR_MESSAGE` arrives with `attachToolOutputs`, `appendNewSteps()` walks back up to the last `USER_INPUT`/`PLANNER_RESPONSE` (`spliceIdx`).
  - If `spliceIdx > _winStart` and `spliceIdx <= _winEnd`, ONLY `_vWindow` tail children with `vIdx >= spliceIdx` are removed (preserving `_winStart`, top cards, and `#vSpacerTop`).
  - `savedScrollTop` is captured at entry and explicitly restored before & after `syncVirtualWindow()` when scrolled up.
- **Unread Jump Tracking:** Tracks `state.firstUnreadStepIndex` when new messages arrive while `userScrolledUp` so clicking `↓ К новому сообщению` jumps to the top of the **first** new step rather than skipping straight to the end.
- **`payload.reset` Preservation:** Captures the top visible `anchorStepKey` before `renderFullFeed()` and restores position via `jumpToStep()` if the user was scrolled up.

#### C. Scroll Anchoring & Localized Inner Scroll
- **`preserveScrollAnchor(fn, triggerEl)`:**
  - `captureScrollAnchor()` assigns **`tier = 0`** to `triggerEl` (with `.tool-result-head` / `.tool-head` / `.step-head` fallbacks) so clicked headers/buttons stay pinned under the user's cursor.
  - **Bottom-Expand Rule:** When expanding downward via a bottom `.show-more-btn` (`setReadMode("full", ...)`, `setArgsMode("full", ...)`, or `foldBtn` expansion), pass the top scroll/content box (`readScrollBox || contentWrap` / `argsContainer`) as `triggerEl` so expansion grows **downward** instead of chasing the bottom button `8,000px` down to the tail. Collapsing passes the clicked button itself.
  - `restoreScrollAnchor()` synchronously aligns `chosen`, measures the toggled card's new height + updates spacers, runs `syncVirtualWindow({ forceRender: true, upgradeSkeletons: true })`, and arms `_activeAnchorLock` (`500ms`).
- **`scrollToTop(openToc)`:** Uses instant `behavior: "auto"` so jumps to TOC/Top cannot be cancelled mid-animation by TOC refresh or layout measurement.
- **Localized Scroll Boxes (`attachInnerScrollGuard` & `scheduleCardOverflowCheck`):**
  - Top TOC `.toc-wrap` uses `attachInnerScrollGuard(el, { scrollOnHover: true })` so wheel scrolling works immediately on hover (chaining to `#feedWrap` at top/bottom bounds).
  - Step `.inner-scroll` boxes (`.tool-args`, `.read-scroll-box`, `.generic-pre`, `.inline-raw-pre`) omit `scrollOnHover` so they capture wheel events only when focused. `scheduleCardOverflowCheck()` in `rAF` toggles `.has-inner-scroll` + `tabIndex = 0` **only** on elements that actually overflow (`scrollHeight > clientHeight + 2`), preventing focus outlines on short non-scrolling boxes like short `CommandLine` cards.
  - Toggle buttons (`Показать полностью` / `Свернуть в прокрутку`) are gated via `.overflow-btn-hidden` in the same `rAF` batch (`scrollHeight > 344` in `full` mode, `scrollHeight > clientHeight + 4` in `scroll` mode). Global default stays under TOC in `#optReadDisplayMode`.

#### D. Rendering, Parsing, Search & Minimap
- **Raw Immutability:** Parsed `step` objects are NEVER mutated. All derived state uses `WeakMap`s (`stepErrCache`, `stepSearchBlobCache`, `stepModelMap`, `stepToolMetaMap`, `stepTaskMetaMap`, `rawStepMap`, `notchItemMap`, `toolArgsReplaceRowMap`, `cardOverflowChecksMap`, `_vElToItemMap`). `{ }` and `Shift + Right-Click` show verbatim disk JSON.
- **Model Tracking (`updateStepModels` & `stepModelMap`):** Scans `<USER_SETTINGS_CHANGE>` envelopes (never prose `<USER_REQUEST>`) in chronological order for `The user changed setting \`Model Selection\` from ... to <Model>.`, tracks live model switches dynamically (including incremental SSE batches), and renders a `.meta-chip-model` badge (`🤖 <Model>`) on every `PLANNER_RESPONSE` header.
- **User Prompt Envelope, `SYSTEM_MESSAGE`, Tags & Deep Links:**
  - `parseUserInputEnvelope()` extracts `<USER_REQUEST>` via EOF-validated suffix matching and surfaces `<ADDITIONAL_METADATA>` / `<USER_SETTINGS_CHANGE>` / unknown `<TAG>` badges (`extractTopLevelXmlTags()`). `unescapeNewlines()` normalizes `\r\n -> \n` only, leaving literal `\n` escapes intact.
  - `SYSTEM_MESSAGE` cards render in clean monospace (`.system-msg-body` via `renderSystemMessageBody()`). `formatPairedSystemTagsInHtml()` uses LIFO stack matching outside `<pre>`/`<code>` so only paired `<SYSTEM_MESSAGE>...</SYSTEM_MESSAGE>` blocks receive `.xml-tag-badge.xml-tag-system`, leaving unpaired prose mentions as plain text.
  - `formatSpecialBracketTagsInHtml()` highlights `[ARTIFACT...]`, `[Attachment...]`, and `@[Quote...]` with distinct theme-safe `.inline-tag` spans outside `<pre>`/`<code>`/`<a>`, preserving nested path auto-linking.
  - **`run_command` Monospace Invariant:** `renderGenericContent()` checks `stepToolMetaMap` (or `Command exited` / `Output:` markers for standalone `GENERIC` cards) so `run_command` / `command_status` outputs always render as `<pre>` monospace rather than accidental Markdown headings.
  - **Bidirectional Background Task Lifecycle Linking (`buildStepMetadataAndTaskIndex()`):** Indexes every `<uuid>/task-<N>` launch (`GENERIC`), caller (`PLANNER_RESPONSE`), wait (`schedule`/`manage_task`), cancel (`Wait cancelled`), and result (`SYSTEM_MESSAGE`). Renders header pills (`.task-link-pill` -> `↗ Результат #N` / `↩ Команда #N`) and inline clickable links (`linkifyTaskIdsInElement()`); live SSE arrival invalidates earlier caller/wait cards when a task finishes.
  - Clicking any `.step-num-chip` (`#N`) copies a canonical dual-purpose deep link (`#conv=<uuid>&step=<N>&project=<name>&file=<jsonl>`); `selectTranscript()` updates URL state via `history.replaceState` with race-safe `_activeLoadSeq` / `_pendingNavStep` guards, and `clearHashStepIfScrolledAway()` clears `&step=` upon manual scrolling/navigation so re-pasting the same `#conv=...&step=...` URL in the browser address bar reliably fires `hashchange` and aligns the card header to `topOffset: 4` (top of `#feedWrap`).
- **Continuous Command Rendering & Boolean Search Engine:**
  - `.cmd-prefix` renders `display: inline` with a real text-node `" "` before `.cmd-main` so searching, selecting, and copying `"pwsh -c git diff"` sees one continuous string.
  - `parseSearchQuery()` / `evalSearchAst()` / `getTurnSearchBlob()` support `"exact phrases"`, unordered multi-word `AND` (searching CLI flags like `-c`/`--stat` literally), `OR`/`|`, `NOT`/`!`, and `(...)` grouping across all log-derived card badges/pills/text (`txt`, `cache`, task pills, unknown fields, `media`, caller + attached outputs). `highlightMatches()` merges inline runs across nested `<span>`/`<a>` tags inside block scopes, auto-opens collapsed `<details>`, ensures folded `read_file` hits past line 800 are rendered when searched, frames the deepest hit container outside its box with `.search-hit-target` (`outline: 5px dashed #d4ff00; outline-offset: 3px;`), and renders non-occluded right-side `.minimap-notch-search` markers on `#promptMinimap` synced via `rAF`.
- **TOC Wrapped Cache Grid (`.cache-strip` & `.toc-row`):** Renders all cached steps in a wrapping grid (`flex-wrap: wrap`) of `14×14px` `.cache-bar` squares with fast `data-tip-delay="80"` hover previews (first message line + timestamp + cache stats). `.cache-map-card` avoids `content-visibility: auto` so offscreen TOC height never collapses virtual coordinates. Clicking a square highlights/scrolls `.toc-wrap` to the corresponding `.toc-row.is-selected` (`tabindex="-1"`); hitting `Enter` or clicking the row jumps `#feedWrap` to the message.
- **Gutters & `:has()` Avoidance:** `.code-gutter-row` and `.md-gutter-row` use `display: block` + `position: relative` + absolute `.code-gutter-num` / `.md-gutter-num` (zero per-line flex overhead). Cards with media get `.has-media` in JS; `:has()` is banned in CSS. Media scales cleanly to container width (`max-width: 100%; max-height: none;`) via `.feed-wrap { min-width: 0; overflow-anchor: none; }`.
- **Single-Scrollbox Invariant:** `.arg-val-md`, `.generic-pre`, `.arg-val` inside outer `.tool-args` or `.read-scroll-box` unroll naturally (`max-height: none; overflow: visible`) so nested vertical scrollbars never occur. `edit_file` highlights `.arg-row-replacement` and scrolls `.tool-args` directly to `Replacement` via batched `applyInitialEditScrolls()`.
- **Zero-DOM Minimap:** `renderPromptMinimap()` and `syncMinimapPositions()` compute `pct` purely from `_vItems` + `offsetY` with zero DOM queries; `updateActiveMinimapNotch()` binary-searches cached `_userNotchCoords` (`O(log N)`) and resyncs settled heights after `750ms`. Hovering any notch removes the native `title` attribute from `#promptMinimap` (restoring it on empty track space) so browser tooltips never overlap `#minimapPreview`.

---

## 5. Critical Invariants (Do Not Break)
1. **Non-Locking File I/O:** Keep `read_jsonl_range()` open-read-close in `"rb"` mode; idle SSE loop may only call `Path.stat()`.
2. **Security Boundaries:** Default host `127.0.0.1`; `_resolve_transcript()` rejects `/`, `\`, `..`; `/api/media` enforces `relative_to(BRAIN_DIR.resolve())`; `renderMarkdown()`, `_send_markdown_html()`, and `_send_dir_html()` escape HTML before formatting.
3. **Raw Step Immutability:** Never inject synthetic fields onto parsed `step` objects — use `WeakMap`s only.
4. **Native UX Conventions:** `thinking` and `tool_calls` `<details>` default to `open = true`; preserve native browser right-click menu; preserve colorblind text/symbol cues + tooltips on all color indicators; keep floating controls clear of the native scrollbar (`right: 54px`) and `#jumpTopBtn`/`#jumpBottomBtn` outside `#feedWrap` (`contain: content` clips `position: fixed`).
5. **Virtual Scroller & Scroll Safety:** Never let `updateVSpacers()` collapse height to `0px` when `_vItems.length > 0`; never attach blocking `{ passive: false }` wheel listeners to `#feed` / `#feedWrap`; keep `overflow-anchor: none` on `.feed-wrap`; keep `#feedWrap`'s `ResizeObserver` width-only.
6. **Documentation Separation:** Keep `README.md` and `README.ru.md` focused purely on user value and workflows; document all internal implementation mechanics here in `PROJECT_ARCHITECTURE.md`.
7. **Privacy & Verification Gate (Zero-Tolerance):** Never commit or publish secrets, `$env:USERNAME`, or local user paths (`C:\Users\...`, `E:\...`). Use the unified safe committer (`git_commit_safe.py` via `.commit_plan.json`) so syntax checks, tests, and full privacy scans run automatically before every commit.

## 6. Verification Checklist
Standalone unit test suite (requires Node.js 18+, zero npm deps):
```powershell
pwsh -c node tests\test_viewer_features.mjs
```
Tests extract real helpers directly from `static/app.js` and verify:
- `formatPairedSystemTagsInHtml()` / `renderSystemMessageBody()` — paired `<SYSTEM_MESSAGE>` tag badging vs unpaired prose & inline `<code>` protection.
- `formatSpecialBracketTagsInHtml()` — `@[Quote]`, `[ARTIFACT]`, `[Attachment]` inline highlighting & `<code>` protection.
- `updateStepModels()` / `extractModelNamesFromSettings()` — dynamic `Model Selection` tracking across `USER_SETTINGS_CHANGE` (dots in model names, multi-switch blocks, prose immunity, `None` resets).
- `buildStepShareUrl()` / `parseHashNavigation()` — canonical `#conv=...&step=...&project=...&file=...` deep-link formatting and routing.
- `parseSearchQuery()` / `evalSearchAst()` / `getTurnSearchBlob()` — exact quoted phrase search, unordered multi-word `AND`, `OR`, `-negation`, grouping, and caller + attached output matching.
- `buildStepMetadataAndTaskIndex()` / `resolveTaskLinkDestination()` — bidirectional background task launch/wait/cancel <-> result linking & `stepToolMetaMap`.

For pre-commit checks + safe local commit, configure `.commit_plan.json` with custom `"checks"` (`["python", "server.py", "--check"]` and `["node", "tests/test_viewer_features.mjs"]`) and run:
```powershell
pwsh -c python $env:USERPROFILE\.gemini\config\skills\local-git-github-gh\scripts\git_commit_safe.py
```
