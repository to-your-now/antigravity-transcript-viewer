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
  `let stepPairedOutputsMap = new WeakMap();`,
  `const cardAttachedMap = new WeakMap();`,
  `const stepErrCache = new WeakMap();`,
  `let taskIndexMap = new Map();`,
  `let stepTaskMetaMap = new WeakMap();`,
  `let _lastDetectedModel = "";`,
  `const BG_TASK_ID_RE = /\\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/task-\\d+)\\b/gi;`,
  `const WORD_CHAR_RE = /[\\p{L}\\p{N}_]/u;`,
  `const fmtStepTime = (ts) => ts ? "12:00:00" : "";`,
  `const fmtFullDateTime = (ts) => ts || "";`,
  `const SEARCH_HISTORY_MAX = 25;`,
  `let _cachedSearchAstRaw = null;`,
  `let _cachedSearchAst = null;`,
  `const state = { activeId: "00000000-0000-0000-0000-000000000001", activeMeta: { project: "sample-project" }, activeLogPath: "/logs/transcript_full.jsonl", steps: [], attachToolOutputs: true, filter: "all", onlyCmdErrors: false, cmdMapFilterOnly: false, cmdMapFocusedOnly: true, cmdMapKeys: new Set(), stepQuery: "", searchFocusedOnly: true, searchAcrossWholeTurn: false, searchWholeWord: false, searchCaseSensitive: false };`,
  `const window = { location: { origin: "http://127.0.0.1:8765", hash: "" } };`,
  sliceFunc(appJs, "isCommandErrorStep"),
  sliceFunc(appJs, "pairToolOutputs"),
  sliceFunc(appJs, "getBgTaskResultOutcome"),
  sliceFunc(appJs, "classifyToolCallOutcome"),
  sliceFunc(appJs, "doesToolCallMatchCmdKeys"),
  sliceFunc(appJs, "getStepMatchingCmdKeys"),
  sliceFunc(appJs, "getStepCmdMapScope"),
  sliceFunc(appJs, "buildCommandMapStats"),
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
  sliceFunc(appJs, "filterUnitsByCmdMapScope"),
  sliceFunc(appJs, "getVisibleTurnSearchUnits"),
  sliceFunc(appJs, "getVisibleTurnSearchBlob"),
  sliceFunc(appJs, "stepMatchesFilter"),
  sliceFunc(appJs, "buildStepMetadataAndTaskIndex"),
  sliceFunc(appJs, "resolveTaskLinkDestination"),
  sliceFunc(appJs, "formatToolArgsForSnippet"),
  sliceFunc(appJs, "extractMatchSnippet"),
  sliceFunc(appJs, "serializeFeedSelectionRange"),
  sliceFunc(appJs, "formatQuoteForComposer"),
  sliceFunc(appJs, "addSearchHistoryEntry"),
  `return { state, isCommandErrorStep, pairToolOutputs, getBgTaskResultOutcome, classifyToolCallOutcome, doesToolCallMatchCmdKeys, getStepMatchingCmdKeys, getStepCmdMapScope, buildCommandMapStats, formatSpecialBracketTagsInHtml, formatPairedSystemTagsInHtml, renderSystemMessageBody, extractModelNamesFromSettings, updateStepModels, stepModelMap, parseHashNavigation, buildStepShareUrl, findTermOccurrences, parseSearchQuery, evalSearchAst, getPositiveSearchTerms, getTurnSearchBlob, getTurnSearchUnits, filterUnitsByCmdMapScope, getVisibleTurnSearchUnits, getVisibleTurnSearchBlob, stepMatchesFilter, buildStepMetadataAndTaskIndex, resolveTaskLinkDestination, formatToolArgsForSnippet, extractMatchSnippet, serializeFeedSelectionRange, formatQuoteForComposer, addSearchHistoryEntry, get taskIndexMap() { return taskIndexMap; }, get stepToolMetaMap() { return stepToolMetaMap; }, get stepTaskMetaMap() { return stepTaskMetaMap; }, get stepPairedOutputsMap() { return stepPairedOutputsMap; } };`,
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
  const listeners = {};
  const node = {
    tagName: tag.toUpperCase(),
    dataset: { ...dataset },
    parentElement: null,
    children,
    scrollHeight: scrollH,
    clientHeight: clientH,
    textContent: "",
    type: "",
    open: true,
    _listeners: listeners,
    get className() {
      return Array.from(clsSet).join(" ");
    },
    set className(v) {
      clsSet.clear();
      for (const c of String(v || "").trim().split(/\s+/)) {
        if (c) clsSet.add(c);
      }
    },
    addEventListener: (ev, fn) => {
      if (!listeners[ev]) listeners[ev] = [];
      listeners[ev].push(fn);
    },
    click: () => {
      for (const fn of listeners.click || []) fn({ target: node });
    },
    remove: () => {
      if (!node.parentElement) return;
      const arr = node.parentElement.children;
      const idx = arr.indexOf(node);
      if (idx !== -1) arr.splice(idx, 1);
      node.parentElement = null;
    },
    classList: {
      contains: (c) => clsSet.has(c),
      add: (c) => clsSet.add(c),
      remove: (c) => clsSet.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (clsSet.has(c)) {
            clsSet.delete(c);
            return false;
          }
          clsSet.add(c);
          return true;
        }
        if (force) clsSet.add(c);
        else clsSet.delete(c);
        return Boolean(force);
      },
    },
    getBoundingClientRect: () => ({ ...rect, left: 0, right: 800, width: 800 }),
    append: (...kids) => {
      for (const k of kids) {
        k.parentElement = node;
        children.push(k);
      }
      return node;
    },
    appendChild: (k) => {
      k.parentElement = node;
      children.push(k);
      return k;
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
        if (rest.startsWith(":not(")) {
          const closeIdx = rest.indexOf(")");
          if (closeIdx === -1) return false;
          const inner = rest.slice(5, closeIdx);
          if (node.matchesSimple(inner)) return false;
          rest = rest.slice(closeIdx + 1);
        } else if (rest.startsWith(".")) {
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
          if (ch.nodeType === 1 && ch.matches(sel, node)) out.push(ch);
          if (ch.nodeType === 1) walk(ch);
        }
      };
      walk(node);
      return out;
    },
    querySelector(sel) {
      return node.querySelectorAll(sel)[0] || null;
    },
    nodeType: 1,
    get childNodes() {
      return children;
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
  // Case A: Peeking top sliver card A + Card B whose .step-head is visible (with omitted thinking above mdB) -> must lock Card B's .step-head
  const cardA = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1260" }, rect: { top: -200, bottom: 68, height: 268 } });
  const headA = makeMockNode({ tag: "DIV", cls: ["step-head"], rect: { top: -200, bottom: -164, height: 36 } });
  const tcA = makeMockNode({ tag: "DIV", cls: ["tool-card", "search-hit-target"], dataset: { toolIdx: "0" }, rect: { top: -160, bottom: 65, height: 225 } });
  const markA = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: -120, bottom: -102, height: 18 } });
  cardA.append(headA, tcA.append(markA));

  const cardB = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1267" }, rect: { top: 80, bottom: 320, height: 240 } });
  const headB = makeMockNode({ tag: "DIV", cls: ["step-head"], rect: { top: 80, bottom: 116, height: 36 } });
  const bodyB = makeMockNode({ tag: "DIV", cls: ["step-body"], rect: { top: 116, bottom: 320, height: 204 } });
  const omittedThink = makeMockNode({ tag: "DETAILS", cls: ["block-thinking", "search-omitted"], rect: { top: 0, bottom: 0, height: 0 } });
  const mdB = makeMockNode({ tag: "DIV", cls: ["md", "search-hit-target"], rect: { top: 120, bottom: 280, height: 160 } });
  const pB = makeMockNode({ tag: "P", cls: ["search-hit-sub"], rect: { top: 140, bottom: 164, height: 24 } });
  const markB = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: 142, bottom: 160, height: 18 } });
  cardB.append(headB, bodyB.append(omittedThink, mdB.append(pB.append(markB))));

  const anchorB = makeAnchorRunner([cardA, cardB], [{ step: {}, stepKey: "1260" }, { step: {}, stepKey: "1267" }]);
  assert.equal(anchorB.stepIndex, "1267", "Card B's visible .step-head must beat peeking sliver of card A");
  assert.deepEqual(
    anchorB.subAnchor,
    { scope: "card", sel: ":scope > .step-head", idx: 0 },
    "When .step-head is visible inside viewport, captureSearchContextAnchor must lock :scope > .step-head so omitted blocks expanding above content never shift the step header"
  );
  assert.equal(anchorB.topInWrap, 80 - 50, "topInWrap must lock the .step-head exact offset relative to #feedWrap");

  // Case B: Card C has visible .step-head AND omitted sibling tool-card tc0 above matched tc1 -> must lock .step-head
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
  assert.equal(anchorC.toolIdx, null);
  assert.deepEqual(anchorC.subAnchor, { scope: "card", sel: ":scope > .step-head", idx: 0 });
  assert.equal(anchorC.topInWrap, 60 - 50);

  // Case C: Match inside expanded .read-scroll-box when .step-head is scrolled off-screen above viewport -> anchors exact .code-gutter-row
  const cardD = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "1280" }, rect: { top: -200, bottom: 700, height: 900 } });
  const headD = makeMockNode({ tag: "DIV", cls: ["step-head"], rect: { top: -200, bottom: -164, height: 36 } });
  const tcD = makeMockNode({ tag: "DIV", cls: ["tool-card"], dataset: { toolIdx: "0" }, rect: { top: -150, bottom: 680, height: 830 } });
  const resD = makeMockNode({ tag: "DIV", cls: ["tool-result"], dataset: { stepIndex: "1281" }, rect: { top: -120, bottom: 680, height: 800 } });
  const boxD = makeMockNode({ tag: "DIV", cls: ["read-scroll-box", "is-full"], rect: { top: -90, bottom: 680, height: 770 }, scrollH: 770, clientH: 770 });
  const row0 = makeMockNode({ tag: "DIV", cls: ["code-gutter-row"], rect: { top: -90, bottom: -70, height: 20 } });
  const row1 = makeMockNode({ tag: "DIV", cls: ["code-gutter-row", "search-hit-sub"], rect: { top: 210, bottom: 230, height: 20 } });
  const markD = makeMockNode({ tag: "MARK", cls: ["hl"], rect: { top: 211, bottom: 229, height: 18 } });
  cardD.append(headD, tcD.append(resD.append(boxD.append(row0, row1.append(markD)))));

  const anchorD = makeAnchorRunner([cardD], [{ step: {}, stepKey: "1280" }]);
  assert.equal(anchorD.toolOutStep, "1281");
  assert.deepEqual(anchorD.subAnchor, { scope: "res", sel: ".code-gutter-row", idx: 1 });
  assert.equal(anchorD.topInWrap, 210 - 50);
}

