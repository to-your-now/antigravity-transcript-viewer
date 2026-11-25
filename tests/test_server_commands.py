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


if __name__ == "__main__":
    unittest.main()
