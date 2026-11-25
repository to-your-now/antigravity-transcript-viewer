"""Zero-dependency stdlib tests for Transcript Viewer backend command execution."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server


class ExecuteConsoleCommandTests(unittest.TestCase):
    def test_empty_command_rejected(self) -> None:
        status, data = server.execute_console_command("   ", raw_cwd=str(ROOT), lang="en")
        self.assertEqual(status, 400)
        self.assertFalse(data["ok"])

    def test_direct_command_runs_in_project_cwd(self) -> None:
        status, data = server.execute_console_command(
            "python -m compileall -q -x .venv server.py",
            raw_cwd=str(ROOT),
            lang="en",
        )
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])
        self.assertEqual(data["exit_code"], 0)
        self.assertEqual(Path(data["cwd"]).resolve(), ROOT.resolve())

    @unittest.skipUnless(sys.platform == "win32", "Windows pwsh quoting parity checks")
    def test_windows_pwsh_double_parse_parity(self) -> None:
        direct_cmd = "Test-Path 'C:\\Program Files (x86)\\'"
        st_direct, d_direct = server.execute_console_command(direct_cmd, raw_cwd=str(ROOT), lang="en")
        self.assertEqual(st_direct, 200)
        self.assertEqual(d_direct["exit_code"], 0)
        self.assertEqual(d_direct["stdout"].strip(), "True")

        broken_pwsh_c = "pwsh -c Test-Path 'C:\\Program Files (x86)\\'"
        st_broken, d_broken = server.execute_console_command(broken_pwsh_c, raw_cwd=str(ROOT), lang="en")
        self.assertEqual(st_broken, 200)
        self.assertNotEqual(d_broken["exit_code"], 0)
        self.assertNotIn("\x1b", d_broken["stderr"])
        self.assertNotIn("[31;", d_broken["stderr"])

        double_quoted_pwsh_c = "pwsh -c Test-Path \"'C:\\Program Files (x86)\\'\""
        st_dq, d_dq = server.execute_console_command(double_quoted_pwsh_c, raw_cwd=str(ROOT), lang="en")
        self.assertEqual(st_dq, 200)
        self.assertEqual(d_dq["exit_code"], 0)
        self.assertEqual(d_dq["stdout"].strip(), "True")

    def test_ansi_stripper_and_interactive_terminal_helpers(self) -> None:
        dirty = "\x1b[31;1mx86: \x1b[0mThe term 'x86' is not recognized.\x1b]0;title\x07"
        self.assertEqual(server._strip_ansi(dirty), "x86: The term 'x86' is not recognized.")

        script_cmd = server._build_windows_interactive_ps_script(ROOT, "Test-Path 'C:\\Program Files (x86)\\'")
        self.assertIn("Set-Location -LiteralPath", script_cmd)
        self.assertIn("''C:\\Program Files (x86)\\''", script_cmd)
        self.assertIn("AddToHistory", script_cmd)
        self.assertIn("Invoke-Expression $__tvCmd", script_cmd)

        script_empty = server._build_windows_interactive_ps_script(ROOT, "")
        self.assertIn("Set-Location -LiteralPath", script_empty)
        self.assertNotIn("Invoke-Expression", script_empty)

        st_bad, d_bad = server.open_interactive_terminal(
            cmd_text="echo hi",
            raw_cwd=str(ROOT / "nonexistent_dir_xyz_999999"),
            lang="en",
        )
        self.assertEqual(st_bad, 400)
        self.assertFalse(d_bad["ok"])

    def test_graceful_shutdown_handlers(self) -> None:
        events = []

        def fake_shutdown(reason: str = "", wait: bool = False, stop_loop: bool = True) -> None:
            events.append((reason, wait, stop_loop))

        cleanup = server._install_shutdown_handlers(fake_shutdown)
        try:
            if sys.platform == "win32":
                self.assertIsNotNone(server._WIN_CONSOLE_HANDLER)
                self.assertEqual(server._WIN_CONSOLE_HANDLER(0), 0)  # CTRL_C_EVENT stays on KeyboardInterrupt
                self.assertEqual(server._WIN_CONSOLE_HANDLER(2), 1)  # CTRL_CLOSE_EVENT handled
                self.assertEqual(events, [("CTRL_CLOSE_EVENT", True, True)])
        finally:
            cleanup()
        if sys.platform == "win32":
            self.assertIsNone(server._WIN_CONSOLE_HANDLER)


class AntigravitySmartPasteTests(unittest.TestCase):
    def _make_mock_ops(self, *, pre_text: str = "", force_verify_text=None):
        VK_RETURN = 0x0D
        VK_RIGHT = 0x27
        VK_A = 0x41
        VK_C = 0x43
        VK_I = 0x49
        VK_V = 0x56

        state = {
            "fg": 1001,  # Browser viewer window HWND
            "ag": 2002,  # Antigravity window HWND
            "clip": "old clipboard",
            "seq": 10,
            "field": pre_text,
            "focused_box": "before_ctrl_i",
            "events": [],
            "restored": [],
            "copy_calls": 0,
        }

        def find_window(p="", t=""):
            return state["ag"], "transcript_viewer - Antigravity"

        def get_foreground():
            return state["fg"]

        def focus_window(h):
            state["fg"] = h
            state["events"].append(("focus", h))
            return True

        def switch_en(h):
            state["events"].append(("hkl_en", h))
            return True, 0x0419

        def restore_hkl(h, hkl):
            state["events"].append(("hkl_restore", h, hkl))

        def set_clip(txt):
            state["clip"] = txt
            state["seq"] += 1
            return True

        def get_clip():
            return state["clip"]

        def clear_clip():
            state["clip"] = ""
            state["seq"] += 1

        def clip_seq():
            return state["seq"]

        def send_key(vk):
            name = {VK_RETURN: "ENTER", VK_RIGHT: "RIGHT"}.get(vk, f"KEY_{vk}")
            state["events"].append(("key", name))
            if vk == VK_RETURN and state["focused_box"] == "chat":
                state["events"].append(("submitted", state["field"]))

        def send_ctrl(vk):
            name = {VK_A: "A", VK_C: "C", VK_I: "I", VK_V: "V"}.get(vk, f"{vk}")
            state["events"].append(("ctrl", name))
            if vk == VK_I:
                state["focused_box"] = "chat"
            elif vk == VK_C:
                state["copy_calls"] += 1
                if state["copy_calls"] == 2 and force_verify_text is not None:
                    state["clip"] = force_verify_text
                    state["seq"] += 1
                elif state["field"]:
                    state["clip"] = state["field"]
                    state["seq"] += 1
            elif vk == VK_V:
                if state["field"] == "" or ("key", "RIGHT") not in state["events"]:
                    state["field"] = state["clip"]
                else:
                    state["field"] += state["clip"]

        def schedule_restore(delay_s, caller_hwnd, ag_hwnd):
            state["restored"].append((delay_s, caller_hwnd, ag_hwnd))

        ops = {
            "find_window": find_window,
            "get_foreground": get_foreground,
            "focus_window": focus_window,
            "switch_en": switch_en,
            "restore_hkl": restore_hkl,
            "set_clip": set_clip,
            "get_clip": get_clip,
            "clear_clip": clear_clip,
            "clip_seq": clip_seq,
            "send_key": send_key,
            "send_ctrl": send_ctrl,
            "sleep": lambda _s: None,
            "schedule_restore": schedule_restore,
        }
        return state, ops

    def test_code_editor_buffer_detector(self) -> None:
        is_code, _ = server._looks_like_code_or_file_buffer("Проверь пожалуйста Command Map")
        self.assertFalse(is_code)

        draft_with_snippet = "Поправь эту функцию:\n```python\ndef foo():\n    return 1\n```"
        is_code_snip, _ = server._looks_like_code_or_file_buffer(draft_with_snippet)
        self.assertFalse(is_code_snip)

        py_file = "import os\nimport sys\nfrom pathlib import Path\n\ndef main():\n    return 0\n"
        is_code_py, ln = server._looks_like_code_or_file_buffer(py_file)
        self.assertTrue(is_code_py)
        self.assertGreaterEqual(ln, 6)

    def test_empty_input_verifies_submits_and_schedules_browser_restore(self) -> None:
        state, ops = self._make_mock_ops(pre_text="")
        ok, _info, status = server.send_text_to_antigravity_window(
            "Check tests and commit", lang="en", _win_ops=ops
        )
        self.assertTrue(ok)
        self.assertEqual(status, "sent")
        self.assertIn(("key", "ENTER"), state["events"])
        self.assertEqual(len(state["restored"]), 1)
        self.assertEqual(state["restored"][0][1], 1001)
        self.assertEqual(state["restored"][0][2], 2002)
        self.assertEqual(state["events"][-1], ("hkl_restore", 2002, 0x0419))

    def test_verify_mismatch_aborts_enter_and_preserves_clipboard(self) -> None:
        state, ops = self._make_mock_ops(pre_text="", force_verify_text="")
        ok, info, status = server.send_text_to_antigravity_window(
            "Important prompt", lang="en", _win_ops=ops
        )
        self.assertFalse(ok)
        self.assertEqual(status, "verify_failed")
        self.assertIn("Enter was not pressed", info)
        self.assertNotIn(("key", "ENTER"), state["events"])
        self.assertEqual(state["restored"], [])
        self.assertEqual(state["clip"], "Important prompt")

    def test_non_empty_draft_appends_at_end_without_enter_or_restore(self) -> None:
        state, ops = self._make_mock_ops(pre_text="First draft line")
        ok, _info, status = server.send_text_to_antigravity_window(
            "Second part", lang="ru", _win_ops=ops
        )
        self.assertTrue(ok)
        self.assertEqual(status, "appended")
        self.assertEqual(state["field"], "First draft line\nSecond part")
        self.assertIn(("key", "RIGHT"), state["events"])
        self.assertNotIn(("key", "ENTER"), state["events"])
        self.assertEqual(state["restored"], [])

    def test_code_editor_focus_aborts_safely_without_pasting(self) -> None:
        py_code = "import json\nimport threading\n\ndef run():\n    return True\n"
        state, ops = self._make_mock_ops(pre_text=py_code)
        ok, _info, status = server.send_text_to_antigravity_window(
            "Do not corrupt code", lang="en", _win_ops=ops
        )
        self.assertFalse(ok)
        self.assertEqual(status, "aborted_code_editor")
        self.assertEqual(state["field"], py_code)
        self.assertNotIn(("ctrl", "V"), state["events"])
        self.assertNotIn(("key", "ENTER"), state["events"])
        self.assertIn(("key", "RIGHT"), state["events"])
        self.assertEqual(state["clip"], "Do not corrupt code")


if __name__ == "__main__":
    unittest.main()
