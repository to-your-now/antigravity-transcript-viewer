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
  `let stepSearchBlobCache = new WeakMap();`,
  `let stepToolMetaMap = new WeakMap();`,
  `let taskIndexMap = new Map();`,
  `let stepTaskMetaMap = new WeakMap();`,
  `let _lastDetectedModel = "";`,
  `const BG_TASK_ID_RE = /\\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/task-\\d+)\\b/gi;`,
  `const fmtStepTime = (ts) => ts ? "12:00:00" : "";`,
  `const fmtFullDateTime = (ts) => ts || "";`,
  `let _cachedSearchAstRaw = null;`,
  `let _cachedSearchAst = null;`,
  `const state = { activeId: "00000000-0000-0000-0000-000000000001", activeMeta: { project: "sample-project" }, activeLogPath: "/logs/transcript_full.jsonl", attachToolOutputs: true };`,
  `const window = { location: { origin: "http://127.0.0.1:8765", hash: "" } };`,
  sliceFunc(appJs, "formatSpecialBracketTagsInHtml"),
  sliceFunc(appJs, "formatPairedSystemTagsInHtml"),
  sliceFunc(appJs, "renderSystemMessageBody"),
  sliceFunc(appJs, "parseGenericOutput"),
  sliceFunc(appJs, "parseEnvelopeSequence"),
  sliceFunc(appJs, "parseUserInputEnvelope"),
  sliceFunc(appJs, "extractTopLevelXmlTags"),
  sliceFunc(appJs, "extractModelNamesFromSettings"),
  sliceFunc(appJs, "getSettingsChangeText"),
  sliceFunc(appJs, "updateStepModels"),
  sliceFunc(appJs, "parseHashNavigation"),
  sliceFunc(appJs, "buildStepShareUrl"),
  sliceFunc(appJs, "getStepSearchBlob"),
  sliceFunc(appJs, "parseSearchQuery"),
  sliceFunc(appJs, "getCachedSearchAst"),
  sliceFunc(appJs, "evalSearchAst"),
  sliceFunc(appJs, "getPositiveSearchTerms"),
  sliceFunc(appJs, "getTurnSearchBlob"),
  sliceFunc(appJs, "buildStepMetadataAndTaskIndex"),
  sliceFunc(appJs, "resolveTaskLinkDestination"),
  `return { formatSpecialBracketTagsInHtml, formatPairedSystemTagsInHtml, renderSystemMessageBody, extractModelNamesFromSettings, updateStepModels, stepModelMap, parseHashNavigation, buildStepShareUrl, parseSearchQuery, evalSearchAst, getPositiveSearchTerms, getTurnSearchBlob, buildStepMetadataAndTaskIndex, resolveTaskLinkDestination, get taskIndexMap() { return taskIndexMap; }, get stepToolMetaMap() { return stepToolMetaMap; }, get stepTaskMetaMap() { return stepTaskMetaMap; } };`,
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

// 5. Special bracket tag formatting (@[Quote], [ARTIFACT, [Attachment) + <code> protection
const tagSample =
  "<p>@[Quote: sample line] [ARTIFACT: media_123] [Attachment: image/png (x.png)] <code>[ARTIFACT] @[Quote]</code></p>";
const tagHtml = api.formatSpecialBracketTagsInHtml(tagSample);
assert.ok(tagHtml.includes('<span class="inline-tag tag-quote">@[Quote: sample line]</span>'));
assert.ok(tagHtml.includes('<span class="inline-tag tag-artifact">[ARTIFACT: media_123]</span>'));
assert.ok(tagHtml.includes('<span class="inline-tag tag-attachment">[Attachment: image/png (x.png)]</span>'));
assert.ok(tagHtml.includes("<code>[ARTIFACT] @[Quote]</code>"), "Inline <code> tags must stay untouched");

// 6. Universal boolean search engine (exact quoted phrase, unordered AND, OR, -negation, parens, caller+attached blob)
const plannerStep = {
  step_index: 2612,
  type: "PLANNER_RESPONSE",
  status: "DONE",
  source: "MODEL",
  content: "Checking diff status.",
  tool_calls: [{ name: "run_command", args: { CommandLine: "pwsh -c git diff --stat" } }],
};
const attachedOutStep = {
  step_index: 2614,
  type: "GENERIC",
  status: "DONE",
  source: "MODEL",
  content: "Created At: 2026-11-24T12:00:00Z\nCompleted At: 2026-11-24T12:00:02Z\nCommand exited with code 0.\nOutput:\nserver.py | 12 +++---",
};
const turnBlob = api.getTurnSearchBlob(plannerStep, [attachedOutStep]);

