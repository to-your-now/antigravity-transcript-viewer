import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsPath = path.resolve(__dirname, "..", "static", "app.js");
const indexHtmlPath = path.resolve(__dirname, "..", "static", "index.html");
const enJsonPath = path.resolve(__dirname, "..", "static", "i18n", "en.json");
const ruJsonPath = path.resolve(__dirname, "..", "static", "i18n", "ru.json");
const appJs = fs.readFileSync(appJsPath, "utf8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const enLocale = JSON.parse(fs.readFileSync(enJsonPath, "utf8"));
const ruLocale = JSON.parse(fs.readFileSync(ruJsonPath, "utf8"));

function sliceFunc(src, name) {
  const marker = `\n  function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`Function not found: ${name}`);
  const end = src.indexOf("\n  }", start + marker.length);
  if (end === -1) throw new Error(`End brace not found for ${name}`);
  return src.slice(start + 1, end + 4);
}

const helpersCode = [
  `const _enLocale = ${JSON.stringify(enLocale)};`,
  `function t(key, vars = null) {
    let cur = _enLocale;
    for (const p of String(key).split(".")) cur = cur && typeof cur === "object" ? cur[p] : undefined;
    let val = typeof cur === "string" ? cur : key;
    if (vars) for (const [k, v] of Object.entries(vars)) val = val.split("{" + k + "}").join(v ?? "");
    return val;
  }`,
  `const escHtml = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");`,
  `const unescapeNewlines = (s) => String(s || "").replace(/\\r\\n/g, "\\n");`,
  `const KNOWN_USER_TAGS = new Set(["USER_REQUEST", "ADDITIONAL_METADATA", "USER_SETTINGS_CHANGE"]);`,
  `const KNOWN_TOP_TAGS = new Set(["USER_REQUEST", "ADDITIONAL_METADATA", "USER_SETTINGS_CHANGE", "SUMMARY", "SYSTEM_MESSAGE"]);`,
  `const stepModelMap = new WeakMap();`,
  `let stepSearchBlobCache = new WeakMap();`,
  `let stepSearchUnitsCache = new WeakMap();`,
  `let stepToolMetaMap = new WeakMap();`,
  `let taskIndexMap = new Map();`,
  `let stepTaskMetaMap = new WeakMap();`,
  `let _lastDetectedModel = "";`,
  `const BG_TASK_ID_RE = /\\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/task-\\d+)\\b/gi;`,
  `const WORD_CHAR_RE = /[\\p{L}\\p{N}_]/u;`,
  `const fmtStepTime = (ts) => ts ? "12:00:00" : "";`,
  `const fmtFullDateTime = (ts) => ts || "";`,
  `const isCommandErrorStep = () => false;`,
  `const getStepMatchingCmdKeys = () => [];`,
  `let _cachedSearchAstRaw = null;`,
  `let _cachedSearchAst = null;`,
  `const state = { activeId: "00000000-0000-0000-0000-000000000001", activeMeta: { project: "sample-project" }, activeLogPath: "/logs/transcript_full.jsonl", attachToolOutputs: true, filter: "all", onlyCmdErrors: false, cmdMapFilterOnly: false, cmdMapKeys: new Set(), stepQuery: "", searchFocusedOnly: true, searchAcrossWholeTurn: false, searchWholeWord: false, searchCaseSensitive: false };`,
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
  sliceFunc(appJs, "findTermOccurrences"),
  sliceFunc(appJs, "getSearchOpts"),
  sliceFunc(appJs, "getStepSearchUnits"),
  sliceFunc(appJs, "getStepSearchBlob"),
  sliceFunc(appJs, "parseSearchQuery"),
  sliceFunc(appJs, "getCachedSearchAst"),
  sliceFunc(appJs, "evalSearchAst"),
  sliceFunc(appJs, "getPositiveSearchTermObjs"),
  sliceFunc(appJs, "getPositiveSearchTerms"),
  sliceFunc(appJs, "getTurnSearchBlob"),
  sliceFunc(appJs, "getTurnSearchUnits"),
  sliceFunc(appJs, "stepMatchesFilter"),
  sliceFunc(appJs, "buildStepMetadataAndTaskIndex"),
  sliceFunc(appJs, "resolveTaskLinkDestination"),
  `return { state, formatSpecialBracketTagsInHtml, formatPairedSystemTagsInHtml, renderSystemMessageBody, extractModelNamesFromSettings, updateStepModels, stepModelMap, parseHashNavigation, buildStepShareUrl, findTermOccurrences, parseSearchQuery, evalSearchAst, getPositiveSearchTerms, getTurnSearchBlob, getTurnSearchUnits, stepMatchesFilter, buildStepMetadataAndTaskIndex, resolveTaskLinkDestination, get taskIndexMap() { return taskIndexMap; }, get stepToolMetaMap() { return stepToolMetaMap; }, get stepTaskMetaMap() { return stepTaskMetaMap; } };`,
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
assert.equal(api.evalSearchAst(api.parseSearchQuery("pwsh -c git diff"), turnBlob), true, "Unquoted CLI flags like -c must search literally, not act as NOT");
assert.equal(api.evalSearchAst(api.parseSearchQuery('"git diff pwsh"'), turnBlob), false, "Wrong order inside quotes must NOT match");
assert.equal(api.evalSearchAst(api.parseSearchQuery("diff server.py pwsh"), turnBlob), true, "Unordered multi-word AND must match across caller + output");
assert.equal(
  api.evalSearchAst(
    api.parseSearchQuery("git diff"),
    api.getTurnSearchBlob({ step_index: 99, type: "PLANNER_RESPONSE", content: "only git here" }, null)
  ),
  false,
  "Space-separated terms without quotes require BOTH terms (AND), not OR"
);
assert.equal(api.evalSearchAst(api.parseSearchQuery("pytest OR compileall OR server.py"), turnBlob), true, "OR operator must match");
assert.equal(api.evalSearchAst(api.parseSearchQuery('run_command !"exit: 1" !traceback'), turnBlob), true, "Negative !phrase/word exclusion must pass when absent");
assert.equal(api.evalSearchAst(api.parseSearchQuery('run_command !"exit: 0"'), turnBlob), false, "Negative !\"exit: 0\" must exclude match");
assert.equal(api.evalSearchAst(api.parseSearchQuery("(pytest OR server.py) AND NOT checking"), turnBlob), false, "Grouped OR + NOT must exclude");
assert.deepEqual(
  api.getPositiveSearchTerms(api.parseSearchQuery('"pwsh -c git diff" server.py !traceback !"exit: 1" NOT error')),
  ["pwsh -c git diff", "server.py"]
);

// Dynamic visible badges/pills must be searchable too
const metaStep = {
  step_index: 500,
  type: "PLANNER_RESPONSE",
  status: "DONE",
  source: "MODEL",
  content: "Hello",
  input_tokens: 100,
  cache_read_tokens: 900,
  output_tokens: 50,
  custom_flag: "experimental_v2",
};
api.stepModelMap.set(metaStep, "Gemini 3.1 Pro");
const metaBlob = api.getTurnSearchBlob(metaStep, null);
assert.equal(api.evalSearchAst(api.parseSearchQuery('"Gemini 3.1 Pro" 90.0% txt:5 experimental_v2'), metaBlob), true, "All dynamic chips/badges must be searchable");

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

// 8. Same-block default search vs whole-turn search, wholeWord, caseSensitive, pure negation
const multiToolPlanner = {
  step_index: 700,
  type: "PLANNER_RESPONSE",
  status: "DONE",
  source: "MODEL",
  thinking: "Investigating AlphaOnlyToken in thought trace.",
  tool_calls: [
    { name: "run_command", args: { CommandLine: "git status" } },
    { name: "read_file", args: { Path: "/repo/server.py" } },
  ],
  content: "Summary mentioning diff later.",
};
const multiToolOutputs = [
  { step_index: 701, type: "GENERIC", status: "DONE", content: "On branch main\nnothing to commit" },
  { step_index: 702, type: "GENERIC", status: "DONE", content: "1: def githubHelper():\n2:     return 'CaseExactVal'" },
];

// Default (searchAcrossWholeTurn = false): words must appear inside the SAME logical unit
api.state.searchAcrossWholeTurn = false;
api.state.searchWholeWord = false;
api.state.searchCaseSensitive = false;
api.state.stepQuery = "git diff";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  false,
  "Default same-block mode must NOT match 'git' in tool_call #1 + 'diff' in content"
);
api.state.stepQuery = "git status";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  true,
  "Default same-block mode must match 'git status' inside tool_call #1"
);
api.state.stepQuery = "githubHelper CaseExactVal";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  true,
  "Default same-block mode must match multiple words within the same tool output unit"
);
api.state.stepQuery = "AlphaOnlyToken status";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  false,
  "Default same-block mode must NOT match thinking + tool_call across separate units"
);
api.state.stepQuery = "/repo/server.py githubHelper";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  true,
  "Default same-block mode must pair tool call #2 args with tool output #2 inside one logical tool unit"
);

