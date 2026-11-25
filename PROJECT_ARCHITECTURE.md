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
│   ├── test_server_commands.py  # Zero-dependency stdlib unittest for /api/run-command & pwsh quoting parity
│   └── test_viewer_features.mjs # Zero-dependency Node unit tests for parsers, model tracking & deep links
├── static/
│   ├── i18n/
│   │   ├── en.json         # Default English UI & server-view translations
│   │   └── ru.json         # Russian translations (strict leaf-key parity verified by unit tests)
│   ├── index.html          # App shell (`lang="en"`), toolbar, `#langSelect`, search popover, feed stage, minimap, modals
│   ├── style.css           # Dark/Day themes, virtual-scroll geometry, `.search-omitted`/`#searchPopover`, single-scrollbox rules
│   └── app.js              # i18n runtime, virtual scroller, LRU cache, SSE tailing, parsers, search engine, UI
```

---

## 3. Backend Architecture (`server.py`)

### Transcript Discovery & Context Detection
- **`--brain-dir` / `BRAIN_DIR`:** Defaults to `~/.gemini/antigravity/brain`. Discovery scans `<conv_id>/.system_generated/logs/transcript_full.jsonl` (falling back to `transcript.jsonl`) and extracts metadata (`title`, `project`, `mtime`, `size`, `lines`).
- **`_detect_project_context()`:** Scans transcript content using Windows & POSIX regexes (filtering out internal agent/account directories) to infer `project_root` and `project_files` for clickable short project filenames (e.g. `server.py`).
- **Runtime Capabilities & Localization:** `/api/transcripts` returns `is_windows`, `default_shell`, `antigravity_paste`, `folder_os`, `file_os`, `open_notepadpp` so `static/app.js` (`applyCapabilitiesUI()`) adapts automatically on Linux/macOS and exposes Notepad++ editing when `_find_notepadpp_exe()` detects an installation. Static `static/i18n/{en,ru}.json` locales are served explicitly and cached in `_get_server_i18n()` / `_srv_t()` so server-rendered views (`/api/file?fmt=1`) and API error/status messages honor `?lang=` or `body.lang` (`en` default).
- **Live Command Runner (`POST /api/run-command` -> `execute_console_command()`) & Interactive Terminal (`POST /api/open-terminal` -> `open_interactive_terminal()`):** Enforces local `Origin`/`Referer` host checks (`127.0.0.1` / `localhost` / `::1`) and shares `_resolve_project_cwd()`. `execute_console_command()` runs inline commands via `pwsh` `-NoLogo -NoProfile -NonInteractive -Command` (`pwsh`/`bash`/`sh` on POSIX) with `NO_COLOR=1`, `TERM=dumb`, `_strip_ansi()` VT/ANSI escape sanitization, `stdin=subprocess.DEVNULL`, `CREATE_NO_WINDOW`, and 30s timeout tree-kill. `open_interactive_terminal()` launches a visible standalone interactive console window (`CREATE_NEW_CONSOLE` + `-NoExit -EncodedCommand` on Windows; `Terminal.app` or desktop terminal emulator on POSIX) in the active project folder, optionally running the target command, adding it to PSReadLine history, and staying open at the interactive prompt.
- **Formatted HTML File Endpoints (`/api/file`):** Both Markdown (`_send_markdown_html()`) and formatted code (`_send_formatted_code_html()`) views include a localized top bar with Raw toggle and (when available) `📝 Notepad++`.

### Lock-Free JSONL Reading, Live SSE & Graceful Shutdown
- **`read_jsonl_range(path, offset)`:** Opens file in `"rb"` mode, detects truncation (`st.st_size < offset` -> `was_reset = True, offset = 0`), reads only up to the last `b"\n"` (partial-line guard while Antigravity is mid-write), closes handle immediately, parses complete lines, and synthesizes a visible `ERROR_MESSAGE` record if a line is malformed JSON.
- **`GET /api/stream/<conv_id>?offset=...`:** Polls `t_path.stat()` (`st_size` / `st_mtime_ns`) using `_SHUTDOWN_EVENT.wait(0.5)` without holding an open file handle. Emits `event: steps` payloads `{ reset, offset, steps }` and `15s` keep-alive `: ping` comments, exiting instantaneously when `_SHUTDOWN_EVENT` fires.
- **Cross-Platform Window/Signal Shutdown (`_install_shutdown_handlers()`):** On Windows, registers a strong-referenced Win32 `SetConsoleCtrlHandler` for `CTRL_CLOSE_EVENT`, `CTRL_BREAK_EVENT`, `CTRL_LOGOFF_EVENT`, and `CTRL_SHUTDOWN_EVENT` (so closing the console window with `[X]` shuts down `server.shutdown()`, `server.server_close()`, and SSE threads cleanly within the OS timeout without keypress prompts); on POSIX, handles `SIGTERM`/`SIGHUP` via background `server.shutdown()`.

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
- **Lines 1–680 (`i18n`, `State`, `WeakMap`s, Scroll Guard, Anchor Preservation):** `loadLocale()`, `t()`, `tDoc()`, `applyStaticTranslations()`, global `state`, `WeakMap` caches, `attachInnerScrollGuard()`, `captureScrollAnchor()`, `restoreScrollAnchor()`, `preserveScrollAnchor()`.
- **Lines 681–2050 (`Formatters`, `Diffs`, `Markdown/Gutter`, `Timezone`):** `unescapeNewlines()`, `computeLineDiff()`, `renderToolArgsStructured()`, `renderCodeWithGutter()`, `renderMarkdownWithGutter()`, `parseGenericOutput()`, `isCommandErrorStep()`, lightweight XSS-safe Markdown renderer, `_buildAutoAnchor()`, `linkifyElement()`.
- **Lines 2051–4060 (`Task Lifecycle`, `Envelopes`, `Model Tracking`, `Search Parser/Matcher`):** `renderGenericContent()`, `buildStepMetadataAndTaskIndex()`, `resolveTaskLinkDestination()`, `parseUserInputEnvelope()`, `updateStepModels()`, `parseSearchQuery()`, `evalSearchAst()`, `getStepSearchUnits()`, `getTurnSearchUnits()`, `getTurnSearchBlob()`, `stepMatchesFilter()`.
- **Lines 4061–5410 (`Card Builder` & `Virtual Scroller Engine`):** `buildStepElement()`, `_lruMap` & `_runPrewarmLruSlice()`, `vResizeObserver`, `syncVirtualWindow()`, `jumpToStep()`.
- **Lines 5411–6865 (`TOC`, `Match-Only Highlighting`, `Feed & Incremental SSE Append`):** `renderCacheMapAndToc()`, `highlightMatches()`, `renderFullFeed()`, `appendNewSteps()`, `scrollToTop()`, `scrollToBottom()`.
- **Lines 6866–7515 (`SSE Stream`, `Search Anchor`, `Interactive Search Popover`, `Filters`):** `startStream()`, `flushPendingSseSteps()`, `selectTranscript()`, `captureSearchContextAnchor()`, `applySearchQueryChange()`, `renderSearchPopover()` / `setSearchOption()`.
- **Lines 7516–8788 (`Minimap`, `Modals`, `Theme`, `Command Map`, `Composer`, `i18n Switcher`, `Init`):** `syncMinimapPositions()`, `updateActiveMinimapNotch()`, `renderPromptMinimap()`, `fileOpenModal`, `applyTheme()`, `renderCommandMapModal()`, composer handlers, `setLanguage()`, `init()` (`tv_lang` default `"en"`).

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
- **UI Jitter Deferral & Strict FIFO Drain (CRITICAL):** `startStream()` buffers incoming SSE steps into `_pendingSseSteps` if the user typed within `400ms` (`_lastComposerTypeMs`) or scrolled within `240ms` (`_lastUserScrollMs`), flushing via `flushPendingSseSteps()`. If cooldown expires before `_sseFlushTimer` fires, `startStream()` MUST drain `_pendingSseSteps` ahead of the newly arriving batch in strict FIFO order (clearing `_sseFlushTimer`) — otherwise newer `GENERIC` steps append before deferred caller steps and break pairing/ordering. Callback guards (`state.eventSource !== es || state.activeId !== convId`) drop stale stream events.
- **Non-Collapsing `GENERIC` Pairing Backwalk:** When `GENERIC`/`SYSTEM_MESSAGE`/`ERROR_MESSAGE` arrives with `attachToolOutputs`, `appendNewSteps()` walks back up to the last `USER_INPUT`/`PLANNER_RESPONSE` (`spliceIdx`).
  - If `spliceIdx > _winStart` and `spliceIdx <= _winEnd`, ONLY `_vWindow` tail children with `vIdx >= spliceIdx` are removed (preserving `_winStart`, top cards, and `#vSpacerTop`).
  - When earlier caller/wait cards in `touchedEarlierSteps` are invalidated inside `[_winStart .. _winEnd]`, `appendNewSteps()` calls `clearVWindowDom()` before resetting `item.el = null` so no in-window DOM gaps occur.
  - `savedScrollTop` is captured at entry and explicitly restored before & after `syncVirtualWindow()` when scrolled up.
