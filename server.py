"""Lightweight, lock-free local web viewer for Antigravity JSONL transcripts.

Zero external dependencies (Python 3.10+ stdlib only).
Serves a browser UI with live SSE tailing, project/title auto-detection,
and safe read-only media serving from ~/.gemini/antigravity/brain.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import html as _html
import json
import mimetypes
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Dict, List, Optional, Tuple

IS_WINDOWS = sys.platform == "win32"
IS_MACOS = sys.platform == "darwin"
if IS_WINDOWS:
    import ctypes
    import ctypes.wintypes

BRAIN_DIR = Path.home() / ".gemini" / "antigravity" / "brain"
STATIC_DIR = Path(__file__).parent / "static"
FAVICON_TAG = (
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,'
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
    "%3Cpath d='M12 4h28l14 14v42H12z' fill='%23ffe01b' stroke='%235c4300' stroke-width='4' stroke-linejoin='round'/%3E"
    "%3Cpath d='M40 4v14h14' fill='%23ffb700' stroke='%235c4300' stroke-width='4' stroke-linejoin='round'/%3E"
    "%3Cpath d='M20 28h24M20 38h24M20 48h16' stroke='%232b1f00' stroke-width='4.5' stroke-linecap='round'/%3E"
    '%3C/svg%3E">'
)

# Metadata cache: conv_id -> (mtime_ns, size, meta_dict)
_META_CACHE: Dict[str, Tuple[int, int, dict]] = {}
_META_LOCK = threading.Lock()
_I18N_SERVER_CACHE: Dict[str, Dict[str, str]] = {}
_SHUTDOWN_EVENT = threading.Event()
_WIN_CONSOLE_HANDLER: Any = None


def _norm_lang(raw_lang: Any) -> str:
    s = str(raw_lang or "").strip().lower()
    return "ru" if s.startswith("ru") else "en"


def _get_server_i18n(lang: str = "en") -> Dict[str, str]:
    key = _norm_lang(lang)
    cached = _I18N_SERVER_CACHE.get(key)
    if cached is not None:
        return cached
    merged: Dict[str, str] = {}
    for code in ("en", key):
        p = STATIC_DIR / "i18n" / f"{code}.json"
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            srv = data.get("server")
            if isinstance(srv, dict):
                merged.update({str(k): str(v) for k, v in srv.items()})
        except OSError:
            pass
        except Exception:
            pass
    _I18N_SERVER_CACHE[key] = merged
    return merged


def _srv_t(lang: str, key: str, **kwargs: Any) -> str:
    table = _get_server_i18n(lang)
    tmpl = table.get(key, key)
    if kwargs:
        for k, v in kwargs.items():
            tmpl = tmpl.replace(f"{{{k}}}", str(v))
    return tmpl

USER_REQ_RE = re.compile(r"<USER_REQUEST>\s*(.*?)\s*</USER_REQUEST>", re.DOTALL)
WORKSPACE_RE = re.compile(
    r"(?:Active Workspaces:\s*[\r\n]+\s*-\s*|Command Working Directory:\s*|Directory:\s*)((?:[A-Za-z]:[/\\]|/)[^\r\n\"'<>|]+)",
    re.IGNORECASE,
)
ANY_PATH_RE = re.compile(
    r"(?<![A-Za-z0-9_:])((?:[A-Za-z]:[/\\]|/(?:home|Users|root|opt|srv|var|mnt|media|tmp|work|projects|workspace|repos|dev|src|data|code|app|usr)/)[A-Za-z0-9_. \\/@+-]+)"
)
SKIP_DIRS = {
    "users", "windows", "program files", "program files (x86)", "programdata",
    "home", "root", "mnt", "media", "opt", "usr", "var", "etc", "srv",
    "bin", "sbin", "lib", "lib64", "dev", "proc", "sys",
    "appdata", ".gemini", "antigravity", "brain", "temp", "tmp", "static",
    "src", "app", "tests", "test", "scripts", "logs", ".system_generated",
}


def _project_from_path(raw_path: str) -> str:
    p = raw_path.strip().rstrip("/\\")
    low = p.lower()
    if not p or ".gemini" in low or "appdata" in low or "://" in p:
        return ""
    is_win = bool(re.match(r"^[A-Za-z]:[/\\]", p)) or ("\\" in p and not p.startswith("/"))
    path_obj: Any = PureWindowsPath(p) if is_win else PurePosixPath(p)
    cur = path_obj.parent if path_obj.suffix else path_obj
    for _ in range(3):
        name = cur.name
        if not name or len(name) <= 1 or len(name) > 48:
            break
        # Never expose the OS account directory itself (/home/<user> or /Users/<user>) as a project name
        if cur.parent != cur and cur.parent.name.lower() in {"users", "home"}:
            break
        if name.lower() not in SKIP_DIRS and not name.endswith(":"):
            return name
        if cur.parent == cur:
            break
        cur = cur.parent
    return ""


def _find_transcript_file(conv_dir: Path) -> Optional[Path]:
    logs_dir = conv_dir / ".system_generated" / "logs"
    full_p = logs_dir / "transcript_full.jsonl"
    if full_p.is_file():
        return full_p
    compact_p = logs_dir / "transcript.jsonl"
    if compact_p.is_file():
        return compact_p
    return None


def _extract_meta(conv_id: str, path: Path, st: os.stat_result) -> dict:
    """Extract title, project name, and basic stats from head/tail without locking."""
    with _META_LOCK:
        cached = _META_CACHE.get(conv_id)
        if cached and cached[0] == st.st_mtime_ns and cached[1] == st.st_size:
            return cached[2]

    title = conv_id[:8]
    project = ""
    line_count = 0
    head_lines: List[str] = []

    try:
        with open(path, "rb") as f:
            # Read up to 256 KB from the start for title & project detection
            head_bytes = f.read(262144)
            head_text = head_bytes.decode("utf-8", errors="replace")
            head_lines = head_text.splitlines()
            # Fast newline count over the whole file in 256 KB chunks
            line_count = head_bytes.count(b"\n")
            while True:
                chunk = f.read(262144)
                if not chunk:
                    break
                line_count += chunk.count(b"\n")
    except OSError:
        pass

    write_project = ""
    read_project = ""
    dir_project = ""

    for raw in head_lines[:150]:
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue

        content = obj.get("content") or ""
        step_type = obj.get("type")

        # Check tool_calls (write/edit is highest signal for active project)
        for tc in obj.get("tool_calls") or []:
            tname = tc.get("name") or ""
            args = tc.get("args") or {}
            for key in ("Path", "TargetFile", "DirectoryPath", "CommandLine"):
                val = str(args.get(key) or "")
                m_p = ANY_PATH_RE.search(val)
                if m_p:
                    cand = _project_from_path(m_p.group(1))
                    if cand:
                        if tname in ("write_file", "edit_file", "replace_file_content", "write_to_file"):
                            if not write_project:
                                write_project = cand
                        elif not read_project:
                            read_project = cand
                        break

        # Check Directory: in tool output (GENERIC), skipping USER_INPUT pasted logs
        if not dir_project and step_type == "GENERIC":
            m_ws = WORKSPACE_RE.search(content)
            if m_ws:
                dir_project = _project_from_path(m_ws.group(1))

        if title == conv_id[:8] and content:
            m_req = USER_REQ_RE.search(content)
            candidate = m_req.group(1) if m_req else content
            # Clean up voice/system prefixes for a readable title
            candidate = re.sub(r"<[^>]+>", " ", candidate)
            candidate = " ".join(candidate.split())
            if candidate:
                title = candidate[:95] + ("…" if len(candidate) > 95 else "")

        if write_project and title != conv_id[:8]:
            break

    project = write_project or dir_project or read_project

    meta = {
        "id": conv_id,
        "filename": path.name,
        "title": title,
        "project": project or "general",
        "size": st.st_size,
        "mtime": st.st_mtime,
        "mtime_iso": dt.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
        "lines": line_count,
    }
    with _META_LOCK:
        _META_CACHE[conv_id] = (st.st_mtime_ns, st.st_size, meta)
    return meta


def list_transcripts() -> List[dict]:
    if not BRAIN_DIR.is_dir():
        return []
    items: List[dict] = []
    try:
        for conv_dir in BRAIN_DIR.iterdir():
            if not conv_dir.is_dir():
                continue
            p = _find_transcript_file(conv_dir)
            if p is None:
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            items.append(_extract_meta(conv_dir.name, p, st))
    except OSError:
        return []
    items.sort(key=lambda x: x["mtime"], reverse=True)
    return items


def _resolve_transcript(conv_id: str) -> Optional[Path]:
    # Strict validation: prevent path traversal
    if not conv_id or "/" in conv_id or "\\" in conv_id or ".." in conv_id:
        return None
    conv_dir = BRAIN_DIR / conv_id
    if not conv_dir.is_dir():
        return None
    return _find_transcript_file(conv_dir)


def _resolve_user_path(raw_path: str, conv_id: str = "", project_root: str = "") -> Optional[Path]:
    """Expand template variables (<appDataDir>, %USERPROFILE%, $HOME, ~) and resolve local path."""
    s = str(raw_path or "").strip().strip('"').strip("'")
    if not s:
        return None
    # Strip #L10-L20 anchor if present
    s = re.sub(r"#L\d+(?:-L?\d+)?$", "", s, flags=re.IGNORECASE)
    if s.lower().startswith("file://"):
        if s.lower().startswith("file:///"):
            s = urllib.parse.unquote(s[7:])  # keeps leading '/' for POSIX paths
            if len(s) >= 3 and s[0] == "/" and s[1].isalpha() and s[2] == ":":
                s = s[1:]  # Windows drive path: /C:/... -> C:/...
        else:
            s = urllib.parse.unquote(s[7:])
    s = s.replace("<appDataDir>", str(BRAIN_DIR.parent))
    if conv_id and "/" not in conv_id and "\\" not in conv_id and ".." not in conv_id:
        s = s.replace("<conversation-id>", conv_id)
    home_str = str(Path.home())
    for env_key in ("USERPROFILE", "LOCALAPPDATA", "APPDATA", "HOME"):
        env_val = os.environ.get(env_key) or (home_str if env_key in ("USERPROFILE", "HOME") else None)
        if env_val:
            s = re.sub(rf"%{env_key}%", lambda _: env_val, s, flags=re.IGNORECASE)
    s = re.sub(r"\$\{?HOME\}?", lambda _: home_str, s)
    if s.startswith("~/") or s.startswith("~\\") or s == "~":
        s = home_str + s[1:]
    # If unresolved placeholders remain, reject cleanly
    if "<" in s or ">" in s:
        return None
    p = Path(s)
    if not p.is_absolute() and project_root:
        pr = Path(project_root)
        if pr.is_dir():
            p = pr / p
    return p.resolve()


def _detect_project_context(records: List[dict], project_name: str = "") -> Tuple[str, List[str]]:
    """Infer workspace root folder and list shallow files/subdirs for optional short-name linking."""
    candidates: List[str] = []
    for rec in records[:150]:
        content = rec.get("content") or ""
        m_ws = WORKSPACE_RE.search(content)
        if m_ws:
            candidates.append(m_ws.group(1).strip())
        for tc in rec.get("tool_calls") or []:
            args = tc.get("args") or {}
            for key in ("DirectoryPath", "Path", "TargetFile"):
                val = str(args.get(key) or "").strip()
                if val and (ANY_PATH_RE.match(val) or val.startswith("/")):
                    candidates.append(val)

    root_dir: Optional[Path] = None
    for cand in candidates:
        low = cand.lower()
        if ".gemini" in low or "appdata" in low:
            continue
        p = Path(cand)
        try:
            if p.is_dir():
                if p.parent != p and p.parent.name.lower() in {"users", "home"}:
                    continue
                if not project_name or p.name.lower() == project_name.lower():
                    root_dir = p.resolve()
                    break
                if root_dir is None:
                    root_dir = p.resolve()
            elif p.is_file():
                for parent in (p.parent, p.parent.parent):
                    if parent.parent != parent and parent.parent.name.lower() in {"users", "home"}:
                        continue
                    if parent.is_dir() and (not project_name or parent.name.lower() == project_name.lower()):
                        root_dir = parent.resolve()
                        break
                if root_dir is not None:
                    break
        except OSError:
            continue

    if root_dir is None or not root_dir.is_dir():
        return "", []

    ignore_dirs = {".git", ".venv", "venv", "__pycache__", "node_modules", ".pytest_cache", ".mypy_cache", ".idea", ".vscode"}
    files: List[str] = []
    try:
        for entry in root_dir.iterdir():
            name = entry.name
            if name in ignore_dirs or name.startswith(".commit_msg"):
                continue
            if entry.is_file():
                files.append(name)
            elif entry.is_dir():
                files.append(name)
                try:
                    for sub in entry.iterdir():
                        if sub.name in ignore_dirs:
                            continue
                        files.append(f"{name}/{sub.name}")
                        if len(files) >= 250:
                            break
                except OSError:
                    pass
            if len(files) >= 250:
                break
    except OSError:
        pass
    return str(root_dir), files


def _find_totalcmd_exe() -> Optional[Path]:
    if not IS_WINDOWS:
        return None
    for cand in (
        Path(r"C:\totalcmd\TOTALCMD64.EXE"),
        Path(r"C:\totalcmd\TOTALCMD.EXE"),
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "totalcmd" / "TOTALCMD64.EXE",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "totalcmd" / "TOTALCMD.EXE",
    ):
        if cand.is_file():
            return cand
    return None


def _find_notepadpp_exe() -> Optional[Path]:
    if not IS_WINDOWS:
        return None
    cands = [
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Notepad++" / "notepad++.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Notepad++" / "notepad++.exe",
    ]
    local_app = os.environ.get("LocalAppData", "")
    if local_app:
        cands.append(Path(local_app) / "Programs" / "Notepad++" / "notepad++.exe")
    for cand in cands:
        try:
            if cand.is_file():
                return cand
        except OSError:
            continue
    for exe_name in ("notepad++.exe", "notepad++"):
        found = shutil.which(exe_name)
        if found and Path(found).is_file():
            return Path(found)
    return None


def _find_posix_opener() -> Optional[str]:
    if IS_MACOS:
        return "open" if shutil.which("open") else None
    if not IS_WINDOWS:
        return "xdg-open" if shutil.which("xdg-open") else None
    return None


def _get_default_shell_name() -> str:
    if IS_WINDOWS:
        if shutil.which("pwsh"):
            return "pwsh"
        if shutil.which("powershell"):
            return "powershell"
        return "cmd"
    if shutil.which("bash"):
        return "bash"
    if shutil.which("pwsh"):
        return "pwsh"
    return "sh"


def _find_shell_for_command(cmd_text: str) -> Tuple[Optional[List[str]], str]:
    """Select the exact shell binary + flags matching Antigravity run_command execution."""
    stripped = cmd_text.lstrip()
    if IS_WINDOWS:
        pwsh_exe = shutil.which("pwsh")
        if pwsh_exe:
            return [pwsh_exe, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", cmd_text], "pwsh"
        ps_exe = shutil.which("powershell")
        if ps_exe:
            return [ps_exe, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", cmd_text], "powershell"
        comspec = os.environ.get("ComSpec") or shutil.which("cmd")
        if comspec:
            return [comspec, "/c", cmd_text], "cmd"
        return None, ""

    if re.match(r"^(?:pwsh|powershell)\b", stripped, re.IGNORECASE):
        pwsh_exe = shutil.which("pwsh")
        if pwsh_exe:
            return [pwsh_exe, "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", cmd_text], "pwsh"
    bash_exe = shutil.which("bash")
    if bash_exe:
        return [bash_exe, "-lc", cmd_text], "bash"
    sh_exe = shutil.which("sh") or "/bin/sh"
    if Path(sh_exe).exists() or shutil.which(sh_exe):
        return [sh_exe, "-c", cmd_text], "sh"
    return None, ""


_ANSI_ESCAPE_RE = re.compile(
    r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[P^_][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-])"
)


def _strip_ansi(text: str) -> str:
    return _ANSI_ESCAPE_RE.sub("", text)


def _decode_console_bytes(raw: bytes) -> str:
    if not raw:
        return ""
    encodings = ["utf-8"]
    if IS_WINDOWS:
        encodings.extend(["cp866", "cp1251"])
    decoded = ""
    for enc in encodings:
        try:
            decoded = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if not decoded:
        decoded = raw.decode("utf-8", errors="replace")
    return _strip_ansi(decoded)


def _resolve_project_cwd(raw_cwd: str = "", conv_id: str = "", lang: str = "en") -> Tuple[Optional[Path], Optional[Dict[str, Any]]]:
    cwd_path: Optional[Path] = None
    if raw_cwd:
        cand = _resolve_user_path(raw_cwd, conv_id, raw_cwd)
        if cand is not None:
            if cand.is_dir():
                cwd_path = cand
            elif cand.is_file():
                cwd_path = cand.parent

    if cwd_path is None and conv_id:
        t_path = _resolve_transcript(conv_id)
        if t_path is not None:
            records, _, _ = read_jsonl_range(t_path, 0)
            st = t_path.stat()
            meta = _extract_meta(conv_id, t_path, st)
            proj_root, _ = _detect_project_context(records, meta.get("project", ""))
            if proj_root:
                pr = Path(proj_root)
                if pr.is_dir():
                    cwd_path = pr

    if cwd_path is None:
        if raw_cwd:
            return None, {"ok": False, "error": _srv_t(lang, "cmdInvalidCwd", cwd=raw_cwd)}
        cwd_path = Path(__file__).resolve().parent
    return cwd_path, None


def _ps_single_quote(text: str) -> str:
    return "'" + str(text).replace("'", "''") + "'"


def _build_windows_interactive_ps_script(cwd_path: Path, cmd_clean: str = "") -> str:
    q_cwd = _ps_single_quote(str(cwd_path))
    lines = [
        f"Set-Location -LiteralPath {q_cwd}",
    ]
    if cmd_clean:
        q_cmd = _ps_single_quote(cmd_clean)
        lines.extend(
            [
                f"try {{ Import-Module PSReadLine -ErrorAction SilentlyContinue; if (Get-Command Get-PSReadLineOption -ErrorAction SilentlyContinue) {{ [Microsoft.PowerShell.PSConsoleReadLine]::AddToHistory({q_cmd}) }} }} catch {{}}",
                f"Write-Host ('[cwd] ' + {q_cwd}) -ForegroundColor DarkCyan",
                f"Write-Host ('PS> ' + {q_cmd}) -ForegroundColor Yellow",
                f"$__tvCmd = {q_cmd}",
                "try {",
                "  Invoke-Expression $__tvCmd",
                "} catch {",
                "  Write-Host $_ -ForegroundColor Red",
                "}",
            ]
        )
    else:
        lines.append(f"Write-Host ('[cwd] ' + {q_cwd}) -ForegroundColor DarkCyan")
    return "\n".join(lines)


def open_interactive_terminal(
    cmd_text: str = "",
    raw_cwd: str = "",
    conv_id: str = "",
    lang: str = "en",
) -> Tuple[int, Dict[str, Any]]:
    lang = _norm_lang(lang)
    cwd_path, cwd_err = _resolve_project_cwd(raw_cwd, conv_id, lang)
    if cwd_path is None:
        return 400, cwd_err or {"ok": False, "error": _srv_t(lang, "cmdInvalidCwd", cwd=raw_cwd)}

    cmd_clean = str(cmd_text or "").rstrip("\r\n")

    if IS_WINDOWS:
        shell_exe = shutil.which("pwsh") or shutil.which("powershell")
        if not shell_exe:
            return 500, {"ok": False, "error": _srv_t(lang, "cmdShellNotFound")}
        shell_label = Path(shell_exe).stem.lower()
        script = _build_windows_interactive_ps_script(cwd_path, cmd_clean)
        encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
        try:
            subprocess.Popen(
                [shell_exe, "-NoLogo", "-NoExit", "-EncodedCommand", encoded],
                cwd=str(cwd_path),
                close_fds=True,
                creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010),
            )
            return 200, {"ok": True, "cwd": str(cwd_path), "shell": shell_label}
        except OSError as exc:
            return 500, {"ok": False, "error": f"{_srv_t(lang, 'termOpenError')}: {exc}"}

    # POSIX (macOS / Linux)
    posix_shell = shutil.which("bash") or shutil.which("zsh") or shutil.which("sh") or "/bin/sh"
    q_cwd = shlex.quote(str(cwd_path))
    if cmd_clean:
        q_cmd_print = shlex.quote(cmd_clean)
        shell_script = f"cd {q_cwd} && printf '\\033[36m[cwd] %s\\033[0m\\n\\033[33m$ %s\\033[0m\\n' {q_cwd} {q_cmd_print}; {cmd_clean}; exec {shlex.quote(posix_shell)} -i"
    else:
        shell_script = f"cd {q_cwd} && printf '\\033[36m[cwd] %s\\033[0m\\n' {q_cwd}; exec {shlex.quote(posix_shell)} -i"

    if IS_MACOS and shutil.which("osascript"):
        try:
            osa_esc = shell_script.replace("\\", "\\\\").replace('"', '\\"')
            subprocess.Popen(
                ["osascript", "-e", f'tell application "Terminal" to do script "{osa_esc}"', "-e", 'tell application "Terminal" to activate'],
                start_new_session=True,
            )
            return 200, {"ok": True, "cwd": str(cwd_path), "shell": Path(posix_shell).name}
        except OSError as exc:
            return 500, {"ok": False, "error": f"{_srv_t(lang, 'termOpenError')}: {exc}"}

    term_candidates = [
        ("x-terminal-emulator", ["-e", posix_shell, "-ic", shell_script]),
        ("gnome-terminal", ["--", posix_shell, "-ic", shell_script]),
        ("konsole", ["-e", posix_shell, "-ic", shell_script]),
        ("xfce4-terminal", ["-x", posix_shell, "-ic", shell_script]),
        ("alacritty", ["-e", posix_shell, "-ic", shell_script]),
        ("kitty", [posix_shell, "-ic", shell_script]),
        ("xterm", ["-e", posix_shell, "-ic", shell_script]),
    ]
    for bin_name, extra_args in term_candidates:
        found = shutil.which(bin_name)
        if found:
            try:
                subprocess.Popen([found, *extra_args], cwd=str(cwd_path), start_new_session=True)
                return 200, {"ok": True, "cwd": str(cwd_path), "shell": Path(posix_shell).name}
            except OSError:
                continue
    return 501, {"ok": False, "error": _srv_t(lang, "termUnsupported")}


def execute_console_command(
    cmd_text: str,
    raw_cwd: str = "",
    conv_id: str = "",
    lang: str = "en",
    timeout_sec: float = 30.0,
) -> Tuple[int, Dict[str, Any]]:
    lang = _norm_lang(lang)
    cmd_clean = str(cmd_text or "").rstrip("\r\n")
    if not cmd_clean.strip():
        return 400, {"ok": False, "error": _srv_t(lang, "cmdEmpty")}

    cwd_path, cwd_err = _resolve_project_cwd(raw_cwd, conv_id, lang)
    if cwd_path is None:
        return 400, cwd_err or {"ok": False, "error": _srv_t(lang, "cmdInvalidCwd", cwd=raw_cwd)}

    argv, shell_label = _find_shell_for_command(cmd_clean)
    if not argv:
        return 500, {"ok": False, "error": _srv_t(lang, "cmdShellNotFound")}

    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env["NO_COLOR"] = "1"
    env["CLICOLOR"] = "0"
    env["FORCE_COLOR"] = "0"
    env["TERM"] = "dumb"

    popen_kwargs: Dict[str, Any] = {
        "cwd": str(cwd_path),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "env": env,
    }
    if IS_WINDOWS:
        popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

    t0 = time.monotonic()
    max_bytes = 200_000
    timed_out = False
    try:
        proc = subprocess.Popen(argv, **popen_kwargs)
    except OSError as exc:
        return 500, {"ok": False, "error": str(exc)}

    try:
        out_b, err_b = proc.communicate(timeout=timeout_sec)
        exit_code = int(proc.returncode or 0)
    except subprocess.TimeoutExpired:
        timed_out = True
        if IS_WINDOWS:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000),
                )
            except Exception:
                proc.kill()
        else:
            proc.kill()
        try:
            out_b, err_b = proc.communicate(timeout=3)
        except Exception:
            out_b, err_b = b"", b""
        exit_code = -1

    duration_ms = max(1, int(round((time.monotonic() - t0) * 1000)))
    stdout_str = _decode_console_bytes((out_b or b"")[:max_bytes])
    stderr_str = _decode_console_bytes((err_b or b"")[:max_bytes])
    if len(out_b or b"") > max_bytes:
        stdout_str += "\n… [truncated]"
    if len(err_b or b"") > max_bytes:
        stderr_str += "\n… [truncated]"
    if timed_out:
        timeout_note = _srv_t(lang, "cmdTimeoutMsg", sec=int(timeout_sec))
        stderr_str = f"{stderr_str}\n{timeout_note}".strip()

    return 200, {
        "ok": True,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "cwd": str(cwd_path),
        "shell": shell_label,
        "stdout": stdout_str,
        "stderr": stderr_str,
        "timed_out": timed_out,
    }


def get_platform_capabilities() -> Dict[str, Any]:
    has_posix_opener = _find_posix_opener() is not None
    return {
        "os": sys.platform,
        "is_windows": IS_WINDOWS,
        "is_macos": IS_MACOS,
        "default_shell": _get_default_shell_name(),
        "antigravity_paste": IS_WINDOWS,
        "open_explorer": IS_WINDOWS,
        "open_totalcmd": IS_WINDOWS and (_find_totalcmd_exe() is not None),
        "open_notepadpp": IS_WINDOWS and (_find_notepadpp_exe() is not None),
        "open_folder_os": IS_WINDOWS or has_posix_opener,
        "open_file_os": IS_WINDOWS or has_posix_opener,
    }


def read_jsonl_range(path: Path, offset: int = 0) -> Tuple[List[dict], int, bool]:
    """Read complete JSONL lines from `offset` up to the last '\\n'.

    Returns (parsed_items, new_offset, was_reset).
    Opens and immediately closes the file so writers are never blocked.
    """
    try:
        st = path.stat()
    except OSError:
        return [], offset, False

    was_reset = False
    if st.st_size < offset:
        offset = 0
        was_reset = True

    if st.st_size == offset:
        return [], offset, was_reset

    try:
        with open(path, "rb") as f:
            f.seek(offset)
            chunk = f.read(st.st_size - offset)
    except OSError:
        return [], offset, was_reset

    last_nl = chunk.rfind(b"\n")
    if last_nl == -1:
        # Line is still being written; wait for '\n'
        return [], offset, was_reset

    complete = chunk[: last_nl + 1]
    new_offset = offset + last_nl + 1
    text = complete.decode("utf-8", errors="replace")

    records: List[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            records.append(
                {
                    "step_index": -1,
                    "source": "SYSTEM",
                    "type": "ERROR_MESSAGE",
                    "status": "ERROR",
                    "created_at": "",
                    "error": f"Malformed JSON line: {line[:200]}",
                }
            )
    return records, new_offset, was_reset


class TranscriptHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def handle(self) -> None:
        try:
            super().handle()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
            return

    def log_message(self, format: str, *args: Any) -> None:
        # Suppress noisy per-request console logs
        return

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/send-to-antigravity":
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            raw_body = self.rfile.read(min(length, 1_000_000)) if length > 0 else b""
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                self._send_json({"ok": False, "error": "Invalid JSON"}, status=400)
                return
            lang = _norm_lang(data.get("lang"))
            if not IS_WINDOWS:
                self._send_json(
                    {
                        "ok": False,
                        "error": _srv_t(lang, "pasteWindowsOnly"),
                        "status": "unsupported",
                    },
                    status=501,
                )
                return
            text = str(data.get("text") or "")
            prefer_project = str(data.get("project") or "")
            prefer_title = str(data.get("title") or "")
            if not text.strip():
                self._send_json({"ok": False, "error": _srv_t(lang, "emptyText")}, status=400)
                return
            trace_lines: List[str] = []
            ok, info, status_code = send_text_to_antigravity_window(
                text, prefer_project, prefer_title, lang=lang, trace_out=trace_lines
            )
            http_status = 200 if ok else (404 if status_code == "not_found" else 409)
            self._send_json(
                {"ok": ok, "info": info, "status": status_code, "trace": "\n".join(trace_lines)},
                status=http_status,
            )
            return

        if parsed.path == "/api/open-folder":
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            raw_body = self.rfile.read(min(length, 200_000))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                self._send_json({"ok": False, "error": "Invalid JSON"}, status=400)
                return
            lang = _norm_lang(data.get("lang"))
            raw_p = str(data.get("path") or "")
            mode = str(data.get("mode") or ("explorer" if IS_WINDOWS else "system")).lower()
            conv_id = str(data.get("conv") or "")
            project_root = str(data.get("root") or "")
            resolved = _resolve_user_path(raw_p, conv_id, project_root)
            if resolved is None or not resolved.exists():
                self._send_json({"ok": False, "error": _srv_t(lang, "pathNotFound", path=raw_p)}, status=404)
                return
            if resolved.is_file():
                self._send_json(
                    {
                        "ok": False,
                        "is_file": True,
                        "file_url": f"/api/file?path={urllib.parse.quote(str(resolved))}&lang={lang}",
                    }
                )
                return
            if mode == "totalcmd":
                if not IS_WINDOWS:
                    self._send_json({"ok": False, "error": _srv_t(lang, "totalcmdWinOnly")}, status=400)
                    return
                tc = _find_totalcmd_exe()
                if not tc:
                    self._send_json(
                        {"ok": False, "error": _srv_t(lang, "totalcmdNotFound")},
                        status=404,
                    )
                    return
                try:
                    subprocess.Popen([str(tc), "/O", "/T", f"/R={resolved}"])
                    self._send_json({"ok": True, "path": str(resolved), "mode": "totalcmd"})
                except OSError as exc:
                    self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            if mode == "explorer":
                if not IS_WINDOWS:
                    self._send_json({"ok": False, "error": _srv_t(lang, "explorerWinOnly")}, status=400)
                    return
                try:
                    subprocess.Popen(["explorer.exe", str(resolved)])
                    self._send_json({"ok": True, "path": str(resolved), "mode": "explorer"})
                except OSError as exc:
                    self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            if IS_WINDOWS:
                try:
                    subprocess.Popen(["explorer.exe", str(resolved)])
                    self._send_json({"ok": True, "path": str(resolved), "mode": "explorer"})
                except OSError as exc:
                    self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            opener = _find_posix_opener()
            if not opener:
                self._send_json(
                    {"ok": False, "error": _srv_t(lang, "posixOpenerNotFound")},
                    status=404,
                )
                return
            try:
                subprocess.Popen([opener, str(resolved)], start_new_session=True)
                self._send_json({"ok": True, "path": str(resolved), "mode": "system"})
            except OSError as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=500)
            return

        if parsed.path == "/api/open-file":
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            raw_body = self.rfile.read(min(length, 200_000))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                self._send_json({"ok": False, "error": "Invalid JSON"}, status=400)
                return
            lang = _norm_lang(data.get("lang"))
            raw_p = str(data.get("path") or "")
            conv_id = str(data.get("conv") or "")
            project_root = str(data.get("root") or "")
            mode = str(data.get("mode") or "system").strip().lower()
            resolved = _resolve_user_path(raw_p, conv_id, project_root)
            if resolved is None or not resolved.exists():
                self._send_json({"ok": False, "error": _srv_t(lang, "pathNotFound", path=raw_p)}, status=404)
                return
            if mode == "notepadpp":
                if not IS_WINDOWS:
                    self._send_json({"ok": False, "error": _srv_t(lang, "notepadWinOnly")}, status=400)
                    return
                if resolved.is_dir():
                    self._send_json({"ok": False, "error": _srv_t(lang, "notepadNoDirs")}, status=400)
                    return
                npp = _find_notepadpp_exe()
                if not npp:
                    self._send_json(
                        {"ok": False, "error": _srv_t(lang, "notepadNotFound")},
                        status=404,
                    )
                    return
                try:
                    subprocess.Popen([str(npp), str(resolved)])
                    self._send_json({"ok": True, "path": str(resolved), "mode": "notepadpp"})
                except OSError as exc:
                    self._send_json({"ok": False, "error": str(exc)}, status=500)
                return
            try:
                if IS_WINDOWS:
                    os.startfile(str(resolved))  # type: ignore[attr-defined]
                else:
                    opener = _find_posix_opener()
                    if not opener:
                        self._send_json(
                            {"ok": False, "error": _srv_t(lang, "systemOpenerNotFound")},
                            status=404,
                        )
                        return
                    subprocess.Popen([opener, str(resolved)], start_new_session=True)
                self._send_json({"ok": True, "path": str(resolved), "mode": "system"})
            except OSError as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=500)
            return

        if parsed.path == "/api/run-command":
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            raw_body = self.rfile.read(min(length, 500_000)) if length > 0 else b""
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                self._send_json({"ok": False, "error": "Invalid JSON"}, status=400)
                return
            lang = _norm_lang(data.get("lang"))
            origin = self.headers.get("Origin") or self.headers.get("Referer") or ""
            if origin:
                orig_host = (urllib.parse.urlparse(origin).hostname or "").lower()
                if orig_host not in {"127.0.0.1", "localhost", "::1"}:
                    self._send_json({"ok": False, "error": _srv_t(lang, "cmdForbiddenOrigin")}, status=403)
                    return
            cmd_text = str(data.get("cmd") or "")
            raw_cwd = str(data.get("cwd") or "")
            conv_id = str(data.get("conv") or "")
            status_code, payload = execute_console_command(cmd_text, raw_cwd=raw_cwd, conv_id=conv_id, lang=lang)
            self._send_json(payload, status=status_code)
            return

        if parsed.path == "/api/open-terminal":
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            raw_body = self.rfile.read(min(length, 500_000)) if length > 0 else b""
            try:
                data = json.loads(raw_body.decode("utf-8")) if raw_body else {}
            except Exception:
                self._send_json({"ok": False, "error": "Invalid JSON"}, status=400)
                return
            lang = _norm_lang(data.get("lang"))
            origin = self.headers.get("Origin") or self.headers.get("Referer") or ""
            if origin:
                orig_host = (urllib.parse.urlparse(origin).hostname or "").lower()
                if orig_host not in {"127.0.0.1", "localhost", "::1"}:
                    self._send_json({"ok": False, "error": _srv_t(lang, "cmdForbiddenOrigin")}, status=403)
                    return
            cmd_text = str(data.get("cmd") or "")
            raw_cwd = str(data.get("cwd") or "")
            conv_id = str(data.get("conv") or "")
            status_code, payload = open_interactive_terminal(cmd_text=cmd_text, raw_cwd=raw_cwd, conv_id=conv_id, lang=lang)
            self._send_json(payload, status=status_code)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def _send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_dir_html(self, dir_path: Path, conv_id: str = "", project_root: str = "", lang: str = "en") -> None:
        lang = _norm_lang(lang)
        try:
            entries = list(dir_path.iterdir())
        except OSError as exc:
            self.send_error(HTTPStatus.FORBIDDEN, str(exc))
            return
        entries.sort(key=lambda p: (not p.is_dir(), p.name.lower()))
        title = _html.escape(dir_path.name or str(dir_path))
        full_path = _html.escape(str(dir_path))
        dir_kind = _html.escape(_srv_t(lang, "dirKind"))
        lang_q = f"&lang={lang}"
        parent_link = ""
        if dir_path.parent != dir_path:
            pq = urllib.parse.quote(str(dir_path.parent))
            parent_lbl = _html.escape(_srv_t(lang, "dirParentLink"))
            parent_link = f'<a class="dir-row is-dir" href="/api/file?path={pq}{lang_q}"><span>{parent_lbl}</span><span class="dir-meta">{dir_kind}</span></a>'

        rows = []
        for item in entries:
            iq = urllib.parse.quote(str(item))
            iname = _html.escape(item.name)
            try:
                st = item.stat()
                mtime = dt.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")
                size_str = f"{st.st_size:,} B".replace(",", " ") if not item.is_dir() else dir_kind
            except OSError:
                mtime, size_str = "", ""
            if item.is_dir():
                rows.append(
                    f'<a class="dir-row is-dir" href="/api/file?path={iq}{lang_q}">'
                    f'<span>📁 {iname}/</span><span class="dir-meta">{_html.escape(size_str)} · {_html.escape(mtime)}</span></a>'
                )
            else:
                rows.append(
                    f'<a class="dir-row" href="/api/file?path={iq}&fmt=1{lang_q}">'
                    f'<span>📄 {iname}</span><span class="dir-meta">{_html.escape(size_str)} · {_html.escape(mtime)}</span></a>'
                )

        caps = get_platform_capabilities()
        ext_btns = []
        if caps["open_explorer"]:
            ext_btns.append(f'<button class="btn-sm" type="button" onclick="openExt(\'explorer\')">{_html.escape(_srv_t(lang, "dirOpenExplorer"))}</button>')
        if caps["open_totalcmd"]:
            ext_btns.append(f'<button class="btn-sm" type="button" onclick="openExt(\'totalcmd\')">{_html.escape(_srv_t(lang, "dirOpenTotalCmd"))}</button>')
        if not caps["is_windows"] and caps["open_folder_os"]:
            ext_btns.append(f'<button class="btn-sm" type="button" onclick="openExt(\'system\')">{_html.escape(_srv_t(lang, "dirOpenFileMgr"))}</button>')
        ext_btns_html = "\n        ".join(ext_btns)

        safe_dir_json = json.dumps(str(dir_path), ensure_ascii=False).replace("</", "<\\/")
        safe_open_err_json = json.dumps(_srv_t(lang, "openError"), ensure_ascii=False).replace("</", "<\\/")
        safe_lang_json = json.dumps(lang, ensure_ascii=False)
        dir_suffix = _html.escape(_srv_t(lang, "dirTitleSuffix"))
        back_logs = _html.escape(_srv_t(lang, "backToLogs"))
        empty_msg = _html.escape(_srv_t(lang, "dirEmpty"))
        page = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — {dir_suffix}</title>
  {FAVICON_TAG}
  <link rel="stylesheet" href="/static/style.css">
  <style>
    body {{ overflow: auto; height: auto; min-height: 100vh; }}
    .dir-page {{ max-width: 960px; margin: 24px auto 48px; padding: 0 20px; }}
    .dir-topbar {{
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 12px 16px; margin-bottom: 14px; background: var(--bg-elev);
      border: 1px solid var(--border); border-radius: 10px;
    }}
    .dir-path {{ font-family: var(--mono); font-size: 12px; color: var(--text-dim); word-break: break-all; }}
    .dir-list {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }}
    .dir-row {{
      display: flex; justify-content: space-between; align-items: center; gap: 12px;
      padding: 8px 14px; border-bottom: 1px solid var(--border); text-decoration: none;
      color: var(--text); font-size: 13.5px;
    }}
    .dir-row:last-child {{ border-bottom: none; }}
    .dir-row:hover {{ background: var(--bg-muted); }}
    .dir-row.is-dir {{ font-weight: 700; color: var(--accent); }}
    .dir-meta {{ font-family: var(--mono); font-size: 11.5px; color: var(--text-dim); white-space: nowrap; }}
  </style>
  <script>
    try {{ if (localStorage.getItem("tv_theme") === "day") document.documentElement.setAttribute("data-theme", "day"); }} catch (_) {{}}
  </script>
</head>
<body>
  <div class="dir-page">
    <div class="dir-topbar">
      <div>
        <div style="font-weight:700;font-size:15px;">📁 {title}</div>
        <div class="dir-path">{full_path}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        {ext_btns_html}
        <a class="btn-sm" href="/" style="text-decoration:none;">{back_logs}</a>
      </div>
    </div>
    <div class="dir-list">
      {parent_link}
      {''.join(rows) if rows else f'<div style="padding:20px;color:var(--text-dim);">{empty_msg}</div>'}
    </div>
  </div>
  <script>
    const DIR_PATH = {safe_dir_json};
    const PAGE_LANG = {safe_lang_json};
    const OPEN_ERR = {safe_open_err_json};
    async function openExt(mode) {{
      try {{
        const r = await fetch("/api/open-folder", {{
          method: "POST",
          headers: {{"Content-Type": "application/json"}},
          body: JSON.stringify({{ path: DIR_PATH, mode, lang: PAGE_LANG }})
        }});
        const d = await r.json();
        if (!d.ok) alert(d.error || OPEN_ERR);
      }} catch (e) {{ alert(e.message); }}
    }}
  </script>
</body>
</html>"""
        body = page.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_markdown_html(self, file_path: Path, lang: str = "en") -> None:
        lang = _norm_lang(lang)
        try:
            md_text = file_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        title = _html.escape(file_path.name)
        full_path = _html.escape(str(file_path))
        raw_url = "/api/file?path=" + urllib.parse.quote(str(file_path)) + "&raw=1"
        safe_json = json.dumps(md_text, ensure_ascii=False).replace("</", "<\\/")
        safe_path_json = json.dumps(str(file_path), ensure_ascii=False).replace("</", "<\\/")
        safe_npp_err = json.dumps(_srv_t(lang, "openNppError"), ensure_ascii=False).replace("</", "<\\/")
        safe_lang_json = json.dumps(lang, ensure_ascii=False)
        caps = get_platform_capabilities()
        npp_btn = (
            f'<button class="btn-sm" id="openNppBtn" type="button">{_html.escape(_srv_t(lang, "openNppBtn"))}</button>'
            if caps.get("open_notepadpp")
            else ""
        )
        back_logs = _html.escape(_srv_t(lang, "backToLogs"))
        page = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Markdown</title>
  {FAVICON_TAG}
  <link rel="stylesheet" href="/static/style.css">
  <style>
    body {{ overflow: auto; height: auto; min-height: 100vh; }}
    .md-page {{ max-width: 960px; margin: 24px auto 48px; padding: 0 20px; }}
    .md-topbar {{
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 10px 14px; margin-bottom: 16px; background: var(--bg-elev);
      border: 1px solid var(--border); border-radius: 10px;
    }}
    .md-path {{ font-family: var(--mono); font-size: 12px; color: var(--text-dim); word-break: break-all; }}
    .md-card {{
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
      padding: 22px 26px; line-height: 1.6;
    }}
    .md-card table {{ border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }}
    .md-card th, .md-card td {{ border: 1px solid var(--border); padding: 6px 10px; text-align: left; }}
    .md-card th {{ background: var(--bg-muted); font-weight: 700; }}
    .md-card blockquote {{
      margin: 10px 0; padding: 6px 14px; border-left: 3px solid var(--accent);
      background: var(--bg-elev); color: var(--text-dim); border-radius: 0 6px 6px 0;
    }}
    .md-card hr {{ border: none; border-top: 1px solid var(--border); margin: 16px 0; }}
  </style>
  <script>
    try {{ if (localStorage.getItem("tv_theme") === "day") document.documentElement.setAttribute("data-theme", "day"); }} catch (_) {{}}
  </script>