// Unit isolation with CLI flag '-c': only the matching run_command unit satisfies 'pwsh -c git diff', NOT sibling read_file with '-c'
const cliTurn = {
  step_index: 710,
  type: "PLANNER_RESPONSE",
  status: "DONE",
  source: "MODEL",
  thinking: "Maybe pass -c flag to something else.",
  tool_calls: [
    { name: "run_command", args: { CommandLine: "pwsh -c git diff" } },
    { name: "read_file", args: { Path: "/repo/other.py" } },
  ],
};
const cliOutputs = [
  { step_index: 711, type: "GENERIC", status: "DONE", content: "Command exited with code 0.\n\nOutput:\nM static/app.js" },
  { step_index: 712, type: "GENERIC", status: "DONE", content: "1: cmd = ['pwsh', '-c', 'echo hi']" },
];
const cliUnits = api.getTurnSearchUnits(cliTurn, cliOutputs);
const cliAst = api.parseSearchQuery("pwsh -c git diff");
const cliMatchedUnits = cliUnits.filter((u) => api.evalSearchAst(cliAst, u, { acrossWholeTurn: false }));
assert.equal(cliMatchedUnits.length, 1, "Only the run_command unit must satisfy 'pwsh -c git diff', never sibling read_file/thinking with '-c'");
assert.equal(cliMatchedUnits[0].toolIdx, 0, "Matched unit must be toolIdx 0 (run_command)");
assert.equal(api.parseSearchQuery("-cache").type, "TERM", "Hyphen prefix -cache must ALWAYS parse as literal TERM, never NOT");