// 12. TOC snippet single-backslash Windows paths, CommandLine Copy/Run backend+UI hooks, and single-line Wait/OUTPUT copy
{
  const cmdStep = {
    step_index: 925,
    type: "PLANNER_RESPONSE",
    status: "DONE",
    source: "MODEL",
    tool_calls: [
      {
        name: "run_command",
        args: {
          CommandLine: "pwsh -c Test-Path 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'",
          WaitMsBeforeAsync: 5000,
        },
      },
    ],
  };
  const snip1 = api.extractMatchSnippet(cmdStep, "msedge.exe", null);
  assert.ok(snip1.includes("Application\\<mark class=\"hl\">msedge.exe</mark>"), "TOC snippet must show single backslashes instead of JSON-escaped \\\\");
  assert.ok(!snip1.includes("Application\\\\"), "TOC snippet must not double backslashes in Windows paths");
  assert.ok(snip1.includes("WaitMsBefore"), "TOC snippet must keep surrounding single-line tool arg context");

  const snip2 = api.extractMatchSnippet(cmdStep, "cation\\msedge.exe", null);
  assert.ok(
    snip2.startsWith("[run_command]") && snip2.includes('<mark class="hl">cation\\msedge.exe</mark>'),
    "Searching cation\\msedge.exe must find and highlight the match inside [run_command] TOC snippet"
  );

  const serverPy = fs.readFileSync(path.resolve(__dirname, "..", "server.py"), "utf8");
  assert.ok(serverPy.includes("def execute_console_command(") && serverPy.includes('"/api/run-command"'), "server.py must expose /api/run-command");
  assert.ok(serverPy.includes("def open_interactive_terminal(") && serverPy.includes('"/api/open-terminal"'), "server.py must expose /api/open-terminal");
  assert.ok(serverPy.includes("def _strip_ansi(") && serverPy.includes('"NO_COLOR"'), "server.py must strip ANSI sequences and set NO_COLOR=1");
  assert.ok(indexHtml.includes('id="openProjTermBtn"') && indexHtml.includes('data-i18n-title="topbar.openTerminalTitle"'), "index.html must include topbar project terminal icon button with tooltip");
  assert.ok(appJs.includes("function attachCommandActionsToHead(") && appJs.includes(".term-cmd-btn") && appJs.includes('"/api/open-terminal"'), "app.js must attach Copy, Run, and Terminal buttons beside CommandLine");
  assert.ok(appJs.includes('document.addEventListener("copy",'), "app.js must normalize copied headers across the whole document, not only inside #feed");
  assert.ok(styleCss.includes(".run-cmd-btn") && styleCss.includes(".term-cmd-btn") && styleCss.includes(".top-term-btn") && styleCss.includes("user-select: none"), "style.css must style .run-cmd-btn, .term-cmd-btn, and .top-term-btn cleanly");
  assert.ok(styleCss.includes(".tool-args.has-cmd-exec") && !styleCss.includes(".tool-args .cmd-exec-out"), "Only .cmd-exec-out may scroll when inline Run output is open; .tool-args must uncap via .has-cmd-exec");
  assert.ok(appJs.includes("has-cmd-exec"), "app.js must toggle .has-cmd-exec on .tool-args when inline .cmd-exec-panel opens/closes");

  const mkText = (s) => ({ nodeType: 3, nodeValue: s });
  const rootFrag = makeMockNode({ tag: "DIV" });
  const stepHead = makeMockNode({ tag: "DIV", cls: ["step-head"] }).append(
    makeMockNode({ tag: "SPAN", cls: ["badge"] }).append(mkText("PLANNER")),
    makeMockNode({ tag: "SPAN", cls: ["step-num-chip"] }).append(mkText("#925")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip"] }).append(mkText("19:51:19")),
    makeMockNode({ tag: "BUTTON", cls: ["raw-btn"] }).append(mkText("{ }"))
  );
  const rowCmd = makeMockNode({ tag: "DIV", cls: ["arg-row", "arg-row-command"] });
  const rowCmdHead = makeMockNode({ tag: "DIV", cls: ["arg-row-cmd-head"] });
  rowCmdHead.append(
    makeMockNode({ tag: "SPAN", cls: ["arg-key"] }).append(mkText("CommandLine")),
    makeMockNode({ tag: "DIV", cls: ["cmd-actions-bar"] }).append(
      makeMockNode({ tag: "BUTTON", cls: ["copy-cmd-btn"] }).append(mkText("Copy")),
      makeMockNode({ tag: "BUTTON", cls: ["run-cmd-btn"] }).append(mkText("Run")),
      makeMockNode({ tag: "BUTTON", cls: ["term-cmd-btn"] }).append(mkText(">_ Terminal"))
    )
  );
  const preCmd = makeMockNode({ tag: "PRE", cls: ["arg-val"] }).append(mkText("pwsh -c Test-Path 'C:\\App\\x.exe'"));
  const execHead = makeMockNode({ tag: "DIV", cls: ["cmd-exec-head"] }).append(
    makeMockNode({ tag: "SPAN", cls: ["cmd-exec-shell"] }).append(mkText("pwsh")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip", "exit-nonzero"] }).append(mkText("EXIT: 1")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip"] }).append(mkText("⏱ 2.2s")),
    makeMockNode({ tag: "SPAN", cls: ["cmd-exec-cwd"] }).append(mkText("cwd: C:\\workspace\\sample")),
    makeMockNode({ tag: "SPAN", cls: ["cmd-exec-actions"] }).append(
      makeMockNode({ tag: "BUTTON", cls: ["cmd-exec-btn"] }).append(mkText("↻ Re-run")),
      makeMockNode({ tag: "BUTTON", cls: ["cmd-exec-btn"] }).append(mkText("✕"))
    )
  );
  const execOut = makeMockNode({ tag: "PRE", cls: ["cmd-exec-out"] }).append(mkText("line 1\nline 2"));
  rowCmd.append(rowCmdHead, preCmd, makeMockNode({ tag: "DIV", cls: ["cmd-exec-panel"] }).append(execHead, execOut));

  const rowWait = makeMockNode({ tag: "DIV", cls: ["arg-row", "arg-row-inline"] }).append(
    makeMockNode({ tag: "SPAN", cls: ["arg-key"] }).append(mkText("WaitMsBeforeAsync")),
    makeMockNode({ tag: "SPAN", cls: ["arg-val-inline"] }).append(mkText("5000"))
  );
  const resHead = makeMockNode({ tag: "DIV", cls: ["tool-result-head"] }).append(
    makeMockNode({ tag: "SPAN", cls: ["badge"] }).append(mkText("OUTPUT\n")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip"] }).append(mkText("MODEL")),
    makeMockNode({ tag: "SPAN", cls: ["status-pill"] }).append(mkText("DONE")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip"] }).append(mkText("⚠ EXIT: 1")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip"] }).append(mkText("19:51:23 · ⏱ 3.0s")),
    makeMockNode({ tag: "BUTTON", cls: ["raw-btn"] }).append(mkText("{ }"))
  );
  const outPre = makeMockNode({ tag: "PRE", cls: ["generic-pre"] }).append(mkText("x86: error line 1\nline 2"));
  rootFrag.append(stepHead, rowCmd, rowWait, resHead, outPre);

  const copied = api.serializeFeedSelectionRange({
    commonAncestorContainer: rootFrag,
    cloneContents: () => rootFrag,
  });
  assert.equal(
    copied,
    "PLANNER #925 19:51:19\nCommandLine\npwsh -c Test-Path 'C:\\App\\x.exe'\npwsh EXIT: 1 ⏱ 2.2s cwd: C:\\workspace\\sample\nline 1\nline 2\nWaitMsBeforeAsync 5000 OUTPUT MODEL DONE ⚠ EXIT: 1 19:51:23 · ⏱ 3.0s\nx86: error line 1\nline 2",
    "Copy handler must join all headers (.step-head, .arg-row-cmd-head, .cmd-exec-head, WaitMsBeforeAsync..OUTPUT) onto single lines without buttons while preserving multiline output"
  );

  // Direct selection strictly inside .cmd-exec-head must also serialize onto one single line
  const execFrag = makeMockNode({ tag: "DIV" }).append(
    makeMockNode({ tag: "SPAN", cls: ["cmd-exec-shell"] }).append(mkText("pwsh\n")),
    makeMockNode({ tag: "SPAN", cls: ["meta-chip"] }).append(mkText("EXIT: 1\n")),
    makeMockNode({ tag: "SPAN", cls: ["cmd-exec-cwd"] }).append(mkText("cwd: C:\\workspace\\sample"))
  );
  const execHeadCopied = api.serializeFeedSelectionRange({
    commonAncestorContainer: execHead,
    cloneContents: () => execFrag,
  });
  assert.equal(execHeadCopied, "pwsh EXIT: 1 cwd: C:\\workspace\\sample");

  // Selection inside <input> must stay native (return null)
  const inpEl = makeMockNode({ tag: "INPUT" });
  assert.equal(api.serializeFeedSelectionRange({ commonAncestorContainer: inpEl, cloneContents: () => inpEl }), null);
}