</head>
<body>
  <div class="md-page">
    <div class="md-topbar">
      <div>
        <div style="font-weight:700;font-size:15px;">{title}</div>
        <div class="md-path">{full_path}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        {npp_btn}
        <a class="btn-sm" href="{raw_url}" style="text-decoration:none;">Raw</a>
        <a class="btn-sm" href="/" style="text-decoration:none;">{back_logs}</a>
      </div>
    </div>
    <article class="md-card md" id="mdOut"></article>
  </div>
  <script type="application/json" id="mdRaw">{safe_json}</script>
  <script>
    (function() {{
      const FILE_PATH = {safe_path_json};
      const PAGE_LANG = {safe_lang_json};
      const NPP_ERR = {safe_npp_err};
      const nppBtn = document.getElementById("openNppBtn");
      if (nppBtn) {{
        nppBtn.addEventListener("click", async () => {{
          try {{
            const r = await fetch("/api/open-file", {{
              method: "POST",
              headers: {{"Content-Type": "application/json"}},
              body: JSON.stringify({{ path: FILE_PATH, mode: "notepadpp", lang: PAGE_LANG }})
            }});
            const d = await r.json();
            if (!d.ok) alert(d.error || NPP_ERR);
          }} catch (e) {{ alert(e.message); }}
        }});
      }}
    }})();
  </script>
  <script>
    (function() {{
      const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      function inlineMd(s) {{
        let t = esc(s);
        t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${{c}}</code>`);
        t = t.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, (_, lbl, url) => {{
          let href = url.replace(/&amp;/g, "&");
          if (href.startsWith("file:///")) {{
            let p = decodeURIComponent(href.slice(7)).replace(/#.*$/, "");
            if (/^\\/[A-Za-z]:/.test(p)) p = p.slice(1);
            href = "/api/file?path=" + encodeURIComponent(p) + "&fmt=1&lang={lang}";
          }} else if (!/^https?:\\/\\//i.test(href) && !href.startsWith("/")) {{
            return lbl;
          }}
          return `<a href="${{esc(href)}}" target="_blank" rel="noopener noreferrer">${{lbl}}</a>`;
        }});
        t = t.replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>");
        t = t.replace(/(^|[^*])\\*([^*\\n]+)\\*(?!\\*)/g, "$1<em>$2</em>");
        return t;
      }}
      function renderMd(src) {{
        const lines = String(src || "").replace(/\\r\\n/g, "\\n").split("\\n");
        let html = "", inCode = false, codeLang = "", codeBuf = [], inUl = false, inOl = false, inTable = false;
        const closeLists = () => {{
          if (inUl) {{ html += "</ul>"; inUl = false; }}
          if (inOl) {{ html += "</ol>"; inOl = false; }}
          if (inTable) {{ html += "</tbody></table>"; inTable = false; }}
        }};
        for (let i = 0; i < lines.length; i++) {{
          const line = lines[i];
          if (inCode) {{
            if (/^\\s*```/.test(line)) {{
              html += `<pre><code>${{esc(codeBuf.join("\\n"))}}</code></pre>`;
              inCode = false; codeBuf = [];
            }} else {{ codeBuf.push(line); }}
            continue;
          }}
          const mFence = line.match(/^\\s*```([^`]*)$/);
          if (mFence) {{ closeLists(); inCode = true; codeLang = mFence[1].trim(); codeBuf = []; continue; }}
          if (!line.trim()) {{ closeLists(); continue; }}
          if (/^\\s*---+$/.test(line)) {{ closeLists(); html += "<hr>"; continue; }}
          const mH = line.match(/^(#{{1,6}})\\s+(.*)$/);
          if (mH) {{ closeLists(); const lvl = mH[1].length; html += `<h${{lvl}}>${{inlineMd(mH[2])}}</h${{lvl}}>`; continue; }}
          if (/^\\s*>\\s?/.test(line)) {{ closeLists(); html += `<blockquote>${{inlineMd(line.replace(/^\\s*>\\s?/, ""))}}</blockquote>`; continue; }}
          if (/^\\s*\\|.+\\|\\s*$/.test(line)) {{
            const cells = line.trim().slice(1, -1).split("|").map(c => c.trim());
            if (!inTable && i + 1 < lines.length && /^\\s*\\|[\\s:|-]+\\|\\s*$/.test(lines[i + 1])) {{
              closeLists();
              html += "<table><thead><tr>" + cells.map(c => `<th>${{inlineMd(c)}}</th>`).join("") + "</tr></thead><tbody>";
              inTable = true; i++; continue;
            }}
            if (inTable) {{
              html += "<tr>" + cells.map(c => `<td>${{inlineMd(c)}}</td>`).join("") + "</tr>";
              continue;
            }}
          }}
          const mUl = line.match(/^\\s*[-*+]\\s+(.*)$/);
          if (mUl) {{
            if (inOl) {{ html += "</ol>"; inOl = false; }}
            if (inTable) {{ html += "</tbody></table>"; inTable = false; }}
            if (!inUl) {{ html += "<ul>"; inUl = true; }}
            html += `<li>${{inlineMd(mUl[1])}}</li>`;
            continue;
          }}
          const mOl = line.match(/^\\s*\\d+\\.\\s+(.*)$/);
          if (mOl) {{
            if (inUl) {{ html += "</ul>"; inUl = false; }}
            if (inTable) {{ html += "</tbody></table>"; inTable = false; }}
            if (!inOl) {{ html += "<ol>"; inOl = true; }}
            html += `<li>${{inlineMd(mOl[1])}}</li>`;
            continue;
          }}
          closeLists();
          html += `<p>${{inlineMd(line)}}</p>`;
        }}
        closeLists();
        if (inCode) html += `<pre><code>${{esc(codeBuf.join("\\n"))}}</code></pre>`;
        return html;
      }}
      const raw = JSON.parse(document.getElementById("mdRaw").textContent);
      document.getElementById("mdOut").innerHTML = renderMd(raw);
    }})();
  </script>