// Whole-turn mode enabled
api.state.searchAcrossWholeTurn = true;
api.state.stepQuery = "git diff";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  true,
  "Whole-turn mode must match words across different blocks of the same turn"
);

// Pure negation in unit-based mode: !word excludes turn if ANY unit contains word
api.state.searchAcrossWholeTurn = false;
api.state.stepQuery = "!AlphaOnlyToken";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  false,
  "Pure negation !AlphaOnlyToken must reject the turn when thinking unit contains AlphaOnlyToken"
);
api.state.stepQuery = "!NotPresentAnywhere";
assert.equal(
  api.stepMatchesFilter(multiToolPlanner, multiToolOutputs),
  true,
  "Pure negation must keep turns where none of the units contain the excluded word"
);

// Whole words option: "git" must NOT match "githubHelper" when searchWholeWord = true
api.state.searchWholeWord = true;
api.state.stepQuery = "git";
assert.equal(
  api.stepMatchesFilter(multiToolOutputs[1], null),
  false,
  "Whole word 'git' must not match 'githubHelper'"
);
api.state.stepQuery = "githubHelper";
assert.equal(
  api.stepMatchesFilter(multiToolOutputs[1], null),
  true,
  "Whole word 'githubHelper' must match exact identifier boundary"
);

// Case sensitive option
api.state.searchWholeWord = false;
api.state.searchCaseSensitive = true;
api.state.stepQuery = "CaseExactVal";
assert.equal(api.stepMatchesFilter(multiToolPlanner, multiToolOutputs), true);
api.state.stepQuery = "caseexactval";
assert.equal(api.stepMatchesFilter(multiToolPlanner, multiToolOutputs), false);