assert.equal(api.evalSearchAst(api.parseSearchQuery('"pwsh -c git diff"'), turnBlob), true, "Exact quoted command must match");
assert.equal(api.evalSearchAst(api.parseSearchQuery('"git diff pwsh"'), turnBlob), false, "Wrong order inside quotes must NOT match");
assert.equal(api.evalSearchAst(api.parseSearchQuery("diff server.py pwsh"), turnBlob), true, "Unordered multi-word AND must match across caller + output");
assert.equal(api.evalSearchAst(api.parseSearchQuery("pytest OR compileall OR server.py"), turnBlob), true, "OR operator must match");
assert.equal(api.evalSearchAst(api.parseSearchQuery('run_command -"exit: 1" -traceback'), turnBlob), true, "Negative phrase/word exclusion must pass when absent");
assert.equal(api.evalSearchAst(api.parseSearchQuery('run_command -"exit: 0"'), turnBlob), false, "Negative quoted chip must exclude match");
assert.equal(api.evalSearchAst(api.parseSearchQuery("(pytest OR server.py) AND NOT checking"), turnBlob), false, "Grouped OR + NOT must exclude");
assert.deepEqual(
  api.getPositiveSearchTerms(api.parseSearchQuery('"pwsh -c git diff" server.py -traceback -"exit: 1"')),
  ["pwsh -c git diff", "server.py"]
);

// 7. Bidirectional background task lifecycle linking (#2612->#2614->#2615->#2616->#2617 and #2642..#2649)
const tid1 = "a5608f81-e9d6-4f69-98be-9895d727b2e5/task-166";
const tid2 = "a5608f81-e9d6-4f69-98be-9895d727b2e5/task-168";
const tidTimer = "a5608f81-e9d6-4f69-98be-9895d727b2e5/task-169";
const taskSteps = [
  { step_index: 2612, type: "PLANNER_RESPONSE", tool_calls: [{ name: "run_command", args: { CommandLine: "pwsh -c node tests/test.mjs" } }] },
  { step_index: 2614, type: "GENERIC", status: "RUNNING", content: `Tool is running as a background task with task id: ${tid1}\nCommand output:\nstarted` },
  { step_index: 2615, type: "PLANNER_RESPONSE", tool_calls: [{ name: "schedule", args: { TimerCondition: tid1, DurationSeconds: 10 } }] },
  { step_index: 2616, type: "GENERIC", status: "DONE", content: `Wait cancelled (task ${tid1} completed).` },
  { step_index: 2617, type: "SYSTEM_MESSAGE", content: `<SYSTEM_MESSAGE>\n[Message] sender=${tid1} content=Task id "${tid1}" finished with result:\nCommand exited with code 0.\n</SYSTEM_MESSAGE>` },
  { step_index: 2642, type: "PLANNER_RESPONSE", tool_calls: [{ name: "run_command", args: { CommandLine: "pwsh -c python server.py --check" } }] },
  { step_index: 2644, type: "GENERIC", status: "RUNNING", content: `Tool is running as a background task with task id: ${tid2}` },
  { step_index: 2645, type: "PLANNER_RESPONSE", tool_calls: [{ name: "schedule", args: { TimerCondition: tid2, DurationSeconds: 5 } }] },
  { step_index: 2646, type: "GENERIC", status: "RUNNING", content: `Task Description: Timer: check\nTool is running as a background task with task id: ${tidTimer}` },
  { step_index: 2648, type: "GENERIC", status: "DONE", content: `Wait cancelled (task ${tid2} completed).` },
  { step_index: 2649, type: "SYSTEM_MESSAGE", content: `<SYSTEM_MESSAGE>\n[Message] sender=${tid2} content=Task id "${tid2}" finished with result:\nCommand exited with code 0.\n</SYSTEM_MESSAGE>` },
];
api.buildStepMetadataAndTaskIndex(taskSteps);

const dLaunch1 = api.resolveTaskLinkDestination(tid1, taskSteps[1], "launch");
assert.equal(dLaunch1.destStepIndex, 2617, "Launch step must link forward to result #2617");
assert.equal(dLaunch1.kind, "to-result");

const dCancel1 = api.resolveTaskLinkDestination(tid1, taskSteps[3], "cancel");
assert.equal(dCancel1.destStepIndex, 2617, "Wait cancelled step must link forward to result #2617");

const dRes1 = api.resolveTaskLinkDestination(tid1, taskSteps[4], "result");
assert.equal(dRes1.destStepIndex, 2612, "Result #2617 must jump back to caller #2612");
assert.equal(dRes1.toolOutStep, 2614, "Result #2617 must focus attached launch output #2614");
assert.equal(dRes1.kind, "to-source");

const dRes2 = api.resolveTaskLinkDestination(tid2, taskSteps[10], "result");
assert.equal(dRes2.destStepIndex, 2642, "Result #2649 must jump back to caller #2642");
assert.equal(dRes2.toolOutStep, 2644, "Result #2649 must focus attached launch output #2644");

const meta2614 = api.stepToolMetaMap.get(taskSteps[1]);
assert.equal(meta2614?.toolName, "run_command", "stepToolMetaMap must track caller toolName for standalone GENERIC steps");

console.log("ALL VIEWER FEATURE UNIT TESTS PASSED!");