// 13. Search query history (dedupe, max length, Alt+ArrowDown/Up popover hooks)
{
  let hist = [];
  hist = api.addSearchHistoryEntry(hist, "  git diff  ", 3);
  hist = api.addSearchHistoryEntry(hist, "", 3);
  hist = api.addSearchHistoryEntry(hist, "EXIT: 1", 3);
  hist = api.addSearchHistoryEntry(hist, "server.py", 3);
  assert.deepEqual(hist, ["server.py", "EXIT: 1", "git diff"], "History should trim, ignore empty strings, and keep most-recent-first");

  // Re-adding an existing entry moves it to index 0 without duplicating
  hist = api.addSearchHistoryEntry(hist, "git diff", 3);
  assert.deepEqual(hist, ["git diff", "server.py", "EXIT: 1"], "Duplicate query must move to top without growing beyond maxLen");

  // Adding a fourth distinct query drops oldest
  hist = api.addSearchHistoryEntry(hist, "msedge.exe", 3);
  assert.deepEqual(hist, ["msedge.exe", "git diff", "server.py"], "History must cap cleanly at maxLen");

  const styleCss = fs.readFileSync(path.resolve(__dirname, "..", "static", "style.css"), "utf8");
  assert.ok(indexHtml.includes('id="searchHistoryPopover"'), "index.html must include #searchHistoryPopover");
  assert.ok(styleCss.includes(".search-history-popover") && styleCss.includes(".search-history-item.active"), "style.css must style #searchHistoryPopover and active rows");
  assert.ok(
    appJs.includes('"tv_search_history"') &&
      appJs.includes('e.key === "ArrowDown" || e.key === "ArrowUp"') &&
      appJs.includes("openSearchHistoryPopover("),
    "app.js must persist tv_search_history and handle Alt+ArrowDown/Alt+ArrowUp history popup"
  );
}