// Reset state
api.state.stepQuery = "";
api.state.searchAcrossWholeTurn = false;
api.state.searchWholeWord = false;
api.state.searchCaseSensitive = false;

// 9. i18n key parity (en.json vs ru.json), English default startup, and SSE FIFO invariant
function collectLeafKeys(obj, prefix = "") {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) keys.push(...collectLeafKeys(v, p));
    else keys.push(p);
  }
  return keys.sort();
}
assert.deepEqual(
  collectLeafKeys(enLocale),
  collectLeafKeys(ruLocale),
  "en.json and ru.json must define identical translation key hierarchies"
);
assert.ok(indexHtml.includes('<html lang="en">'), "index.html must default to English (lang=\"en\")");
assert.ok(appJs.includes('let savedLang = "en";'), "app.js init must default to English when tv_lang is unset");
assert.ok(appJs.includes("} else if (_pendingSseSteps.length > 0) {"), "SSE stream handler must drain _pendingSseSteps before appending incoming steps");
assert.ok(appJs.includes("captureSearchContextAnchor"), "app.js must capture and restore active card anchor when clearing search");
assert.ok(appJs.includes("matchedUnitScopes"), "highlightMatches must evaluate search AST per logical unit in default same-block mode");
assert.ok(appJs.includes("search-hit-sub") && appJs.includes("applyInitialSearchScrolls"), "app.js must apply two-tier hit framing and auto-scroll scrollable output boxes to hits");
assert.ok(!appJs.includes("'-cache'") && !appJs.includes("error OR warning -cache"), "Search popover must not advertise hyphen '-' as negation");
assert.ok(!appJs.includes("-word / !word") && !appJs.includes("(a OR b) -c"), "Search popover syntax examples must use ! / NOT instead of hyphen '-'");

// 10. TOC jump stability (synchronous window measurement + multi-pass alignment) & jumpBottomBtn state/style
const styleCss = fs.readFileSync(path.resolve(__dirname, "..", "static", "style.css"), "utf8");
assert.ok(appJs.includes("function measureMountedVWindowNow("), "app.js must define measureMountedVWindowNow() for jump alignment");
assert.ok(
  appJs.includes("measureMountedVWindowNow();") && appJs.includes("matchesProgrammaticTop"),
  "jumpToStep must synchronously measure mounted cards and guard programmatic scroll events against slow frames"
);
const jumpBtnRule = styleCss.match(/\.jump-bottom\s*\{[^}]*\}/);
assert.ok(jumpBtnRule && jumpBtnRule[0].includes("var(--bg-elev)"), ".jump-bottom default CSS must use neutral var(--bg-elev), not permanent accent blue");
assert.ok(
  indexHtml.includes('id="jumpBottomBtn" data-i18n="minimap.jumpBottom"'),
  "index.html must default #jumpBottomBtn label to minimap.jumpBottom"
);
assert.ok(
  appJs.includes("function syncJumpBottomButtonState("),
  "app.js must centralize #jumpBottomBtn unread/normal state in syncJumpBottomButtonState()"
);