- **Unread Jump Tracking & Neutral Bottom Button:** Tracks `state.firstUnreadStepIndex` when new messages arrive while `userScrolledUp` so clicking `#jumpBottomBtn` jumps to the top of the **first** new step rather than skipping straight to the end. `syncJumpBottomButtonState()` keeps `.jump-bottom` styled identically to `.jump-top` (`var(--bg-elev)`) whenever `state.firstUnreadStepIndex === null` (clearing `.flash-yellow` and `"New message"` on click, bottom reach, transcript switch, language change, or manual scroll into view of the new message).
- **`jumpToStep()` Synchronous Window Measurement & Non-Destructive Anchor Guard:** `jumpToStep()` invokes `measureMountedVWindowNow()` in a bounded convergence pass alongside `syncVirtualWindow({ forceRender: true, upgradeSkeletons: true })` so underestimated giant preceding cards (e.g. `CHECKPOINT`s before a TOC target) immediately update `_vItems[].height` and `offsetY` before `updateScrollUiOnFrame()` runs, preventing stale-offset window eviction. Slow-frame programmatic `scroll` events whose `scrollTop` still matches `_lastScrollFrameTop` never cancel `_activeJumpLock`. Background anchor-restore callers (`applySearchQueryChange()`, `setSearchOption()`, `setLanguage()`) pass `resetFiltersOnMissing: false` so editing/narrowing a query when the previous anchor stops matching never clears `#stepSearch.value` or active filters.
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