</body>
</html>"""
        body = page.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _send_formatted_code_html(self, file_path: Path, is_json: bool = False, lang: str = "en") -> None:
        lang = _norm_lang(lang)
        try:
            raw_text = file_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        display_text = raw_text
        if is_json:
            try:
                display_text = json.dumps(json.loads(raw_text), indent=2, ensure_ascii=False)
            except Exception:
                pass
        title = _html.escape(file_path.name)
        full_path = _html.escape(str(file_path))
        raw_url = "/api/file?path=" + urllib.parse.quote(str(file_path)) + "&raw=1"
        safe_json = json.dumps(display_text, ensure_ascii=False).replace("</", "<\\/")
        safe_path_json = json.dumps(str(file_path), ensure_ascii=False).replace("</", "<\\/")
        safe_npp_err = json.dumps(_srv_t(lang, "openNppError"), ensure_ascii=False).replace("</", "<\\/")
        safe_lang_json = json.dumps(lang, ensure_ascii=False)
        copy_lbl = _srv_t(lang, "copyBtn")
        copied_lbl = _srv_t(lang, "copiedBtn")
        safe_copy_json = json.dumps(copy_lbl, ensure_ascii=False).replace("</", "<\\/")
        safe_copied_json = json.dumps(copied_lbl, ensure_ascii=False).replace("</", "<\\/")
        caps = get_platform_capabilities()
        npp_btn = (
            f'<button class="btn-sm" id="openNppBtn" type="button">{_html.escape(_srv_t(lang, "openNppBtn"))}</button>'
            if caps.get("open_notepadpp")
            else ""
        )
        back_logs = _html.escape(_srv_t(lang, "backToLogs"))
        page = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  {FAVICON_TAG}
  <link rel="stylesheet" href="/static/style.css">
  <style>
    body {{ overflow: auto; height: auto; min-height: 100vh; }}
    .code-page {{ max-width: 1120px; margin: 20px auto 48px; padding: 0 20px; }}
    .code-topbar {{
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 10px 14px; margin-bottom: 14px; background: var(--bg-elev);
      border: 1px solid var(--border); border-radius: 10px;
    }}
    .code-path {{ font-family: var(--mono); font-size: 12px; color: var(--text-dim); word-break: break-all; }}
  </style>
  <script>
    try {{ if (localStorage.getItem("tv_theme") === "day") document.documentElement.setAttribute("data-theme", "day"); }} catch (_) {{}}
  </script>
</head>
<body>
  <div class="code-page">
    <div class="code-topbar">
      <div>
        <div style="font-weight:700;font-size:15px;">{title}</div>
        <div class="code-path">{full_path}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-sm" id="copyCodeBtn" type="button">{_html.escape(copy_lbl)}</button>
        {npp_btn}
        <a class="btn-sm" href="{raw_url}" style="text-decoration:none;">Raw</a>
        <a class="btn-sm" href="/" style="text-decoration:none;">{back_logs}</a>
      </div>
    </div>
    <div class="code-gutter-wrap" id="codeOut"></div>
  </div>
  <script type="application/json" id="codeRaw">{safe_json}</script>
  <script>
    (function() {{
      const FILE_PATH = {safe_path_json};
      const PAGE_LANG = {safe_lang_json};
      const NPP_ERR = {safe_npp_err};
      const COPY_LBL = {safe_copy_json};
      const COPIED_LBL = {safe_copied_json};
      const nppBtn = document.getElementById("openNppBtn");
      if (nppBtn) {{
        nppBtn.addEventListener("click", async () => {{
          try {{
            const r = await fetch("/api/open-file", {{
              method: "POST",
              headers: {{"Content-Type": "application/json"}},
              body: JSON.stringify({{ path: FILE_PATH, mode: "notepadpp", lang: PAGE_LANG }})
            }});
            const d = await r.json();
            if (!d.ok) alert(d.error || NPP_ERR);
          }} catch (e) {{ alert(e.message); }}
        }});
      }}
      const txt = JSON.parse(document.getElementById("codeRaw").textContent);
      const out = document.getElementById("codeOut");
      const lines = String(txt || "").replace(/\\r\\n/g, "\\n").split("\\n");
      const frag = document.createDocumentFragment();
      lines.forEach((ln, idx) => {{
        const row = document.createElement("div");
        row.className = "code-gutter-row";
        const num = document.createElement("div");
        num.className = "code-gutter-num";
        num.textContent = String(idx + 1);
        const cell = document.createElement("div");
        cell.className = "code-gutter-line";
        cell.textContent = ln === "" ? " " : ln;
        row.appendChild(num);
        row.appendChild(cell);
        frag.appendChild(row);
      }});
      out.appendChild(frag);
      document.getElementById("copyCodeBtn").addEventListener("click", (e) => {{
        navigator.clipboard.writeText(txt).then(() => {{
          e.target.textContent = COPIED_LBL;
          setTimeout(() => (e.target.textContent = COPY_LBL), 1200);
        }});
      }});
    }})();
  </script>
</body>
</html>"""
        body = page.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, file_path: Path, content_type: Optional[str] = None) -> None:
        try:
            data = file_path.read_bytes()
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        if not content_type:
            content_type, _ = mimetypes.guess_type(str(file_path))
            content_type = content_type or "application/octet-stream"
        if content_type.startswith("text/") or content_type == "application/javascript":
            content_type += "; charset=utf-8"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            self._send_file(STATIC_DIR / "index.html", "text/html")
            return

        if path.startswith("/static/"):
            rel = urllib.parse.unquote(path[len("/static/"):])
            if not rel or "\\" in rel or ".." in rel or rel.startswith("/"):
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            try:
                base_static = STATIC_DIR.resolve()
                target = (STATIC_DIR / rel).resolve()
                target.relative_to(base_static)
            except Exception:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            if not target.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            self._send_file(target)
            return

        if path == "/api/transcripts":
            self._send_json(
                {
                    "brain_dir": str(BRAIN_DIR),
                    "platform": sys.platform,
                    "capabilities": get_platform_capabilities(),
                    "transcripts": list_transcripts(),
                }
            )
            return

        if path == "/api/antigravity-window":
            if not IS_WINDOWS:
                self._send_json({"found": False, "title": "", "supported": False})
                return
            prefer_project = (qs.get("project") or [""])[0]
            prefer_title = (qs.get("title") or [""])[0]
            hwnd, title = find_antigravity_window(prefer_project, prefer_title)
            self._send_json({"found": bool(hwnd), "title": title, "supported": True})
            return

        if path.startswith("/api/transcript/"):
            conv_id = urllib.parse.unquote(path[len("/api/transcript/"):])
            t_path = _resolve_transcript(conv_id)
            if t_path is None:
                self._send_json({"error": "Transcript not found"}, status=404)
                return
            records, offset, _ = read_jsonl_range(t_path, 0)
            st = t_path.stat()
            meta = _extract_meta(conv_id, t_path, st)
            project_root, project_files = _detect_project_context(records, meta.get("project", ""))
            self._send_json(
                {
                    "meta": meta,
                    "path": str(t_path),
                    "project_root": project_root,
                    "project_files": project_files,
                    "offset": offset,
                    "steps": records,
                }
            )
            return

        if path.startswith("/api/stream/"):
            conv_id = urllib.parse.unquote(path[len("/api/stream/"):])
            t_path = _resolve_transcript(conv_id)
            if t_path is None:
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            try:
                offset = int(qs.get("offset", ["0"])[0])
            except ValueError:
                offset = 0
            self._handle_sse(t_path, offset)
            return

        if path == "/api/media" or path == "/api/file":
            raw_p = qs.get("path", [""])[0]
            conv_id = qs.get("conv", [""])[0]
            project_root = qs.get("root", [""])[0]
            if not raw_p:
                self.send_error(HTTPStatus.BAD_REQUEST)
                return
            try:
                if path == "/api/media":
                    resolved = Path(raw_p).resolve()
                    resolved.relative_to(BRAIN_DIR.resolve())
                else:
                    resolved = _resolve_user_path(raw_p, conv_id, project_root)
                    if resolved is None:
                        self.send_error(HTTPStatus.BAD_REQUEST, "Unresolved path")
                        return
            except Exception:
                self.send_error(HTTPStatus.FORBIDDEN, "Access denied")
                return
            lang = _norm_lang(qs.get("lang", ["en"])[0])
            if path == "/api/file" and resolved.is_dir():
                self._send_dir_html(resolved, conv_id, project_root, lang=lang)
                return
            if not resolved.is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            ext = resolved.suffix.lower()
            is_raw = qs.get("raw", ["0"])[0] == "1"
            is_fmt = qs.get("fmt", ["0"])[0] == "1"
            text_like_exts = {
                ".txt", ".log", ".jsonl", ".json", ".md", ".markdown",
                ".py", ".ps1", ".bat", ".cmd", ".sh", ".css", ".js", ".ts",
                ".jsx", ".tsx", ".html", ".htm", ".xml", ".svg", ".yaml", ".yml",
                ".toml", ".ini", ".cfg", ".csv", ".sql",
            }
            if is_raw:
                ctype = "text/plain" if ext in text_like_exts else None
                self._send_file(resolved, ctype)
                return
            if ext in {".md", ".markdown"}:
                self._send_markdown_html(resolved, lang=lang)
                return
            if ext in {".html", ".htm"}:
                self._send_file(resolved, "text/html")
                return
            if ext == ".svg":
                self._send_file(resolved, "image/svg+xml")
                return
            if is_fmt and ext in text_like_exts:
                self._send_formatted_code_html(resolved, is_json=(ext == ".json"), lang=lang)
                return
            ctype = "text/plain" if ext in text_like_exts else None
            self._send_file(resolved, ctype)
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    def _handle_sse(self, t_path: Path, offset: int) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        last_mtime_ns = 0
        last_size = offset
        last_ping = time.monotonic()

        try:
            while not _SHUTDOWN_EVENT.is_set():
                try:
                    st = t_path.stat()
                except OSError:
                    if _SHUTDOWN_EVENT.wait(timeout=1.0):
                        break
                    continue

                if st.st_size != last_size or st.st_mtime_ns != last_mtime_ns:
                    records, new_offset, was_reset = read_jsonl_range(t_path, offset)
                    last_mtime_ns = st.st_mtime_ns
                    last_size = st.st_size
                    if was_reset or records:
                        offset = new_offset
                        payload = json.dumps(
                            {"reset": was_reset, "offset": offset, "steps": records},
                            ensure_ascii=False,
                        )
                        msg = f"event: steps\ndata: {payload}\n\n".encode("utf-8")
                        self.wfile.write(msg)
                        self.wfile.flush()
                        last_ping = time.monotonic()

                now = time.monotonic()
                if now - last_ping >= 15.0:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last_ping = now

                if _SHUTDOWN_EVENT.wait(timeout=0.5):
                    break
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request: Any, client_address: Any) -> None:
        _, exc, _ = sys.exc_info()
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