// Functional simulation of syncJumpBottomButtonState()
const fakeCls = new Set(["hidden", "flash-yellow"]);
const fakeBtn = {
  textContent: "↓ New message",
  classList: {
    toggle: (cls, force) => {
      if (force) fakeCls.add(cls);
      else fakeCls.delete(cls);
    },
  },
};
const syncBtn = new Function(
  "els",
  "state",
  "_lastShowBottom",
  "t",
  `${sliceFunc(appJs, "syncJumpBottomButtonState")}\nreturn syncJumpBottomButtonState;`
)(
  { jumpBottomBtn: fakeBtn },
  api.state,
  false,
  (k) => (k === "minimap.jumpNewMessage" ? "↓ New message" : "↓ Bottom")
);
api.state.firstUnreadStepIndex = 42;
syncBtn(true);
assert.ok(!fakeCls.has("hidden") && fakeCls.has("flash-yellow") && fakeBtn.textContent === "↓ New message");
api.state.firstUnreadStepIndex = null;
syncBtn(true);
assert.ok(!fakeCls.has("hidden") && !fakeCls.has("flash-yellow") && fakeBtn.textContent === "↓ Bottom");
syncBtn(false);
assert.ok(fakeCls.has("hidden") && !fakeCls.has("flash-yellow") && fakeBtn.textContent === "↓ Bottom");

assert.ok(
  appJs.includes("resetFiltersOnMissing === false") && appJs.includes("resetFiltersOnMissing: false"),
  "Search/option anchor restore must pass resetFiltersOnMissing: false so typing partial queries never wipes #stepSearch"
);
assert.ok(
  !appJs.includes('els.stepSearch.addEventListener("focus", openSearchPopover)'),
  "#searchPopover must open via #searchOptsBtn only, not on #stepSearch focus"
);
assert.ok(
  appJs.includes('e.key === "."') && appJs.includes('e.code === "Slash"') && appJs.includes("isCtrlDotShortcut"),
  "Global keydown handler must focus #stepSearch on Ctrl+. / physical Slash (Russian keyboard layout)"
);
assert.ok(
  appJs.includes("searchTrimmed: curSearchTrim") && appJs.includes("canReuseMeasured"),
  "renderFullFeed must invalidate previously measured trimmed card heights when clearing search"
);
assert.ok(
  appJs.includes("subAnchor") && appJs.includes("pickAcrossCards") && appJs.includes("findWithin") && appJs.includes("skipWindowSync"),
  "captureSearchContextAnchor and jumpToStep must track sub-block anchors via findWithin/pickAcrossCards without :scope closest bugs"
);