// 14. Search debounce (380ms + typing pause guard) and TOC visibility preservation on search
{
  assert.ok(
    appJs.includes("SEARCH_DEBOUNCE_MS = 380") &&
      appJs.includes("cancelPrewarmLru();") &&
      appJs.includes("captureTocSearchView(") &&
      appJs.includes("restoreTocSearchView("),
    "app.js must debounce search input at 380ms, pause LRU prewarm while typing, and preserve TOC view during search"
  );

  const runTocHarness = ({ scrollTop, mapRect, mainRect, postMainRect, scrollHeight = 2400, clientHeight = 800 }) => {
    const fw = makeMockNode({ tag: "DIV", cls: ["feed-wrap"], rect: { top: 50, bottom: 50 + clientHeight, height: clientHeight } });
    fw.scrollTop = scrollTop;
    fw.scrollHeight = scrollHeight;
    fw.clientHeight = clientHeight;

    let activeMap = makeMockNode({ tag: "SECTION", cls: ["cache-map-card"], rect: mapRect });
    const det = makeMockNode({ tag: "DETAILS", cls: ["cache-map-details"], rect: mapRect });
    det.open = true;
    let activeMain = makeMockNode({ tag: "DIV", cls: ["toc-wrap"], rect: mainRect });
    activeMain.offsetHeight = mainRect.height;
    activeMap.append(det.append(activeMain));

    const testState = { userScrolledUp: false };
    const docStub = { getElementById: (id) => (id === "cacheMapCard" ? activeMap : null) };
    let synced = false;
    let uiUpdated = false;
    const fns = new Function(
      "document",
      "els",
      "state",
      "_suppressScrollTsUntil",
      "_lastScrollFrameTop",
      "syncVirtualWindow",
      "updateScrollUiOnFrame",
      `${sliceFunc(appJs, "captureTocSearchView")}\n${sliceFunc(appJs, "restoreTocSearchView")}\nreturn { captureTocSearchView, restoreTocSearchView };`
    )(
      docStub,
      { feedWrap: fw },
      testState,
      0,
      scrollTop,
      () => {
        synced = true;
      },
      () => {
        uiUpdated = true;
      }
    );

    const view = fns.captureTocSearchView();
    if (view && postMainRect) {
      activeMain = makeMockNode({ tag: "DIV", cls: ["toc-wrap"], rect: postMainRect });
      activeMain.offsetHeight = postMainRect.height;
      activeMap = makeMockNode({ tag: "SECTION", cls: ["cache-map-card"], rect: postMainRect });
      const postDet = makeMockNode({ tag: "DETAILS", cls: ["cache-map-details"], rect: postMainRect });
      postDet.open = true;
      activeMap.append(postDet.append(activeMain));
      fw.scrollTop = 0;
      fns.restoreTocSearchView(view);
    }
    return { view, finalScrollTop: fw.scrollTop, userScrolledUp: testState.userScrolledUp, synced, uiUpdated };
  };

  // Case A: At top looking at TOC -> search shrinks TOC & feed grows tall -> must stay at scrollTop 0, NOT jump to bottom
  const resA = runTocHarness({
    scrollTop: 0,
    mapRect: { top: 62, bottom: 520, height: 458 },
    mainRect: { top: 150, bottom: 450, height: 300 },
    postMainRect: { top: 150, bottom: 225, height: 75 },
    scrollHeight: 3200,
    clientHeight: 800,
  });
  assert.ok(resA.view && resA.view.inView && resA.view.headVisible, "Top TOC must be detected as in view");
  assert.equal(resA.finalScrollTop, 0, "Searching while at top TOC must keep scrollTop at 0");
  assert.equal(resA.userScrolledUp, true, "Must lock userScrolledUp so follow mode does not jump away from TOC");
  assert.ok(resA.synced && resA.uiUpdated);

  // Case B: Scrolled partway into TOC rows (scrollTop=260), search shrinks .toc-wrap from bottom 450 to 185 -> must clamp scrollTop cleanly to keep TOC visible
  const resB = runTocHarness({
    scrollTop: 260,
    mapRect: { top: -198, bottom: 260, height: 458 },
    mainRect: { top: 50, bottom: 210, height: 160 },
    postMainRect: { top: 160, bottom: 235, height: 75 },
    scrollHeight: 2400,
    clientHeight: 800,
  });
  assert.ok(resB.view && resB.view.inView && !resB.view.headVisible, "Partially scrolled TOC with >=48px .toc-wrap visible must count as in view");
  assert.equal(resB.finalScrollTop, 110, "Shrunken TOC must pull scrollTop up from 260 to 110 so filtered TOC stays visible");

  // Case C: Scrolled past TOC to read cards (only checkboxes strip barely above/at top) -> must NOT hijack card anchoring
  const resC = runTocHarness({
    scrollTop: 900,
    mapRect: { top: -400, bottom: 78, height: 478 },
    mainRect: { top: -320, bottom: 30, height: 350 },
    postMainRect: null,
  });
  assert.equal(resC.view, null, "When .toc-wrap is above viewport and only bottom options strip peeks, TOC must NOT override card anchor");
}

