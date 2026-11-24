import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsPath = path.resolve(__dirname, "..", "static", "app.js");
const appJs = fs.readFileSync(appJsPath, "utf8");

function sliceFunc(src, name) {
  const marker = `\n  function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const end = src.indexOf("\n  }", start + marker.length);
  if (end === -1) throw new Error(`End brace not found for ${name}`);
  return src.slice(start + 1, end + 4);
}

const helpersCode = [
  `const escHtml = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");`,
  `const unescapeNewlines = (s) => String(s || "").replace(/\\r\\n/g, "\\n");`,
  `const KNOWN_USER_TAGS = new Set(["USER_REQUEST", "ADDITIONAL_METADATA", "USER_SETTINGS_CHANGE"]);`,
  `const stepModelMap = new WeakMap();`,
  `let _lastDetectedModel = "";`,
  `const state = { activeId: "00000000-0000-0000-0000-000000000001", activeMeta: { project: "sample-project" }, activeLogPath: "/logs/transcript_full.jsonl" };`,
  `const window = { location: { origin: "http://127.0.0.1:8765", hash: "" } };`,
  sliceFunc(appJs, "formatPairedSystemTagsInHtml"),
  sliceFunc(appJs, "renderSystemMessageBody"),
  sliceFunc(appJs, "parseEnvelopeSequence"),
  sliceFunc(appJs, "parseUserInputEnvelope"),
  sliceFunc(appJs, "extractTopLevelXmlTags"),
  sliceFunc(appJs, "extractModelNamesFromSettings"),
  sliceFunc(appJs, "getSettingsChangeText"),
  sliceFunc(appJs, "updateStepModels"),
  sliceFunc(appJs, "parseHashNavigation"),
  sliceFunc(appJs, "buildStepShareUrl"),
  `return { formatPairedSystemTagsInHtml, renderSystemMessageBody, extractModelNamesFromSettings, updateStepModels, stepModelMap, parseHashNavigation, buildStepShareUrl };`,
].join("\n\n");

const api = new Function(helpersCode)();

// 1. Paired <SYSTEM_MESSAGE>...</SYSTEM_MESSAGE> vs unpaired prose mention
const sysMsg =
  "The following is a <SYSTEM_MESSAGE> not actually sent by the user. It is provided by the system as important information to pay attention to.\n\n" +
  "<SYSTEM_MESSAGE>\n[Message] timestamp=2026-01-01T00:00:00Z\nHello\n</SYSTEM_MESSAGE>";
const renderedSys = api.renderSystemMessageBody(sysMsg);
const badgeCount = (renderedSys.match(/class="xml-tag-badge xml-tag-system"/g) || []).length;
assert.equal(badgeCount, 2, "Only paired opening & closing <SYSTEM_MESSAGE> tags should be badged");
assert.ok(
  renderedSys.startsWith("The following is a &lt;SYSTEM_MESSAGE&gt; not actually sent by the user."),
  "Unpaired prose mention must stay plain text"
);

// 2. Inline <code>/<pre> protection in Markdown HTML
const mdHtml = "<p>Mention <code>&lt;SYSTEM_MESSAGE&gt;</code> vs real:</p><p>&lt;SYSTEM_MESSAGE&gt;\nhi\n&lt;/SYSTEM_MESSAGE&gt;</p>";
const mdFormatted = api.formatPairedSystemTagsInHtml(mdHtml);
assert.equal((mdFormatted.match(/xml-tag-system/g) || []).length, 2);
assert.ok(mdFormatted.includes("<code>&lt;SYSTEM_MESSAGE&gt;</code>"));

// 3. Dynamic model tracking (dots in model name, multi-change in one block, prose immunity, reset to None)
const steps = [
  {
    type: "USER_INPUT",
    content: "<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Claude Sonnet 4.6 (Thinking). No need to comment on this.\n</USER_SETTINGS_CHANGE>\n<USER_REQUEST>\nHello\n</USER_REQUEST>",
  },
  { type: "PLANNER_RESPONSE", content: "First" },
  {
    type: "USER_INPUT",
    content: "<USER_REQUEST>\nQuoted log: The user changed setting `Model Selection` from X to FAKE MODEL. No need to comment.\n</USER_REQUEST>",
  },
  { type: "PLANNER_RESPONSE", content: "Still Sonnet" },
  {
    type: "USER_INPUT",
    content: "<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from Claude Sonnet 4.6 (Thinking) to Gemini 4 Hydrogen (Medium). No need to comment.\nThe user changed setting `Model Selection` from Gemini 4 Hydrogen (Medium) to GPT-OSS 120B (Medium). No need to comment.\n</USER_SETTINGS_CHANGE>\n<USER_REQUEST>\nSwitch\n</USER_REQUEST>",
  },
  { type: "PLANNER_RESPONSE", content: "Now GPT-OSS" },
  {
    type: "USER_INPUT",
    content: "<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from GPT-OSS 120B (Medium) to None. No need to comment.\n</USER_SETTINGS_CHANGE>\n<USER_REQUEST>\nReset\n</USER_REQUEST>",
  },
  { type: "PLANNER_RESPONSE", content: "None now" },
];
api.updateStepModels(steps, true);
assert.equal(api.stepModelMap.get(steps[1]), "Claude Sonnet 4.6 (Thinking)");
assert.equal(api.stepModelMap.get(steps[3]), "Claude Sonnet 4.6 (Thinking)");
assert.equal(api.stepModelMap.get(steps[5]), "GPT-OSS 120B (Medium)");
assert.equal(api.stepModelMap.get(steps[7]), undefined);

// 4. Dual-purpose step deep link build + parse
const shareUrl = api.buildStepShareUrl(2649);
assert.equal(
  shareUrl,
  "http://127.0.0.1:8765/#conv=00000000-0000-0000-0000-000000000001&step=2649&project=sample-project&file=transcript_full.jsonl"
);
const parsed = api.parseHashNavigation("#" + shareUrl.split("#")[1]);
assert.deepEqual(parsed, { convId: "00000000-0000-0000-0000-000000000001", targetStep: "2649" });

console.log("ALL VIEWER FEATURE UNIT TESTS PASSED!");
