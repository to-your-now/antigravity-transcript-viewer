# Antigravity Transcript Viewer

> **See what your AI agent thinks, runs, reads, and spends — in real time.**  
> A fast, local browser viewer for Google Antigravity session logs on Windows, Linux, and macOS with zero setup.

[🇷🇺 Читать на русском](README.ru.md) · [🤖 Architecture & AI Agent Guide](PROJECT_ARCHITECTURE.md)

---

## Why Use This?

Antigravity saves full conversation logs — prompts, hidden thinking blocks, tool calls, file edits, context compactions, and token metrics — into large raw JSONL files. Reading them in a text editor is painful.

**Antigravity Transcript Viewer** turns those logs into a clean, interactive workspace in your browser:

### Live Reading & Navigation
- **Real-Time Live Feed & New Turn Blink:** New messages and tool results stream in automatically as the agent works, without interrupting or locking Antigravity. Newly arrived cards flash with a pulsing highlight frame for several seconds once actually visible on screen (staying ready to blink if your browser tab was in the background during auto-scroll). When you scroll up to read earlier steps, a flashing **`↓ К новому сообщению`** button takes you straight to the first unread message.
- **Fast on Huge Sessions:** Smoothly browse sessions with tens of thousands of steps without browser freezes.
- **Table of Contents & Scrollbar Minimap:** Jump to any step from the top Table of Contents, or use the color-coded notches along the right scrollbar (`💬` prompts, `📦` compactions, `⚠` command errors, `★` Command Map selections) — hover any notch to preview text and click to jump.
- **Dialog-Only Mode:** Switch to **Диалог** to read just your messages and the AI's final answers, with one-click buttons between turns to peek at hidden thinking and tool calls whenever needed.
- **Universal Instant Search (`/` or `Ctrl+.`):** Search across messages, thinking blocks, tool names, parameters, command outputs (e.g., `EXIT: 1`), step numbers, and timestamps, with matching quotes highlighted both in the feed and in the Table of Contents. Press **`Alt+↓` / `Alt+↑`** inside the search box to open and pick from your recent search history (`Enter` runs, `Esc` closes).

### Tools, Code, Diffs & Files
- **Paired Tool Calls & Clear Errors:** Every tool result appears right below the command that ran it. Failed commands and errors stand out immediately with a blue-yellow striped border, clear `✓` / `⚠` icons, and `exit: 0` / `EXIT: N` badges.
- **Readable Code, Markdown & Diffs:**
  - `edit_file` shows a line-by-line diff (strikethrough deletions, **bold** additions, *italic* edits) automatically scrolled right to the `Replacement` section.
  - `read_file` renders `.md` files as formatted Markdown and code files in monospace with clean 1-by-1 line numbers (easy to copy code without selecting line numbers).
  - Global display setting under the Table of Contents (**In scrollbox**, **Full**, or **Hidden**), plus smart **Show full / Collapse** buttons that appear only when content actually overflows.
  - Scroll the top Table of Contents directly with your mouse wheel on hover; inner code/parameter boxes scroll cleanly once clicked so they never snag normal feed scrolling.
- **One-Click Copy, Live `▶ Run` & Project Consoles:** Code copy buttons strip trailing newlines so commands don't auto-execute on paste, and copying any card or command header keeps metadata neatly on a single line (omitting `{ }` and action buttons). Every logged `CommandLine` includes **`Copy`**, **`▶ Run`** (executes inline in the active project folder with an independently scrollable output box), and **`>_ Terminal`** (opens a standalone persistent terminal window pre-filled with that command), while the compact console icon in the top bar launches a shell directly inside the current project directory. Multi-line shell commands also include **`Copy &&`** (single-line chained) and **`Copy { ; }`** (PowerShell block) buttons. Common prefixes (`pwsh -c`, `cmd /c`) are dimmed so the actual command stands out.
- **Images Fitted to Window:** Attached and inline screenshots scale cleanly to fit your window width without horizontal scrollbars, and open full-size on click.
- **Clickable Links & File Viewer:** URLs, local paths, and project filenames become clickable links. Clicking a local file lets you choose **Formatted in Browser**, **Raw Text**, or **System Default App** (with a "Remember choice" option and folder opener modes for **Browser**, **Explorer**, or **Total Commander**).
- **Accurate Local Time & Original JSON (`{ }`):** Automatically calibrates timestamps to your local session time (showing raw UTC on hover). Click `{ }` or **`Shift + Right-Click`** on any card to inspect the exact underlying JSON without losing your standard browser context menu.