// 15. Command Map: accurate outcome stats (ok/err/other + background completion + attach=false parity), file collection, focused turn trimming & reveal button
{
  const bgTidOk = "b1111111-1111-1111-1111-111111111111/task-1";
  const bgTidErr = "b1111111-1111-1111-1111-111111111111/task-2";
  const bgTidRun = "b1111111-1111-1111-1111-111111111111/task-3";
  const cmSteps = [
    {
      step_index: 10,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      thinking: "Check files and run checks",
      tool_calls: [
        { name: "read_file", args: { AbsolutePath: "C:\\proj\\server.py" } },
        { name: "run_command", args: { CommandLine: "python server.py --check" } },
        { name: "run_command", args: { CommandLine: "pytest -q" } },
        { name: "run_command", args: { CommandLine: "long_task" } },
      ],
      content: "Summary after tools.",
    },
    { step_index: 11, type: "GENERIC", status: "DONE", content: "1: print('ok')" },
    { step_index: 12, type: "GENERIC", status: "RUNNING", content: `Tool is running as a background task with task id: ${bgTidOk}\nCommand output:\nstarted` },
    { step_index: 13, type: "GENERIC", status: "RUNNING", content: `Tool is running as a background task with task id: ${bgTidErr}\nCommand output:\nstarted` },
    { step_index: 14, type: "GENERIC", status: "RUNNING", content: `Tool is running as a background task with task id: ${bgTidRun}\nCommand output:\nstill going` },
    { step_index: 15, type: "SYSTEM_MESSAGE", content: `<SYSTEM_MESSAGE>\n[Message] sender=${bgTidOk} content=Task id "${bgTidOk}" finished with result:\nCommand exited with code 0.\n</SYSTEM_MESSAGE>` },
    { step_index: 16, type: "SYSTEM_MESSAGE", content: `<SYSTEM_MESSAGE>\n[Message] sender=${bgTidErr} content=Task id "${bgTidErr}" finished with result:\nCommand exited with code 1.\n</SYSTEM_MESSAGE>` },
    {
      step_index: 20,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      tool_calls: [{ name: "edit_file", args: { TargetFile: "C:\\proj\\app.js" } }],
    },
    { step_index: 21, type: "GENERIC", status: "ERROR", content: "Encountered error in step execution: TargetContent not found" },
  ];

  api.state.steps = cmSteps;
  api.buildStepMetadataAndTaskIndex(cmSteps);

  // Statistics must be accurate even when attachToolOutputs === false
  api.state.attachToolOutputs = false;
  const stats = api.buildCommandMapStats();
  const rcStat = stats.toolStats.get("run_command");
  const rfStat = stats.toolStats.get("read_file");
  const efStat = stats.toolStats.get("edit_file");
  assert.deepEqual(
    { total: rcStat.total, ok: rcStat.ok, err: rcStat.err, other: rcStat.other },
    { total: 3, ok: 1, err: 1, other: 1 },
    "run_command stats must resolve background exit 0 (ok), exit 1 (err), and unfinished task (other) even when attachToolOutputs=false"
  );
  assert.equal(rcStat.ok + rcStat.err + rcStat.other, rcStat.total, "ok + err + other must strictly equal total");
  assert.ok(rfStat.files.has("server.py"), "read_file AbsolutePath basename must be collected in Command Map files");
  assert.equal(efStat.ok, 0);
  assert.equal(efStat.err, 1);
  assert.ok(efStat.files.has("app.js"), "edit_file TargetFile basename must be collected");

  // Standalone GENERIC output matching when detached
  api.state.cmdMapKeys = new Set(["tool:edit_file:err"]);
  api.state.cmdMapFilterOnly = true;
  assert.ok(api.getStepMatchingCmdKeys(cmSteps[8], null).includes("edit_file ⚠"), "Detached GENERIC error step must match tool:edit_file:err");
  assert.equal(api.stepMatchesFilter(cmSteps[7], null), true, "Caller step #20 must match tool:edit_file:err via stepPairedOutputsMap");
  assert.equal(api.stepMatchesFilter(cmSteps[0], null), false, "Step #10 without edit_file error must be filtered out");

  // Subtype sub:errors must also catch background exit 1
  api.state.cmdMapKeys = new Set(["sub:errors"]);
  assert.ok(api.getStepMatchingCmdKeys(cmSteps[0], null).includes("sub:errors"), "sub:errors must match turn containing background exit 1");

  // Reset attachToolOutputs for DOM trimming test
  api.state.attachToolOutputs = true;

  // Functional simulation of applyCmdMapFocusTrim()
  const trimCardDoc = {
    createElement: (tag) => makeMockNode({ tag }),
  };
  const cmdCard = makeMockNode({ tag: "ARTICLE", cls: ["step", "type-PLANNER_RESPONSE"], dataset: { stepIndex: "10" } });
  const cmdBody = makeMockNode({ tag: "DIV", cls: ["step-body"] });
  const thinkDet = makeMockNode({ tag: "DETAILS", cls: ["block", "block-thinking"] });
  const toolsDet = makeMockNode({ tag: "DETAILS", cls: ["block", "block-tools"] });
  const toolsBody = makeMockNode({ tag: "DIV", cls: ["block-body"] });
  const tc0 = makeMockNode({ tag: "DIV", cls: ["tool-card"], dataset: { toolIdx: "0" } }); // read_file
  const tc1 = makeMockNode({ tag: "DIV", cls: ["tool-card"], dataset: { toolIdx: "1" } }); // run_command (ok)
  const tc2 = makeMockNode({ tag: "DIV", cls: ["tool-card"], dataset: { toolIdx: "2" } }); // run_command (err)
  const tc3 = makeMockNode({ tag: "DIV", cls: ["tool-card"], dataset: { toolIdx: "3" } }); // run_command (other)
  const mdFinal = makeMockNode({ tag: "DIV", cls: ["md"] });
  cmdCard.append(cmdBody.append(thinkDet, toolsDet.append(toolsBody.append(tc0, tc1, tc2, tc3)), mdFinal));

  const trimState = {
    cmdMapFilterOnly: true,
    cmdMapFocusedOnly: true,
    cmdMapKeys: new Set(["tool:run_command:err"]),
    stepQuery: "",
    searchFocusedOnly: true,
  };
  const runTrim = new Function(
    "document",
    "state",
    "t",
    "preserveScrollAnchor",
    "scheduleCardOverflowCheck",
    "requestAnimationFrame",
    "scheduleMinimapSync",
    "cardAttachedMap",
    "stepPairedOutputsMap",
    "stepTaskMetaMap",
    "taskIndexMap",
    "stepErrCache",
    "unescapeNewlines",
    `${sliceFunc(appJs, "isCommandErrorStep")}\n${sliceFunc(appJs, "getBgTaskResultOutcome")}\n${sliceFunc(appJs, "classifyToolCallOutcome")}\n${sliceFunc(appJs, "doesToolCallMatchCmdKeys")}\n${sliceFunc(appJs, "attachSearchRevealBar")}\n${sliceFunc(appJs, "applyCmdMapFocusTrim")}\nreturn applyCmdMapFocusTrim;`
  )(
    trimCardDoc,
    trimState,
    (k, vars) => (k === "card.searchRevealTurn" ? `Show full (${vars.count})` : `Collapse (${vars.count})`),
    (fn) => fn(),
    () => {},
    () => {},
    () => {},
    new WeakMap(),
    api.stepPairedOutputsMap,
    api.stepTaskMetaMap,
    api.taskIndexMap,
    new WeakMap(),
    (s) => String(s || "").replace(/\r\n/g, "\n")
  );

  runTrim(cmdCard, cmSteps[0], [cmSteps[1], cmSteps[2], cmSteps[3], cmSteps[4]]);
  assert.ok(thinkDet.classList.contains("search-omitted"), "Thinking block must be omitted when filtering by tool:run_command:err");
  assert.ok(mdFinal.classList.contains("search-omitted"), "Prose .md block must be omitted when filtering by tool:run_command:err");
  assert.ok(tc0.classList.contains("search-omitted"), "Sibling read_file must be omitted");
  assert.ok(tc1.classList.contains("search-omitted"), "Passing run_command must be omitted when filtering strictly by :err");
  assert.ok(!tc2.classList.contains("search-omitted") && tc2.classList.contains("search-hit-target"), "Failing run_command must remain visible & highlighted");
  assert.ok(tc3.classList.contains("search-omitted"), "Pending run_command must be omitted when filtering strictly by :err");
  assert.ok(cmdCard.classList.contains("has-search-omitted"), "Card must get .has-search-omitted");

  const revealBtn = cmdCard.querySelector(".search-reveal-btn");
  assert.ok(revealBtn, "Card must render local reveal button for omitted blocks & sibling tools");
  assert.equal(revealBtn.textContent, "Show full (5)", "Omitted count must equal 1 thinking + 3 sibling tools + 1 .md = 5");
  revealBtn.click();
  assert.ok(cmdCard.classList.contains("is-search-untrimmed"), "Clicking reveal button must expand omitted blocks locally");
  assert.equal(revealBtn.textContent, "Collapse (5)", "Clicking reveal button must toggle label to collapse");
  revealBtn.click();
  assert.ok(!cmdCard.classList.contains("is-search-untrimmed"), "Clicking again must collapse back to selected command only");

  // Whole-turn guard: type:PLANNER_RESPONSE alone must never hide all children
  const guardCard = makeMockNode({ tag: "ARTICLE", cls: ["step", "type-PLANNER_RESPONSE"] });
  const guardBody = makeMockNode({ tag: "DIV", cls: ["step-body"] });
  const guardThink = makeMockNode({ tag: "DETAILS", cls: ["block-thinking"] });
  guardCard.append(guardBody.append(guardThink));
  trimState.cmdMapKeys = new Set(["type:PLANNER_RESPONSE"]);
  runTrim(guardCard, cmSteps[0], null);
  assert.ok(!guardThink.classList.contains("search-omitted"), "Filtering by type:PLANNER_RESPONSE alone must never empty card body");

  // UI/HTML/CSS defaults check
  const styleCss = fs.readFileSync(path.resolve(__dirname, "..", "static", "style.css"), "utf8");
  assert.ok(indexHtml.includes('id="cmdMapFocusedOnly" checked'), "index.html must enable #cmdMapFocusedOnly by default");
  assert.ok(appJs.includes('localStorage.getItem("tv_cmd_map_focused")') && appJs.includes("cmdMapFocusedOnly: true"), "app.js must default cmdMapFocusedOnly=true and persist tv_cmd_map_focused");
  assert.ok(styleCss.includes(".cmd-sub-check.is-checked") && styleCss.includes(".cmd-sub-check.is-other") && !styleCss.includes(":has("), "style.css must style checked/other cmd-map pills without CSS :has()");
}