// 11. Functional simulation of captureSearchContextAnchor() under trimmed searchFocusedOnly mode
function makeMockNode({ tag = "DIV", cls = [], dataset = {}, rect = { top: 0, bottom: 0, height: 0 }, scrollH = 0, clientH = 0 } = {}) {
  const clsSet = new Set(cls);
  const children = [];
  const node = {
    tagName: tag.toUpperCase(),
    dataset: { ...dataset },
    parentElement: null,
    children,
    scrollHeight: scrollH,
    clientHeight: clientH,
    classList: {
      contains: (c) => clsSet.has(c),
      add: (c) => clsSet.add(c),
    },
    getBoundingClientRect: () => ({ ...rect, left: 0, right: 800, width: 800 }),
    append: (...kids) => {
      for (const k of kids) {
        k.parentElement = node;
        children.push(k);
      }
      return node;
    },
    contains: (other) => {
      let cur = other;
      while (cur) {
        if (cur === node) return true;
        cur = cur.parentElement;
      }
      return false;
    },
    matchesSimple(part) {
      // Minimal matcher for tag, .class, [data-attr] and [data-attr="val"]
      let rest = part.trim();
      if (!rest) return false;
      if (rest === "*") return true;
      const tagM = rest.match(/^[a-zA-Z0-9]+/);
      if (tagM) {
        if (tagM[0].toUpperCase() !== node.tagName) return false;
        rest = rest.slice(tagM[0].length);
      }
      while (rest.length) {
        if (rest.startsWith(".")) {
          const cm = rest.slice(1).match(/^[a-zA-Z0-9_-]+/);
          if (!cm || !clsSet.has(cm[0])) return false;
          rest = rest.slice(1 + cm[0].length);
        } else if (rest.startsWith("[")) {
          const am = rest.match(/^\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/);
          if (!am) return false;
          const dsKey = am[1].replace(/^data-/, "").replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
          const val = node.dataset[dsKey];
          if (val === undefined) return false;
          if (am[2] !== undefined && String(val) !== am[2]) return false;
          rest = rest.slice(am[0].length);
        } else {
          return false;
        }
      }
      return true;
    },
    matchesChain(chain, scopeRoot) {
      const tokens = chain.trim().split(/\s+/);
      let idx = tokens.length - 1;
      let cur = node;
      while (idx >= 0) {
        const tok = tokens[idx];
        if (tok === ">") {
          return false;
        }
        if (tok === ":scope") {
          return cur === scopeRoot && idx === 0;
        }
        if (!cur || !cur.matchesSimple(tok)) return false;
        idx--;
        if (idx >= 0 && tokens[idx] === ">") {
          idx--;
          cur = cur.parentElement;
        } else if (idx >= 0) {
          // Descendant match
          let anc = cur.parentElement;
          const remChain = tokens.slice(0, idx + 1).join(" ");
          while (anc) {
            if (anc.matchesChain(remChain, scopeRoot)) return true;
            if (anc === scopeRoot) break;
            anc = anc.parentElement;
          }
          return false;
        }
      }
      return true;
    },
    matches(sel, scopeRoot = null) {
      return sel.split(",").some((part) => node.matchesChain(part, scopeRoot));
    },
    closest(sel) {
      let cur = node;
      while (cur) {
        if (cur.matches(sel, node)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        for (const ch of n.children) {
          if (ch.matches(sel, node)) out.push(ch);
          walk(ch);
        }
      };
      walk(node);
      return out;
    },
  };
  return node;
}

const makeAnchorRunner = (cards, items) => {
  const vWin = makeMockNode({ tag: "DIV", cls: ["v-window"] }).append(...cards);
  const feedWrap = makeMockNode({ tag: "DIV", cls: ["feed-wrap"], rect: { top: 50, bottom: 850, height: 800 } });
  const captureFn = new Function(
    "els",
    "state",
    "_vItems",
    "_vWindow",
    "getVListBaseTop",
    "findVItemAtY",
    `${sliceFunc(appJs, "captureSearchContextAnchor")}\nreturn captureSearchContextAnchor;`
  )(
    { feedWrap },
    { steps: items.map((it) => it.step) },
    items,
    vWin,
    () => 0,
    () => 0
  );
  return captureFn();
};

{
  // Case A: Peeking top card A (mark offscreen at -100, only .search-hit-target tail at 60) + Card B with visible mark in .step-body > .md > p
  const cardA = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1260" }, rect: { top: -200, bottom: 68, height: 268 } });
  const tcA = makeMockNode({ tag: "DIV", cls: ["tool-card", "search-hit-target"], dataset: { toolIdx: "0" }, rect: { top: -180, bottom: 65, height: 245 } });
  const markA = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: -120, bottom: -102, height: 18 } });
  cardA.append(tcA.append(markA));

  const cardB = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1267" }, rect: { top: 80, bottom: 320, height: 240 } });
  const headB = makeMockNode({ tag: "DIV", cls: ["step-head"], rect: { top: 80, bottom: 116, height: 36 } });
  const bodyB = makeMockNode({ tag: "DIV", cls: ["step-body"], rect: { top: 116, bottom: 320, height: 204 } });
  const omittedThink = makeMockNode({ tag: "DETAILS", cls: ["block-thinking", "search-omitted"], rect: { top: 0, bottom: 0, height: 0 } });
  const mdB = makeMockNode({ tag: "DIV", cls: ["md", "search-hit-target"], rect: { top: 120, bottom: 280, height: 160 } });
  const pB = makeMockNode({ tag: "P", cls: ["search-hit-sub"], rect: { top: 140, bottom: 164, height: 24 } });
  const markB = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: 142, bottom: 160, height: 18 } });
  cardB.append(headB, bodyB.append(omittedThink, mdB.append(pB.append(markB))));

  const anchorB = makeAnchorRunner([cardA, cardB], [{ step: {}, stepKey: "1260" }, { step: {}, stepKey: "1267" }]);
  assert.equal(anchorB.stepIndex, "1267", "Visible mark.hl in card B must beat peeking .search-hit-target tail of card A");
  assert.deepEqual(
    anchorB.subAnchor,
    { scope: "card", sel: ":scope > .step-body > .md p", idx: 0 },
    "Match inside .md must capture :scope > .step-body > .md p subAnchor instead of collapsing to article.step"
  );
  assert.equal(anchorB.topInWrap, 140 - 50, "topInWrap must anchor the .md <p> offset relative to #feedWrap");

  // Case B: Match inside .tool-card > .tool-head with omitted sibling tool-card above it
  const cardC = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1270" }, rect: { top: 60, bottom: 260, height: 200 } });
  const headC = makeMockNode({ tag: "DIV", cls: ["step-head"], rect: { top: 60, bottom: 96, height: 36 } });
  const bodyC = makeMockNode({ tag: "DIV", cls: ["step-body"], rect: { top: 96, bottom: 260, height: 164 } });
  const toolsDet = makeMockNode({ tag: "DETAILS", cls: ["block-tools"], rect: { top: 96, bottom: 260, height: 164 } });
  const toolsBody = makeMockNode({ tag: "DIV", cls: ["block-body"], rect: { top: 120, bottom: 260, height: 140 } });
  const tc0 = makeMockNode({ tag: "DIV", cls: ["tool-card", "search-omitted"], dataset: { toolIdx: "0" }, rect: { top: 0, bottom: 0, height: 0 } });
  const tc1 = makeMockNode({ tag: "DIV", cls: ["tool-card", "search-hit-target"], dataset: { toolIdx: "1" }, rect: { top: 120, bottom: 240, height: 120 } });
  const tc1Head = makeMockNode({ tag: "DIV", cls: ["tool-head", "search-hit-sub"], rect: { top: 120, bottom: 152, height: 32 } });
  const markTc1 = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: 126, bottom: 144, height: 18 } });
  cardC.append(headC, bodyC.append(toolsDet.append(toolsBody.append(tc0, tc1.append(tc1Head.append(markTc1))))));

  const anchorC = makeAnchorRunner([cardC], [{ step: {}, stepKey: "1270" }]);
  assert.equal(anchorC.toolIdx, "1");
  assert.deepEqual(anchorC.subAnchor, { scope: "tc", sel: ":scope > .tool-head", idx: 0 });
  assert.equal(anchorC.topInWrap, 120 - 50);

  // Case C: Match inside expanded (non-overflowing) .read-scroll-box code line anchors exact .code-gutter-row
  const cardD = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1280" }, rect: { top: -200, bottom: 700, height: 900 } });
  const tcD = makeMockNode({ tag: "DIV", cls: ["tool-card"], dataset: { toolIdx: "0" }, rect: { top: -150, bottom: 680, height: 830 } });
  const resD = makeMockNode({ tag: "DIV", cls: ["tool-result"], dataset: { stepIndex: "1281" }, rect: { top: -120, bottom: 680, height: 800 } });
  const boxD = makeMockNode({ tag: "DIV", cls: ["read-scroll-box", "is-full"], rect: { top: -90, bottom: 680, height: 770 }, scrollH: 770, clientH: 770 });
  const row0 = makeMockNode({ tag: "DIV", cls: ["code-gutter-row"], rect: { top: -90, bottom: -70, height: 20 } });
  const row1 = makeMockNode({ tag: "DIV", cls: ["code-gutter-row", "search-hit-sub"], rect: { top: 210, bottom: 230, height: 20 } });
  const markD = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: 211, bottom: 229, height: 18 } });
  cardD.append(tcD.append(resD.append(boxD.append(row0, row1.append(markD)))));

  const anchorD = makeAnchorRunner([cardD], [{ step: {}, stepKey: "1280" }]);
  assert.equal(anchorD.toolOutStep, "1281");
  assert.deepEqual(anchorD.subAnchor, { scope: "res", sel: ".code-gutter-row", idx: 1 });
  assert.equal(anchorD.topInWrap, 210 - 50);
}

console.log("ALL VIEWER FEATURE UNIT TESTS PASSED!");
