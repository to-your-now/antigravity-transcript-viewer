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
├── server.py               # Local HTTP server, JSONL tailer/SSE, file/dir/media endpoints, command runner, Win32 paste helper
├── run.bat / run.sh        # Native launchers (Windows / Linux & macOS)
├── README.md               # User-facing English documentation (keep free of implementation internals)
├── README.ru.md            # User-facing Russian documentation (keep free of implementation internals)
├── PROJECT_ARCHITECTURE.md # This engineering & AI agent architectural guide
├── tests/
│   ├── test_server_commands.py  # Stdlib unittest: /api/run-command, pwsh quoting parity, shutdown handlers, Win32 smart paste protocol
│   └── test_viewer_features.mjs # Node 18+ unit tests: parsers, model tracking, search AST/scoping, Command Map, SSE/fresh pulse, i18n parity
└── static/
    ├── i18n/
    │   ├── en.json         # Default English UI & server-view translations
    │   └── ru.json         # Russian translations (strict leaf-key parity verified by tests)
    ├── index.html          # App shell (`lang="en"`), toolbar, `#langSelect`, search/Command Map popovers, composer, feed stage, minimap
    ├── style.css           # Dark/Day themes, virtual-scroll geometry, `.search-omitted`/`#searchPopover`, single-scrollbox rules
    └── app.js              # i18n runtime, virtual scroller, LRU cache, SSE tailing, parsers, search engine, Command Map, UI