#### D. Rendering, Parsing, Search, i18n & Minimap
- **Internationalization (`i18n`):** Ships with `static/i18n/en.json` (startup default `tv_lang = "en"`, `<html lang="en">`) and `static/i18n/ru.json`. `setLanguage()` loads locales dynamically, updates `data-i18n*` elements via `applyStaticTranslations()`, clears TOC/card/minimap caches, preserves the active viewport anchor, and re-renders live without page reload.
- **Raw Immutability:** Parsed `step` objects are NEVER mutated. All derived state uses `WeakMap`s (`stepErrCache`, `stepSearchBlobCache`, `stepSearchUnitsCache`, `stepModelMap`, `stepToolMetaMap`, `stepTaskMetaMap`, `rawStepMap`, `notchItemMap`, `toolArgsReplaceRowMap`, `cardOverflowChecksMap`, `_vElToItemMap`, `minimapMetaCache`). `{ }` and `Shift + Right-Click` show verbatim disk JSON.
- **Model Tracking (`updateStepModels` & `stepModelMap`):** Scans `<USER_SETTINGS_CHANGE>` envelopes (never prose `<USER_REQUEST>`) in chronological order for `The user changed setting \`Model Selection\` from ... to <Model>.`, tracks live model switches dynamically (including incremental SSE batches), and renders a `.meta-chip-model` badge (`🤖 <Model>`) on every `PLANNER_RESPONSE` header.
- **User Prompt Envelope, `SYSTEM_MESSAGE`, Tags & Deep Links:**
  - `parseUserInputEnvelope()` extracts `<USER_REQUEST>` via EOF-validated suffix matching and surfaces `<ADDITIONAL_METADATA>` / `<USER_SETTINGS_CHANGE>` / unknown `<TAG>` badges (`extractTopLevelXmlTags()`). `unescapeNewlines()` normalizes `\r\n -> \n` only, leaving literal `\n` escapes intact.
  - `SYSTEM_MESSAGE` cards render in clean monospace (`.system-msg-body` via `renderSystemMessageBody()`). `formatPairedSystemTagsInHtml()` uses LIFO stack matching outside `<pre>`/`<code>` so only paired `<SYSTEM_MESSAGE>...</SYSTEM_MESSAGE>` blocks receive `.xml-tag-badge.xml-tag-system`, leaving unpaired prose mentions as plain text.
  - `formatSpecialBracketTagsInHtml()` highlights `[ARTIFACT...]`, `[Attachment...]`, and `@[Quote...]` with distinct theme-safe `.inline-tag` spans outside `<pre>`/`<code>`/`<a>`, preserving nested path auto-linking.
  - **`run_command` Monospace Invariant:** `renderGenericContent()` checks `stepToolMetaMap` (or `Command exited` / `Output:` markers for standalone `GENERIC` cards) so `run_command` / `command_status` outputs always render as `<pre>` monospace rather than accidental Markdown headings.
  - **Bidirectional Background Task Lifecycle Linking (`buildStepMetadataAndTaskIndex()`):** Indexes every `<uuid>/task-<N>` launch (`GENERIC`), caller (`PLANNER_RESPONSE`), wait (`schedule`/`manage_task`), cancel (`Wait cancelled`), and result (`SYSTEM_MESSAGE`). Renders header pills (`.task-link-pill`) and inline clickable links (`linkifyTaskIdsInElement()`); live SSE arrival invalidates earlier caller/wait cards when a task finishes. Note: keep translation helper `t()` unshadowed inside this module (use `tInfo` for task records).
  - Clicking any `.step-num-chip` (`#N`) copies a canonical dual-purpose deep link (`#conv=<uuid>&step=<N>&project=<name>&file=<jsonl>`); `selectTranscript()` updates URL state via `history.replaceState` with race-safe `_activeLoadSeq` / `_pendingNavStep` guards, and `clearHashStepIfScrolledAway()` clears `&step=` upon manual scrolling/navigation so re-pasting the same `#conv=...&step=...` URL in the browser address bar reliably fires `hashchange` and aligns the card header to `topOffset: 4` (top of `#feedWrap`).