// 16. Fresh Turn Blinking Frame: deferred countdown while hidden/offscreen, starts pulse once visible, clears on expiry
{
  let fakeNow = 10_000;
  const origDateNow = Date.now;
  Date.now = () => fakeNow;
  try {
    const fwNode = makeMockNode({ tag: "DIV", cls: ["feed-wrap"], rect: { top: 0, bottom: 600, height: 600 }, clientH: 600 });
    const cVis = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "201" }, rect: { top: 420, bottom: 560, height: 140 } });
    const cOff = makeMockNode({ tag: "ARTICLE", cls: ["step"], dataset: { stepIndex: "202" }, rect: { top: 750, bottom: 900, height: 150 } });
    const vWin = makeMockNode({ tag: "DIV", cls: ["v-window"] });
    vWin.append(cVis, cOff);
    fwNode.append(vWin);

    const mockDoc = { visibilityState: "hidden" };
    const freshApi = new Function(
      "document",
      "els",
      "_vWindow",
      `
      ${sliceFunc(appJs, "clearFreshPulses")}
      ${sliceFunc(appJs, "markFreshSteps")}
      ${sliceFunc(appJs, "isStepFreshNow")}
      ${sliceFunc(appJs, "syncCardFreshPulse")}
      ${sliceFunc(appJs, "scheduleFreshPulseCleanup")}
      ${sliceFunc(appJs, "activateVisibleFreshPulses")}
      const FRESH_PULSE_DURATION_MS = 4500;
      const FRESH_PENDING_MAX = 120;
      const _freshPendingKeys = new Set();
      const _freshActiveUntilMap = new Map();
      let _freshCleanupTimer = 0;
      return { clearFreshPulses, markFreshSteps, isStepFreshNow, syncCardFreshPulse, activateVisibleFreshPulses, _freshPendingKeys, _freshActiveUntilMap };
      `
    )(mockDoc, { feedWrap: fwNode }, vWin);

    freshApi.markFreshSteps(["201", "202"]);
    freshApi.activateVisibleFreshPulses();
    assert.ok(cVis.classList.contains("step-new-pulse") && cOff.classList.contains("step-new-pulse"), "Fresh cards must display highlight frame right on arrival");
    assert.equal(freshApi._freshPendingKeys.size, 2, "Countdown must NOT start while tab is hidden in background");

    // Advance 20 seconds in background, then switch back to visible tab
    fakeNow += 20_000;
    mockDoc.visibilityState = "visible";
    freshApi.activateVisibleFreshPulses();
    assert.ok(!freshApi._freshPendingKeys.has("201") && freshApi._freshActiveUntilMap.get("201") === fakeNow + 4500, "Visible card countdown must start when user switches back to tab");
    assert.ok(freshApi._freshPendingKeys.has("202"), "Off-viewport card must remain pending until scrolled into view");

    // Advance past 4500ms -> card 201 stops blinking, off-screen 202 still waits until scrolled into view
    fakeNow += 4600;
    freshApi.activateVisibleFreshPulses();
    assert.ok(!cVis.classList.contains("step-new-pulse"), "Card 201 pulse must stop cleanly after ~4.5s");
    assert.ok(cOff.classList.contains("step-new-pulse"), "Off-screen card 202 must stay queued until user scrolls to it");

    // Scroll card 202 into view
    cOff.getBoundingClientRect = () => ({ top: 150, bottom: 300, height: 150, left: 0, right: 800, width: 800 });
    freshApi.activateVisibleFreshPulses();
    assert.ok(!freshApi._freshPendingKeys.has("202") && cOff.classList.contains("step-new-pulse"), "Card 202 starts 4.5s countdown once scrolled into viewport");

    fakeNow += 4600;
    freshApi.activateVisibleFreshPulses();
    assert.ok(!cOff.classList.contains("step-new-pulse"), "Card 202 pulse expires cleanly after being seen");
  } finally {
    Date.now = origDateNow;
  }
}