```

---

## 3. Backend Architecture (`server.py`)

### HTTP Endpoint Map
| Endpoint | Handler / Purpose |
|---|---|
| `GET /`, `/static/*` | Serves static shell (`index.html`), assets, and `static/i18n/{en,ru}.json` (path-traversal guarded via `relative_to(STATIC_DIR.resolve())`) |
| `GET /api/transcripts` | Lists transcripts + returns `platform` & `capabilities` (`is_windows`, `default_shell`, `antigravity_paste`, `open_explorer`, `open_totalcmd`, `open_notepadpp`, `open_folder_os`, `open_file_os`) |
| `GET /api/transcript/<conv_id>` | Loads full JSONL transcript, extracts `meta`, infers `project_root` / `project_files`, returns byte `offset` for SSE tailing |
| `GET /api/stream/<conv_id>?offset=N` | SSE live stream (`stat()` poll every `0.5s`, `15s` `: ping`, exits cleanly on `_SHUTDOWN_EVENT`) |
| `GET /api/file?path=...&fmt=1&raw=1&lang=...` | Directory HTML listing (`_send_dir_html`), rendered Markdown (`_send_markdown_html`), line-numbered code (`_send_formatted_code_html`), or plain `raw=1` |
| `GET /api/media?path=...` | Serves media strictly inside `BRAIN_DIR.resolve()` |
| `GET /api/antigravity-window` | Windows-only probe (`find_antigravity_window`) returning `{ found, title, supported }` |
| `POST /api/send-to-antigravity` | Windows-only verified paste/submit (`send_text_to_antigravity_window(..., trace_out=...)` -> `{ ok, info, status, trace }`) |
| `POST /api/open-folder` / `POST /api/open-file` | Opens folder (`explorer` / `totalcmd` / POSIX opener) or file (`os.startfile` / POSIX / `notepadpp`) |
| `POST /api/run-command` / `POST /api/open-terminal` | Enforces local `Origin`/`Referer` (`127.0.0.1` / `localhost` / `::1`); runs inline shell command or opens persistent interactive terminal in active project |

### Transcript Discovery, Context & Non-Locking SSE
- **`--brain-dir` / `BRAIN_DIR`:** Defaults to `~/.gemini/antigravity/brain`; scans `<conv_id>/.system_generated/logs/transcript_full.jsonl` (fallback `transcript.jsonl`) and caches metadata in `_META_CACHE`.
- **`_detect_project_context()`:** Scans up to 150 head steps (skipping `.gemini` / `appdata` / home root dirs) to infer `project_root` and up to 250 shallow `project_files`.
- **Server Localization:** `_get_server_i18n()` / `_srv_t()` caches `static/i18n/{en,ru}.json` `"server"` keys so API messages and `/api/file` HTML views honor `?lang=` or `body.lang` (`en` default).
- **`read_jsonl_range(path, offset)`:** Opens `"rb"`, detects truncation (`st.st_size < offset` -> `was_reset = True, offset = 0`), reads only up to the final `b"\n"`, closes immediately, and converts malformed lines into synthetic `ERROR_MESSAGE` records.
- **Live Command Runner & Interactive Terminal:** Shares `_resolve_project_cwd()`. `execute_console_command()` executes via `pwsh -NoLogo -NoProfile -NonInteractive -Command` (`powershell`/`cmd` fallback; `pwsh`/`bash`/`sh` on POSIX) with `NO_COLOR=1`, `TERM=dumb`, `_strip_ansi()`, `stdin=DEVNULL`, `CREATE_NO_WINDOW`, and 30s timeout tree-kill. `open_interactive_terminal()` spawns `CREATE_NEW_CONSOLE` (`pwsh -NoLogo -NoExit -EncodedCommand`) with PSReadLine history seeding on Windows, or `osascript`/desktop terminal on POSIX.
- **Cross-Platform Window/Signal Shutdown (`_install_shutdown_handlers()`):** Strong-referenced Win32 `SetConsoleCtrlHandler` handles `CTRL_CLOSE_EVENT`, `CTRL_BREAK_EVENT`, `CTRL_LOGOFF_EVENT`, `CTRL_SHUTDOWN_EVENT` (so console `[X]` stops `server.shutdown()`, `server.server_close()`, and SSE threads cleanly within OS timeout); POSIX handles `SIGTERM`/`SIGHUP`.

### Local Path Resolution
- **`_resolve_user_path()`:** Expands `<appDataDir>`, `<conversation-id>`, `%USERPROFILE%`, `$HOME`, `~`, resolves relative paths against `project_root`, strips `#L10-L20` line anchors, and preserves leading `/` on POSIX `file:///home/...` URIs.

### Win32 `Antigravity.exe` Smart Paste & Verified Auto-Send Integration
- **Target Client & Shortcut:** Designed for **Antigravity 2.0 App**, where **`Ctrl+I` (`VK_I`)** reliably focuses Agent Chat. Keep `Ctrl+I` unless explicitly migrating clients.
- **Agent Sandbox Testing Note:** Agent `run_command` shells execute inside Windows isolated `WinSta0\exebox-*` desktops where `GetForegroundWindow() == 0` and real `WinSta0\Default` windows (`Antigravity.exe`) are invisible (clipboard is shared). Unit-test all paste state transitions cleanly via `_win_ops` dependency injection in `tests/test_server_commands.py`, and let the user test live desktop paste directly.
- **Window Focus & Input Mechanics:** Captures `caller_hwnd = GetForegroundWindow()`, activates matched `Antigravity.exe` via `_activate_hwnd()` (`AttachThreadInput` on both `fg_tid` and `target_tid` + `SetForegroundWindow`), temporarily posts `WM_INPUTLANGCHANGEREQUEST` (`0x0409` EN), sends `MapVirtualKeyW` scan codes with `KEYEVENTF_EXTENDEDKEY` (`_EXTENDED_VKS`, including `VK_END`/`VK_RIGHT`), and provides `_send_ctrl_combo` + `_send_shift_combo` via generalized `_send_mod_combo`. Clipboard helpers (`_set_clipboard_unicode`, `_get_clipboard_unicode`, `_clear_clipboard`) retry `OpenClipboard` (`10 × 12ms`).
- **Two-Stage Sentinel Clipboard & Code-Editor Safety Protocol:**
  1. Sends `Ctrl+I` (`0.22s` settle) -> `_copy_focused()` writes unique sentinel probe `__AGY_CLIP_PROBE_<seq>__` (avoiding `EmptyClipboard` false-positives; updates `seq0` on self-bumps so `OpenClipboard` never spins), then sends `Ctrl+A`, `0.08–0.12s`, `Ctrl+C` (`0.30–0.45s` `GetClipboardSequenceNumber()` poll).
  2. `_looks_like_code_or_file_buffer(pre_text)` checks length (`>2800` chars / `>=30` lines), source file headers, and code-line ratios (exempting short conversational markdown ```` ``` ```` blocks); if code is detected, runs `_deselect_to_end()` (`VK_RIGHT` + `Ctrl+End`), preserves the prompt in clipboard, and aborts (`aborted_code_editor`).
  3. **Empty input (`pre_text.strip() == ""`):** ALWAYS calls `_deselect_to_end()` **before** pasting so a missed pre-copy can never overwrite an existing draft -> pastes (`Ctrl+V`, `0.20–0.26s`) -> re-copies via `_copy_focused` (with 1 automatic retry) and compares `_norm_clipboard_cmp()` (normalizing `\r`, `\u00a0`, zero-width `\u200b`–`\u200d`/`\ufeff`, line trailing spaces, and Lexical `<p>` `\n+` breaks -> `\n`). **Only on exact match** runs `_deselect_to_end()` + `VK_RETURN` (`status: "sent"`) and schedules `threading.Timer(1.8s)` to restore `caller_hwnd` (only if foreground is still `Antigravity.exe`). On mismatch (`verify_failed`), collapses selection, leaves prompt in clipboard, and never presses `Enter`.
  4. **Non-empty safe draft:** Runs `_deselect_to_end()`, sends `Shift+Enter` (`_send_shift_combo(VK_RETURN)`) when the cleaned draft (stripping zero-width chars) does not already end with `\n`/`\r` (preventing Lexical from stripping leading `\n` on clipboard paste), then pastes `text` via `Ctrl+V` without pressing `Enter` or stealing focus (`status: "appended"`).
- **UI Trace Toggle (`LOG`):** `send_text_to_antigravity_window(..., trace_out=trace_lines)` records timestamped `[+...ms]` steps into JSON `"trace"` for the frontend `LOG` toggle (`#toggleComposerTraceBtn` -> `#composerTraceBar`) without polluting server `stderr` on normal requests.

---

## 4. Frontend Architecture (`static/app.js` & `static/style.css`)

### Section Map of `static/app.js`
Locate code by symbol/section name rather than volatile line numbers:
- **Core Runtime & Scroll Anchors:** `loadLocale()`, `t()`, `tDoc()`, `applyStaticTranslations()`, global `state`, `WeakMap` caches, `attachInnerScrollGuard()`, `captureScrollAnchor()`, `restoreScrollAnchor()`, `preserveScrollAnchor()`.
- **Formatters, Markdown & Clipboard Serialization:** `unescapeNewlines()`, `computeLineDiff()`, `renderToolArgsStructured()`, `renderCodeWithGutter()`, `renderMarkdownWithGutter()`, `parseGenericOutput()`, `isCommandErrorStep()`, `_buildAutoAnchor()`, `linkifyElement()`, `attachCommandActionsToHead()`, `serializeFeedSelectionRange()`.
- **Indexing, Envelopes & Search Engine:** `renderGenericContent()`, `buildStepMetadataAndTaskIndex()`, `resolveTaskLinkDestination()`, `parseUserInputEnvelope()`, `updateStepModels()`, `parseSearchQuery()`, `evalSearchAst()`, `getStepSearchUnits()`, `getTurnSearchUnits()`, `getStepCmdMapScope()`, `stepMatchesFilter()`.
- **Virtual Scroller & Card Builder:** `buildStepElement()`, `_lruMap`, `_runPrewarmLruSlice()`, `vResizeObserver`, `syncVirtualWindow()`, `jumpToStep()`, `applyCmdMapFocusTrim()`, `highlightMatches()`.
- **TOC, Feed, SSE & Fresh Pulses:** `renderCacheMapAndToc()`, `extractMatchSnippet()`, `renderFullFeed()`, `appendNewSteps()`, `startStream()`, `flushPendingSseSteps()`, `markFreshSteps()`, `activateVisibleFreshPulses()`, `syncCardFreshPulse()`.
- **Popovers, Modals, Composer & Init:** `captureSearchContextAnchor()`, `applySearchQueryChange()` (`SEARCH_DEBOUNCE_MS = 380`), `addSearchHistoryEntry()`, `openSearchHistoryPopover()`, `renderSearchPopover()`, `syncMinimapPositions()`, `updateActiveMinimapNotch()`, `renderPromptMinimap()`, `buildCommandMapStats()`, `renderCommandMapModal()`, composer & `LOG` handlers (`submitToAntigravity()`, `renderComposerTrace()`), `setLanguage()`, `init()`.

### Persistence (`localStorage` Keys)
`tv_lang` (`"en"` default), `tv_theme`, `tv_search_history`, `tv_cmd_map_focused` (`true` default), `tv_composer_collapsed`, `tv_composer_height`, `tv_folder_mode`, `tv_file_mode`.

---

### Core Subsystems & How They Interact

#### A. Windowed Virtual Scroller & Detached LRU Pre-Renderer
Modeled after TanStack Virtual / Virtuoso so 70,000+ step logs never blow up Chrome Style/Layout/Composite:
- **Pure-JS Index (`_vItems[]`):** `{ idx, kind ("step"|"expand"), step, attached, attachedCount, stepKey, hasErr, bytes, estHeight, height, measured, offsetY, el, cfgKey }`, indexed by `_vStepToItemMap`.
- **DOM Window (`#vListBox` -> `#vSpacerTop` + `#vWindow` + `#vSpacerBottom`):** Mounts at most ~42 live nodes (`overscan = 950px`, shrunk to `450px` during fast drags).
- **`updateVSpacers()` Collapse Guard (CRITICAL):** Whenever `_vItems.length > 0` and `_winEnd < _winStart`, `_vSpacerBottom` MUST equal `_vTotalHeight` (never `0px`), or Chrome immediately clamps `#feedWrap.scrollTop = 0`.
- **Detached LRU & Drag Skeletons:** `_lruMap` retains up to `CARD_LRU_MAX = 96` detached cards; `_runPrewarmLruSlice()` builds `±1 MB` around the viewport in `<6ms` idle slices (paused while typing/scrolling). High-velocity flicks mount `0.1ms` `.step-drag-skeleton` boxes and upgrade viewport-first (`65ms` settle).
- **Height Measurement (`vResizeObserver`) & Priority Locks:**
  1. `keepPinnedBottom`: active when `followToggle.checked && !state.userScrolledUp` (or `_pinBottomLockUntil`), **only if** no jump/anchor lock is active.
  2. `jumpLockValid` (`_activeJumpLock`): holds target step at `desiredTop` after `jumpToStep()`.
  3. `anchorLockValid` (`_activeAnchorLock`): holds viewed element steady across async neighbor measurements (`preserveScrollAnchor()`).
  4. Fallback `scrollAdjust`: compensates `scrollTop += diff` for cards above `viewTopInList + 8` when `canCompensate` is true.

#### B. Live SSE Stability & Fresh-Turn Pulse
- **UI Jitter Deferral & Strict FIFO Drain (CRITICAL):** `startStream()` buffers SSE batches into `_pendingSseSteps` if user typed (`<400ms`) or scrolled (`<240ms`), flushing via `flushPendingSseSteps()`. When cooldown expires before `_sseFlushTimer` fires, `startStream()` drains `_pendingSseSteps` ahead of the new batch in strict FIFO order. Stale stream callbacks are dropped via `state.eventSource !== es || state.activeId !== convId`.
- **Non-Collapsing `GENERIC` Pairing Backwalk:** Re-pairs `GENERIC`/`SYSTEM_MESSAGE`/`ERROR_MESSAGE` back to `spliceIdx`: if `spliceIdx > _winStart && spliceIdx <= _winEnd`, removes only tail nodes (`vIdx >= spliceIdx`); if `touchedEarlierSteps` invalidates visible earlier cards, calls `clearVWindowDom()` to prevent DOM gaps; preserves `savedScrollTop` when scrolled up. On `payload.reset`, captures top visible `anchorStepKey` and restores via `jumpToStep()`.
- **Unread Tracking & Deferred Fresh Pulse:** Tracks `state.firstUnreadStepIndex` when scrolled up (`#jumpBottomBtn` jumps to the first unread step and returns to neutral `var(--bg-elev)` styling once cleared). Newly arrived steps + touched task caller steps enter `_freshPendingKeys`; `activateVisibleFreshPulses()` starts a `4500ms` `.step-new-pulse` blinking frame **only when `document.visibilityState === "visible"` AND the card intersects `#feedWrap`** (`syncCardFreshPulse()` preserves pulse state across virtual recycling).

#### C. Scroll Anchoring & Single-Scrollbox Layout
- **`preserveScrollAnchor(fn, triggerEl)` & Bottom-Expand Rule:** `tier = 0` pins `triggerEl`. Expanding downward via bottom `.show-more-btn` (`setReadMode`, `setArgsMode`, `foldBtn`) MUST pass the top container (`readScrollBox || contentWrap` / `argsContainer`) as `triggerEl` so content grows downward; collapsing passes the button itself. `restoreScrollAnchor()` measures synchronously and arms `_activeAnchorLock` (`500ms`). `scrollToTop()` uses instant `behavior: "auto"`.
- **Localized Inner Scroll & Single-Scrollbox Invariant:** TOC `.toc-wrap` uses `scrollOnHover: true`; inner step boxes omit `scrollOnHover` and `scheduleCardOverflowCheck()` enables `.has-inner-scroll` + `tabIndex = 0` + `.overflow-btn-hidden` in `rAF` only on overflowing boxes. `.arg-val-md` / `.generic-pre` / `.arg-val` unroll inside `.tool-args` / `.read-scroll-box` (no nested scrollbars, except bounded `.cmd-exec-out` `280px` while `.tool-args.has-cmd-exec` uncaps outer `.tool-args`). `edit_file` scrolls `.tool-args` directly to `.arg-row-replacement` via `applyInitialEditScrolls()` (yielded during active search).
- **Zero `:has()` & Absolute Gutters:** `:has()` is banned in CSS; JS toggles helper classes (`.has-media`, `.is-checked`, etc.). Code/Markdown gutters use `display: block` + `position: relative` + absolute line numbers.

#### D. Search Engine, Command Map Scope & Rendering
- **Command-Map-Focused View & Scoped Search (`getStepCmdMapScope()`):**
  - `buildStepMetadataAndTaskIndex()` populates `stepPairedOutputsMap` and `taskIndexMap` independently of `state.attachToolOutputs` so Command Map always gets exact `ok + err + other === total` stats.
  - `state.cmdMapFocusedOnly` (default `true`) triggers `applyCmdMapFocusTrim()` to hide non-matching thinking/prose/sibling `.tool-card`s via `.search-omitted` while keeping each matched `.tool-card` + `.tool-result` visible with a `.search-reveal-bar` toggle.
  - When `cmdMapFilterOnly && cmdMapFocusedOnly` is active on a `PLANNER_RESPONSE`, `getStepCmdMapScope()` becomes the authoritative search scope across `getVisibleTurnSearchUnits()`, `getVisibleTurnSearchBlob()`, `extractMatchSnippet()`, TOC tool chips, and `isUnitScopeAllowedByCmdMap()` inside `highlightMatches()`: hidden sibling tools, hidden thinking, and hidden prose cannot match queries, resurrect hidden blocks, or receive `<mark.hl>` highlights.
- **Per-Unit AST Matching, Two-Tier Framing & Search-Clear Anchoring:**
  - When `searchAcrossWholeTurn = false`, `highlightMatches()` evaluates `evalSearchAst` per `.unitScope` so partial hits outside the matched block receive zero `<mark.hl>`.
  - Two-tier framing: outer macro blocks (`.tool-card`, `details.block-thinking`, `.step-body > .md`) receive thick dashed `.search-hit-target`, while inner matched paragraphs/lines/args get thin `.search-hit-sub`.
  - `formatToolArgsForSnippet()` + `extractMatchSnippet()` keep single-line args and unescaped single-`\` Windows paths (`cation\msedge.exe`); `shouldUnfoldSearchTail()` reveals >800-line tails when needed; clearing/editing `#stepSearch` locks visible `:scope > .step-head` first in `captureSearchContextAnchor()` (`resetFiltersOnMissing: false`) across a 5-pass + two-frame `jumpToStep()`.
- **Raw Immutability, Envelopes, Models & Task Linking:**
  - Never mutate parsed `step` objects — use `WeakMap`s only. `{ }` / `Shift + Right-Click` shows verbatim JSON.
  - `updateStepModels()` scans `<USER_SETTINGS_CHANGE>` envelopes chronologically (ignoring `<USER_REQUEST>` prose) to badge `.meta-chip-model` (`🤖 <Model>`).
  - `parseUserInputEnvelope()`, `formatPairedSystemTagsInHtml()` (LIFO outside `<pre>`/`<code>`), `formatSpecialBracketTagsInHtml()` (`[ARTIFACT]`, `[Attachment]`, `@[Quote]`), and `buildStepMetadataAndTaskIndex()` (bidirectional `<uuid>/task-<N>` pills — keep helper `t()` unshadowed by using `tInfo`!).
  - `renderGenericContent()` keeps `run_command` / `command_status` outputs strictly `<pre>` monospace.
  - Universal `copy` handler (`serializeFeedSelectionRange()`, bypassing `INPUT`/`TEXTAREA`) serializes viewer headers/metadata rows onto clean single lines while omitting UI action buttons and `{ }`. `.cmd-prefix` uses `display: inline` + real `" "` text node before `.cmd-main`.
- **Zero-DOM Minimap, Deep Links & Composer:**
  - Minimap (`renderPromptMinimap()`, `syncMinimapPositions()`, `updateActiveMinimapNotch()`) runs `O(log N)` purely from `_vItems` + `offsetY` and strips `#promptMinimap`'s `title` while hovering notches.
  - `.step-num-chip` copies `#conv=<uuid>&step=<N>&project=<name>&file=<jsonl>`; `selectTranscript()` tracks `_activeLoadSeq` / `_pendingNavStep` and `clearHashStepIfScrolledAway()` clears stale `&step=` on scroll.
  - `jumpToStep()` invokes bounded synchronous `measureMountedVWindowNow()` passes so underestimated giant preceding cards (`CHECKPOINT`s) never trigger stale-offset window eviction.
  - Composer toggles on `Ctrl+'` / `Ctrl+э` (`e.code === "Quote"`), guards `_agSendInFlight` with a `35ms` `Enter` `keydown` settle delay, preserves send status for `15s` against background polling, and stores the Win32 telemetry trace behind the compact `LOG` button (`#toggleComposerTraceBtn` -> `#composerTraceBar`).

---

## 5. Critical Invariants (Do Not Break)
1. **Non-Locking File I/O:** Keep `read_jsonl_range()` open-read-close in `"rb"` mode; idle SSE loop may only call `Path.stat()`.
2. **Security Boundaries:** Default host `127.0.0.1`; `_resolve_transcript()` rejects `/`, `\`, `..`; `/api/media` enforces `relative_to(BRAIN_DIR.resolve())`; `renderMarkdown()`, `_send_markdown_html()`, and `_send_dir_html()` escape HTML before formatting; `/api/run-command` & `/api/open-terminal` enforce local `Origin`/`Referer`.
3. **Raw Step Immutability:** Never inject synthetic fields onto parsed `step` objects — use `WeakMap`s only.
4. **Native UX Conventions:** `thinking` and `tool_calls` `<details>` default to `open = true`; preserve native right-click menu; preserve colorblind cues + tooltips; keep `#jumpTopBtn`/`#jumpBottomBtn` outside `#feedWrap` (`contain: content` clips `position: fixed`).
5. **Virtual Scroller & Scroll Safety:** Never let `updateVSpacers()` collapse to `0px` when `_vItems.length > 0`; never attach blocking `{ passive: false }` wheel listeners to `#feed` / `#feedWrap`; keep `overflow-anchor: none` on `.feed-wrap`; keep `#feedWrap`'s `ResizeObserver` width-only.
6. **Documentation Separation:** Keep `README.md` and `README.ru.md` focused strictly on user workflows; document internal implementation mechanics here in `PROJECT_ARCHITECTURE.md`.
7. **Privacy & Verification Gate (Zero-Tolerance):** Never commit or publish secrets, `$env:USERNAME`, or local user paths (`C:\Users\...`, `E:\...`). Use `git_commit_safe.py` via `.commit_plan.json` before every commit.
8. **Git Branch Mapping:** Local git commits live on `master`, whereas GitHub (`to-your-now/antigravity-transcript-viewer`) uses `main` — always pass `--branch main` to `gh_sync.py`.

---

## 6. Verification Checklist
Standalone zero-dependency test suites (Node.js 18+ & Python 3.10+):
```powershell
node tests\test_viewer_features.mjs ; python tests\test_server_commands.py
```
Suites cover:
- **`tests/test_server_commands.py`:** `execute_console_command()` (`cwd`, `pwsh` double-parse parity, `_strip_ansi`), `open_interactive_terminal()`, `_install_shutdown_handlers()`, and `AntigravitySmartPasteTests` (`_looks_like_code_or_file_buffer`, verified empty submit + restore timer, `verify_failed` clipboard fallback, pre-copy failure safety, ZWSP + multi-line Lexical `\r\n\r\n` normalization, `Shift+Enter` append newline, and `trace_out` telemetry).
- **`tests/test_viewer_features.mjs`:**
  - Envelopes, `<SYSTEM_MESSAGE>` LIFO badging, inline bracket tags (`@[Quote]`, `[ARTIFACT]`, `[Attachment]`), and dynamic `Model Selection` tracking;
  - Canonical `#conv=...&step=...` deep links, `serializeFeedSelectionRange()` single-line header copying, and `addSearchHistoryEntry()` persistence;
  - Search AST matching, per-block vs whole-turn scoping, single-`\` snippet paths, and `.step-head` search-clear viewport anchoring;
  - Bidirectional background `<uuid>/task-<N>` linking and `stepToolMetaMap`;
  - Command Map stats/focus trimming (`Section 15`), deferred fresh-turn pulse visibility (`Section 16`), Command-Map-scoped search specificity (`Section 18`), plus `static/i18n/{en,ru}.json` strict leaf-key parity & SSE `_pendingSseSteps` FIFO drain invariants.

For pre-commit verification + safe local commit, configure `.commit_plan.json`:
```json
{
  "message": "...",
  "stage_tracked": true,
  "add_files": [],
  "checks": [
    {"name": "Server health check", "cmd": ["python", "server.py", "--check"]},
    {"name": "Backend unit tests", "cmd": ["python", "tests/test_server_commands.py"]},
    {"name": "Frontend feature unit tests", "cmd": ["node", "tests/test_viewer_features.mjs"]}
  ],
  "auto_checks": true,
  "allow_untracked": false
}
```
Then run:
```powershell
python $env:USERPROFILE\.gemini\config\skills\local-git-github-gh\scripts\git_commit_safe.py
```