- **Continuous Command Rendering, Live Runner, Interactive Terminal & Clipboard Hygiene:**
  - `.cmd-prefix` renders `display: inline` with a real text-node `" "` before `.cmd-main` so searching, selecting, and copying `"pwsh -c git diff"` sees one continuous string. `attachCommandActionsToHead()` places Copy (zero trailing newlines), bright `▶ Run` (inline `.cmd-exec-panel` via `/api/run-command`), and `>_ Terminal` (standalone persistent window via `/api/open-terminal`) beside every `CommandLine` row, while `#openProjTermBtn` in `#topbar` opens a standalone console directly in the active project folder.
  - UI action buttons (`.raw-btn` `{ }`, `.head-raw-btn`, `.copy-cmd-btn`, `.run-cmd-btn`, `.term-cmd-btn`, `.cmd-exec-btn`, `.show-more-btn`) apply `user-select: none`, and `document`'s universal `copy` listener (`serializeFeedSelectionRange()`, bypassing `INPUT`/`TEXTAREA`) serializes ALL headers and metadata rows across the viewer (`.step-head`, `.tool-head`, `.tool-result-head`, `.cmd-exec-head`, `.arg-row-cmd-head`, `.arg-row-inline`, `.tok-bar`, `.modal-head`, `.topbar-right`, `details > summary`, etc.) onto clean single lines while omitting `{ }` and UI buttons and leaving multi-line code/output preserved.