# ---------- Windows Antigravity.exe Window & Clipboard Helper ----------
def find_antigravity_window(
    prefer_project: str = "", prefer_title: str = ""
) -> Tuple[Optional[int], str]:
    """Find the nearest visible Antigravity.exe window (window title reflects workspace/conversation)."""
    if sys.platform != "win32":
        return None, ""

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    matches: List[Tuple[int, str]] = []

    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

    def _cb(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True

        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        hproc = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
        exe_name = ""
        if hproc:
            try:
                pbuf = ctypes.create_unicode_buffer(512)
                psize = ctypes.wintypes.DWORD(512)
                if kernel32.QueryFullProcessImageNameW(hproc, 0, pbuf, ctypes.byref(psize)):
                    exe_name = Path(pbuf.value).name.lower()
            finally:
                kernel32.CloseHandle(hproc)

        if exe_name != "antigravity.exe":
            return True

        rect = ctypes.wintypes.RECT()
        if user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            if (rect.right - rect.left) < 200 or (rect.bottom - rect.top) < 150:
                return True

        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        matches.append((hwnd, buf.value))
        return True

    user32.EnumWindows(EnumWindowsProc(_cb), 0)
    if not matches:
        return None, ""

    # Prefer window whose title matches active conversation title or project name
    p_title = prefer_title.strip().lower()[:32]
    p_proj = prefer_project.strip().lower()
    if p_title or p_proj:
        for hwnd, title in matches:
            tl = title.lower()
            if (p_title and p_title in tl) or (p_proj and p_proj != "general" and p_proj in tl):
                return hwnd, title
    return matches[0]


def _open_clipboard_retry(attempts: int = 10, delay_s: float = 0.012) -> bool:
    user32 = ctypes.windll.user32
    user32.OpenClipboard.argtypes = [ctypes.wintypes.HWND]
    for i in range(max(1, attempts)):
        if user32.OpenClipboard(None):
            return True
        if i + 1 < attempts:
            time.sleep(delay_s)
    return False


def _set_clipboard_unicode(text: str) -> bool:
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 0x0002

    user32.SetClipboardData.argtypes = [ctypes.wintypes.UINT, ctypes.wintypes.HANDLE]
    user32.SetClipboardData.restype = ctypes.wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [ctypes.wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = ctypes.wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [ctypes.wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.wintypes.HGLOBAL]

    data = text.encode("utf-16-le") + b"\x00\x00"
    if not _open_clipboard_retry():
        return False
    try:
        user32.EmptyClipboard()
        hmem = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
        if not hmem:
            return False
        ptr = kernel32.GlobalLock(hmem)
        if not ptr:
            return False
        try:
            ctypes.memmove(ptr, data, len(data))
        finally:
            kernel32.GlobalUnlock(hmem)
        if not user32.SetClipboardData(CF_UNICODETEXT, hmem):
            return False
        return True
    finally:
        user32.CloseClipboard()


def _get_clipboard_unicode() -> str:
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    CF_UNICODETEXT = 13

    user32.GetClipboardData.argtypes = [ctypes.wintypes.UINT]
    user32.GetClipboardData.restype = ctypes.wintypes.HANDLE
    kernel32.GlobalLock.argtypes = [ctypes.wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.wintypes.HGLOBAL]

    if not _open_clipboard_retry():
        return ""
    try:
        hmem = user32.GetClipboardData(CF_UNICODETEXT)
        if not hmem:
            return ""
        ptr = kernel32.GlobalLock(hmem)
        if not ptr:
            return ""
        try:
            return ctypes.wstring_at(ptr)
        finally:
            kernel32.GlobalUnlock(hmem)
    finally:
        user32.CloseClipboard()


def _clear_clipboard() -> None:
    user32 = ctypes.windll.user32
    if _open_clipboard_retry():
        try:
            user32.EmptyClipboard()
        finally:
            user32.CloseClipboard()


_EXTENDED_VKS = frozenset({
    0x21, 0x22, 0x23, 0x24,  # PRIOR, NEXT, END, HOME
    0x25, 0x26, 0x27, 0x28,  # LEFT, UP, RIGHT, DOWN
    0x2D, 0x2E,              # INSERT, DELETE
})

_CODE_LINE_START_RE = re.compile(
    r"^\s*(?:"
    r"import\s+[A-Za-z_*{\[]|"
    r"from\s+\S+\s+import\s+|"
    r"(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(|"
    r"class\s+[A-Za-z_]\w*[\s(:{]|"
    r"(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+[A-Za-z_$]|"
    r"(?:export\s+)?(?:const|let|var)\s+[A-Za-z_${\[]\w*\s*=|"
    r"return\s+[^\s]|"
    r"#include\s*[<\"']|"
    r"using\s+[A-Za-z_][\w.]*\s*;|"
    r"package\s+[A-Za-z_][\w.]*;?|"
    r"(?:public|private|protected)\s+(?:static\s+)?[A-Za-z_]|"
    r"</?[a-zA-Z][a-zA-Z0-9-]*(?:\s|>|$)|"
    r"[}\])];?\s*$"
    r")"
)
_FILE_HEADER_PREFIXES = (
    "#!",
    '"""',
    "'''",
    "<!doctype",
    "<html",
    "<?php",
    "from __future__",
    "/*",
)


def _send_key(vk: int) -> None:
    user32 = ctypes.windll.user32
    INPUT_KEYBOARD = 1
    KEYEVENTF_EXTENDEDKEY = 0x0001
    KEYEVENTF_KEYUP = 0x0002
    ext_flag = KEYEVENTF_EXTENDEDKEY if vk in _EXTENDED_VKS else 0
    scan = user32.MapVirtualKeyW(vk, 0) & 0xFFFF

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [
            ("dx", ctypes.wintypes.LONG),
            ("dy", ctypes.wintypes.LONG),
            ("mouseData", ctypes.wintypes.DWORD),
            ("dwFlags", ctypes.wintypes.DWORD),
            ("time", ctypes.wintypes.DWORD),
            ("dwExtraInfo", ctypes.c_size_t),
        ]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", ctypes.wintypes.WORD),
            ("wScan", ctypes.wintypes.WORD),
            ("dwFlags", ctypes.wintypes.DWORD),
            ("time", ctypes.wintypes.DWORD),
            ("dwExtraInfo", ctypes.c_size_t),
        ]

    class _INPUT_UNION(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", ctypes.wintypes.DWORD), ("union", _INPUT_UNION)]

    def _mk(flags: int = 0) -> INPUT:
        inp = INPUT()
        inp.type = INPUT_KEYBOARD
        inp.union.ki = KEYBDINPUT(wVk=vk, wScan=scan, dwFlags=flags | ext_flag, time=0, dwExtraInfo=0)
        return inp

    seq = (INPUT * 2)(_mk(0), _mk(KEYEVENTF_KEYUP))
    user32.SendInput(2, seq, ctypes.sizeof(INPUT))


def _send_mod_combo(mod_vk: int, vk: int) -> None:
    user32 = ctypes.windll.user32
    INPUT_KEYBOARD = 1
    KEYEVENTF_EXTENDEDKEY = 0x0001
    KEYEVENTF_KEYUP = 0x0002
    mod_scan = user32.MapVirtualKeyW(mod_vk, 0) & 0xFFFF
    key_scan = user32.MapVirtualKeyW(vk, 0) & 0xFFFF
    key_ext = KEYEVENTF_EXTENDEDKEY if vk in _EXTENDED_VKS else 0

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [
            ("dx", ctypes.wintypes.LONG),
            ("dy", ctypes.wintypes.LONG),
            ("mouseData", ctypes.wintypes.DWORD),
            ("dwFlags", ctypes.wintypes.DWORD),
            ("time", ctypes.wintypes.DWORD),
            ("dwExtraInfo", ctypes.c_size_t),
        ]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", ctypes.wintypes.WORD),
            ("wScan", ctypes.wintypes.WORD),
            ("dwFlags", ctypes.wintypes.DWORD),
            ("time", ctypes.wintypes.DWORD),
            ("dwExtraInfo", ctypes.c_size_t),
        ]

    class _INPUT_UNION(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", ctypes.wintypes.DWORD), ("union", _INPUT_UNION)]

    def _make_key(vk_code: int, scan_code: int, flags: int = 0) -> INPUT:
        inp = INPUT()
        inp.type = INPUT_KEYBOARD
        inp.union.ki = KEYBDINPUT(wVk=vk_code, wScan=scan_code, dwFlags=flags, time=0, dwExtraInfo=0)
        return inp

    seq = (INPUT * 4)(
        _make_key(mod_vk, mod_scan, 0),
        _make_key(vk, key_scan, key_ext),
        _make_key(vk, key_scan, KEYEVENTF_KEYUP | key_ext),
        _make_key(mod_vk, mod_scan, KEYEVENTF_KEYUP),
    )
    user32.SendInput(4, seq, ctypes.sizeof(INPUT))


def _send_ctrl_combo(vk: int) -> None:
    _send_mod_combo(0x11, vk)


def _send_shift_combo(vk: int) -> None:
    _send_mod_combo(0x10, vk)


def _activate_hwnd(hwnd: int, settle_s: float = 0.14) -> bool:
    if sys.platform != "win32" or not hwnd:
        return False
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    SW_RESTORE = 9
    if not user32.IsWindow(hwnd):
        return False
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)

    user32.AllowSetForegroundWindow(-1)  # ASFW_ANY
    fg_hwnd = user32.GetForegroundWindow()
    fg_tid = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0
    target_tid = user32.GetWindowThreadProcessId(hwnd, None)
    cur_tid = kernel32.GetCurrentThreadId()
    attached_fg = False
    attached_tgt = False
    if fg_tid and fg_tid != cur_tid:
        attached_fg = bool(user32.AttachThreadInput(cur_tid, fg_tid, True))
    if target_tid and target_tid != cur_tid and target_tid != fg_tid:
        attached_tgt = bool(user32.AttachThreadInput(cur_tid, target_tid, True))
    try:
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        if user32.GetForegroundWindow() != hwnd:
            _send_key(0x12)  # Alt unlock fallback
            user32.BringWindowToTop(hwnd)
            user32.SetForegroundWindow(hwnd)
    finally:
        if attached_tgt:
            user32.AttachThreadInput(cur_tid, target_tid, False)
        if attached_fg:
            user32.AttachThreadInput(cur_tid, fg_tid, False)
    if settle_s > 0:
        time.sleep(settle_s)
    return user32.GetForegroundWindow() == hwnd


def _norm_clipboard_cmp(text: str) -> str:
    s = (
        text.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\u00a0", " ")
        .replace("\u200b", "")
        .replace("\u200c", "")
        .replace("\u200d", "")
        .replace("\ufeff", "")
        .strip()
    )
    # Rich-text editors (Lexical/Chromium) often serialize <p> breaks as \n\n on Ctrl+C
    return re.sub(r"[ \t]*\n+[ \t]*", "\n", s)


def _looks_like_code_or_file_buffer(text: str) -> Tuple[bool, int]:
    """Detect whether copied Ctrl+A text looks like an active source file / editor buffer rather than a chat draft."""
    if not text or not text.strip():
        return False, 0
    norm = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = norm.splitlines()
    line_count = len(lines)
    if len(norm) > 2800 or line_count >= 30:
        return True, line_count

    first_non_empty = next((ln.strip().lower() for ln in lines if ln.strip()), "")
    if any(first_non_empty.startswith(p) for p in _FILE_HEADER_PREFIXES):
        return True, line_count

    # Intentional conversational prompt with an embedded ``` code snippet should still append safely
    if "```" in norm and line_count < 20:
        return False, line_count

    non_empty = [ln for ln in lines if ln.strip()]
    if len(non_empty) >= 4:
        code_hits = 0
        for ln in non_empty:
            stripped = ln.rstrip()
            if _CODE_LINE_START_RE.match(ln) or (
                (ln.startswith("    ") or ln.startswith("\t"))
                and (stripped.endswith((";", "{", "}", "):", "=>", ",")))
            ):
                code_hits += 1
        if code_hits >= 3 and (code_hits / len(non_empty)) >= 0.45:
            return True, line_count

    if line_count >= 2 and first_non_empty.startswith("{") and any('":' in ln for ln in non_empty):
        return True, line_count

    return False, line_count


def _default_win_paste_ops() -> Dict[str, Any]:
    user32 = ctypes.windll.user32
    WM_INPUTLANGCHANGEREQUEST = 0x0050

    def _schedule_restore(delay_s: float, target_hwnd: int, expected_current_hwnd: int) -> None:
        if not target_hwnd or target_hwnd == expected_current_hwnd:
            return

        def _restore() -> None:
            try:
                if not user32.IsWindow(target_hwnd):
                    return
                if expected_current_hwnd and user32.GetForegroundWindow() != expected_current_hwnd:
                    return
                _activate_hwnd(target_hwnd, settle_s=0.05)
            except Exception:
                pass

        t = threading.Timer(delay_s, _restore)
        t.daemon = True
        t.start()

    def _switch_to_en(hwnd: int) -> Tuple[bool, int]:
        target_tid = user32.GetWindowThreadProcessId(hwnd, None)
        orig_hkl = user32.GetKeyboardLayout(target_tid)
        if (orig_hkl & 0xFFFF) != 0x0409:
            en_hkl = user32.LoadKeyboardLayoutW("00000409", 0)
            if en_hkl:
                user32.PostMessageW(hwnd, WM_INPUTLANGCHANGEREQUEST, 0, en_hkl)
                time.sleep(0.06)
                return True, orig_hkl
        return False, orig_hkl

    def _restore_hkl(hwnd: int, orig_hkl: int) -> None:
        if orig_hkl:
            user32.PostMessageW(hwnd, WM_INPUTLANGCHANGEREQUEST, 0, orig_hkl)

    return {
        "find_window": find_antigravity_window,
        "get_foreground": lambda: int(user32.GetForegroundWindow() or 0),
        "focus_window": lambda h: _activate_hwnd(h, settle_s=0.14),
        "switch_en": _switch_to_en,
        "restore_hkl": _restore_hkl,
        "set_clip": _set_clipboard_unicode,
        "get_clip": _get_clipboard_unicode,
        "clear_clip": _clear_clipboard,
        "clip_seq": lambda: int(user32.GetClipboardSequenceNumber()),
        "send_key": _send_key,
        "send_ctrl": _send_ctrl_combo,
        "send_shift": _send_shift_combo,
        "sleep": time.sleep,
        "schedule_restore": _schedule_restore,
    }


def send_text_to_antigravity_window(
    text: str,
    prefer_project: str = "",
    prefer_title: str = "",
    lang: str = "en",
    *,
    _win_ops: Optional[Dict[str, Any]] = None,
    trace_out: Optional[List[str]] = None,
) -> Tuple[bool, str, str]:
    """Safely inspect Antigravity's input, verify empty vs draft, paste, and auto-send only on verified empty fields."""
    lang = _norm_lang(lang)
    t_start = time.monotonic()

    def _trace(msg: str) -> None:
        if trace_out is not None:
            dt_ms = int(round((time.monotonic() - t_start) * 1000))
            trace_out.append(f"[+{dt_ms:>4d}ms] {msg}")

    if _win_ops is None and sys.platform != "win32":
        _trace("ERR: Windows-only")
        return False, _srv_t(lang, "agWinOnly"), "error"

    ops = _win_ops if _win_ops is not None else _default_win_paste_ops()

    VK_RETURN = 0x0D
    VK_END = 0x23
    VK_RIGHT = 0x27
    VK_A = 0x41
    VK_C = 0x43
    VK_I = 0x49
    VK_V = 0x56

    hwnd, title = ops["find_window"](prefer_project, prefer_title)
    _trace(f"find_window -> hwnd={hwnd} title={title!r}")
    if not hwnd:
        return False, _srv_t(lang, "agNotFound"), "not_found"

    caller_hwnd = int(ops["get_foreground"]() or 0)
    focused_ok = bool(ops["focus_window"](hwnd))
    fg_after_focus = int(ops["get_foreground"]() or 0)
    _trace(f"focus_window: caller={caller_hwnd} -> target={hwnd} ok={focused_ok} fg_now={fg_after_focus}")
    if not focused_ok:
        ops["set_clip"](text)
        _trace("ABORT: focus_window failed -> text copied to clipboard")
        return False, _srv_t(lang, "agFocusErr"), "focus_error"

    def _copy_focused(label: str, timeout_s: float = 0.35, select_delay_s: float = 0.08) -> Tuple[bool, str]:
        probe = f"__AGY_CLIP_PROBE_{ops['clip_seq']()}__"
        probe_ok = bool(ops["set_clip"](probe))
        if not probe_ok:
            ops["clear_clip"]()
        seq0 = ops["clip_seq"]()
        ops["sleep"](0.02)
        ops["send_ctrl"](VK_A)
        ops["sleep"](select_delay_s)
        ops["send_ctrl"](VK_C)
        elapsed = 0.0
        seq_bumps = 0
        while elapsed < timeout_s:
            cur_seq = ops["clip_seq"]()
            if cur_seq != seq0:
                seq_bumps += 1
                ops["sleep"](0.025)
                val = ops["get_clip"]()
                if val == "":
                    ops["sleep"](0.025)
                    val = ops["get_clip"]()
                if val != probe:
                    _trace(
                        f"{label}: OK (Ctrl+A -> Ctrl+C, seq {seq0}->{cur_seq}, bumps={seq_bumps}, "
                        f"len={len(val)}, preview={val[:35]!r})"
                    )
                    return True, val
                seq0 = cur_seq
            ops["sleep"](0.015)
            elapsed += 0.015
        val = ops["get_clip"]()
        if val == probe:
            ops["clear_clip"]()
            _trace(
                f"{label}: NO_CHANGE / TIMEOUT (probe unchanged after {int(timeout_s * 1000)}ms, "
                f"seq0={seq0}, fg={ops['get_foreground']()})"
            )
            return False, ""
        _trace(
            f"{label}: FALLBACK (ok={bool(val)}, len={len(val)}, fg={ops['get_foreground']()}, preview={val[:35]!r})"
        )
        return bool(val), val

    def _deselect_to_end() -> None:
        # Collapse any Ctrl+A selection, then jump unconditionally to end of multiline/rich-text box
        ops["send_key"](VK_RIGHT)
        ops["sleep"](0.02)
        ops["send_ctrl"](VK_END)
        ops["sleep"](0.04)

    def _log_paste_trace(
        status_label: str,
        *,
        pre_ok: bool = False,
        pre_len: int = 0,
        after_ok: bool = False,
        exp_len: int = 0,
        got_len: int = 0,
    ) -> None:
        if _win_ops is not None:
            return
        fg_now = int(ops["get_foreground"]() or 0)
        print(
            f"[ag-paste] status={status_label} caller={caller_hwnd} ag={hwnd} fg={fg_now} "
            f"pre=({pre_ok},{pre_len}) after=({after_ok},{got_len}/{exp_len})",
            file=sys.stderr,
            flush=True,
        )

    switched_layout, orig_hkl = ops["switch_en"](hwnd)
    _trace(f"switch_en: switched={switched_layout} orig_hkl=0x{int(orig_hkl or 0):x}")
    try:
        # 1. Focus Agent Chat input in Antigravity App (Ctrl+I)
        ops["send_ctrl"](VK_I)
        ops["sleep"](0.22)
        _trace(f"Ctrl+I sent -> sleep 220ms -> fg={ops['get_foreground']()}")

        # 2. Check existing input content via sentinel-probed Ctrl+A -> Ctrl+C
        pre_copy_ok, pre_text = _copy_focused("pre_check", 0.30, select_delay_s=0.08)
        is_code, line_count = _looks_like_code_or_file_buffer(pre_text)
        if is_code:
            _deselect_to_end()
            ops["set_clip"](text)
            _trace(f"ABORT: code editor heuristic triggered (lines={line_count})")
            _log_paste_trace("aborted_code_editor", pre_ok=pre_copy_ok, pre_len=len(pre_text))
            return False, _srv_t(lang, "agCodeEditorAborted", lines=line_count), "aborted_code_editor"

        if pre_text.strip() == "":
            _trace("branch=EMPTY -> deselect_to_end -> set_clip -> Ctrl+V")
            # 3a. Empty (or copy timed out): ALWAYS collapse selection + Ctrl+End BEFORE pasting so any hidden draft is never overwritten
            _deselect_to_end()
            if not ops["set_clip"](text):
                _trace("ABORT: set_clip(text) failed")
                _log_paste_trace("clipboard_error", pre_ok=pre_copy_ok, pre_len=len(pre_text))
                return False, _srv_t(lang, "agClipboardErr"), "clipboard_error"
            ops["sleep"](0.035)
            ops["send_ctrl"](VK_V)
            wait_paste_s = 0.20 if len(text) <= 500 else 0.26
            ops["sleep"](wait_paste_s)
            _trace(f"Ctrl+V sent (input_len={len(text)}, sleep={int(wait_paste_s * 1000)}ms)")

            after_ok, after_text = _copy_focused("post_check_1", 0.45, select_delay_s=0.09)
            if not after_ok:
                ops["sleep"](0.14)
                after_ok, after_text = _copy_focused("post_check_2", 0.45, select_delay_s=0.12)

            norm_after = _norm_clipboard_cmp(after_text)
            norm_expected = _norm_clipboard_cmp(text)
            if not norm_after or norm_after != norm_expected:
                diff_idx = -1
                for idx, (ca, ce) in enumerate(zip(norm_after, norm_expected)):
                    if ca != ce:
                        diff_idx = idx
                        break
                if diff_idx == -1 and len(norm_after) != len(norm_expected):
                    diff_idx = min(len(norm_after), len(norm_expected))
                _trace(
                    f"VERIFY_FAILED: after_ok={after_ok} norm_exp_len={len(norm_expected)} "
                    f"norm_got_len={len(norm_after)} first_diff_idx={diff_idx}"
                )
                _deselect_to_end()
                ops["set_clip"](text)
                _log_paste_trace(
                    "verify_failed",
                    pre_ok=pre_copy_ok,
                    pre_len=len(pre_text),
                    after_ok=after_ok,
                    exp_len=len(norm_expected),
                    got_len=len(norm_after),
                )
                msg = _srv_t(lang, "agVerifyFailed", title=title)
                if not after_ok or len(norm_after) != len(norm_expected):
                    msg = f"{msg} [post={after_ok}:{len(norm_after)}/{len(norm_expected)}]"
                return False, msg, "verify_failed"

            _trace(f"VERIFY_OK: len={len(norm_after)} -> deselect_to_end -> ENTER")
            _deselect_to_end()
            ops["sleep"](0.04)
            ops["send_key"](VK_RETURN)
            _trace("ENTER sent")
            _log_paste_trace(
                "sent",
                pre_ok=pre_copy_ok,
                pre_len=len(pre_text),
                after_ok=after_ok,
                exp_len=len(norm_expected),
                got_len=len(norm_after),
            )
            if caller_hwnd and caller_hwnd != hwnd:
                ops["schedule_restore"](1.8, caller_hwnd, hwnd)
                _trace(f"schedule_restore(1.8s -> hwnd={caller_hwnd})")
            return True, title, "sent"

        # 3b. Safe non-empty draft: deselect and jump to absolute end, insert real line break (Shift+Enter) if needed, append cleanly, NEVER press Enter
        _trace(f"branch=APPEND (pre_len={len(pre_text)}) -> deselect_to_end -> Shift+Enter -> Ctrl+V (no Enter)")
        _deselect_to_end()
        clean_pre = pre_text.rstrip("\u200b\u200c\u200d\ufeff")
        tail_ch = clean_pre[-1] if clean_pre else ""
        needs_newline = tail_ch not in ("\n", "\r")
        append_text = text
        if needs_newline:
            send_shift = ops.get("send_shift")
            if send_shift is not None:
                send_shift(VK_RETURN)
                ops["sleep"](0.045)
                _trace("Shift+Enter sent before append paste")
            else:
                append_text = f"\n{text}"
        if not ops["set_clip"](append_text):
            _trace("ABORT: set_clip(append_text) failed")
            _log_paste_trace("clipboard_error", pre_ok=pre_copy_ok, pre_len=len(pre_text))
            return False, _srv_t(lang, "agClipboardErr"), "clipboard_error"
        ops["sleep"](0.035)
        ops["send_ctrl"](VK_V)
        ops["sleep"](0.08)
        _trace("Ctrl+V (append) sent -> done")
        _log_paste_trace("appended", pre_ok=pre_copy_ok, pre_len=len(pre_text))
        return True, title, "appended"
    finally:
        if switched_layout and orig_hkl:
            ops["restore_hkl"](hwnd, orig_hkl)
            _trace(f"restore_hkl -> 0x{int(orig_hkl):x}")


def run_self_check() -> int:
    caps = get_platform_capabilities()
    transcripts = list_transcripts()
    print(f"Platform: {caps['os']} | antigravity_paste={caps['antigravity_paste']} | folder_os={caps['open_folder_os']} | file_os={caps['open_file_os']}")
    print(f"Brain dir: {BRAIN_DIR} (exists={BRAIN_DIR.is_dir()})")
    print(f"Transcripts found: {len(transcripts)}")
    for item in transcripts[:5]:
        print(
            f"  - [{item['project']}] {item['id'][:8]} | {item['mtime_iso']} | "
            f"{item['lines']} lines | {item['title'][:60]}"
        )
    if transcripts:
        p = _resolve_transcript(transcripts[0]["id"])
        if p:
            recs, off, _ = read_jsonl_range(p, 0)
            print(f"Sample read OK: {len(recs)} records parsed, offset={off}")
    return 0


def _install_shutdown_handlers(on_shutdown: Any) -> Any:
    """Install OS shutdown handlers (Win32 console close/logoff/shutdown & POSIX SIGTERM/SIGHUP)."""
    global _WIN_CONSOLE_HANDLER
    cleanups: List[Any] = []

    if IS_WINDOWS:
        CTRL_BREAK_EVENT = 1
        CTRL_CLOSE_EVENT = 2
        CTRL_LOGOFF_EVENT = 5
        CTRL_SHUTDOWN_EVENT = 6
        ctrl_names = {
            CTRL_BREAK_EVENT: "CTRL_BREAK_EVENT",
            CTRL_CLOSE_EVENT: "CTRL_CLOSE_EVENT",
            CTRL_LOGOFF_EVENT: "CTRL_LOGOFF_EVENT",
            CTRL_SHUTDOWN_EVENT: "CTRL_SHUTDOWN_EVENT",
        }
        try:
            handler_proto = ctypes.WINFUNCTYPE(ctypes.wintypes.BOOL, ctypes.wintypes.DWORD)

            def _win_ctrl(dw_ctrl_type: int) -> int:
                label = ctrl_names.get(int(dw_ctrl_type))
                if label:
                    on_shutdown(label, wait=True, stop_loop=True)
                    return 1
                return 0

            cb = handler_proto(_win_ctrl)
            if ctypes.windll.kernel32.SetConsoleCtrlHandler(cb, True):
                _WIN_CONSOLE_HANDLER = cb

                def _remove_win() -> None:
                    global _WIN_CONSOLE_HANDLER
                    try:
                        ctypes.windll.kernel32.SetConsoleCtrlHandler(cb, False)
                    except Exception:
                        pass
                    if _WIN_CONSOLE_HANDLER is cb:
                        _WIN_CONSOLE_HANDLER = None

                cleanups.append(_remove_win)
        except Exception:
            pass

    if threading.current_thread() is threading.main_thread():
        for sig_name in ("SIGTERM", "SIGHUP"):
            sig_num = getattr(signal, sig_name, None)
            if sig_num is None:
                continue
            try:
                prev = signal.getsignal(sig_num)

                def _sig_handler(_signum: int, _frame: Any, name: str = sig_name) -> None:
                    on_shutdown(name, wait=False, stop_loop=True)

                signal.signal(sig_num, _sig_handler)
                cleanups.append(lambda s=sig_num, p=prev: signal.signal(s, p))
            except (ValueError, OSError):
                pass

    def _cleanup() -> None:
        for fn in reversed(cleanups):
            try:
                fn()
            except Exception:
                pass

    return _cleanup


def main() -> int:
    global BRAIN_DIR
    parser = argparse.ArgumentParser(description="Antigravity JSONL Transcript Web Viewer")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8765, help="Bind port (default: 8765)")
    parser.add_argument(
        "--brain-dir",
        type=Path,
        default=None,
        help="Custom path to Antigravity brain directory (default: ~/.gemini/antigravity/brain)",
    )
    parser.add_argument("--no-open", action="store_true", help="Do not open browser automatically")
    parser.add_argument("--check", action="store_true", help="Run quick self-check and exit")
    args = parser.parse_args()

    if args.brain_dir is not None:
        BRAIN_DIR = args.brain_dir.expanduser()

    if args.check:
        return run_self_check()

    _SHUTDOWN_EVENT.clear()
    server = ReusableThreadingHTTPServer((args.host, args.port), TranscriptHandler)
    shutdown_done = threading.Event()
    shutdown_lock = threading.Lock()
    shutdown_started = False

    def _request_shutdown(reason: str = "", wait: bool = False, stop_loop: bool = True) -> None:
        nonlocal shutdown_started
        with shutdown_lock:
            first = not shutdown_started
            shutdown_started = True
        if first:
            try:
                msg = f"\nShutting down ({reason})..." if reason else "\nShutting down..."
                print(msg, flush=True)
            except Exception:
                pass
            _SHUTDOWN_EVENT.set()
            if stop_loop:
                threading.Thread(target=server.shutdown, daemon=True, name="tv-shutdown").start()
        if wait:
            shutdown_done.wait(timeout=3.5)

    cleanup_handlers = _install_shutdown_handlers(_request_shutdown)
    url = f"http://{args.host}:{args.port}/"
    print(f"Antigravity Transcript Viewer running at {url}")
    print(f"Watching: {BRAIN_DIR}")
    print("Press Ctrl+C or close this window to stop.")

    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever(poll_interval=0.2)
    except KeyboardInterrupt:
        _request_shutdown("Ctrl+C", wait=False, stop_loop=False)
    finally:
        _SHUTDOWN_EVENT.set()
        cleanup_handlers()
        try:
            server.server_close()
        finally:
            shutdown_done.set()
    return 0


if __name__ == "__main__":
    sys.exit(main())