// 17. Hotkey Ctrl+' / Ctrl+э, non-draggable auto-links, search scroll to .diff-line, & StartLine spacing
{
  const styleCss = fs.readFileSync(path.resolve(__dirname, "..", "static", "style.css"), "utf8");
  assert.ok(appJs.includes('e.code === "Quote"') && appJs.includes('applyComposerCollapsed(willCollapse)'), "app.js must bind Ctrl+' / Ctrl+э via e.code === 'Quote' to toggle composer");
  assert.ok(styleCss.includes("@keyframes stepNewPulse") && styleCss.includes("prefers-reduced-motion"), "style.css must define @keyframes stepNewPulse and reduced-motion override");
  assert.ok(styleCss.includes("-webkit-user-drag: none") && appJs.includes("a.draggable = false"), "Auto-links must disable native link dragging so edit_file/tool paths stay text-selectable");
  assert.ok(appJs.includes('.diff-line, .arg-row-inline') && !appJs.includes('firstMark.closest(".code-gutter-row, .md-gutter-row, .arg-row,'), "applyInitialSearchScrolls must target .diff-line instead of jumping back to outer .arg-row header");
  assert.ok(appJs.includes('node.classList.contains("arg-row-stacked")'), "serializeFeedSelectionRange must preserve space between .arg-key and .arg-val-inline in stacked rows like StartLine 4415");
  assert.ok(appJs.includes("node.nodeType !== 1 && node.nodeType !== 11"), "collectInlineMetaText must descend into DocumentFragment (nodeType 11) when copying inside .tool-head / pills like edit_file");

  // Single-pill / inline header copy test with nodeType=11 DocumentFragment (selecting just `edit_file`)
  const serializeFn = new Function(`return (${sliceFunc(appJs, "serializeFeedSelectionRange")});`)();
  const makeCopyNode = (nodeType, { tag = "SPAN", cls = [], text = "", kids = [] } = {}) => {
    const clsSet = new Set(cls);
    const n = {
      nodeType,
      tagName: tag,
      nodeValue: nodeType === 3 ? text : null,
      parentElement: null,
      childNodes: kids,
      classList: { contains: (c) => clsSet.has(c) },
      matches: (sel) =>
        sel.split(",").some((s) => {
          const t = s.trim();
          if (t.startsWith(".")) return clsSet.has(t.slice(1).split(":")[0]);
          return tag.toLowerCase() === t.toLowerCase();
        }),
      closest: (sel) => {
        let cur = n;
        while (cur) {
          if (cur.nodeType === 1 && cur.matches(sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelector: () => null,
    };
    for (const k of kids) k.parentElement = n;
    return n;
  };
  const pillText = makeCopyNode(3, { text: "edit_file" });
  const pillSpan = makeCopyNode(1, { tag: "SPAN", cls: ["tool-name"], kids: [pillText] });
  const headDiv = makeCopyNode(1, { tag: "DIV", cls: ["tool-head"], kids: [pillSpan] });
  const fragText = makeCopyNode(3, { text: "edit_file" });
  const fragPill = makeCopyNode(1, { tag: "SPAN", cls: ["tool-name"], kids: [fragText] });
  const fragRoot = makeCopyNode(11, { tag: "", kids: [fragPill] });
  const singlePillCopy = serializeFn({
    commonAncestorContainer: pillText,
    cloneContents: () => fragRoot,
  });
  assert.equal(singlePillCopy, "edit_file", "Selecting just the edit_file pill inside .tool-head must copy 'edit_file' instead of empty string");
}

// 18. Search specificity inside active Command Map selection & focused turn trimming
{
  const stepA = {
    step_index: 501,
    type: "PLANNER_RESPONSE",
    source: "MODEL",
    status: "DONE",
    thinking: "Hidden thinking mentions needle_target and timeout_flag",
    content: "Hidden intermediate prose mentions needle_target",
    tool_calls: [
      { name: "read_file", args: { Path: "needle_target.py", Note: "timeout_flag" } },
      { name: "run_command", args: { CommandLine: "echo clean_ok" } },
    ],
  };
  const outA0 = { step_index: 502, type: "GENERIC", status: "DONE", content: "needle_target from read_file" };
  const outA1 = { step_index: 503, type: "GENERIC", status: "DONE", content: "Exit code: 0\nclean_ok" };

  const stepB = {
    step_index: 504,
    type: "PLANNER_RESPONSE",
    source: "MODEL",
    status: "DONE",
    thinking: "Thinking also mentions needle_target early",
    tool_calls: [
      { name: "read_file", args: { Path: "needle_target_ignored.py" } },
      { name: "run_command", args: { CommandLine: "pytest needle_target.py" } },
    ],
  };
  const outB0 = { step_index: 505, type: "GENERIC", status: "DONE", content: "needle_target in hidden read_file" };
  const outB1 = { step_index: 506, type: "GENERIC", status: "DONE", content: "Exit code: 0\nneedle_target passed" };

  const prevSteps = api.state.steps;
  const prevAttached = api.state.attachToolOutputs;
  const prevFilterOnly = api.state.cmdMapFilterOnly;
  const prevFocusedOnly = api.state.cmdMapFocusedOnly;
  const prevKeys = api.state.cmdMapKeys;
  const prevQuery = api.state.stepQuery;
  const prevWholeTurn = api.state.searchAcrossWholeTurn;
  const prevSearchFocused = api.state.searchFocusedOnly;

  try {
    api.state.steps = [stepA, outA0, outA1, stepB, outB0, outB1];
    api.state.attachToolOutputs = true;
    api.buildStepMetadataAndTaskIndex(api.state.steps);
    const { attachedByPlanner } = api.pairToolOutputs(api.state.steps);
    const attA = attachedByPlanner.get(stepA);
    const attB = attachedByPlanner.get(stepB);

    api.state.cmdMapFilterOnly = true;
    api.state.cmdMapFocusedOnly = true;
    api.state.cmdMapKeys = new Set(["tool:run_command"]);

    // 18a. Query hitting only hidden thinking/read_file/content must NOT match stepA
    api.state.stepQuery = "needle_target";
    api.state.searchAcrossWholeTurn = false;
    assert.equal(api.stepMatchesFilter(stepA, attA), false, "Hidden read_file/thinking/prose must NOT match when only run_command is shown");
    assert.equal(api.stepMatchesFilter(stepB, attB), true, "Visible run_command containing needle_target must match");

    // 18b. Even with searchAcrossWholeTurn=true, hidden blocks cannot bridge a query across visible run_command
    api.state.searchAcrossWholeTurn = true;
    assert.equal(api.stepMatchesFilter(stepA, attA), false, "Across-whole-turn must also exclude hidden blocks under focused Command Map");
    api.state.stepQuery = "needle_target clean_ok";
    assert.equal(api.stepMatchesFilter(stepA, attA), false, "Hidden thinking + visible run_command must NOT combine when focused Command Map is active");

    // 18c. Pure negation skips hidden blocks too
    api.state.searchAcrossWholeTurn = false;
    api.state.stepQuery = "!timeout_flag";
    assert.equal(api.stepMatchesFilter(stepA, attA), true, "Pure negation !timeout_flag must ignore timeout_flag in hidden read_file");

    // 18d. TOC snippet must quote visible [run_command], never [thinking] or [read_file]
    api.state.stepQuery = "needle_target";
    const snipB = api.extractMatchSnippet(stepB, "needle_target", attB);
    assert.ok(snipB.startsWith("[run_command]"), `TOC snippet must quote visible [run_command], got: ${snipB}`);
    assert.ok(!snipB.includes("[thinking]") && !snipB.includes("[read_file]"), "TOC snippet must never quote hidden blocks");

    // 18e. When cmdMapFocusedOnly=false (full cards displayed), hidden-in-focused blocks match normally
    api.state.cmdMapFocusedOnly = false;
    assert.equal(api.stepMatchesFilter(stepA, attA), true, "Full step mode (cmdMapFocusedOnly=false) searches all blocks of matched cards");

    // 18f. When only step-level key (type:PLANNER_RESPONSE) is checked with cmdMapFocusedOnly=true, whole card stays searchable
    api.state.cmdMapFocusedOnly = true;
    api.state.cmdMapKeys = new Set(["type:PLANNER_RESPONSE"]);
    assert.equal(api.getStepCmdMapScope(stepA, attA).restricted, false);
    assert.equal(api.stepMatchesFilter(stepA, attA), true, "Step-level type filter keeps entire turn searchable");

    // 18g. Highlight + trim invariants on DOM cards
    assert.ok(appJs.includes("isUnitScopeAllowedByCmdMap("), "highlightMatches must restrict text runs and unit scopes to Command-Map-visible blocks");
    assert.ok(appJs.includes("getVisibleTurnSearchUnits(") && appJs.includes("getVisibleTurnSearchBlob("), "stepMatchesFilter must evaluate only Command-Map-visible units/blob");
  } finally {
    api.state.steps = prevSteps;
    api.state.attachToolOutputs = prevAttached;
    api.state.cmdMapFilterOnly = prevFilterOnly;
    api.state.cmdMapFocusedOnly = prevFocusedOnly;
    api.state.cmdMapKeys = prevKeys;
    api.state.stepQuery = prevQuery;
    api.state.searchAcrossWholeTurn = prevWholeTurn;
    api.state.searchFocusedOnly = prevSearchFocused;
    api.buildStepMetadataAndTaskIndex(prevSteps);
  }
}

// 19. Quote-to-composer formatting (latest session vs older project/session context) + #quoteToComposerBtn left of LOG
{
  const sameSessionQuote = api.formatQuoteForComposer({
    text: "Traceback line 1\n  detail 2",
    startStep: 42,
    endStep: 42,
    activeId: "conv-latest-111",
    latestId: "conv-latest-111",
    project: "transcript_viewer",
    latestProject: "transcript_viewer",
    projectRoot: "/repo/transcript_viewer",
    logPath: "/logs/conv-latest-111/transcript_full.jsonl",
  });
  assert.equal(
    sameSessionQuote,
    "[Step #42]\n> Traceback line 1\n>   detail 2",
    "Active latest session quote uses concise [Step #N] + blockquote without @[Quote]"
  );
  assert.ok(!sameSessionQuote.includes("@[Quote"), "Must never emit internal @[Quote] token");

  const multiStepQuote = api.formatQuoteForComposer({
    text: "first line\n\nlast line",
    startStep: 41,
    endStep: 43,
    activeId: "conv-latest-111",
    latestId: "conv-latest-111",
  });
  assert.equal(multiStepQuote, "[Steps #41–#43]\n> first line\n>\n> last line");

  const otherProjectQuote = api.formatQuoteForComposer({
    text: "Token monitor alert",
    startStep: 118,
    endStep: 118,
    activeId: "conv-old-222",
    latestId: "conv-latest-111",
    project: "gcp-token-monitor",
    latestProject: "transcript_viewer",
    projectRoot: "/repo/gcp-token-monitor",
    logPath: "/logs/conv-old-222/transcript_full.jsonl",
    title: "Monitor Fix",
  });
  assert.ok(otherProjectQuote.startsWith("[Project: gcp-token-monitor · Step #118]\n"));
  assert.ok(otherProjectQuote.includes("📁 Project root: /repo/gcp-token-monitor\n"));
  assert.ok(otherProjectQuote.includes("📄 Log: /logs/conv-old-222/transcript_full.jsonl («Monitor Fix»)\n"));
  assert.ok(otherProjectQuote.endsWith("\n> Token monitor alert"));

  const olderSameProjectQuote = api.formatQuoteForComposer({
    text: "Yesterday note",
    startStep: 2823,
    endStep: 2823,
    activeId: "conv-old-333",
    latestId: "conv-latest-111",
    project: "transcript_viewer",
    latestProject: "transcript_viewer",
    projectRoot: "/repo/transcript_viewer",
    logPath: "/logs/conv-old-333/transcript_full.jsonl",
  });
  assert.ok(olderSameProjectQuote.startsWith("[Previous session · Project: transcript_viewer · Step #2823]\n"));
  assert.ok(olderSameProjectQuote.includes("📄 Log: /logs/conv-old-333/transcript_full.jsonl\n"));

  const qIdx = indexHtml.indexOf('id="quoteToComposerBtn"');
  const logIdx = indexHtml.indexOf('id="toggleComposerTraceBtn"');
  assert.ok(qIdx !== -1 && logIdx !== -1 && qIdx < logIdx, "#quoteToComposerBtn must sit inside #composerLogRow directly left of LOG");
}

console.log("ALL VIEWER FEATURE UNIT TESTS PASSED!");
