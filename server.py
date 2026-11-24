"""Lightweight, lock-free local web viewer for Antigravity JSONL transcripts.

Zero external dependencies (Python 3.10+ stdlib only).
Serves a browser UI with live SSE tailing, project/title auto-detection,
and safe read-only media serving from ~/.gemini/antigravity/brain.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html as _html
import json
import mimetypes
import os
import re
import shutil
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


def get_platform_capabilities() -> Dict[str, Any]:
    has_posix_opener = _find_posix_opener() is not None
    return {
        "os": sys.platform,
        "is_windows": IS_WINDOWS,
        "is_macos": IS_MACOS,
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
            if not IS_WINDOWS:
                self._send_json(
                    {
                        "ok": False,
                        "error": "Автовставка в окно Antigravity поддерживается только на Windows",
                        "status": "unsupported",
                    },
                    status=501,
                )
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            raw_body = self.rfile.read(min(length, 1_000_000))
            try:
                data = json.loads(raw_body.decode("utf-8"))
            except Exception:
                self._send_json({"ok": False, "error": "Invalid JSON"}, status=400)
                return
            text = str(data.get("text") or "")
            prefer_project = str(data.get("project") or "")
            prefer_title = str(data.get("title") or "")
            if not text.strip():
                self._send_json({"ok": False, "error": "Пустой текст"}, status=400)
                return
            ok, info, status_code = send_text_to_antigravity_window(text, prefer_project, prefer_title)
            self._send_json({"ok": ok, "info": info, "status": status_code}, status=200 if ok else 404)
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
            raw_p = str(data.get("path") or "")
            mode = str(data.get("mode") or ("explorer" if IS_WINDOWS else "system")).lower()
            conv_id = str(data.get("conv") or "")
            project_root = str(data.get("root") or "")
            resolved = _resolve_user_path(raw_p, conv_id, project_root)
            if resolved is None or not resolved.exists():
                self._send_json({"ok": False, "error": f"Путь не найден: {raw_p}"}, status=404)
                return
            if resolved.is_file():
                self._send_json(
                    {
                        "ok": False,
                        "is_file": True,
                        "file_url": f"/api/file?path={urllib.parse.quote(str(resolved))}",
                    }
                )
                return
            if mode == "totalcmd":
                if not IS_WINDOWS:
                    self._send_json({"ok": False, "error": "Total Commander доступен только на Windows"}, status=400)
                    return
                tc = _find_totalcmd_exe()
                if not tc:
                    self._send_json(
                        {"ok": False, "error": r"Total Commander не найден (C:\totalcmd\TOTALCMD64.EXE)"},
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
                    self._send_json({"ok": False, "error": "Проводник (explorer.exe) доступен только на Windows"}, status=400)
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
                    {"ok": False, "error": "Системный файловый менеджер недоступен (не найден xdg-open/open)"},
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
            raw_p = str(data.get("path") or "")
            conv_id = str(data.get("conv") or "")
            project_root = str(data.get("root") or "")
            mode = str(data.get("mode") or "system").strip().lower()
            resolved = _resolve_user_path(raw_p, conv_id, project_root)
            if resolved is None or not resolved.exists():
                self._send_json({"ok": False, "error": f"Путь не найден: {raw_p}"}, status=404)
                return
            if mode == "notepadpp":
                if not IS_WINDOWS:
                    self._send_json({"ok": False, "error": "Notepad++ доступен только на Windows"}, status=400)
                    return
                if resolved.is_dir():
                    self._send_json({"ok": False, "error": "Notepad++ открывает файлы, а не папки"}, status=400)
                    return
                npp = _find_notepadpp_exe()
                if not npp:
                    self._send_json(
                        {"ok": False, "error": r"Notepad++ не найден (Program Files\Notepad++\notepad++.exe)"},
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
                            {"ok": False, "error": "Открытие в системной программе недоступно (не найден xdg-open/open)"},
                            status=404,
                        )
                        return
                    subprocess.Popen([opener, str(resolved)], start_new_session=True)
                self._send_json({"ok": True, "path": str(resolved), "mode": "system"})
            except OSError as exc:
                self._send_json({"ok": False, "error": str(exc)}, status=500)
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

    def _send_dir_html(self, dir_path: Path, conv_id: str = "", project_root: str = "") -> None:
        try:
            entries = list(dir_path.iterdir())
        except OSError as exc:
            self.send_error(HTTPStatus.FORBIDDEN, str(exc))
            return
        entries.sort(key=lambda p: (not p.is_dir(), p.name.lower()))
        title = _html.escape(dir_path.name or str(dir_path))
        full_path = _html.escape(str(dir_path))
        parent_link = ""
        if dir_path.parent != dir_path:
            pq = urllib.parse.quote(str(dir_path.parent))
            parent_link = f'<a class="dir-row is-dir" href="/api/file?path={pq}"><span>⬆ .. (на уровень выше)</span><span class="dir-meta">Папка</span></a>'

        rows = []
        for item in entries:
            iq = urllib.parse.quote(str(item))
            iname = _html.escape(item.name)
            try:
                st = item.stat()
                mtime = dt.datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")
                size_str = f"{st.st_size:,} B".replace(",", " ") if not item.is_dir() else "Папка"
            except OSError:
                mtime, size_str = "", ""
            if item.is_dir():
                rows.append(
                    f'<a class="dir-row is-dir" href="/api/file?path={iq}">'
                    f'<span>📁 {iname}/</span><span class="dir-meta">{_html.escape(size_str)} · {_html.escape(mtime)}</span></a>'
                )
            else:
                rows.append(
                    f'<a class="dir-row" href="/api/file?path={iq}&fmt=1">'
                    f'<span>📄 {iname}</span><span class="dir-meta">{_html.escape(size_str)} · {_html.escape(mtime)}</span></a>'
                )

        caps = get_platform_capabilities()
        ext_btns = []
        if caps["open_explorer"]:
            ext_btns.append('<button class="btn-sm" type="button" onclick="openExt(\'explorer\')">🗂 В Проводнике</button>')
        if caps["open_totalcmd"]:
            ext_btns.append('<button class="btn-sm" type="button" onclick="openExt(\'totalcmd\')">⚡ В TotalCmd</button>')
        if not caps["is_windows"] and caps["open_folder_os"]:
            ext_btns.append('<button class="btn-sm" type="button" onclick="openExt(\'system\')">📂 В файловом менеджере</button>')
        ext_btns_html = "\n        ".join(ext_btns)

        safe_dir_json = json.dumps(str(dir_path), ensure_ascii=False).replace("</", "<\\/")
        page = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Папка</title>
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
        <a class="btn-sm" href="/" style="text-decoration:none;">← К логам</a>
      </div>
    </div>
    <div class="dir-list">
      {parent_link}
      {''.join(rows) if rows else '<div style="padding:20px;color:var(--text-dim);">Папка пуста</div>'}
    </div>
  </div>
  <script>
    const DIR_PATH = {safe_dir_json};
    async function openExt(mode) {{
      try {{
        const r = await fetch("/api/open-folder", {{
          method: "POST",
          headers: {{"Content-Type": "application/json"}},
          body: JSON.stringify({{ path: DIR_PATH, mode }})
        }});
        const d = await r.json();
        if (!d.ok) alert(d.error || "Ошибка открытия");
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

    def _send_markdown_html(self, file_path: Path) -> None:
        try:
            md_text = file_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        import html as _html
        title = _html.escape(file_path.name)
        full_path = _html.escape(str(file_path))
        raw_url = "/api/file?path=" + urllib.parse.quote(str(file_path)) + "&raw=1"
        safe_json = json.dumps(md_text, ensure_ascii=False).replace("</", "<\\/")
        safe_path_json = json.dumps(str(file_path), ensure_ascii=False).replace("</", "<\\/")
        caps = get_platform_capabilities()
        npp_btn = (
            '<button class="btn-sm" id="openNppBtn" type="button">📝 Notepad++</button>'
            if caps.get("open_notepadpp")
            else ""
        )
        page = f"""<!DOCTYPE html>