- **Per-Unit AST Highlighting, Two-Tier Framing, Single-`\` Snippets & `.step-head` Search-Clear Anchor:** When `searchAcrossWholeTurn = false`, `highlightMatches()` evaluates `evalSearchAst` per `.unitScope` (`matchedUnitScopes`) so partial hits (such as a lone `-c` inside a sibling `read_file`) receive zero `<mark.hl>` or hit frames. Framing uses two tiers: the enclosing macro block (`.tool-card`, `details.block-thinking`, `.step-body > .md`, etc.) ALWAYS gets the thick outer dashed outline (`.search-hit-target`), while matched inner paragraphs, code lines, or arg rows get a thin non-overlapping dashed outline (`.search-hit-sub`). `trimNonMatching` omits ONLY non-matching blocks and sibling `.tool-card`s via `.search-omitted` (with a per-card `.search-reveal-bar` button), while **always** keeping matched `.tool-card`s together with their `.tool-result` command outputs immediately visible. `applyInitialSearchScrolls()` batches `rAF` scroll-to-hit positioning for scrollable inner boxes (taking priority over `edit_file` scroll-to-Replacement during active search), `formatToolArgsForSnippet()` + `extractMatchSnippet()` preserve single-line log structure with unescaped single-`\` paths so queries like `cation\msedge.exe` match and display cleanly in TOC, `shouldUnfoldSearchTail()` unfolds >800-line outputs when tail lines are needed, and clearing or editing `#stepSearch` locks visible `:scope > .step-head` FIRST in `captureSearchContextAnchor()` (falling back to inner `mark.hl`/sub-blocks only when `.step-head` is scrolled off-screen above viewport) before `renderFullFeed({ skipWindowSync: true })` and `jumpToStep()` 5-pass + two-frame post-overflow `rAF` alignment.
- **TOC Wrapped Cache Grid (`.cache-strip` & `.toc-row`):** Renders all cached steps in a wrapping grid (`flex-wrap: wrap`) of `14×14px` `.cache-bar` squares with fast `data-tip-delay="80"` hover previews (first message line + timestamp + cache stats). `.cache-map-card` avoids `content-visibility: auto` so offscreen TOC height never collapses virtual coordinates. Clicking a square highlights/scrolls `.toc-wrap` to the corresponding `.toc-row.is-selected` (`tabindex="-1"`); hitting `Enter` or clicking the row jumps `#feedWrap` to the message.
- **Gutters & `:has()` Avoidance:** `.code-gutter-row` and `.md-gutter-row` use `display: block` + `position: relative` + absolute `.code-gutter-num` / `.md-gutter-num` (zero per-line flex overhead). Cards with media get `.has-media` in JS; `:has()` is banned in CSS. Media scales cleanly to container width (`max-width: 100%; max-height: none;`) via `.feed-wrap { min-width: 0; overflow-anchor: none; }`.
- **Single-Scrollbox Invariant:** `.arg-val-md`, `.generic-pre`, `.arg-val` inside outer `.tool-args` or `.read-scroll-box` unroll naturally (`max-height: none; overflow: visible`) so nested vertical scrollbars never occur. Exception: `.cmd-exec-out` inside inline `.cmd-exec-panel` keeps its own bounded scrollbox (`max-height: 280px; overflow-y: auto`), and `.tool-args.has-cmd-exec` uncaps outer `.tool-args` while open so `CommandLine` and `.cmd-exec-head` remain stationary. `edit_file` highlights `.arg-row-replacement` and scrolls `.tool-args` directly to `Replacement` via batched `applyInitialEditScrolls()`.
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
Standalone unit test suites (require Node.js 18+ & Python 3.10+, zero external deps):
```powershell
node tests\test_viewer_features.mjs ; python tests\test_server_commands.py
```
Tests verify:
- `formatPairedSystemTagsInHtml()` / `renderSystemMessageBody()` — paired `<SYSTEM_MESSAGE>` tag badging vs unpaired prose & inline `<code>` protection.
- `formatSpecialBracketTagsInHtml()` — `@[Quote]`, `[ARTIFACT]`, `[Attachment]` inline highlighting & `<code>` protection.
- `updateStepModels()` / `extractModelNamesFromSettings()` — dynamic `Model Selection` tracking across `USER_SETTINGS_CHANGE` (dots in model names, multi-switch blocks, prose immunity, `None` resets).
- `buildStepShareUrl()` / `parseHashNavigation()` — canonical `#conv=...&step=...&project=...&file=...` deep-link formatting and routing.
- `parseSearchQuery()` / `evalSearchAst()` / `getTurnSearchUnits()` / `stepMatchesFilter()` — exact quoted phrase search, same-block default vs whole-turn search, pure negation, `wholeWord`, `caseSensitive`, grouping, and caller + attached output matching.
- `buildStepMetadataAndTaskIndex()` / `resolveTaskLinkDestination()` — bidirectional background task launch/wait/cancel <-> result linking & `stepToolMetaMap`.
- `formatToolArgsForSnippet()` / `extractMatchSnippet()` — single-`\` Windows path matching/display (`cation\msedge.exe`) & structured single-line log snippets.
- `captureSearchContextAnchor()` & `serializeFeedSelectionRange()` — visible `.step-head` lock before inner sub-block fallback on search clear, plus clean single-line clipboard serialization (`WaitMsBeforeAsync` through `OUTPUT` without `{ }`).
- `execute_console_command()` (`tests/test_server_commands.py`) — active-project `cwd` execution and `pwsh` double-parse parity.
- `static/i18n/{en,ru}.json`, `index.html`, and `app.js` invariants — strict leaf-key parity between locales, English startup default (`lang="en"`, `tv_lang = "en"`), SSE `_pendingSseSteps` FIFO drain guard, and search-clear viewport anchoring.

For pre-commit checks + safe local commit, configure `.commit_plan.json` with custom `"checks"` (`["python", "server.py", "--check"]`, `["python", "tests/test_server_commands.py"]`, and `["node", "tests/test_viewer_features.mjs"]`) and run:
```powershell
python $env:USERPROFILE\.gemini\config\skills\local-git-github-gh\scripts\git_commit_safe.py
```