### Token & Prompt Cache Analytics
- **Spot Cache Expiration at a Glance:** Each model turn shows `input`, `cache_read`, and `output` tokens plus a colorblind-safe grayscale cache hit indicator.
- **Pause & Cache Strip:** The top Cache Map visualizes pauses (`Δt`) between turns so you can immediately see when a break caused the prompt cache to go cold.
- **📊 Command Map:** Open full session statistics grouped by step types, statuses, and tools (`✓ OK`, `⚠ Errors`, `⋯ Running / other` + touched files). Highlight selected tools on the right minimap with `★` markers, filter the feed to matching events, and keep **Selected commands only in steps** enabled by default so sibling tools and surrounding thinking stay cleanly hidden (with a local button on each card to expand the full turn when needed). Any subsequent search runs strictly within the currently visible Command Map selection and view mode without bringing back hidden blocks.

### Workspace Comfort & Prompt Composer
- **Resizable Prompt Composer (Windows) (`Ctrl+'`):** Toggle the composer panel anytime from any keyboard layout with **`Ctrl+'`** (`Shift+Enter` for newline). Pressing **`Enter`** safely checks Antigravity's active input: if it is empty, pastes, verifies the pasted text, presses `Enter` to send, and returns focus back to your browser after ~1.8s; if a non-code draft already exists, appends cleanly at the end without pressing `Enter`; if focus is inside a code file buffer, aborts safely and keeps your message in the clipboard. On Linux/macOS, pressing `Enter` copies the prompt to your clipboard.
- **Collapsible UI & Themes:** Independently collapse the sidebar (`«`), top toolbar (`▲`), and composer (`▼`) for maximum reading space, and switch between high-contrast **Dark** and warm low-blue-light **Day** themes.

---

## Quick Start (Windows / Linux / macOS)

1. Ensure **Python 3.10+** is installed (no `pip install` or Node.js required).
2. Download or clone the repository and run **`run.bat`** (Windows), **`./run.sh`** (Linux/macOS), or:

```bash
python server.py      # Windows
python3 server.py     # Linux / macOS
```

3. Open `http://127.0.0.1:8765/` (opens automatically by default) to browse all sessions sorted by most recently updated. Close the console window anytime (`Ctrl+C` or window `[X]`) for a clean shutdown without hanging prompts.

### CLI Options

| Flag | Default | Description |
| :--- | :--- | :--- |
| `--port` | `8765` | Local HTTP port |
| `--host` | `127.0.0.1` | Bind address (localhost only by default) |
| `--brain-dir` | `~/.gemini/antigravity/brain` | Custom path to Antigravity `brain` folder |
| `--no-open` | `false` | Start server without opening a browser tab |
| `--check` | `false` | Verify transcript discovery & parsing, then exit |

---

## Shortcuts

- **`/`** or **`Ctrl+.`** (any layout) — Focus the in-log search filter.
- **`Alt+↓` / `Alt+↑`** inside search — Open and browse recent search history (`Enter` runs, `Esc` closes).
- **`PgDn` / `PgUp` / `Home` / `End`** — Scroll the session feed regardless of where button focus sits.
- **`{ }` button** or **`Shift + Right-Click`** — View original raw JSON for a step or tool output.
- **`Hover 1.2s`** on badges or argument names — View a helpful explanation tooltip.
- **`Enter` / `Shift+Enter`** in the composer — Smart verified send/append into Antigravity (or copy to clipboard) / insert newline.
- **`Ctrl+'`** (any layout) — Open or collapse the composer input panel.
- **`Esc`** — Close open modals, image preview, tooltips, or deactivate inner box scroll.

---

## Privacy & Platform Support

- **Strictly Local:** Listens on `127.0.0.1` only, reads logs in read-only mode, and never sends your data anywhere.
- **Cross-Platform:** Full viewing, live tailing, search, diffs, Markdown, and Command Map work identically on Windows, Linux, and macOS. Windows-specific helpers (Explorer/TotalCmd and auto-pasting into `Antigravity.exe`) adapt cleanly on Linux/macOS to system file managers and clipboard mode.