<html lang="ru">
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
        <a class="btn-sm" href="/" style="text-decoration:none;">← К логам</a>
      </div>
    </div>
    <article class="md-card md" id="mdOut"></article>
  </div>
  <script type="application/json" id="mdRaw">{safe_json}</script>
  <script>
    (function() {{
      const FILE_PATH = {safe_path_json};
      const nppBtn = document.getElementById("openNppBtn");
      if (nppBtn) {{
        nppBtn.addEventListener("click", async () => {{
          try {{
            const r = await fetch("/api/open-file", {{
              method: "POST",
              headers: {{"Content-Type": "application/json"}},
              body: JSON.stringify({{ path: FILE_PATH, mode: "notepadpp" }})
            }});
            const d = await r.json();
            if (!d.ok) alert(d.error || "Ошибка открытия в Notepad++");
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
            href = "/api/file?path=" + encodeURIComponent(p) + "&fmt=1";
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

    def _send_formatted_code_html(self, file_path: Path, is_json: bool = False) -> None:
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
        caps = get_platform_capabilities()
        npp_btn = (
            '<button class="btn-sm" id="openNppBtn" type="button">📝 Notepad++</button>'
            if caps.get("open_notepadpp")
            else ""
        )
        page = f"""<!DOCTYPE html>
<html lang="ru">
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
        <button class="btn-sm" id="copyCodeBtn" type="button">📋 Copy</button>
        {npp_btn}
        <a class="btn-sm" href="{raw_url}" style="text-decoration:none;">Raw</a>
        <a class="btn-sm" href="/" style="text-decoration:none;">← К логам</a>
      </div>
    </div>
    <div class="code-gutter-wrap" id="codeOut"></div>
  </div>
  <script type="application/json" id="codeRaw">{safe_json}</script>
  <script>
    (function() {{
      const FILE_PATH = {safe_path_json};
      const nppBtn = document.getElementById("openNppBtn");
      if (nppBtn) {{
        nppBtn.addEventListener("click", async () => {{
          try {{
            const r = await fetch("/api/open-file", {{
              method: "POST",
              headers: {{"Content-Type": "application/json"}},
              body: JSON.stringify({{ path: FILE_PATH, mode: "notepadpp" }})
            }});
            const d = await r.json();
            if (!d.ok) alert(d.error || "Ошибка открытия в Notepad++");
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
          e.target.textContent = "✓ Скопировано";
          setTimeout(() => (e.target.textContent = "📋 Copy"), 1200);
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
            rel = path[len("/static/"):]
            if "/" in rel or "\\" in rel or ".." in rel:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            target = STATIC_DIR / rel
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
            if path == "/api/file" and resolved.is_dir():
                self._send_dir_html(resolved, conv_id, project_root)
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
                self._send_markdown_html(resolved)
                return
            if ext in {".html", ".htm"}:
                self._send_file(resolved, "text/html")
                return
            if ext == ".svg":
                self._send_file(resolved, "image/svg+xml")
                return
            if is_fmt and ext in text_like_exts:
                self._send_formatted_code_html(resolved, is_json=(ext == ".json"))
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
            while True:
                try:
                    st = t_path.stat()
                except OSError:
                    time.sleep(1.0)
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

                time.sleep(0.5)
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


def _set_clipboard_unicode(text: str) -> bool:
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 0x0002

    user32.OpenClipboard.argtypes = [ctypes.wintypes.HWND]
    user32.SetClipboardData.argtypes = [ctypes.wintypes.UINT, ctypes.wintypes.HANDLE]
    user32.SetClipboardData.restype = ctypes.wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [ctypes.wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = ctypes.wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [ctypes.wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.wintypes.HGLOBAL]

    data = text.encode("utf-16-le") + b"\x00\x00"
    if not user32.OpenClipboard(None):
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

    user32.OpenClipboard.argtypes = [ctypes.wintypes.HWND]
    user32.GetClipboardData.argtypes = [ctypes.wintypes.UINT]
    user32.GetClipboardData.restype = ctypes.wintypes.HANDLE
    kernel32.GlobalLock.argtypes = [ctypes.wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.wintypes.HGLOBAL]

    if not user32.OpenClipboard(None):
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
    user32.OpenClipboard.argtypes = [ctypes.wintypes.HWND]
    if user32.OpenClipboard(None):
        try:
            user32.EmptyClipboard()
        finally:
            user32.CloseClipboard()


def _send_key(vk: int) -> None:
    user32 = ctypes.windll.user32
    INPUT_KEYBOARD = 1
    KEYEVENTF_KEYUP = 0x0002

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
        inp.union.ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=flags, time=0, dwExtraInfo=0)
        return inp

    seq = (INPUT * 2)(_mk(0), _mk(KEYEVENTF_KEYUP))
    user32.SendInput(2, seq, ctypes.sizeof(INPUT))


def _send_ctrl_combo(vk: int) -> None:
    user32 = ctypes.windll.user32
    INPUT_KEYBOARD = 1
    KEYEVENTF_KEYUP = 0x0002
    VK_CONTROL = 0x11

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

    def _make_key(vk_code: int, flags: int = 0) -> INPUT:
        inp = INPUT()
        inp.type = INPUT_KEYBOARD
        inp.union.ki = KEYBDINPUT(wVk=vk_code, wScan=0, dwFlags=flags, time=0, dwExtraInfo=0)
        return inp

    seq = (INPUT * 4)(
        _make_key(VK_CONTROL, 0),
        _make_key(vk, 0),
        _make_key(vk, KEYEVENTF_KEYUP),
        _make_key(VK_CONTROL, KEYEVENTF_KEYUP),
    )
    user32.SendInput(4, seq, ctypes.sizeof(INPUT))


def send_text_to_antigravity_window(
    text: str, prefer_project: str = "", prefer_title: str = ""
) -> Tuple[bool, str, str]:
    """Copy text, focus Antigravity.exe (with EN layout for Ctrl+I), paste (Ctrl+V), and restore layout. Never presses Enter."""
    if sys.platform != "win32":
        return False, "Поддерживается только на Windows", "error"

    hwnd, title = find_antigravity_window(prefer_project, prefer_title)
    if not hwnd:
        return False, "Окно Antigravity.exe не найдено", "not_found"

    if not _set_clipboard_unicode(text):
        return False, "Не удалось записать текст в буфер обмена", "clipboard_error"

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    SW_RESTORE = 9
    WM_INPUTLANGCHANGEREQUEST = 0x0050
    VK_I = 0x49
    VK_V = 0x56

    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, SW_RESTORE)

    # Allow foreground switch even from a background HTTP worker thread
    user32.AllowSetForegroundWindow(-1)  # ASFW_ANY
    fg_hwnd = user32.GetForegroundWindow()
    fg_tid = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0
    cur_tid = kernel32.GetCurrentThreadId()
    attached = False
    if fg_tid and fg_tid != cur_tid:
        attached = bool(user32.AttachThreadInput(cur_tid, fg_tid, True))
    try:
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        if user32.GetForegroundWindow() != hwnd:
            user32.keybd_event(0x12, 0, 0, 0)
            user32.keybd_event(0x12, 0, 0x0002, 0)
            user32.SetForegroundWindow(hwnd)
    finally:
        if attached:
            user32.AttachThreadInput(cur_tid, fg_tid, False)

    time.sleep(0.14)
    if user32.GetForegroundWindow() != hwnd:
        return False, "Не удалось активировать окно Antigravity.exe (текст в буфере)", "focus_error"

    # Temporarily switch target window's keyboard layout to English (0x0409) so Ctrl+I works under Russian layout
    target_tid = user32.GetWindowThreadProcessId(hwnd, None)
    orig_hkl = user32.GetKeyboardLayout(target_tid)
    switched_layout = False
    if (orig_hkl & 0xFFFF) != 0x0409:
        en_hkl = user32.LoadKeyboardLayoutW("00000409", 0)
        if en_hkl:
            user32.PostMessageW(hwnd, WM_INPUTLANGCHANGEREQUEST, 0, en_hkl)
            switched_layout = True
            time.sleep(0.06)

    try:
        # Focus Agent Chat input in Antigravity IDE (Ctrl+I) and paste (Ctrl+V) without Enter
        _send_ctrl_combo(VK_I)
        time.sleep(0.15)
        _send_ctrl_combo(VK_V)
        time.sleep(0.06)
    finally:
        if switched_layout and orig_hkl:
            user32.PostMessageW(hwnd, WM_INPUTLANGCHANGEREQUEST, 0, orig_hkl)

    return True, title, "pasted"


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

    server = ReusableThreadingHTTPServer((args.host, args.port), TranscriptHandler)
    url = f"http://{args.host}:{args.port}/"
    print(f"Antigravity Transcript Viewer running at {url}")
    print(f"Watching: {BRAIN_DIR}")
    print("Press Ctrl+C to stop.")

    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
