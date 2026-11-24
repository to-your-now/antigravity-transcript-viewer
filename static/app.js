(() => {
  "use strict";

  const state = {
    lang: "en",
    transcripts: [],
    activeId: null,
    steps: [],
    offset: 0,
    eventSource: null,
    filter: "all",       // all | dialog | errors
    stepQuery: "",
    searchFocusedOnly: true,
    searchAcrossWholeTurn: false,
    searchWholeWord: false,
    searchCaseSensitive: false,
    sidebarQuery: "",
    projectFilter: "",
    userScrolledUp: false,
    totals: { inTok: 0, cacheTok: 0, outTok: 0 },
    attachToolOutputs: true,
    expandAllOutputs: false,
    monoOutputs: true,
    readDisplayMode: "scroll", // scroll (18 lines) | full | hide
    onlyCmdErrors: false,
    cmdMapFilterOnly: false,
    cmdMapKeys: new Set(),
    disableAutoLinks: false,
    folderOpenMode: "browser",   // browser | explorer | totalcmd | system
    fileOpenMode: "ask",         // ask | browser_fmt | browser_raw | system
    linkifyProjectFiles: true,
    detailsDefaultOpen: true,
    capabilities: {
      os: "unknown",
      is_windows: true,
      is_macos: false,
      antigravity_paste: true,
      open_explorer: true,
      open_totalcmd: true,
      open_notepadpp: true,
      open_folder_os: true,
      open_file_os: true,
    },
    brainDir: "",
    activeLogPath: "",
    projectRoot: "",
    projectFiles: [],
    projectDirs: new Set(),
    activeMeta: null,
    suppressScrollCheck: false,
    firstUnreadStepIndex: null,
    userTzOffsetMin: null,
    userTzSource: "browser",
    userTzCalibSample: "",
  };

  const els = {
    appRoot: document.querySelector(".app"),
    collapseSidebarBtn: document.getElementById("collapseSidebarBtn"),
    expandSidebarBtn: document.getElementById("expandSidebarBtn"),
    transcriptCount: document.getElementById("transcriptCount"),
    transcriptList: document.getElementById("transcriptList"),
    refreshListBtn: document.getElementById("refreshListBtn"),
    sidebarSearch: document.getElementById("sidebarSearch"),
    projectFilter: document.getElementById("projectFilter"),
    convTitle: document.getElementById("convTitle"),
    convMeta: document.getElementById("convMeta"),
    langSelect: document.getElementById("langSelect"),
    livePill: document.getElementById("livePill"),
    liveText: document.getElementById("liveText"),
    followToggle: document.getElementById("followToggle"),
    searchBoxWrap: document.getElementById("searchBoxWrap"),
    stepSearch: document.getElementById("stepSearch"),
    searchOptsBtn: document.getElementById("searchOptsBtn"),
    searchPopover: document.getElementById("searchPopover"),
    onlyCmdErrorsToggle: document.getElementById("onlyCmdErrorsToggle"),
    expandAllBtn: document.getElementById("expandAllBtn"),
    collapseAllBtn: document.getElementById("collapseAllBtn"),
    sessionStats: document.getElementById("sessionStats"),
    feedWrap: document.getElementById("feedWrap"),
    feed: document.getElementById("feed"),
    promptMinimap: document.getElementById("promptMinimap"),
    minimapPreview: document.getElementById("minimapPreview"),
    jumpTopBtn: document.getElementById("jumpTopBtn"),
    jumpBottomBtn: document.getElementById("jumpBottomBtn"),
    lightbox: document.getElementById("lightbox"),
    lightboxImg: document.getElementById("lightboxImg"),
    themeToggle: document.getElementById("themeToggle"),
    tooltip: document.getElementById("tooltip"),
    jumpMapBtn: document.getElementById("jumpMapBtn"),
    composerForm: document.getElementById("composerForm"),
    promptInput: document.getElementById("promptInput"),
    composerStatus: document.getElementById("composerStatus"),
    composerSendBtn: document.getElementById("composerSendBtn"),
    collapseHeaderBtn: document.getElementById("collapseHeaderBtn"),
    floatingTopBar: document.getElementById("floatingTopBar"),
    floatingSidebarBtn: document.getElementById("floatingSidebarBtn"),
    expandHeaderBtn: document.getElementById("expandHeaderBtn"),
    collapseComposerBtn: document.getElementById("collapseComposerBtn"),
    expandComposerBtn: document.getElementById("expandComposerBtn"),
    composerResizer: document.getElementById("composerResizer"),
    openCmdMapBtn: document.getElementById("openCmdMapBtn"),
    cmdMapModal: document.getElementById("cmdMapModal"),
    cmdMapBody: document.getElementById("cmdMapBody"),
    cmdMapFilterOnly: document.getElementById("cmdMapFilterOnly"),
    cmdMapSelectAll: document.getElementById("cmdMapSelectAll"),
    cmdMapClear: document.getElementById("cmdMapClear"),
    cmdMapClose: document.getElementById("cmdMapClose"),
    fileOpenModal: document.getElementById("fileOpenModal"),
    fileOpenTitle: document.getElementById("fileOpenTitle"),
    fileOpenPathPreview: document.getElementById("fileOpenPathPreview"),
    fileOpenCopyPathBtn: document.getElementById("fileOpenCopyPathBtn"),
    fileOpenCloseBtn: document.getElementById("fileOpenCloseBtn"),
    fileOpenRememberCheck: document.getElementById("fileOpenRememberCheck"),
    fileOpenNotepadChoice: document.getElementById("fileOpenNotepadChoice"),
    fileOpenSystemChoice: document.getElementById("fileOpenSystemChoice"),
  };

  const _i18nCache = {};
  let _localeData = {};
  let _fallbackLocaleData = {};

  function _getNestedI18n(obj, key) {
    if (!obj || !key) return undefined;
    const parts = String(key).split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) {
        cur = cur[p];
      } else {
        return undefined;
      }
    }
    return typeof cur === "string" ? cur : undefined;
  }

  function t(key, vars = null) {
    let val = _getNestedI18n(_localeData, key);
    if (val === undefined) val = _getNestedI18n(_fallbackLocaleData, key);
    if (val === undefined) val = key;
    if (vars && typeof vars === "object") {
      for (const [k, v] of Object.entries(vars)) {
        val = val.split(`{${k}}`).join(v === undefined || v === null ? "" : String(v));
      }
    }
    return val;
  }

  function tDoc(group, itemKey, fallbackKey) {
    const val =
      _localeData?.docs?.[group]?.[itemKey] ??
      _fallbackLocaleData?.docs?.[group]?.[itemKey];
    return typeof val === "string" ? val : t(fallbackKey);
  }

  async function loadLocale(lang) {
    const code = lang === "ru" ? "ru" : "en";
    const fetchCode = async (c) => {
      if (_i18nCache[c]) return _i18nCache[c];
      try {
        const res = await fetch(`/static/i18n/${c}.json`, { cache: "no-cache" });
        if (res.ok) {
          const data = await res.json();
          _i18nCache[c] = data;
          return data;
        }
      } catch (_) {}
      return null;
    };
    const enData = await fetchCode("en");
    if (enData) _fallbackLocaleData = enData;
    const targetData = code === "en" ? enData : await fetchCode(code);
    _localeData = targetData || enData || {};
    state.lang = code;
    document.documentElement.lang = code;
    if (els.langSelect) els.langSelect.value = code;
    try {
      localStorage.setItem("tv_lang", code);
    } catch (_) {}
    return code;
  }

  function applyStaticTranslations() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (k) el.textContent = t(k);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const k = el.getAttribute("data-i18n-title");
      if (k) el.setAttribute("title", t(k));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const k = el.getAttribute("data-i18n-placeholder");
      if (k) el.setAttribute("placeholder", t(k));
    });
    if (els.promptMinimap) {
      els.promptMinimap.setAttribute("title", t("minimap.trackTitle"));
    }
  }

  const rawStepMap = new WeakMap();
  const stepModelMap = new WeakMap();
  let stepToolMetaMap = new WeakMap();
  let taskIndexMap = new Map();
  let stepTaskMetaMap = new WeakMap();
  const notchItemMap = new WeakMap();
  const mdFenceBlocksMap = new WeakMap();
  const stepErrCache = new WeakMap();
  const toolArgsReplaceRowMap = new WeakMap();
  let minimapMetaCache = new WeakMap();
  const _vElToItemMap = new WeakMap();
  const cardOverflowChecksMap = new WeakMap();
  let stepSearchBlobCache = new WeakMap();
  let stepSearchUnitsCache = new WeakMap();
  let _lastDetectedModel = "";
  let _suppressHashChange = false;
  let _pendingNavStep = "";
  let _activeLoadSeq = 0;
  const _vStepToItemMap = new Map();  // String(step_index) -> vItem (including attached GENERICs)
  const userNotchByStep = new Map();      // String(step_index) -> minimap notch
  const _lruMap = new Map();              // LRU of vItems holding offscreen rendered DOM nodes
  const _highlightedCards = new Set();    // cards currently containing <mark class="hl">
  const CARD_GAP = 12;
  const CARD_LRU_MAX = 96;
  const PREWARM_SIDE_BYTES = 1048576;     // +/- 1 MB detached LRU prewarm
  let _vItems = [];                       // virtual feed items: { idx, kind, step, attached, ... }
  let _vTotalHeight = 0;
  let _vListBox = null;
  let _vSpacerTop = null;
  let _vWindow = null;
  let _vSpacerBottom = null;
  let _winStart = 0;
  let _winEnd = -1;
  let _tocBaseCache = null;            // { activeId, stepsLen, tzMin, hasTokBars, barsHtml, rowsHtml, count }
  let _tocDirty = false;
  let _userNotchCoords = [];           // Sorted [{ top, bottom, notch }] for O(log N) scroll highlight
  let _lastUserScrollMs = 0;
  let _suppressScrollTsUntil = 0;
  let _suppressRoScrollCompUntil = 0;
  let _activeJumpLock = null;
  let _activeAnchorLock = null;
  let _pinBottomLockUntil = 0;
  let _scrollbarDragging = false;
  let _lastActiveUserNotch = null;
  let _lastMinimapTotalH = 0;
  let _lastShowTop = null;
  let _lastShowBottom = null;

  const _wheelGuardedEls = new WeakSet();
  const _hoverScrollEls = new WeakSet();
  function normalizeWheelDeltaY(e) {
    if (e.deltaMode === 1) return e.deltaY * 32;
    if (e.deltaMode === 2) return e.deltaY * (els.feedWrap?.clientHeight || 600);
    return e.deltaY;
  }
  function attachInnerScrollGuard(el, opts = {}) {
    if (!el) return;
    if (opts.scrollOnHover) {
      _hoverScrollEls.add(el);
      el.removeAttribute("tabindex");
    }
    if (_wheelGuardedEls.has(el)) return;
    _wheelGuardedEls.add(el);
    if (!opts.scrollOnHover) {
      scheduleCardOverflowCheck(el);
    }
    el.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || Math.abs(e.deltaY) < 0.01) return;
        if (el.scrollHeight <= el.clientHeight + 2) return;
        const activeEl = document.activeElement;
        if (_hoverScrollEls.has(el) || (activeEl && el.contains(activeEl))) {
          const dy = normalizeWheelDeltaY(e);
          const atTop = el.scrollTop <= 0 && dy < 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && dy > 0;
          if (!atTop && !atBottom) return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (els.feedWrap) {
          _lastUserScrollMs = Date.now();
          els.feedWrap.scrollTop += normalizeWheelDeltaY(e);
        }
      },
      { passive: false }
    );
  }

  let _pendingEditScrolls = [];
  let _editScrollRaf = 0;
  function scheduleEditScroll(wrap, rowEl, topMargin = 4) {
    _pendingEditScrolls.push([wrap, rowEl, topMargin]);
    if (_editScrollRaf) return;
    _editScrollRaf = requestAnimationFrame(() => {
      _editScrollRaf = 0;
      const batch = _pendingEditScrolls;
      _pendingEditScrolls = [];
      const targets = [];
      // Batch read phase
      for (const [w, r, margin] of batch) {
        if (w.isConnected && r.isConnected) {
          const wr = w.getBoundingClientRect();
          const rr = r.getBoundingClientRect();
          if (wr.height > 0 && w.scrollHeight > w.clientHeight + 4) {
            targets.push([w, Math.max(0, w.scrollTop + (rr.top - wr.top) - margin)]);
          }
        }
      }
      // Batch write phase
      for (const [w, top] of targets) {
        w.scrollTop = top;
      }
    });
  }

  function applyInitialEditScrolls(rootEl) {
    if (!rootEl) return;
    if (rootEl.dataset && rootEl.dataset.hasEditDiff === "1") {
      const argWraps = rootEl.querySelectorAll(".tool-args");
      for (const aw of argWraps) {
        if (aw.classList.contains("is-full") || aw.classList.contains("hidden")) continue;
        if (state.stepQuery && aw.querySelector("mark.hl")) continue;
        const rr = toolArgsReplaceRowMap.get(aw);
        if (rr) scheduleEditScroll(aw, rr, 4);
      }
      return;
    }
    const cards = rootEl.querySelectorAll ? rootEl.querySelectorAll('[data-has-edit-diff="1"]') : [];
    for (const cardEl of cards) {
      const argWraps = cardEl.querySelectorAll(".tool-args");
      for (const aw of argWraps) {
        if (aw.classList.contains("is-full") || aw.classList.contains("hidden")) continue;
        if (state.stepQuery && aw.querySelector("mark.hl")) continue;
        const rr = toolArgsReplaceRowMap.get(aw);
        if (rr) scheduleEditScroll(aw, rr, 4);
      }
    }
  }

  function applyInitialSearchScrolls(rootEl) {
    if (!rootEl || !state.stepQuery) return;
    const boxes = rootEl.querySelectorAll
      ? rootEl.querySelectorAll(".read-scroll-box, .tool-args, .generic-pre.inner-scroll, .inline-raw-pre")
      : [];
    for (const box of boxes) {
      if (!box.isConnected || box.classList.contains("is-full") || box.classList.contains("hidden")) continue;
      if (box.closest(".search-omitted") && !box.closest("article.step.is-search-untrimmed")) continue;
      // Respect single-scrollbox rule: never schedule an inner child inside .read-scroll-box or .tool-args
      const outerBox = box.parentElement ? box.parentElement.closest(".read-scroll-box, .tool-args") : null;
      if (outerBox && !outerBox.classList.contains("is-full")) continue;
      const firstMark = box.querySelector("mark.hl");
      if (!firstMark) continue;
      const target =
        firstMark.closest(".code-gutter-row, .md-gutter-row, .arg-row, p, li, h1, h2, h3, h4, h5, h6") ||
        firstMark;
      scheduleEditScroll(box, target, 16);
    }
  }

  let _pendingOverflowChecks = [];
  let _overflowCheckRaf = 0;
  function registerOverflowCheck(cardEl, box, btns, isFullFn) {
    if (!cardEl || !box || !btns || !btns.length) return;
    let list = cardOverflowChecksMap.get(cardEl);
    if (!list) {
      list = [];
      cardOverflowChecksMap.set(cardEl, list);
    }
    list.push({ box, btns, isFullFn });
  }
  function scheduleCardOverflowCheck(rootEl) {
    if (!rootEl) return;
    _pendingOverflowChecks.push(rootEl);
    if (_overflowCheckRaf) return;
    _overflowCheckRaf = requestAnimationFrame(() => {
      _overflowCheckRaf = 0;
      const batch = Array.from(new Set(_pendingOverflowChecks));
      _pendingOverflowChecks = [];
      const toggleOps = [];
      const scrollOps = [];
      const seenScrollEls = new Set();
      // Batch read phase
      for (const root of batch) {
        const list = cardOverflowChecksMap.get(root);
        if (list) {
          for (const entry of list) {
            const { box, btns, isFullFn } = entry;
            if (!box.isConnected || box.classList.contains("hidden") || box.offsetParent === null) continue;
            const overflows = isFullFn() ? box.scrollHeight > 344 : box.scrollHeight > box.clientHeight + 4;
            for (const b of btns) toggleOps.push([b, !overflows]);
          }
        }
        const scrollCandidates = [];
        if (root.classList && root.classList.contains("inner-scroll")) scrollCandidates.push(root);
        if (root.querySelectorAll) {
          for (const sc of root.querySelectorAll(".inner-scroll")) scrollCandidates.push(sc);
        }
        for (const sc of scrollCandidates) {
          if (seenScrollEls.has(sc) || _hoverScrollEls.has(sc)) continue;
          seenScrollEls.add(sc);
          const canScroll = Boolean(sc.isConnected && sc.offsetParent !== null && sc.scrollHeight > sc.clientHeight + 2);
          scrollOps.push([sc, canScroll]);
        }
      }
      // Batch write phase
      for (const [b, shouldHide] of toggleOps) {
        b.classList.toggle("overflow-btn-hidden", shouldHide);
      }
      for (const [sc, canScroll] of scrollOps) {
        sc.classList.toggle("has-inner-scroll", canScroll);
        if (canScroll) sc.tabIndex = 0;
        else sc.removeAttribute("tabindex");
      }
    });
  }

  // ---------- Viewport Scroll Anchor Preservation ----------
  // Prevents jarring jumps when toggling Raw/Markdown, collapsing long read_file boxes, or opening/closing blocks.
  const ANCHOR_PROBE_SEL =
    ".code-row, .md > p, .md > pre, .md > ul, .md > ol, .md > blockquote, .md > h1, .md > h2, .md > h3, .md > h4, .md > table, .arg-row, .show-more-btn, .read-hidden-note, .tool-result-head, .tool-head, summary, .tool-card, .step-head, article.step, .cache-map-card, .generic-pre, .inline-raw-pre, .read-scroll-box, .tool-args, .generic-content-wrap";
  let _anchorAdjustRaf = 0;

  function isAnchorVisible(el) {
    if (!el || !el.isConnected || !els.feed || !els.feed.contains(el)) return false;
    if (el.getClientRects().length === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 && r.width <= 0) return false;
    let p = el.parentElement;
    while (p && p !== els.feed) {
      if (
        p.classList.contains("inner-scroll") ||
        p.classList.contains("read-scroll-box") ||
        p.classList.contains("tool-args")
      ) {
        if (p.scrollHeight > p.clientHeight + 2) {
          const pr = p.getBoundingClientRect();
          if (r.bottom <= pr.top + 4 || r.top >= pr.bottom - 4) {
            return false;
          }
        }
      }
      p = p.parentElement;
    }
    return true;
  }

  function captureScrollAnchor(triggerEl = null) {
    if (!els.feedWrap || !els.feed) return null;
    const wrapRect = els.feedWrap.getBoundingClientRect();
    if (wrapRect.height <= 0) return null;
    const centerY = wrapRect.top + wrapRect.height * 0.5;
    const probeX = Math.min(wrapRect.right - 24, wrapRect.left + Math.max(80, wrapRect.width * 0.45));
    const seen = new Set();
    const candidates = [];

    const pushCand = (el, tier) => {
      if (!el || seen.has(el) || !els.feed.contains(el)) return;
      if (!isAnchorVisible(el)) return;
      const r = el.getBoundingClientRect();
      seen.add(el);
      const isOffscreenTall = r.top < wrapRect.top - 140 && r.height > wrapRect.height * 0.9;
      const finalTier = tier === 0 ? 0 : (isOffscreenTall ? 4 : tier);
      const dist = Math.abs((r.top + r.bottom) * 0.5 - centerY);
      candidates.push({ el, top: r.top, tier: finalTier, dist });
    };

    if (triggerEl && triggerEl.isConnected && els.feed.contains(triggerEl)) {
      pushCand(triggerEl, 0);
      const resHead = triggerEl.closest ? triggerEl.closest(".tool-result")?.querySelector(".tool-result-head") : null;
      const tcHead = triggerEl.closest ? triggerEl.closest(".tool-card")?.querySelector(".tool-head") : null;
      const stepHead = triggerEl.closest ? triggerEl.closest("article.step")?.querySelector(".step-head") : null;
      if (resHead) pushCand(resHead, 1);
      if (tcHead) pushCand(tcHead, 1);
      if (stepHead) pushCand(stepHead, 2);
    }

    const probes = [
      [centerY, 1],
      [centerY - wrapRect.height * 0.14, 1],
      [centerY + wrapRect.height * 0.14, 1],
      [centerY - wrapRect.height * 0.30, 3],
      [centerY + wrapRect.height * 0.30, 3],
      [wrapRect.top + 60, 3],
      [wrapRect.bottom - 60, 3],
    ];

    for (const [py, tier] of probes) {
      if (py < wrapRect.top || py > wrapRect.bottom) continue;
      const stack = document.elementsFromPoint(probeX, py);
      for (const node of stack) {
        if (!els.feed.contains(node)) continue;
        const blk = node.closest ? node.closest(ANCHOR_PROBE_SEL) : null;
        if (blk && els.feed.contains(blk)) {
          pushCand(blk, tier);
        }
      }
    }

    candidates.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
    return { candidates };
  }

  function restoreScrollAnchor(snap) {
    if (!snap || !els.feedWrap || !snap.candidates.length) return;
    const fw = els.feedWrap;
    let chosen = null;
    for (const c of snap.candidates) {
      if (isAnchorVisible(c.el)) {
        chosen = c;
        break;
      }
    }
    if (!chosen) return;

    const alignChosen = () => {
      if (!isAnchorVisible(chosen.el)) return false;
      const delta = chosen.el.getBoundingClientRect().top - chosen.top;
      if (Math.abs(delta) > 1) {
        _suppressScrollTsUntil = performance.now() + 140;
        fw.scrollTop = Math.max(0, fw.scrollTop + delta);
        _lastScrollFrameTop = fw.scrollTop;
        return true;
      }
      return false;
    };

    _pinBottomLockUntil = 0;
    _activeJumpLock = null;
    alignChosen();

    const anchorCard = chosen.el.closest ? chosen.el.closest("article.step, .dialog-expand-wrap") : null;
    const anchorItem = anchorCard ? _vElToItemMap.get(anchorCard) : null;
    if (anchorItem && anchorCard.isConnected) {
      const measuredH = Math.ceil(anchorCard.getBoundingClientRect().height) + CARD_GAP;
      if (measuredH > CARD_GAP && Math.abs(measuredH - anchorItem.height) >= 1) {
        anchorItem.height = measuredH;
        anchorItem.measured = true;
        recomputeVItemOffsets(anchorItem.idx);
        updateVSpacers();
        alignChosen();
      }
    }

    syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
    alignChosen();

    const cardOffset =
      anchorItem && anchorCard && anchorCard.isConnected && chosen.el.isConnected
        ? chosen.el.getBoundingClientRect().top - anchorCard.getBoundingClientRect().top
        : 0;
    _activeAnchorLock = {
      el: chosen.el,
      top: chosen.top,
      item: anchorItem,
      cardOffset,
      expiresAt: performance.now() + 500,
    };

    if (_anchorAdjustRaf) cancelAnimationFrame(_anchorAdjustRaf);
    _anchorAdjustRaf = requestAnimationFrame(() => {
      _anchorAdjustRaf = 0;
      if (!_activeAnchorLock || _activeAnchorLock.el !== chosen.el) return;
      alignChosen();
      updateScrollUiOnFrame();
    });
  }

  function preserveScrollAnchor(fn, triggerEl = null) {
    const snap = captureScrollAnchor(triggerEl);
    fn();
    restoreScrollAnchor(snap);
  }

  // ---------- Helpers ----------
  function unescapeNewlines(str) {
    if (str === null || str === undefined) return "";
    // Only normalize CRLF -> LF; NEVER blindly convert literal \n so pasted JSON, code strings, and C:\new paths stay intact
    return String(str).replace(/\r\n/g, "\n");
  }

  const ARG_PRIORITY = [
    "StartLine", "EndLine", "ByteOffset",
    "Path", "TargetFile", "DirectoryPath",
    "CommandLine", "WaitMsBeforeAsync", "IsDaemon",
    "Target", "TargetContent", "Replacement", "ReplacementContent",
    "Content", "CodeContent", "Overwrite", "Append",
    "query", "domain",
    "TypeName", "Role", "Model", "Workspace", "Prompt", "Recipient", "Message",
  ];

  function computeLineDiff(oldStr, newStr) {
    const a = String(oldStr || "").split("\n");
    const b = String(newStr || "").split("\n");
    const m = a.length;
    const n = b.length;

    // Guard for huge diffs: fallback to simple mark
    if (m * n > 10000) {
      return {
        oldLines: a.map((t) => ({ cls: "diff-del", text: t })),
        newLines: b.map((t) => ({ cls: "diff-add", text: t })),
      };
    }

    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (a[i] === b[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
        }
      }
    }

    const ops = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        ops.push({ op: "eq", text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ op: "del", text: a[i] });
        i++;
      } else {
        ops.push({ op: "add", text: b[j] });
        j++;
      }
    }
    while (i < m) ops.push({ op: "del", text: a[i++] });
    while (j < n) ops.push({ op: "add", text: b[j++] });

    // Pair adjacent del + add blocks as modified (italic)
    const oldLines = [];
    const newLines = [];
    let k = 0;
    while (k < ops.length) {
      if (ops[k].op === "eq") {
        oldLines.push({ cls: "diff-eq", text: ops[k].text });
        newLines.push({ cls: "diff-eq", text: ops[k].text });
        k++;
      } else {
        const dels = [];
        const adds = [];
        while (k < ops.length && ops[k].op !== "eq") {
          if (ops[k].op === "del") dels.push(ops[k].text);
          else adds.push(ops[k].text);
          k++;
        }
        const paired = Math.min(dels.length, adds.length);
        for (let p = 0; p < dels.length; p++) {
          oldLines.push({ cls: p < paired ? "diff-mod-old" : "diff-del", text: dels[p] });
        }
        for (let p = 0; p < adds.length; p++) {
          newLines.push({ cls: p < paired ? "diff-mod-new" : "diff-add", text: adds[p] });
        }
      }
    }
    return { oldLines, newLines };
  }

  function renderDiffLines(preEl, lines) {
    const frag = document.createDocumentFragment();
    for (const item of lines) {
      const span = document.createElement("span");
      span.className = `diff-line ${item.cls}`;
      span.textContent = item.text === "" ? " " : item.text;
      frag.appendChild(span);
    }
    preEl.appendChild(frag);
  }

  function renderToolArgsStructured(args, skipKeys = new Set()) {
    const wrap = document.createElement("div");
    wrap.className = "tool-args inner-scroll";
    attachInnerScrollGuard(wrap);
    if (!args || typeof args !== "object") {
      const s = String(args || "");
      wrap.textContent = s;
      wrap.dataset.estLines = String(s ? s.split("\n").length : 1);
      wrap.dataset.totalChars = String(s.length);
      wrap.dataset.hasBlock = s.includes("\n") || s.length > 100 ? "1" : "0";
      return wrap;
    }

    const TARGET_KEYS = new Set(["Target", "TargetContent"]);
    const REPLACE_KEYS = new Set(["Replacement", "ReplacementContent"]);
    const BLOCK_KEYS = new Set(["Content", "CodeContent", "CommandLine", "Prompt", "Message", "Summary", "Description", "SystemPrompt"]);

    // Precompute line-level diff if both Target and Replacement exist
    const targetKey = args.Target !== undefined ? "Target" : (args.TargetContent !== undefined ? "TargetContent" : null);
    const replaceKey = args.Replacement !== undefined ? "Replacement" : (args.ReplacementContent !== undefined ? "ReplacementContent" : null);
    let diffResult = null;
    if (targetKey && replaceKey) {
      diffResult = computeLineDiff(
        unescapeNewlines(args[targetKey]),
        unescapeNewlines(args[replaceKey])
      );
    }

    const keys = Object.keys(args).filter((k) => k !== "toolSummary" && !skipKeys.has(k));
    keys.sort((a, b) => {
      const ia = ARG_PRIORITY.indexOf(a);
      const ib = ARG_PRIORITY.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });

    let replaceRowEl = null;
    let estLines = 0;
    let totalChars = 0;
    let hasBlockArg = false;

    for (const k of keys) {
      const v = args[k];
      const row = document.createElement("div");
      if (k === replaceKey) replaceRowEl = row;
      const valStr = typeof v === "string" ? unescapeNewlines(v) : JSON.stringify(v, null, 2);
      const isMultiline =
        TARGET_KEYS.has(k) ||
        REPLACE_KEYS.has(k) ||
        BLOCK_KEYS.has(k) ||
        valStr.includes("\n") ||
        valStr.length > 100;

      totalChars += valStr.length;
      if (isMultiline) {
        hasBlockArg = true;
        const linesArr = valStr.split("\n");
        let rowLines = linesArr.length;
        for (let li = 0; li < linesArr.length; li++) {
          if (linesArr[li].length > 95) rowLines += Math.floor((linesArr[li].length - 1) / 95);
        }
        estLines += rowLines + 2;
      } else {
        estLines += 1.5;
      }

      const keySpan = document.createElement("span");
      keySpan.className = "arg-key";
      keySpan.textContent = k;
      keySpan.dataset.tipTitle = t("card.paramTitle", { key: k });
      keySpan.dataset.tipDesc = tDoc("args", k, "card.paramFallback");
      keySpan.dataset.tipRaw = `${k}: ${valStr.slice(0, 120)}`;

      if (isMultiline) {
        row.className = k === replaceKey ? "arg-row arg-row-replacement" : "arg-row";
        row.appendChild(keySpan);

        if (k === "CommandLine") {
          const pre = document.createElement("pre");
          pre.className = "arg-val";
          renderCommandLineWithHighlight(pre, valStr);
          row.appendChild(pre);
        } else {
          const argTargetPath = String(args.Path || args.TargetFile || "");
          const isArgMdFile = /\.(?:md|markdown)$/i.test(argTargetPath);
          const hasOtherExt = Boolean(argTargetPath) && !isArgMdFile && /\.[A-Za-z0-9]{1,10}$/i.test(argTargetPath);
          const canRenderArgMd =
            !TARGET_KEYS.has(k) &&
            !REPLACE_KEYS.has(k) &&
            (k === "Content" || k === "CodeContent" || k === "Prompt" || k === "Message" || k === "Summary" || k === "Description") &&
            (isArgMdFile || (!hasOtherExt && looksLikeMarkdown(valStr)));

          if (canRenderArgMd) {
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.className = "arg-md-toggle";
            toggleBtn.textContent = "Raw";
            row.appendChild(toggleBtn);

            const mdDiv = document.createElement("div");
            mdDiv.className = "arg-val arg-val-md md";
            mdDiv.innerHTML = renderMarkdown(valStr);
            row.appendChild(mdDiv);

            let rawPre = null;
            toggleBtn.addEventListener("click", () => {
              preserveScrollAnchor(() => {
                if (rawPre) {
                  rawPre.classList.toggle("hidden");
                  mdDiv.classList.toggle("hidden");
                  toggleBtn.textContent = mdDiv.classList.contains("hidden") ? "Markdown" : "Raw";
                } else {
                  rawPre = document.createElement("pre");
                  rawPre.className = "arg-val";
                  rawPre.textContent = valStr;
                  linkifyElement(rawPre);
                  mdDiv.classList.add("hidden");
                  row.appendChild(rawPre);
                  toggleBtn.textContent = "Markdown";
                }
              }, toggleBtn);
            });
          } else {
            const pre = document.createElement("pre");
            let cls = "arg-val";
            if (TARGET_KEYS.has(k)) cls += " arg-val-target";
            else if (REPLACE_KEYS.has(k)) cls += " arg-val-replacement";
            pre.className = cls;

            if (diffResult && k === targetKey) {
              renderDiffLines(pre, diffResult.oldLines);
            } else if (diffResult && k === replaceKey) {
              renderDiffLines(pre, diffResult.newLines);
            } else {
              pre.textContent = valStr;
            }
            row.appendChild(pre);
          }
        }
      } else {
        const stacked = k === "StartLine" || k === "EndLine" || k === "ByteOffset";
        row.className = stacked ? "arg-row arg-row-inline arg-row-stacked" : "arg-row arg-row-inline";
        row.appendChild(keySpan);
        const valSpan = document.createElement("span");
        valSpan.className = "arg-val-inline";
        if (k === "CommandLine") {
          renderCommandLineWithHighlight(valSpan, valStr);
        } else {
          valSpan.textContent = valStr;
        }
        row.appendChild(valSpan);
      }
      wrap.appendChild(row);
    }
    wrap.dataset.estLines = String(Math.ceil(estLines));
    wrap.dataset.totalChars = String(totalChars);
    wrap.dataset.hasBlock = hasBlockArg ? "1" : "0";
    if (replaceRowEl) {
      toolArgsReplaceRowMap.set(wrap, replaceRowEl);
      scheduleEditScroll(wrap, replaceRowEl);
    }
    return wrap;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function fmtNum(n) {
    return Number(n || 0).toLocaleString(state.lang === "ru" ? "ru-RU" : "en-US");
  }

  function fmtRelTime(mtimeSec) {
    const diff = Math.max(0, Math.floor(Date.now() / 1000 - mtimeSec));
    if (diff < 60) return t("card.timeAgoSec", { n: diff });
    if (diff < 3600) return t("card.timeAgoMin", { n: Math.floor(diff / 60) });
    if (diff < 86400) return t("card.timeAgoHour", { n: Math.floor(diff / 3600) });
    return t("card.timeAgoDay", { n: Math.floor(diff / 86400) });
  }

  function getEffectiveTzOffsetMin() {
    return state.userTzOffsetMin !== null ? state.userTzOffsetMin : -new Date().getTimezoneOffset();
  }

  function formatTzOffsetLabel(offsetMin) {
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(Math.round(offsetMin));
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
  }

  function extractUserLocalTimeStr(text) {
    if (!text) return null;
    const raw = String(text);
    const reAll = /The current local time is:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/gi;
    // Always pick the LAST occurrence (outer trailing <ADDITIONAL_METADATA>, never an older snippet pasted inside prompt text)
    let last = null;
    let m;
    while ((m = reAll.exec(raw)) !== null) {
      last = m[1];
    }
    return last;
  }

  function calibrateUserTimezone(steps) {
    state.userTzOffsetMin = null;
    state.userTzSource = "browser";
    state.userTzCalibSample = "";
    if (!Array.isArray(steps) || !steps.length) return false;

    for (const s of steps) {
      if (!s || s.type !== "USER_INPUT" || !s.content) continue;
      const localRaw = extractUserLocalTimeStr(s.content);
      if (!localRaw) continue;

      const offM = localRaw.match(/([+-])(\d{2}):?(\d{2})$/);
      if (offM) {
        const sign = offM[1] === "-" ? -1 : 1;
        const mins = sign * (Number(offM[2]) * 60 + Number(offM[3]));
        state.userTzOffsetMin = mins;
        state.userTzSource = "transcript";
        state.userTzCalibSample = `${localRaw} ↔ created_at: ${s.created_at || "—"}`;
        return true;
      }

      if (s.created_at) {
        const createdMs = Date.parse(s.created_at);
        const wallM = localRaw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
        if (!Number.isNaN(createdMs) && wallM) {
          const wallUtcMs = Date.UTC(
            Number(wallM[1]),
            Number(wallM[2]) - 1,
            Number(wallM[3]),
            Number(wallM[4]),
            Number(wallM[5]),
            Number(wallM[6])
          );
          const diffMin = Math.round((wallUtcMs - createdMs) / 60000 / 15) * 15;
          if (Math.abs(diffMin) <= 14 * 60) {
            state.userTzOffsetMin = diffMin;
            state.userTzSource = "transcript";
            state.userTzCalibSample = `${localRaw} ↔ created_at: ${s.created_at}`;
            return true;
          }
        }
      }
    }
    return false;
  }

  function fmtStepTime(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const offMin = getEffectiveTzOffsetMin();
    const shifted = new Date(d.getTime() + offMin * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  }

  function fmtFullDateTime(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const offMin = getEffectiveTzOffsetMin();
    const shifted = new Date(d.getTime() + offMin * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const datePart = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
    const timePart = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
    return `${datePart} ${timePart} ${formatTzOffsetLabel(offMin)}`;
  }

  function fmtDeltaSec(sec) {
    if (sec === null || sec === undefined || sec < 0) return "—";
    if (sec < 60) return t("card.deltaSec", { n: Math.round(sec) });
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m < 60) return s > 0 ? t("card.deltaMinSec", { m, s }) : t("card.deltaMin", { m });
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return t("card.deltaHourMin", { h, m: rm });
  }

  function getCacheLevel(hitPct, totIn) {
    if (totIn <= 0) return { lvl: 0, cls: "", label: t("card.cacheNone") };
    if (hitPct >= 90) return { lvl: 5, cls: "cache-lvl-5", label: t("card.cacheLvl5") };
    if (hitPct >= 70) return { lvl: 4, cls: "cache-lvl-4", label: t("card.cacheLvl4") };
    if (hitPct >= 40) return { lvl: 3, cls: "cache-lvl-3", label: t("card.cacheLvl3") };
    if (hitPct > 0) return { lvl: 2, cls: "cache-lvl-2", label: t("card.cacheLvl2") };
    return { lvl: 1, cls: "cache-lvl-1", label: t("card.cacheLvl1") };
  }

  function expandLocalTemplatePath(rawPath) {
    let s = String(rawPath || "").trim();
    if (!s) return "";
    if (state.brainDir) {
      const appDataDir = state.brainDir.replace(/[\\/][^\\/]+[\\/]?$/, "");
      if (appDataDir) s = s.replace(/<appDataDir>/gi, appDataDir);
      const mHome = state.brainDir.match(/^([A-Za-z]:[/\\]Users[/\\][^/\\]+|\/(?:home|Users)\/[^/\\]+|\/root)/i);
      if (mHome) {
        s = s.replace(/%USERPROFILE%/gi, mHome[1]);
        s = s.replace(/\$\{?HOME\}?/g, mHome[1]);
        s = s.replace(/^~(?=[/\\]|$)/, mHome[1]);
      }
    }
    if (state.activeId) {
      s = s.replace(/<conversation-id>/gi, state.activeId);
    }
    return s;
  }

  function toCleanFileHref(rawPath) {
    const expanded = expandLocalTemplatePath(rawPath);
    if (!expanded) return "#";
    let fwd = expanded.replace(/\\/g, "/");
    if (/^file:\/\//i.test(fwd)) return fwd;
    // Strip leading slashes and encode spaces/hash safely while preserving readability (works for both C:/... and /home/...)
    fwd = fwd.replace(/^\/+/, "");
    const safeFwd = fwd
      .replace(/%/g, "%25")
      .replace(/#/g, "%23")
      .replace(/\?/g, "%3F")
      .replace(/ /g, "%20");
    return `file:///${safeFwd}`;
  }

  function resolveFileHref(url, opts = {}) {
    // Detect links to brain/ transcripts -> open inside this viewer (unless treatTranscriptAsFile)
    const mTrans = url.match(/brain[/\\]([0-9a-f-]{8,})[/\\]\.system_generated[/\\]logs[/\\]transcript(?:_full)?\.jsonl/i);
    if (mTrans && !opts.treatTranscriptAsFile) {
      return { href: `#conv=${encodeURIComponent(mTrans[1])}`, convId: mTrans[1], isBrainFile: true, isDir: false, localPath: url };
    }
    // Keep clean file:///... href for copying while preserving OS path separators for Windows & POSIX
    if (/^file:\/\//i.test(url)) {
      let localPath = decodeURIComponent(url.replace(/^file:\/+/i, "")).split("#")[0];
      if (/^[A-Za-z]:[/\\]/.test(localPath)) {
        localPath = localPath.replace(/\//g, "\\");
      } else if (localPath && !localPath.startsWith("/")) {
        localPath = `/${localPath}`;
      }
      return {
        href: toCleanFileHref(localPath),
        convId: null,
        isBrainFile: true,
        isDir: isLikelyDirectoryPath(localPath),
        localPath,
      };
    }
    return { href: url, convId: null, isBrainFile: false, isDir: false, localPath: "" };
  }

  function isLikelyDirectoryPath(rawPath) {
    if (!rawPath) return false;
    const p = String(rawPath).trim().replace(/["']/g, "");
    if (/[\\/]$/.test(p)) return true;
    const norm = p.replace(/\\/g, "/");
    if (state.projectDirs && state.projectDirs.has(norm.toLowerCase())) return true;
    const base = norm.split("/").filter(Boolean).pop() || "";
    if (!base) return true;
    if (/^(?:Dockerfile|Makefile|LICENSE|README|Procfile|Vagrantfile|\..+)$/i.test(base)) return false;
    return !/\.[A-Za-z0-9]{1,8}$/.test(base);
  }

  function makeLocalPathHref(rawPath) {
    return toCleanFileHref(rawPath);
  }

  function renderCommandLineWithHighlight(el, cmdStr) {
    const text = String(cmdStr || "");
    const m = text.match(/^(\s*(?:(?:pwsh|powershell)(?:\.exe)?(?:\s+-[A-Za-z]+)*\s+-c(?:ommand)?|cmd(?:\.exe)?\s+\/[ck])\s+)([\s\S]+)$/i);
    if (!m) {
      el.textContent = text;
      return;
    }
    el.textContent = "";
    const preSpan = document.createElement("span");
    preSpan.className = "cmd-prefix";
    preSpan.textContent = m[1].trimEnd();
    const sep = document.createTextNode(" ");
    const mainSpan = document.createElement("span");
    mainSpan.className = "cmd-main";
    mainSpan.textContent = m[2];
    el.appendChild(preSpan);
    el.appendChild(sep);
    el.appendChild(mainSpan);
  }

  function makeTipAttrs(title, desc, rawExample) {
    return `data-tip-title="${escHtml(title)}" data-tip-desc="${escHtml(desc)}" data-tip-raw="${escHtml(rawExample)}"`;
  }

  function buildCopyBarHtml(code, lang) {
    const clean = String(code || "").replace(/[\r\n\s]+$/g, "");
    const isMultiLine = clean.includes("\n");
    const l = String(lang || "").toLowerCase();
    const isShellLang =
      !l ||
      ["sh", "bash", "zsh", "shell", "pwsh", "powershell", "ps1", "cmd", "bat", "dos", "console", "terminal"].includes(l);
    const looksLikeNonShell = /^\s*[{[<]/.test(clean) && !l;
    let extraBtns = "";
    if (isMultiLine && isShellLang && !looksLikeNonShell) {
      const showPwshBtn =
        state.capabilities?.is_windows !== false || ["pwsh", "powershell", "ps1"].includes(l);
      extraBtns =
        `<button class="copy-btn copy-btn-variant" type="button" data-copy-mode="one_line" title="${escHtml(t("card.copyOneLineTitle"))}">${escHtml(t("card.copyOneLine"))}</button>` +
        (showPwshBtn
          ? `<button class="copy-btn copy-btn-variant" type="button" data-copy-mode="pwsh_block" title="${escHtml(t("card.copyPwshBlockTitle"))}">${escHtml(t("card.copyPwshBlock"))}</button>`
          : "");
    }
    return `<div class="copy-bar">${extraBtns}<button class="copy-btn" type="button" data-copy-mode="exact" title="${escHtml(t("card.copyExactTitle"))}">${escHtml(t("card.copyExact"))}</button></div>`;
  }

  function formatShellForCopy(rawText, mode) {
    const clean = String(rawText || "").replace(/\r\n/g, "\n").replace(/[\r\n\s]+$/g, "");
    if (mode === "exact") return clean;
    // Join line continuations (\ or `) and drop blank / standalone # comment lines
    const rawLines = clean.split("\n");
    const merged = [];
    let buf = "";
    for (let ln of rawLines) {
      const trimmed = ln.trim();
      if (!buf && (!trimmed || trimmed.startsWith("#") || /^::/.test(trimmed))) continue;
      if (/[\\`]$/.test(trimmed)) {
        buf += (buf ? " " : "") + trimmed.slice(0, -1).trimEnd();
      } else {
        buf += (buf ? " " : "") + trimmed;
        merged.push(buf.trim());
        buf = "";
      }
    }
    if (buf.trim()) merged.push(buf.trim());
    if (merged.length <= 1) return merged[0] || clean;
    if (mode === "one_line") return merged.join(" && ");
    if (mode === "pwsh_block") return `& { ${merged.join("; ")} }`;
    return clean;
  }

  // ---------- Lightweight XSS-safe Markdown Renderer ----------
  function formatMdLinkHtml(label, rawUrl, isAuto = false) {
    const url = String(rawUrl || "").replace(/&amp;/g, "&");
    const res = resolveFileHref(url);
    if (res.convId) {
      const cls = isAuto ? "transcript-link link-auto" : "transcript-link link-authored";
      const tip = isAuto
        ? makeTipAttrs(t("card.autoLinkTranscript"), t("card.autoLinkDetected"), url)
        : "";
      return `<a href="${escHtml(res.href)}" class="${cls}" data-conv-id="${escHtml(res.convId)}" ${tip}>${label}</a>`;
    }
    if (isAuto) {
      const cls = res.localPath ? "link-auto local-path-link" : "link-auto";
      const dirAttr = res.isDir ? 'data-is-dir="1"' : "";
      const lpAttr = res.localPath ? `data-local-path="${escHtml(res.localPath)}"` : "";
      const tip = makeTipAttrs(
        t("card.autoLinkGenericTitle"),
        res.isDir ? t("card.autoLinkGenericDir") : t("card.autoLinkGenericFile"),
        res.localPath || url
      );
      return `<a href="${escHtml(res.href)}" class="${cls}" ${dirAttr} ${lpAttr} ${tip} target="_blank" rel="noopener noreferrer">${label}</a>`;
    }
    const extraCls = res.localPath ? "link-authored local-path-link" : "link-authored";
    const dirAttr = res.isDir ? 'data-is-dir="1"' : "";
    const lpAttr = res.localPath ? `data-local-path="${escHtml(res.localPath)}"` : "";
    return `<a href="${escHtml(res.href)}" class="${extraCls}" ${dirAttr} ${lpAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
  }

  function formatInlineMdHtml(escapedLine) {
    const inlineCodes = [];
    const links = [];
    // 1) Protect inline code spans FIRST so *, **, [], file:/// inside `...` never break HTML tags
    let s = String(escapedLine || "").replace(/``([^\n]+?)``|`([^`\n]+)`/g, (_, dbl, sgl) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`<code>${dbl !== undefined ? dbl : sgl}</code>`);
      return `\u0000IC${idx}\u0000`;
    });
    // 2) Extract explicit Markdown links [label](url) (allowing parens inside URLs & code spans in label)
    s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|file:\/\/\/)(?:[^\s()]|\([^\s()]*\))+)\)/g, (_, label, url) => {
      const idx = links.length;
      links.push(formatMdLinkHtml(label, url, false));
      return `\u0000LN${idx}\u0000`;
    });
    // 3) Bold & Italic (outside inline code & link URLs)
    s = s
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    // 4) Bare file:/// auto-links & <truncated ...> highlight
    if (!state.disableAutoLinks) {
      s = s.replace(/(file:\/\/\/[^\s<>"')\]]+)/g, (url) => formatMdLinkHtml(url, url, true));
    }
    s = s.replace(/&lt;truncated\s+[^&]+&gt;/gi, (m) => `<strong class="trunc-badge">${m}</strong>`);
    // 5) Restore links first, then inline code spans inside/outside labels
    s = s.replace(/\u0000LN(\d+)\u0000/g, (_, idx) => links[Number(idx)] ?? "");
    return s.replace(/\u0000IC(\d+)\u0000/g, (_, idx) => inlineCodes[Number(idx)] ?? "");
  }

  function renderMarkdown(raw, opts = {}) {
    if (!raw) return "";
    const codeBlocks = [];
    let text = String(raw).replace(/\r\n/g, "\n").replace(/\u0000/g, "\uFFFD");

    // Extract fenced code blocks (supports 3+ backticks so ```` wraps inner ``` safely)
    text = text.replace(/^[ \t]*(`{3,})([a-zA-Z0-9_-]*)[ \t]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm, (_, _fence, lang, code) => {
      const idx = codeBlocks.length;
      const langLabel = lang ? ` data-lang="${escHtml(lang)}"` : "";
      const trimmedCode = code.replace(/[\r\n\s]+$/g, "");
      codeBlocks.push(
        `<pre${langLabel}>${buildCopyBarHtml(trimmedCode, lang)}<code>${escHtml(trimmedCode)}</code></pre>`
      );
      return `\u0000CB${idx}\u0000`;
    });
    // Fallback inline/unanchored fenced blocks
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      const langLabel = lang ? ` data-lang="${escHtml(lang)}"` : "";
      const trimmedCode = code.replace(/[\r\n\s]+$/g, "");
      codeBlocks.push(
        `<pre${langLabel}>${buildCopyBarHtml(trimmedCode, lang)}<code>${escHtml(trimmedCode)}</code></pre>`
      );
      return `\u0000CB${idx}\u0000`;
    });

    // Escape remaining HTML
    text = escHtml(text);

    const inline = (s) => formatInlineMdHtml(s);
    const measureIndent = (ws) => {
      let col = 0;
      for (let k = 0; k < ws.length; k++) {
        col += ws[k] === "\t" ? (4 - (col % 4)) : 1;
      }
      return col;
    };
    const matchListLine = (ln) => {
      const m = ln.match(/^([ \t]*)(?:([-*])\s+(.*)|(\d+)\.\s+(.*))$/);
      if (!m) return null;
      const indent = measureIndent(m[1]);
      if (m[2] !== undefined) {
        return { type: "ul", indent, text: m[3], num: null };
      }
      return { type: "ol", indent, text: m[5], num: Number(m[4]) || 1 };
    };
    const renderListNode = (node) => {
      const itemsHtml = node.items.map((it) => {
        const bodyParts = [it.textHtml];
        if (it.contParts.length) {
          bodyParts.push(`<br>${it.contParts.join("<br>")}`);
        }
        const childrenHtml = it.children.map(renderListNode).join("");
        if (node.type === "ol") {
          const itemNum = it.num;
          const prefixNum = opts.highlightOlNums ? `<span class="compaction-num">${itemNum}.</span>` : "";
          return `<li value="${itemNum}">${prefixNum}${bodyParts.join("")}${childrenHtml}</li>`;
        }
        return `<li>${bodyParts.join("")}${childrenHtml}</li>`;
      }).join("");
      if (node.type === "ol") {
        return `<ol start="${node.startNum}">${itemsHtml}</ol>`;
      }
      return `<ul>${itemsHtml}</ul>`;
    };

    const lines = text.split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Code block placeholder
      const cbMatch = line.trim().match(/^\u0000CB(\d+)\u0000$/);
      if (cbMatch) {
        out.push(codeBlocks[Number(cbMatch[1])]);
        i++;
        continue;
      }

      // Horizontal rule
      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      // Headings h1..h6
      const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        const lvl = hMatch[1].length;
        out.push(`<h${lvl}>${inline(hMatch[2])}</h${lvl}>`);
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith("&gt; ") || line === "&gt;") {
        const bq = [];
        while (i < lines.length && (lines[i].startsWith("&gt; ") || lines[i] === "&gt;")) {
          bq.push(inline(lines[i].slice(lines[i].startsWith("&gt; ") ? 5 : 4)));
          i++;
        }
        out.push(`<blockquote>${bq.join("<br>")}</blockquote>`);
        continue;
      }

      // Markdown Table
      if (
        line.includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])
      ) {
        const parseRow = (r) =>
          r
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim());
        const headers = parseRow(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
          rows.push(parseRow(lines[i]));
          i++;
        }
        let tbl = "<table><thead><tr>" + headers.map((h) => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>";
        for (const r of rows) {
          tbl += "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
        }
        tbl += "</tbody></table>";
        out.push(tbl);
        continue;
      }

      // Hierarchical Unordered / Ordered Lists (supports nested ul/ol & indented continuations)
      const firstItem = matchListLine(line);
      if (firstItem) {
        const root = {
          type: firstItem.type,
          indent: firstItem.indent,
          startNum: firstItem.num || 1,
          items: [{
            textHtml: inline(firstItem.text),
            num: firstItem.num,
            contParts: [],
            children: [],
          }],
        };
        const stack = [root];
        i++;

        while (i < lines.length) {
          let nextIdx = i;
          let skippedBlank = false;
          while (nextIdx < lines.length && lines[nextIdx].trim() === "") {
            skippedBlank = true;
            nextIdx++;
          }
          if (nextIdx >= lines.length) break;

          const curLine = lines[nextIdx];

          // Never absorb non-list block boundaries
          if (
            /^\u0000CB\d+\u0000$/.test(curLine.trim()) ||
            /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(curLine) ||
            /^(#{1,6})\s+/.test(curLine) ||
            /^\s*&gt;(?:\s|$)/.test(curLine) ||
            (curLine.includes("|") && nextIdx + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[nextIdx + 1]))
          ) {
            break;
          }

          const lm = matchListLine(curLine);
          if (lm) {
            while (stack.length > 1 && lm.indent < stack[stack.length - 1].indent) {
              stack.pop();
            }
            const top = stack[stack.length - 1];

            if (lm.indent > top.indent) {
              const parentItem = top.items[top.items.length - 1];
              const subList = {
                type: lm.type,
                indent: lm.indent,
                startNum: lm.num || 1,
                items: [{
                  textHtml: inline(lm.text),
                  num: lm.num,
                  contParts: [],
                  children: [],
                }],
              };
              parentItem.children.push(subList);
              stack.push(subList);
              i = nextIdx + 1;
              continue;
            }

            if (lm.indent < top.indent) {
              break;
            }

            if (lm.type !== top.type) {
              if (stack.length === 1) {
                break;
              }
              stack.pop();
              const outerTop = stack[stack.length - 1];
              const outerItem = outerTop.items[outerTop.items.length - 1];
              const subList = {
                type: lm.type,
                indent: lm.indent,
                startNum: lm.num || 1,
                items: [{
                  textHtml: inline(lm.text),
                  num: lm.num,
                  contParts: [],
                  children: [],
                }],
              };
              outerItem.children.push(subList);
              stack.push(subList);
              i = nextIdx + 1;
              continue;
            }

            top.items.push({
              textHtml: inline(lm.text),
              num: lm.num,
              contParts: [],
              children: [],
            });
            i = nextIdx + 1;
            continue;
          }

          // Indented continuation line inside the current list item
          const lineIndent = measureIndent((curLine.match(/^[ \t]*/) || [""])[0]);
          const top = stack[stack.length - 1];
          let targetList = null;
          if (skippedBlank) {
            for (let s = stack.length - 1; s >= 0; s--) {
              if (lineIndent >= stack[s].indent + 2) {
                targetList = stack[s];
                break;
              }
            }
          } else if (lineIndent >= top.indent + 2) {
            targetList = top;
          }
          if (!targetList) break;
          const targetItem = targetList.items[targetList.items.length - 1];
          if (targetItem.children.length > 0) break;
          targetItem.contParts.push(inline(curLine.trim()));
          i = nextIdx + 1;
        }

        out.push(renderListNode(root));
        continue;
      }

      // Blank line
      if (line.trim() === "") {
        i++;
        continue;
      }

      // Paragraph
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !/^\s*[-*]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i]) &&
        !lines[i].startsWith("&gt; ") &&
        lines[i] !== "&gt;" &&
        !/^\u0000CB\d+\u0000$/.test(lines[i].trim()) &&
        !(lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1]))
      ) {
        para.push(inline(lines[i]));
        i++;
      }
      out.push(`<p>${para.join("<br>")}</p>`);
    }

    // Restore any inline code-block placeholders if needed
    const finalHtml = out.join("").replace(/\u0000CB(\d+)\u0000/g, (_, idx) => codeBlocks[Number(idx)]);
    return formatSpecialBracketTagsInHtml(formatPairedSystemTagsInHtml(finalHtml));
  }

  function formatSpecialBracketTagsInHtml(html) {
    if (!html) return html;
    if (!html.includes("ARTIFACT") && !html.includes("Attachment") && !html.includes("Quote")) {
      return html;
    }
    const saved = [];
    const masked = html.replace(/<(pre|code|a)\b[^>]*>[\s\S]*?<\/\1>|<span class="xml-tag-badge[\s\S]*?<\/span>/gi, (m) => {
      const idx = saved.length;
      saved.push(m);
      return `\u0000BT${idx}\u0000`;
    });
    const out = masked
      .replace(/(@\[Quote(?::[^\]\n]{0,160})?\])/g, '<span class="inline-tag tag-quote">$1</span>')
      .replace(/(\[ARTIFACT(?:[:\s][^\]\n]{0,200})?\])/g, '<span class="inline-tag tag-artifact">$1</span>')
      .replace(/(\[Attachment(?:[:\s][^\]\n]{0,260})?\])/g, '<span class="inline-tag tag-attachment">$1</span>')
      .replace(/(\[ARTIFACT(?=\s|$|<))/g, '<span class="inline-tag tag-artifact">$1</span>')
      .replace(/(\[Attachment(?=\s|$|<))/g, '<span class="inline-tag tag-attachment">$1</span>');
    return out.replace(/\u0000BT(\d+)\u0000/g, (_, idx) => saved[Number(idx)]);
  }

  function formatPairedSystemTagsInHtml(html) {
    if (!html || !html.includes("SYSTEM_MESSAGE")) return html;
    // Protect <pre>...</pre> and <code>...</code> blocks so code snippets never get badged
    const saved = [];
    const masked = html.replace(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
      const idx = saved.length;
      saved.push(m);
      return `\u0000ST${idx}\u0000`;
    });
    if (!masked.includes("SYSTEM_MESSAGE")) return html;

    const re = /&lt;(\/?)SYSTEM_MESSAGE&gt;/g;
    const tokens = [];
    let m;
    while ((m = re.exec(masked)) !== null) {
      tokens.push({
        start: m.index,
        end: m.index + m[0].length,
        isClose: m[1] === "/",
        raw: m[0],
        paired: false,
      });
    }
    if (tokens.length < 2) return html;

    // LIFO stack matching ensures a stray prose mention (e.g. "The following is a <SYSTEM_MESSAGE> not...")
    // stays plain text while the real <SYSTEM_MESSAGE> ... </SYSTEM_MESSAGE> pair matches together.
    const stack = [];
    for (let k = 0; k < tokens.length; k++) {
      if (!tokens[k].isClose) {
        stack.push(k);
      } else if (stack.length > 0) {
        const openIdx = stack.pop();
        tokens[openIdx].paired = true;
        tokens[k].paired = true;
      }
    }

    let anyPaired = false;
    for (const t of tokens) {
      if (t.paired) {
        anyPaired = true;
        break;
      }
    }
    if (!anyPaired) return html;

    const parts = [];
    let pos = 0;
    for (const t of tokens) {
      if (t.start > pos) parts.push(masked.slice(pos, t.start));
      if (t.paired) {
        parts.push(`<span class="xml-tag-badge xml-tag-system">${t.raw}</span>`);
      } else {
        parts.push(t.raw);
      }
      pos = t.end;
    }
    if (pos < masked.length) parts.push(masked.slice(pos));
    return parts.join("").replace(/\u0000ST(\d+)\u0000/g, (_, idx) => saved[Number(idx)]);
  }

  function renderSystemMessageBody(rawText) {
    const escaped = escHtml(String(rawText || ""));
    return formatSpecialBracketTagsInHtml(formatPairedSystemTagsInHtml(escaped));
  }

  // ---------- Step Parsing & Card Creation ----------
  function parseGenericOutput(rawText) {
    const text = unescapeNewlines(rawText || "");
    const chips = [];
    let exitChip = null;
    let createdAt = null;
    let completedAt = null;

    let pos = 0;
    let bodyStart = 0;
    const len = text.length;
    for (let lineIdx = 0; lineIdx < 12 && pos < len; lineIdx++) {
      let nl = text.indexOf("\n", pos);
      if (nl === -1) nl = len;
      const ln = text.slice(pos, nl).trim();
      const nextPos = nl < len ? nl + 1 : len;
      if (!ln) {
        pos = nextPos;
        bodyStart = nextPos;
        continue;
      }
      let m;
      if ((m = ln.match(/^Created At:\s*(.+)$/i))) {
        createdAt = m[1].trim();
        pos = nextPos;
        bodyStart = nextPos;
        continue;
      }
      if ((m = ln.match(/^Completed At:\s*(.+)$/i))) {
        completedAt = m[1].trim();
        pos = nextPos;
        bodyStart = nextPos;
        continue;
      }
      if ((m = ln.match(/^Command exited with code\s+(-?\d+)\.?$/i))) {
        const codeNum = Number(m[1]);
        const isErr = codeNum !== 0;
        exitChip = {
          label: isErr ? `⚠ EXIT: ${m[1]}` : `✓ exit: 0`,
          cls: isErr ? "exit-nonzero" : "exit-ok",
          title: t("card.exitCodeTitle"),
          desc: !isErr ? t("card.exitCodeOk") : t("card.exitCodeErr", { code: m[1] }),
          raw: ln,
        };
        pos = nextPos;
        bodyStart = nextPos;
        continue;
      }
      if ((m = ln.match(/^Showing lines\s+(\d+-\d+)\s+of\s+(\d+)$/i))) {
        chips.push({
          label: `lines: ${m[1]}/${m[2]}`,
          cls: "",
          title: t("card.readLinesTitle"),
          desc: t("card.readLinesDesc", { range: m[1], total: m[2] }),
          raw: ln,
        });
        pos = nextPos;
        bodyStart = nextPos;
        continue;
      }
      if (/^(Command output:|Output:)$/i.test(ln)) {
        pos = nextPos;
        bodyStart = nextPos;
        continue;
      }
      break;
    }

    if (createdAt) {
      const tShort = fmtStepTime(createdAt) || createdAt;
      let durStr = "";
      if (completedAt) {
        const d1 = Date.parse(createdAt);
        const d2 = Date.parse(completedAt);
        if (!Number.isNaN(d1) && !Number.isNaN(d2)) {
          durStr = ` · ⏱ ${((d2 - d1) / 1000).toFixed(1)}${t("card.durationUnit")}`;
        }
      }
      chips.unshift({
        label: `${tShort}${durStr}`,
        cls: "",
        title: t("card.durationTitle"),
        desc: t("card.durationDesc", {
          start: createdAt,
          end: completedAt ? t("card.durationEnd", { end: completedAt }) : "",
        }),
        raw: `Created At: ${createdAt}${completedAt ? `\nCompleted At: ${completedAt}` : ""}`,
      });
    }

    // Put exit code FIRST so errors are immediately visible on the left
    if (exitChip) {
      chips.unshift(exitChip);
    }

    const body = bodyStart > 0 ? text.slice(bodyStart).replace(/^\n+/, "") : text;
    return { chips, body: body || text };
  }

  function stripLineNumbers(text) {
    const str = String(text || "");
    if (!str) return { hadNumbers: false, stripped: str, strippedLines: [], lineNums: [] };

    // Fast pre-check on up to first 15 lines to avoid splitting large non-numbered logs
    let samplePos = 0;
    let sampleNonEmpty = 0;
    let sampleNum = 0;
    for (let k = 0; k < 15 && samplePos < str.length; k++) {
      let nl = str.indexOf("\n", samplePos);
      if (nl === -1) nl = str.length;
      const sampleLine = str.slice(samplePos, nl);
      if (sampleLine.trim()) {
        sampleNonEmpty++;
        if (/^\d+:\s?/.test(sampleLine)) sampleNum++;
      }
      samplePos = nl + 1;
    }
    if (sampleNonEmpty === 0 || sampleNum / sampleNonEmpty < 0.5) {
      return { hadNumbers: false, stripped: str, strippedLines: [], lineNums: [] };
    }

    const lines = str.split("\n");
    let numbered = 0;
    let nonEmpty = 0;
    const strippedLines = new Array(lines.length);
    const lineNums = new Array(lines.length);
    let lastNum = 0;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const m = ln.match(/^(\d+):\s?(.*)$/);
      if (m) {
        lastNum = Number(m[1]);
        lineNums[i] = lastNum;
        strippedLines[i] = m[2];
        if (ln.trim()) nonEmpty++;
        numbered++;
      } else {
        lastNum = lastNum > 0 ? lastNum + 1 : 0;
        lineNums[i] = lastNum || null;
        strippedLines[i] = ln;
        if (ln.trim()) nonEmpty++;
      }
    }
    if (nonEmpty > 0 && numbered / nonEmpty >= 0.7) {
      return {
        hadNumbers: true,
        stripped: null,
        strippedLines,
        lineNums,
      };
    }
    return { hadNumbers: false, stripped: str, strippedLines: lines, lineNums: [] };
  }

  function renderInlineMdLine(rawLine) {
    const safe = escHtml(String(rawLine || "").replace(/\u0000/g, "\uFFFD"));
    return formatSpecialBracketTagsInHtml(formatInlineMdHtml(safe));
  }

  function renderCodeWithGutter(strippedLines, lineNums, maxRows = Infinity) {
    const wrap = document.createElement("div");
    wrap.className = "code-gutter-wrap";
    const total = strippedLines.length;
    const limit = Math.min(total, maxRows);
    const htmlParts = new Array(limit);
    for (let i = 0; i < limit; i++) {
      const n = lineNums[i];
      const numStr = n !== null && n !== undefined ? String(n) : "";
      const txt = strippedLines[i];
      const safeTxt = txt === "" ? " " : escHtml(txt);
      htmlParts[i] = `<div class="code-gutter-row"><div class="code-gutter-num">${numStr}</div><div class="code-gutter-line">${safeTxt}</div></div>`;
    }
    wrap.innerHTML = htmlParts.join("");
    return wrap;
  }

  function renderMarkdownWithGutter(strippedLines, lineNums, maxRows = Infinity) {
    const wrap = document.createElement("div");
    wrap.className = "md-gutter-wrap";
    const total = Math.min(strippedLines.length, maxRows);
    const htmlParts = new Array(total);
    const fenceBlocks = [];
    let inCode = false;

    for (let i = 0; i < total; i++) {
      const ln = strippedLines[i];
      const n = lineNums[i];
      const numLabel = n !== null && n !== undefined ? String(n) : "";

      if (inCode) {
        if (/^\s*```/.test(ln)) {
          inCode = false;
          htmlParts[i] = `<div class="md-gutter-row is-fence"><div class="md-gutter-num">${numLabel}</div><div class="md-gutter-cell md">${escHtml(ln.trim() || "```")}</div></div>`;
        } else {
          const safeCode = ln === "" ? " " : escHtml(ln);
          htmlParts[i] = `<div class="md-gutter-row is-code-line"><div class="md-gutter-num">${numLabel}</div><div class="md-gutter-cell md">${safeCode}</div></div>`;
        }
        continue;
      }

      const mFence = ln.match(/^\s*```([a-zA-Z0-9_-]*)\s*$/);
      if (mFence) {
        inCode = true;
        const buf = [];
        for (let j = i + 1; j < strippedLines.length; j++) {
          if (/^\s*```/.test(strippedLines[j])) break;
          buf.push(strippedLines[j]);
        }
        const fIdx = fenceBlocks.length;
        fenceBlocks.push(buf.join("\n").replace(/[\r\n\s]+$/g, ""));
        htmlParts[i] =
          `<div class="md-gutter-row is-fence"><div class="md-gutter-num">${numLabel}</div>` +
          `<div class="md-gutter-cell md"><span>${escHtml(ln.trim())}</span>` +
          `<button type="button" class="copy-btn" data-fence-idx="${fIdx}">Copy</button></div></div>`;
        continue;
      }

      let rowCls = "md-gutter-row";
      let cellHtml = " ";
      if (!ln.trim()) {
        rowCls = "md-gutter-row is-blank";
      } else if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(ln)) {
        cellHtml = "<hr>";
      } else {
        const hMatch = ln.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
        if (hMatch) {
          const lvl = hMatch[1].length;
          cellHtml = `<h${lvl}>${renderInlineMdLine(hMatch[2])}</h${lvl}>`;
        } else if (/^\s*>\s?/.test(ln)) {
          cellHtml = `<blockquote>${renderInlineMdLine(ln.replace(/^\s*>\s?/, ""))}</blockquote>`;
        } else if (/^\s*\|.*\|\s*$/.test(ln) || (/\|/.test(ln) && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(ln))) {
          if (/^\s*\|?[\s:-]+\|[\s|:-]*$/.test(ln)) {
            cellHtml = `<div class="md-table-sep">${escHtml(ln.trim())}</div>`;
          } else {
            const cells = ln.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
            const isHdr = i + 1 < strippedLines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(strippedLines[i + 1]);
            cellHtml =
              `<div class="md-table-line${isHdr ? " is-header" : ""}">` +
              cells.map((c) => `<div class="md-table-cell">${renderInlineMdLine(c)}</div>`).join("") +
              `</div>`;
          }
        } else {
          const mUl = ln.match(/^(\s*)[-*]\s+(.*)$/);
          const mOl = ln.match(/^(\s*)(\d+)\.\s+(.*)$/);
          if (mUl) {
            const indent = Math.min(4, Math.floor(mUl[1].length / 2));
            cellHtml = `<ul class="md-line-list" style="margin-left:${indent * 16}px !important"><li>${renderInlineMdLine(mUl[2])}</li></ul>`;
          } else if (mOl) {
            const indent = Math.min(4, Math.floor(mOl[1].length / 2));
            const val = Number(mOl[2]) || 1;
            cellHtml = `<ol start="${val}" class="md-line-list" style="margin-left:${indent * 16}px !important"><li value="${val}">${renderInlineMdLine(mOl[3])}</li></ol>`;
          } else {
            cellHtml = renderInlineMdLine(ln);
          }
        }
      }
      htmlParts[i] = `<div class="${rowCls}"><div class="md-gutter-num">${numLabel}</div><div class="md-gutter-cell md">${cellHtml}</div></div>`;
    }

    wrap.innerHTML = htmlParts.join("");
    if (fenceBlocks.length > 0) {
      mdFenceBlocksMap.set(wrap, fenceBlocks);
      wrap.addEventListener("click", (e) => {
        const btn = e.target.closest(".copy-btn[data-fence-idx]");
        if (!btn) return;
        const idx = Number(btn.dataset.fenceIdx);
        const blocks = mdFenceBlocksMap.get(wrap);
        if (!blocks || idx < 0 || idx >= blocks.length) return;
        navigator.clipboard.writeText(blocks[idx]).then(() => {
          btn.textContent = "✓";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        });
      });
    }
    return wrap;
  }

  function looksLikeMarkdown(text) {
    if (!text) return false;
    const t = String(text);
    if (/^\s*```/m.test(t)) return true;
    if (/^\s{0,3}#{1,6}\s+\S/m.test(t)) return true;
    if (/^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/m.test(t)) return true;
    if (/\[[^\]\n]+\]\((?:https?:\/\/|file:\/\/\/)[^)\s]+\)/.test(t)) return true;
    if (/^\s*>\s+\S/m.test(t) && (/\*\*[^*\n]+\*\*/.test(t) || /^\s*[-*]\s+/m.test(t))) return true;
    if (/\*\*[^*\n]{2,}\*\*/.test(t) && /^\s*(?:[-*]|\d+\.)\s+/m.test(t)) return true;
    return false;
  }

  let _projectFilesSepRe = null;
  let _projectFilesPlainRe = null;
  function rebuildProjectFilesRegex() {
    if (!state.projectFiles || !state.projectFiles.length) {
      _projectFilesSepRe = null;
      _projectFilesPlainRe = null;
      return;
    }
    const sorted = Array.from(new Set(state.projectFiles))
      .filter((n) => n && n.length >= 3)
      .sort((a, b) => b.length - a.length);
    if (!sorted.length) {
      _projectFilesSepRe = null;
      _projectFilesPlainRe = null;
      return;
    }
    const withSep = [];
    const plain = [];
    for (const n of sorted) {
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\//g, "[/\\\\]");
      if (/[./\\]/.test(n)) withSep.push(esc);
      else plain.push(esc);
    }
    _projectFilesSepRe = withSep.length
      ? new RegExp(`(?<![A-Za-z0-9_./\\\\-])(${withSep.join("|")})(?![A-Za-z0-9_./\\\\-])`, "g")
      : null;
    _projectFilesPlainRe = plain.length
      ? new RegExp(`(?<![A-Za-z0-9_./\\\\-])(${plain.join("|")})(?![A-Za-z0-9_./\\\\-])`, "g")
      : null;
  }

  function _cleanTrailingPunct(raw) {
    let s = raw;
    while (s.length > 1) {
      const last = s[s.length - 1];
      if (last === "." || last === "," || last === ";" || last === ":" || last === "!" || last === "?") {
        s = s.slice(0, -1);
      } else if (last === ")") {
        const opens = (s.match(/\(/g) || []).length;
        const closes = (s.match(/\)/g) || []).length;
        if (closes > opens) s = s.slice(0, -1);
        else break;
      } else {
        break;
      }
    }
    return s;
  }

  function _buildAutoAnchor(kind, rawVal, displayText, opts = {}) {
    const a = document.createElement("a");
    const openModeLabel =
      state.folderOpenMode === "totalcmd"
        ? "Total Commander"
        : state.folderOpenMode === "explorer"
        ? t("card.folderModeExplorer")
        : state.folderOpenMode === "system"
        ? t("card.folderModeFileManager")
        : t("card.folderModeBrowser");

    if (kind === "web") {
      a.href = rawVal;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "link-auto";
      a.dataset.tipTitle = t("card.autoLinkWebTitle");
      a.dataset.tipDesc = t("card.autoLinkWebDesc");
      a.dataset.tipRaw = rawVal;
      a.textContent = displayText;
      return a;
    }

    if (kind === "fileurl") {
      const res = resolveFileHref(rawVal, opts);
      a.href = res.href;
      if (res.convId) {
        a.className = "transcript-link link-auto";
        a.dataset.convId = res.convId;
      } else {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "link-auto local-path-link";
        if (res.localPath) a.dataset.localPath = res.localPath;
        if (res.isDir) a.dataset.isDir = "1";
      }
      a.dataset.tipTitle = res.isDir
        ? t("card.autoLinkLocalDirTitle", { mode: openModeLabel })
        : t("card.autoLinkLocalFileTitle");
      a.dataset.tipDesc = t("card.autoLinkFileUriDesc");
      a.dataset.tipRaw = res.localPath || rawVal;
      a.textContent = displayText;
      return a;
    }

    // Local / template / short project path
    const mTrans = rawVal.match(/brain[/\\]([0-9a-f-]{8,})[/\\]\.system_generated[/\\]logs[/\\]transcript(?:_full)?\.jsonl/i);
    if (mTrans && !opts.treatTranscriptAsFile) {
      a.href = `#conv=${encodeURIComponent(mTrans[1])}`;
      a.className = "transcript-link link-auto";
      a.dataset.convId = mTrans[1];
      a.dataset.tipTitle = t("card.autoLinkTranscript");
      a.dataset.tipDesc = t("card.autoLinkTranscriptDesc");
      a.dataset.tipRaw = rawVal;
      a.textContent = displayText;
      return a;
    }

    const isDir = isLikelyDirectoryPath(rawVal);
    const isShort = kind === "short";
    const rootSep = state.projectRoot && state.projectRoot.includes("/") && !state.projectRoot.includes("\\") ? "/" : "\\";
    const relJoined = rootSep === "/" ? rawVal.replace(/\\/g, "/") : rawVal.replace(/\//g, "\\");
    const resolvedDisplayPath = isShort && state.projectRoot
      ? `${state.projectRoot.replace(/[\\/]+$/, "")}${rootSep}${relJoined}`
      : rawVal;
    a.href = makeLocalPathHref(resolvedDisplayPath);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = `link-auto local-path-link${isShort ? " link-auto-short" : ""}`;
    a.dataset.localPath = resolvedDisplayPath;
    if (isDir) a.dataset.isDir = "1";

    if (isShort) {
      a.dataset.tipTitle = isDir
        ? t("card.autoLinkProjectDirTitle", { mode: openModeLabel })
        : t("card.autoLinkProjectFileTitle");
      a.dataset.tipDesc = t("card.autoLinkProjectDesc");
    } else if (kind === "template") {
      a.dataset.tipTitle = isDir
        ? t("card.autoLinkTemplateDirTitle", { mode: openModeLabel })
        : t("card.autoLinkTemplateFileTitle");
      a.dataset.tipDesc = t("card.autoLinkTemplateDesc");
    } else {
      a.dataset.tipTitle = isDir
        ? t("card.autoLinkLocalDirTitle", { mode: openModeLabel })
        : t("card.autoLinkLocalFileTitle");
      a.dataset.tipDesc = isDir
        ? t("card.autoLinkOpenWithDesc", { mode: openModeLabel })
        : t("card.autoLinkCopyFileUriDesc");
    }
    a.dataset.tipRaw = expandLocalTemplatePath(resolvedDisplayPath);
    a.textContent = displayText;
    return a;
  }

  function linkifyElement(rootEl, opts = {}) {
    if (!rootEl || state.disableAutoLinks) return;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length < 3) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest("a, button, script, style, textarea, input, select, .badge, .xml-tag-badge, .step-num-chip, .meta-chip, .status-pill, .tok-bar, .code-gutter-num, .md-gutter-num, .compaction-num, .tool-ok-badge, .tool-err-badge, .cmd-prefix, .copy-bar, .tool-name, .arg-key")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    let cur;
    while ((cur = walker.nextNode())) nodes.push(cur);
    if (!nodes.length) return;

    const HAS_LINK_HINT_RE = /[:~%<$]|\/(?:home|Users|root|opt|var|tmp|etc|usr|mnt|media|srv)\//;
    const HAS_SEP_HINT_RE = /[./\\]/;
    const MAIN_RE = /https?:\/\/[^\s<>"'`)\]]+|file:\/\/\/[^\s<>"'`)\]]+|"([A-Za-z]:[/\\][^"\r\n*?<>|]{2,220})"|'([A-Za-z]:[/\\][^'\r\n*?<>|]{2,220})'|"(\/(?:home|Users|root|opt|var|tmp|etc|usr|mnt|media|srv)\/[^"\r\n*?<>|]{1,220})"|'(\/(?:home|Users|root|opt|var|tmp|etc|usr|mnt|media|srv)\/[^'\r\n*?<>|]{1,220})'|(?:<appDataDir>|%USERPROFILE%|%LOCALAPPDATA%|%APPDATA%|\$\{?HOME\}?|~)(?:[/\\](?:<conversation-id>|[^\s<>"'`*?|\r\n,;()[\]]+))+[/\\]?|(?<![A-Za-z0-9_:])[A-Za-z]:[/\\][A-Za-z0-9_.~%а-яА-ЯёЁ-][^\s<>"'`*?|\r\n,;()[\]]*[/\\]?|(?<![A-Za-z0-9_.:/-])\/(?:home|Users|root|opt|var|tmp|etc|usr|mnt|media|srv)\/[A-Za-z0-9_.~%+@-][^\s<>"'`*?|\r\n,;()[\]]*\/?/g;

    const getShortRegexForText = (txt) => {
      if (!state.linkifyProjectFiles || !txt) return null;
      if (_projectFilesSepRe && HAS_SEP_HINT_RE.test(txt)) return _projectFilesSepRe;
      return _projectFilesPlainRe;
    };

    const appendShortOrText = (frag, txt) => {
      if (!state.linkifyProjectFiles || !txt) {
        frag.appendChild(document.createTextNode(txt));
        return;
      }
      const useSep = Boolean(_projectFilesSepRe && HAS_SEP_HINT_RE.test(txt));
      const activeRe = useSep ? _projectFilesSepRe : _projectFilesPlainRe;
      if (!activeRe) {
        frag.appendChild(document.createTextNode(txt));
        return;
      }
      // If text contains separators, check _projectFilesSepRe (plus rare plain names if both exist via second pass only when needed)
      activeRe.lastIndex = 0;
      let pos = 0;
      let m;
      while ((m = activeRe.exec(txt)) !== null) {
        if (m.index > pos) frag.appendChild(document.createTextNode(txt.slice(pos, m.index)));
        frag.appendChild(_buildAutoAnchor("short", m[1], m[1], opts));
        pos = m.index + m[0].length;
      }
      if (pos < txt.length) frag.appendChild(document.createTextNode(txt.slice(pos)));
    };

    for (const textNode of nodes) {
      const text = textNode.nodeValue;
      const maybeMain = HAS_LINK_HINT_RE.test(text);

      if (!maybeMain) {
        if (!state.linkifyProjectFiles) continue;
        const re = getShortRegexForText(text);
        if (!re) continue;
        re.lastIndex = 0;
        if (re.test(text)) {
          const frag = document.createDocumentFragment();
          appendShortOrText(frag, text);
          textNode.parentNode.replaceChild(frag, textNode);
        }
        continue;
      }

      MAIN_RE.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let pos = 0;
      let matchedAny = false;
      let m;

      while ((m = MAIN_RE.exec(text)) !== null) {
        const rawWhole = m[0];
        const idx = m.index;
        if (idx > pos) appendShortOrText(frag, text.slice(pos, idx));

        if (m[1] || m[2] || m[3] || m[4]) {
          // Quoted Windows or POSIX path: keep quote chars outside the link
          const qChar = rawWhole[0];
          const inner = (m[1] || m[2] || m[3] || m[4]).trim();
          const qKind = m[3] || m[4] ? "posix" : "win";
          frag.appendChild(document.createTextNode(qChar));
          frag.appendChild(_buildAutoAnchor(qKind, inner, inner, opts));
          frag.appendChild(document.createTextNode(qChar));
          pos = idx + rawWhole.length;
          matchedAny = true;
          continue;
        }

        const clean = _cleanTrailingPunct(rawWhole);
        const tail = rawWhole.slice(clean.length);
        let kind = "win";
        if (/^https?:\/\//i.test(clean)) kind = "web";
        else if (/^file:\/\//i.test(clean)) kind = "fileurl";
        else if (/^(?:<appDataDir>|%USERPROFILE%|%LOCALAPPDATA%|%APPDATA%|\$\{?HOME\}?|~)/i.test(clean)) kind = "template";
        else if (clean.startsWith("/")) kind = "posix";

        frag.appendChild(_buildAutoAnchor(kind, clean, clean, opts));
        if (tail) appendShortOrText(frag, tail);
        pos = idx + rawWhole.length;
        matchedAny = true;
      }

      if (matchedAny) {
        if (pos < text.length) appendShortOrText(frag, text.slice(pos));
        textNode.parentNode.replaceChild(frag, textNode);
      } else if (state.linkifyProjectFiles) {
        const re = getShortRegexForText(text);
        if (re) {
          re.lastIndex = 0;
          if (re.test(text)) {
            appendShortOrText(frag, text);
            textNode.parentNode.replaceChild(frag, textNode);
          }
        }
      }
    }
  }

  function shouldUnfoldSearchTail(headStr, tailStr, fullStr) {
    if (!state.stepQuery || !tailStr) return false;
    const ast = getCachedSearchAst(state.stepQuery);
    if (!ast) return false;
    const termObjs = getPositiveSearchTermObjs(ast);
    if (!termObjs.length) return false;
    const sOpts = getSearchOpts();
    const headLow = headStr.toLowerCase();
    const tailLow = tailStr.toLowerCase();
    if (!evalSearchAst(ast, headStr, sOpts) && evalSearchAst(ast, fullStr, sOpts)) {
      return true;
    }
    return termObjs.some(
      (term) =>
        findTermOccurrences(tailStr, tailLow, term.text, term.lower, sOpts, false).length > 0 &&
        findTermOccurrences(headStr, headLow, term.text, term.lower, sOpts, false).length === 0
    );
  }

  function renderGenericContent(container, rawContent, toolName = "", toolArgs = null, preParsed = null, cardEl = null) {
    const parsed = preParsed || parseGenericOutput(rawContent);
    const bodyText = parsed.body;
    const targetPath = String((toolArgs && (toolArgs.Path || toolArgs.TargetFile)) || "");
    const isMdFile = /\.(?:md|markdown)$/i.test(targetPath);
    const hasLinesChip = parsed.chips.some((c) => c.label.startsWith("lines:"));
    const isReadTool = toolName === "read_file" || toolName === "view_file" || (!toolName && hasLinesChip);
    const isFileTool =
      isReadTool || ["edit_file", "replace_file_content", "write_file", "write_to_file"].includes(toolName);
    const isCmdTool =
      ["run_command", "command_status", "send_command_input", "read_terminal", "schedule", "manage_task"].includes(toolName) ||
      /^(?:Command exited with code\s+-?\d+|Command output:|Tool is running as a background task|Wait cancelled\b)/im.test(
        unescapeNewlines(rawContent || "").slice(0, 600)
      );
    const lineNumInfo =
      isReadTool || (!isFileTool && hasLinesChip)
        ? stripLineNumbers(bodyText)
        : { hadNumbers: false, stripped: bodyText, strippedLines: [], lineNums: [] };
    const getMdSourceText = () =>
      lineNumInfo.hadNumbers
        ? (lineNumInfo.stripped !== null ? lineNumInfo.stripped : lineNumInfo.strippedLines.join("\n"))
        : bodyText;

    let isMd = false;
    if (isReadTool) {
      isMd = isMdFile;
    } else if (isFileTool || isCmdTool) {
      isMd = false;
    } else if (toolName === "search_web") {
      isMd = true;
    } else if (!lineNumInfo.hadNumbers) {
      const isStrongMd = /^\s*```|^\s{0,3}#{1,6}\s+\S|^\s*\|.+\|\s*\n\s*\|[\s:|-]+\|/m.test(bodyText);
      isMd = (!state.monoOutputs && looksLikeMarkdown(bodyText)) || isStrongMd;
    }

    const contentWrap = document.createElement("div");
    contentWrap.className = "generic-content-wrap";

    const needRawToggle = isMd || lineNumInfo.hadNumbers;
    const rawLabelText = lineNumInfo.hadNumbers ? t("card.rawWithLineNums") : t("card.rawPlain");
    const backLabelText = isMd ? t("card.showMarkdown") : t("card.showWithLineNums");
    const registeredBtns = [];
    let toggleRawFn = null;

    const registerRawBtn = (btn) => {
      if (!btn || !toggleRawFn) return;
      registeredBtns.push(btn);
      if (hasModeCtrl) btn.classList.toggle("hidden", curReadMode === "hide");
      btn.addEventListener("click", () => toggleRawFn(btn));
    };

    const syncRawButtons = (showingRaw) => {
      for (const b of registeredBtns) {
        if (b.classList.contains("head-raw-btn")) {
          b.classList.toggle("active", showingRaw);
          b.textContent = showingRaw ? backLabelText : rawLabelText;
        } else {
          b.textContent = showingRaw ? backLabelText : rawLabelText;
        }
      }
    };

    // Support 3 display modes ("scroll" 18-line box | "full" | "hide") for read_file/view_file and any tall output
    const totalBodyLines = lineNumInfo.hadNumbers
      ? lineNumInfo.strippedLines.length
      : (bodyText ? bodyText.split("\n").length : 0);
    const isLongOutput = !isReadTool && (totalBodyLines > 16 || bodyText.length > 850);
    const hasModeCtrl = isReadTool || isLongOutput;

    let curReadMode = hasModeCtrl
      ? (state.expandAllOutputs || state.readDisplayMode === "full"
          ? "full"
          : (isReadTool && state.readDisplayMode === "hide" ? "hide" : "scroll"))
      : "scroll";
    const readScrollBox = hasModeCtrl ? document.createElement("div") : null;
    const viewTarget = readScrollBox || contentWrap;
    if (readScrollBox) {
      readScrollBox.className = `read-scroll-box inner-scroll${curReadMode === "full" ? " is-full" : ""}`;
      attachInnerScrollGuard(readScrollBox);
      contentWrap.appendChild(readScrollBox);
    }

    const registeredFullBtns = [];
    const readModeCallbacks = [];
    let applyReadModeHook = null;

    const getFullBtnLabel = (mode) => (mode === "full" ? t("card.collapseToScroll") : t("card.showFull"));

    const setReadMode = (nextMode, triggerEl = null) => {
      if (!hasModeCtrl) return;
      if (nextMode !== "scroll" && nextMode !== "full" && nextMode !== "hide") return;
      // When expanding via bottom button, anchor the visible top box so content expands downward instead of jumping down to the tail
      const isBottomTrigger = Boolean(triggerEl && triggerEl.classList.contains("show-more-btn"));
      const anchorEl = nextMode === "full" && isBottomTrigger ? (readScrollBox || contentWrap) : triggerEl;
      preserveScrollAnchor(() => {
        curReadMode = nextMode;
        if (applyReadModeHook) applyReadModeHook(curReadMode);
        const fullLbl = getFullBtnLabel(curReadMode);
        for (const b of registeredFullBtns) {
          b.textContent = fullLbl;
          b.classList.toggle("hidden", curReadMode === "hide");
          if (b.classList.contains("head-raw-btn")) {
            b.classList.toggle("active", curReadMode === "full");
          }
        }
        for (const b of registeredBtns) {
          b.classList.toggle("hidden", curReadMode === "hide");
        }
        for (const cb of readModeCallbacks) cb(curReadMode);
      }, anchorEl);
      if (cardEl) scheduleCardOverflowCheck(cardEl);
      requestAnimationFrame(scheduleMinimapSync);
    };

    const registerFullBtn = (btn) => {
      if (!btn || !hasModeCtrl) return;
      registeredFullBtns.push(btn);
      btn.textContent = getFullBtnLabel(curReadMode);
      btn.classList.toggle("hidden", curReadMode === "hide");
      if (btn.classList.contains("head-raw-btn")) {
        btn.classList.toggle("active", curReadMode === "full");
      }
      btn.addEventListener("click", () => {
        setReadMode(curReadMode === "full" ? "scroll" : "full", btn);
      });
    };

    const onReadModeChange = (cb) => {
      if (typeof cb === "function") readModeCallbacks.push(cb);
    };

    if (isMd) {
      let mdViewEl;
      let foldBtn = null;
      if (lineNumInfo.hadNumbers && lineNumInfo.lineNums.length > 0) {
        const totalLines = lineNumInfo.strippedLines.length;
        const SCROLL_CAP = 800;
        const LIMIT_LINES = hasModeCtrl ? SCROLL_CAP : 150;
        const needFold = hasModeCtrl
          ? (curReadMode !== "full" && totalLines > SCROLL_CAP)
          : (!state.expandAllOutputs && totalLines > LIMIT_LINES);
        let effectiveLimit = needFold ? LIMIT_LINES : Infinity;
        if (needFold && state.stepQuery) {
          const headRaw = lineNumInfo.strippedLines.slice(0, effectiveLimit).join("\n");
          const tailRaw = lineNumInfo.strippedLines.slice(effectiveLimit).join("\n");
          const fullRaw = lineNumInfo.strippedLines.join("\n");
          if (shouldUnfoldSearchTail(headRaw, tailRaw, fullRaw)) {
            effectiveLimit = Infinity;
          }
        }
        const needFoldEffective = effectiveLimit < totalLines;
        mdViewEl = renderMarkdownWithGutter(
          lineNumInfo.strippedLines,
          lineNumInfo.lineNums,
          needFoldEffective ? effectiveLimit : Infinity
        );
        viewTarget.appendChild(mdViewEl);

        if (!hasModeCtrl && needFoldEffective) {
          foldBtn = document.createElement("button");
          foldBtn.type = "button";
          foldBtn.className = "show-more-btn";
          const collapsedHtml = t("card.showFullFoldHtml", { shown: LIMIT_LINES, total: totalLines });
          foldBtn.innerHTML = collapsedHtml;
          let expanded = false;
          foldBtn.addEventListener("click", () => {
            const expanding = !expanded;
            preserveScrollAnchor(() => {
              expanded = !expanded;
              const nextEl = renderMarkdownWithGutter(
                lineNumInfo.strippedLines,
                lineNumInfo.lineNums,
                expanded ? Infinity : LIMIT_LINES
              );
              linkifyElement(nextEl);
              if (state.stepQuery) highlightMatches(nextEl, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
              mdViewEl.replaceWith(nextEl);
              mdViewEl = nextEl;
              foldBtn.innerHTML = expanded ? escHtml(t("card.collapseToLines", { lines: LIMIT_LINES })) : collapsedHtml;
            }, expanding ? contentWrap : foldBtn);
          });
          contentWrap.appendChild(foldBtn);
        } else if (hasModeCtrl && totalLines > SCROLL_CAP) {
          applyReadModeHook = ((origHook) => (mode) => {
            if (mode === "full" && mdViewEl.childElementCount < totalLines) {
              const nextEl = renderMarkdownWithGutter(lineNumInfo.strippedLines, lineNumInfo.lineNums, Infinity);
              linkifyElement(nextEl);
              if (state.stepQuery) highlightMatches(nextEl, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
              mdViewEl.replaceWith(nextEl);
              mdViewEl = nextEl;
            }
            if (origHook) origHook(mode);
          })(applyReadModeHook);
        }
      } else {
        mdViewEl = document.createElement("div");
        mdViewEl.className = "md";
        mdViewEl.innerHTML = renderMarkdown(getMdSourceText());
        viewTarget.appendChild(mdViewEl);
      }

      if (needRawToggle) {
        let rawPre = null;
        let showingRaw = false;
        const bottomRawBtn = document.createElement("button");
        bottomRawBtn.type = "button";
        bottomRawBtn.className = "show-more-btn";
        bottomRawBtn.textContent = rawLabelText;
        toggleRawFn = (triggerEl = null) => {
          preserveScrollAnchor(() => {
            showingRaw = !showingRaw;
            if (showingRaw) {
              if (!rawPre) {
                rawPre = document.createElement("pre");
                rawPre.className = hasModeCtrl ? "generic-pre expanded" : "generic-pre expanded inner-scroll";
                if (!hasModeCtrl) {
                  attachInnerScrollGuard(rawPre);
                }
                rawPre.textContent = bodyText;
                linkifyElement(rawPre);
                if (state.stepQuery) highlightMatches(rawPre, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
                if (hasModeCtrl) viewTarget.appendChild(rawPre);
                else contentWrap.insertBefore(rawPre, foldBtn || bottomRawBtn);
              } else {
                rawPre.classList.remove("hidden");
              }
              mdViewEl.classList.add("hidden");
              if (foldBtn) foldBtn.classList.add("hidden");
            } else {
              if (rawPre) rawPre.classList.add("hidden");
              mdViewEl.classList.remove("hidden");
              if (foldBtn) foldBtn.classList.remove("hidden");
            }
            syncRawButtons(showingRaw);
          }, triggerEl || bottomRawBtn);
          if (cardEl) scheduleCardOverflowCheck(cardEl);
        };
        contentWrap.appendChild(bottomRawBtn);
        registerRawBtn(bottomRawBtn);
      }
    } else if (lineNumInfo.hadNumbers && lineNumInfo.lineNums.length > 0) {
      const totalLines = lineNumInfo.strippedLines.length;
      const SCROLL_CAP = 800;
      const LIMIT_LINES = hasModeCtrl ? SCROLL_CAP : 150;
      const needFold = hasModeCtrl
        ? (curReadMode !== "full" && totalLines > SCROLL_CAP)
        : (!state.expandAllOutputs && totalLines > LIMIT_LINES);

      const lineLimit = needFold ? (hasModeCtrl ? SCROLL_CAP : LIMIT_LINES) : Infinity;
      let effectiveLimit = lineLimit;
      if (needFold && state.stepQuery) {
        const headRaw = lineNumInfo.strippedLines.slice(0, lineLimit).join("\n");
        const tailRaw = lineNumInfo.strippedLines.slice(lineLimit).join("\n");
        const fullRaw = lineNumInfo.strippedLines.join("\n");
        if (shouldUnfoldSearchTail(headRaw, tailRaw, fullRaw)) {
          effectiveLimit = Infinity;
        }
      }
      const needFoldEffective = effectiveLimit < totalLines;

      let codeViewEl = renderCodeWithGutter(
        lineNumInfo.strippedLines,
        lineNumInfo.lineNums,
        needFoldEffective ? effectiveLimit : Infinity
      );
      viewTarget.appendChild(codeViewEl);

      let foldBtn = null;
      if (!hasModeCtrl && needFoldEffective) {
        foldBtn = document.createElement("button");
        foldBtn.type = "button";
        foldBtn.className = "show-more-btn";
        const collapsedHtml = t("card.showFullFoldHtml", { shown: LIMIT_LINES, total: totalLines });
        foldBtn.innerHTML = collapsedHtml;
        let expanded = false;
        foldBtn.addEventListener("click", () => {
          const expanding = !expanded;
          preserveScrollAnchor(() => {
            expanded = !expanded;
            const nextEl = renderCodeWithGutter(
              lineNumInfo.strippedLines,
              lineNumInfo.lineNums,
              expanded ? Infinity : LIMIT_LINES
            );
            linkifyElement(nextEl);
            if (state.stepQuery) highlightMatches(nextEl, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
            codeViewEl.replaceWith(nextEl);
            codeViewEl = nextEl;
            foldBtn.innerHTML = expanded ? escHtml(t("card.collapseToLines", { lines: LIMIT_LINES })) : collapsedHtml;
          }, expanding ? contentWrap : foldBtn);
        });
        contentWrap.appendChild(foldBtn);
      } else if (hasModeCtrl && totalLines > SCROLL_CAP) {
        applyReadModeHook = ((origHook) => (mode) => {
          if (mode === "full" && codeViewEl.childElementCount < totalLines) {
            const nextEl = renderCodeWithGutter(lineNumInfo.strippedLines, lineNumInfo.lineNums, Infinity);
            linkifyElement(nextEl);
            if (state.stepQuery) highlightMatches(nextEl, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
            codeViewEl.replaceWith(nextEl);
            codeViewEl = nextEl;
          }
          if (origHook) origHook(mode);
        })(applyReadModeHook);
      }

      let rawPre = null;
      let showingRaw = false;
      const bottomRawBtn = document.createElement("button");
      bottomRawBtn.type = "button";
      bottomRawBtn.className = "show-more-btn";
      bottomRawBtn.textContent = rawLabelText;
      toggleRawFn = (triggerEl = null) => {
        preserveScrollAnchor(() => {
          showingRaw = !showingRaw;
          if (showingRaw) {
            if (!rawPre) {
              rawPre = document.createElement("pre");
              rawPre.className = hasModeCtrl ? "generic-pre expanded" : "generic-pre expanded inner-scroll";
              if (!hasModeCtrl) {
                attachInnerScrollGuard(rawPre);
              }
              rawPre.textContent = bodyText;
              linkifyElement(rawPre);
              if (state.stepQuery) highlightMatches(rawPre, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
              if (hasModeCtrl) viewTarget.appendChild(rawPre);
              else contentWrap.insertBefore(rawPre, foldBtn || bottomRawBtn);
            } else {
              rawPre.classList.remove("hidden");
            }
            codeViewEl.classList.add("hidden");
            if (foldBtn) foldBtn.classList.add("hidden");
          } else {
            if (rawPre) rawPre.classList.add("hidden");
            codeViewEl.classList.remove("hidden");
            if (foldBtn) foldBtn.classList.remove("hidden");
          }
          syncRawButtons(showingRaw);
        }, triggerEl || bottomRawBtn);
        if (cardEl && hasModeCtrl) scheduleCardOverflowCheck(cardEl);
      };
      contentWrap.appendChild(bottomRawBtn);
      registerRawBtn(bottomRawBtn);
    } else {
      const allLines = bodyText.split("\n");
      const totalLines = allLines.length;
      const SCROLL_CAP = 800;
      const LIMIT_LINES = hasModeCtrl ? SCROLL_CAP : 150;
      const needFold = hasModeCtrl
        ? (curReadMode !== "full" && totalLines > SCROLL_CAP)
        : (!state.expandAllOutputs && totalLines > LIMIT_LINES);
      let effectiveLimit = needFold ? LIMIT_LINES : Infinity;
      if (needFold && state.stepQuery) {
        const headRaw = allLines.slice(0, LIMIT_LINES).join("\n");
        const tailRaw = allLines.slice(LIMIT_LINES).join("\n");
        if (shouldUnfoldSearchTail(headRaw, tailRaw, bodyText)) {
          effectiveLimit = Infinity;
        }
      }
      const needFoldEffective = effectiveLimit < totalLines;

      const pre = document.createElement("pre");
      pre.className = hasModeCtrl ? "generic-pre expanded" : "generic-pre inner-scroll";
      if (!hasModeCtrl) {
        attachInnerScrollGuard(pre);
      }
      pre.textContent = needFoldEffective ? allLines.slice(0, effectiveLimit).join("\n") : bodyText;
      viewTarget.appendChild(pre);

      if (!hasModeCtrl && needFoldEffective) {
        const btn = document.createElement("button");
        btn.className = "show-more-btn";
        btn.type = "button";
        const collapsedHtml = t("card.showFullFoldHtml", { shown: LIMIT_LINES, total: totalLines });
        btn.innerHTML = collapsedHtml;
        let expanded = false;
        btn.addEventListener("click", () => {
          const expanding = !expanded;
          preserveScrollAnchor(() => {
            expanded = !expanded;
            pre.textContent = expanded ? bodyText : allLines.slice(0, LIMIT_LINES).join("\n");
            linkifyElement(pre);
            if (state.stepQuery) highlightMatches(pre, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
            btn.innerHTML = expanded ? escHtml(t("card.collapseToLines", { lines: LIMIT_LINES })) : collapsedHtml;
          }, expanding ? contentWrap : btn);
        });
        contentWrap.appendChild(btn);
      } else if (hasModeCtrl && totalLines > SCROLL_CAP) {
        applyReadModeHook = ((origHook) => (mode) => {
          if (mode === "full" && pre.textContent.length < bodyText.length) {
            pre.textContent = bodyText;
            linkifyElement(pre);
            if (state.stepQuery) highlightMatches(pre, state.stepQuery, { ...getSearchOpts(), trimNonMatching: false });
          }
          if (origHook) origHook(mode);
        })(applyReadModeHook);
      }
    }

    if (hasModeCtrl) {
      const hiddenNote = document.createElement("div");
      hiddenNote.className = "read-hidden-note";
      const hiddenLabel = document.createElement("span");
      hiddenLabel.textContent = isReadTool ? t("card.fileHidden") : t("card.outputHidden");
      hiddenNote.appendChild(hiddenLabel);
      const showScrollBtn = document.createElement("button");
      showScrollBtn.type = "button";
      showScrollBtn.className = "show-more-btn";
      showScrollBtn.style.marginTop = "0";
      showScrollBtn.textContent = t("card.showInScroll");
      showScrollBtn.addEventListener("click", () => setReadMode("scroll", showScrollBtn));
      const showFullFromHideBtn = document.createElement("button");
      showFullFromHideBtn.type = "button";
      showFullFromHideBtn.className = "show-more-btn";
      showFullFromHideBtn.style.marginTop = "0";
      showFullFromHideBtn.textContent = t("card.showFull");
      showFullFromHideBtn.addEventListener("click", () => setReadMode("full", showFullFromHideBtn));
      hiddenNote.appendChild(showScrollBtn);
      hiddenNote.appendChild(showFullFromHideBtn);
      contentWrap.appendChild(hiddenNote);

      const bottomFullBtn = document.createElement("button");
      bottomFullBtn.type = "button";
      bottomFullBtn.className = "show-more-btn";
      contentWrap.appendChild(bottomFullBtn);
      registerFullBtn(bottomFullBtn);

      const baseHook = applyReadModeHook;
      applyReadModeHook = (mode) => {
        if (baseHook) baseHook(mode);
        readScrollBox.classList.toggle("hidden", mode === "hide");
        readScrollBox.classList.toggle("is-full", mode === "full");
        hiddenNote.classList.toggle("hidden", mode !== "hide");
        for (const b of registeredFullBtns) b.classList.toggle("hidden", mode === "hide");
        for (const b of registeredBtns) b.classList.toggle("hidden", mode === "hide");
      };
      applyReadModeHook(curReadMode);
      if (cardEl) {
        registerOverflowCheck(cardEl, readScrollBox, registeredFullBtns, () => curReadMode === "full");
      }
    }

    container.appendChild(contentWrap);
    return {
      chips: parsed.chips,
      contentWrap,
      rawLabel: needRawToggle ? rawLabelText : "",
      registerRawBtn,
      isReadTool,
      hasModeCtrl,
      getReadMode: () => curReadMode,
      setReadMode,
      registerFullBtn,
      onReadModeChange,
    };
  }

  function extractInlineBrainImages(text) {
    if (!text) return [];
    const urls = new Set();
    const re = /(?:file:\/\/\/|[A-Za-z]:[/\\]|\/(?:home|Users|root|tmp|var|opt)\/)[^\s<>"')\]]+\.(?:png|jpe?g|webp|gif)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      let localPath = m[0];
      if (/^file:\/\//i.test(localPath)) {
        localPath = decodeURIComponent(localPath.replace(/^file:\/+/i, ""));
        if (/^[A-Za-z]:[/\\]/.test(localPath)) {
          localPath = localPath.replace(/\//g, "\\");
        } else if (localPath && !localPath.startsWith("/")) {
          localPath = `/${localPath}`;
        }
      } else if (/^[A-Za-z]:[/\\]/.test(localPath)) {
        localPath = localPath.replace(/\//g, "\\");
      }
      if (/brain[/\\]/i.test(localPath)) {
        urls.add(localPath);
      }
    }
    return Array.from(urls);
  }

  const BG_TASK_ID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/task-\d+)\b/gi;

  function buildStepMetadataAndTaskIndex(steps) {
    stepToolMetaMap = new WeakMap();
    taskIndexMap = new Map();
    stepTaskMetaMap = new WeakMap();
    if (!Array.isArray(steps) || !steps.length) return;

    const addStepTaskEvent = (step, ev) => {
      if (!step) return;
      let list = stepTaskMetaMap.get(step);
      if (!list) {
        list = [];
        stepTaskMetaMap.set(step, list);
      }
      if (!list.some((x) => x.role === ev.role && x.taskId === ev.taskId && x.awaitedTaskId === ev.awaitedTaskId)) {
        list.push(ev);
      }
    };

    const getTask = (taskId) => {
      let t = taskIndexMap.get(taskId);
      if (!t) {
        t = {
          taskId,
          launchStepIndex: null,
          callerStepIndex: null,
          resultStepIndex: null,
          taskType: "task",
          waitSteps: new Set(),
          cancelSteps: new Set(),
        };
        taskIndexMap.set(taskId, t);
      }
      return t;
    };

    // 1. Structural caller -> tool output pairing (independent of state.attachToolOutputs)
    const plannerOutputsMap = new Map();
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s || s.type !== "PLANNER_RESPONSE" || !Array.isArray(s.tool_calls) || !s.tool_calls.length) continue;
      const need = s.tool_calls.length;
      const found = [];
      for (let j = i + 1; j < steps.length && found.length < need; j++) {
        const nxt = steps[j];
        if (!nxt) continue;
        if (nxt.type === "GENERIC") found.push(nxt);
        else if (nxt.type === "SYSTEM_MESSAGE" || nxt.type === "ERROR_MESSAGE") continue;
        else break;
      }
      if (found.length) {
        plannerOutputsMap.set(s, found);
        for (let k = 0; k < found.length; k++) {
          const tc = s.tool_calls[k];
          if (tc) {
            stepToolMetaMap.set(found[k], {
              toolName: tc.name || "",
              toolArgs: tc.args || null,
              callerStep: s,
              toolIdx: k,
            });
          }
        }
      }
    }

    // 2. Index every background task lifecycle event across steps
    for (const s of steps) {
      if (!s) continue;
      const contentStr = unescapeNewlines(s.content || "");
      const meta = s.type === "GENERIC" ? stepToolMetaMap.get(s) : null;

      if (s.type === "GENERIC") {
        const mLaunch = contentStr.match(/Tool is running as a background task with task id:\s*([0-9a-f-]{8,}\/task-\d+)/i);
        if (mLaunch) {
          const taskId = mLaunch[1];
          const t = getTask(taskId);
          t.launchStepIndex = s.step_index;
          if (meta && meta.callerStep) {
            t.callerStepIndex = meta.callerStep.step_index;
            addStepTaskEvent(meta.callerStep, { role: "caller", taskId, launchStepIndex: s.step_index, toolIdx: meta.toolIdx });
          }
          if (/Task Description:\s*Timer:/i.test(contentStr) || (meta && meta.toolName === "schedule")) {
            t.taskType = "timer";
          }
          addStepTaskEvent(s, { role: "launch", taskId });
        }

        const mCancel = contentStr.match(/Wait cancelled\s*\(\s*task\s+([0-9a-f-]{8,}\/task-\d+)/i);
        if (mCancel) {
          const taskId = mCancel[1];
          const t = getTask(taskId);
          t.cancelSteps.add(s.step_index);
          addStepTaskEvent(s, { role: "cancel", taskId });
          if (meta && meta.callerStep) {
            addStepTaskEvent(meta.callerStep, { role: "wait", taskId, launchStepIndex: s.step_index, toolIdx: meta.toolIdx });
          }
        }
      }

      if (s.type === "PLANNER_RESPONSE" && Array.isArray(s.tool_calls)) {
        const outs = plannerOutputsMap.get(s) || [];
        s.tool_calls.forEach((tc, tcIdx) => {
          if (!tc || !tc.args || typeof tc.args !== "object") return;
          for (const v of Object.values(tc.args)) {
            if (typeof v !== "string") continue;
            BG_TASK_ID_RE.lastIndex = 0;
            let tm;
            while ((tm = BG_TASK_ID_RE.exec(v)) !== null) {
              const condTaskId = tm[1];
              const t = getTask(condTaskId);
              if (tc.name === "schedule" || tc.name === "manage_task") {
                t.waitSteps.add(s.step_index);
                addStepTaskEvent(s, { role: "wait", taskId: condTaskId, toolIdx: tcIdx });
                const pairedOut = outs[tcIdx];
                if (pairedOut) {
                  addStepTaskEvent(pairedOut, { role: "awaited", awaitedTaskId: condTaskId });
                }
              }
            }
          }
        });
      }

      if (s.type === "SYSTEM_MESSAGE") {
        const mRes =
          contentStr.match(/sender=([0-9a-f-]{8,}\/task-\d+)/i) ||
          contentStr.match(/Task id\s+"?([0-9a-f-]{8,}\/task-\d+)"?\s+finished/i);
        if (mRes) {
          const taskId = mRes[1];
          const t = getTask(taskId);
          t.resultStepIndex = s.step_index;
          addStepTaskEvent(s, { role: "result", taskId });
        }
      }
    }
  }

  function resolveTaskLinkDestination(taskId, stepObj, preferredRole = "") {
    const tInfo = taskIndexMap.get(taskId);
    if (!tInfo) return null;
    const stepIdxStr = stepObj ? String(stepObj.step_index ?? "") : "";
    const isResultStep =
      preferredRole === "result" ||
      (tInfo.resultStepIndex !== null && stepIdxStr !== "" && String(tInfo.resultStepIndex) === stepIdxStr);

    if (isResultStep) {
      const destStep = tInfo.callerStepIndex !== null ? tInfo.callerStepIndex : tInfo.launchStepIndex;
      if (destStep === null) return null;
      const useToolOut =
        state.attachToolOutputs &&
        tInfo.callerStepIndex !== null &&
        tInfo.launchStepIndex !== null &&
        String(tInfo.callerStepIndex) !== String(tInfo.launchStepIndex);
      return {
        destStepIndex: destStep,
        toolOutStep: useToolOut ? tInfo.launchStepIndex : null,
        kind: "to-source",
        label:
          tInfo.callerStepIndex !== null
            ? t("card.taskPillToCmdLabel", { step: tInfo.callerStepIndex })
            : t("card.taskPillToLaunchLabel", { step: tInfo.launchStepIndex }),
        desc:
          tInfo.callerStepIndex !== null
            ? (tInfo.launchStepIndex !== null
                ? t("card.taskPillToCmdBgDesc", { step: tInfo.callerStepIndex, launch: tInfo.launchStepIndex })
                : t("card.taskPillToCmdSimpleDesc", { step: tInfo.callerStepIndex }))
            : t("card.taskPillToLaunchDesc", { step: tInfo.launchStepIndex }),
      };
    }

    if (tInfo.resultStepIndex !== null) {
      return {
        destStepIndex: tInfo.resultStepIndex,
        toolOutStep: null,
        kind: "to-result",
        label: t("card.taskPillToResultLabel", { step: tInfo.resultStepIndex }),
        desc: t("card.taskPillToResultDesc", { step: tInfo.resultStepIndex }),
      };
    }

    // Fallback: if this step is an awaited timer launch whose own task didn't fire, link caller
    if (preferredRole === "launch" && !state.attachToolOutputs && tInfo.callerStepIndex !== null) {
      return {
        destStepIndex: tInfo.callerStepIndex,
        toolOutStep: null,
        kind: "to-source",
        label: t("card.taskPillToCmdLabel", { step: tInfo.callerStepIndex }),
        desc: t("card.taskPillToCmdSimpleDesc", { step: tInfo.callerStepIndex }),
      };
    }
    return null;
  }

  function getHeaderTaskPillsHtml(stepObj, scope = "step") {
    if (!stepObj) return "";
    const evs = stepTaskMetaMap.get(stepObj);
    if (!evs || !evs.length) return "";
    const pills = [];
    const seenKeys = new Set();
    const pushLink = (dest, tipTitle, extraLabel = "") => {
      if (!dest) return;
      const k = `${dest.kind}:${dest.destStepIndex}:${dest.toolOutStep ?? ""}:${extraLabel}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      const url = buildStepShareUrl(dest.destStepIndex);
      const text = extraLabel || dest.label;
      const toolAttr = dest.toolOutStep !== null && dest.toolOutStep !== undefined
        ? ` data-jump-tool-out="${escHtml(dest.toolOutStep)}"`
        : "";
      pills.push(
        `<a class="task-link-pill task-link-${dest.kind}" href="${escHtml(url)}" data-jump-step="${escHtml(dest.destStepIndex)}"${toolAttr} ${makeTipAttrs(
          tipTitle,
          dest.desc,
          url
        )}>${escHtml(text)}</a>`
      );
    };

    for (const ev of evs) {
      const tInfo = ev.taskId ? taskIndexMap.get(ev.taskId) : null;
      if (ev.role === "result" && tInfo) {
        const dest = resolveTaskLinkDestination(ev.taskId, stepObj, "result");
        pushLink(dest, t("card.taskLinkToCaller"));
        if (!state.attachToolOutputs && tInfo.launchStepIndex !== null && tInfo.callerStepIndex !== null && tInfo.launchStepIndex !== tInfo.callerStepIndex) {
          pushLink(
            {
              destStepIndex: tInfo.launchStepIndex,
              toolOutStep: null,
              kind: "to-source",
              label: t("card.taskPillBgLaunchLabel", { step: tInfo.launchStepIndex }),
              desc: t("card.taskPillBgLaunchDesc", { step: tInfo.launchStepIndex }),
            },
            t("card.taskLinkToLaunch")
          );
        }
      } else if (ev.role === "launch" && tInfo) {
        const dest = resolveTaskLinkDestination(ev.taskId, stepObj, "launch");
        if (dest && dest.kind === "to-result") {
          pushLink(dest, t("card.taskLinkToResult"));
        } else {
          // Check if this launch is an awaited timer whose awaited task has a result
          const awaitedEv = evs.find((x) => x.role === "awaited" && x.awaitedTaskId);
          const awaitedDest = awaitedEv ? resolveTaskLinkDestination(awaitedEv.awaitedTaskId, stepObj, "wait") : null;
          if (awaitedDest) {
            pushLink(awaitedDest, t("card.taskLinkToAwaitedResult"));
          } else {
            const pKey = `pending:${ev.taskId}`;
            if (!seenKeys.has(pKey)) {
              seenKeys.add(pKey);
              pills.push(
                `<span class="task-link-pill task-link-pending" ${makeTipAttrs(
                  t("card.taskPillPendingTitle"),
                  t("card.taskPillPendingDesc"),
                  ev.taskId
                )}>${escHtml(t("card.taskPillPendingLabel"))}</span>`
              );
            }
            if (dest) pushLink(dest, t("card.taskLinkToCmd"));
          }
        }
        if (scope === "step" && !state.attachToolOutputs && tInfo.callerStepIndex !== null) {
          pushLink(
            {
              destStepIndex: tInfo.callerStepIndex,
              toolOutStep: null,
              kind: "to-source",
              label: t("card.taskPillToCmdLabel", { step: tInfo.callerStepIndex }),
              desc: t("card.taskPillToCmdSimpleDesc", { step: tInfo.callerStepIndex }),
            },
            t("card.taskLinkToCaller")
          );
        }
      } else if ((ev.role === "caller" || ev.role === "wait" || ev.role === "cancel") && tInfo) {
        const dest = resolveTaskLinkDestination(ev.taskId, stepObj, ev.role);
        if (dest && dest.kind === "to-result") {
          pushLink(dest, t("card.taskLinkToResult"));
        }
      } else if (ev.role === "awaited" && ev.awaitedTaskId) {
        const dest = resolveTaskLinkDestination(ev.awaitedTaskId, stepObj, "wait");
        if (dest && dest.kind === "to-result") {
          pushLink(dest, t("card.taskLinkToAwaitedResult"));
        }
      }
    }
    return pills.join("");
  }

  function linkifyTaskIdsInElement(rootEl, stepObj = null) {
    if (!rootEl || taskIndexMap.size === 0) return;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.includes("/task-")) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (p.closest("a, button, script, style, textarea, input, select, .task-link-pill, .step-num-chip, .inline-raw-pre, .copy-bar")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let cur;
    while ((cur = walker.nextNode())) nodes.push(cur);
    if (!nodes.length) return;

    const evs = stepObj ? (stepTaskMetaMap.get(stepObj) || []) : [];
    const roleHint = evs.some((e) => e.role === "result") ? "result" : "";

    for (const tn of nodes) {
      const txt = tn.nodeValue;
      BG_TASK_ID_RE.lastIndex = 0;
      let m;
      let pos = 0;
      let matched = false;
      const frag = document.createDocumentFragment();
      while ((m = BG_TASK_ID_RE.exec(txt)) !== null) {
        const tid = m[1];
        const dest = resolveTaskLinkDestination(tid, stepObj, roleHint);
        if (!dest) continue;
        matched = true;
        if (m.index > pos) frag.appendChild(document.createTextNode(txt.slice(pos, m.index)));
        const a = document.createElement("a");
        a.className = `task-step-link task-link-${dest.kind}`;
        a.href = buildStepShareUrl(dest.destStepIndex);
        a.dataset.jumpStep = String(dest.destStepIndex);
        if (dest.toolOutStep !== null && dest.toolOutStep !== undefined) {
          a.dataset.jumpToolOut = String(dest.toolOutStep);
        }
        a.dataset.tipTitle = `${dest.label} (${tid})`;
        a.dataset.tipDesc = dest.desc;
        a.dataset.tipRaw = a.href;
        a.textContent = tid;
        frag.appendChild(a);
        pos = m.index + tid.length;
      }
      if (matched) {
        if (pos < txt.length) frag.appendChild(document.createTextNode(txt.slice(pos)));
        tn.parentNode.replaceChild(frag, tn);
      }
    }
  }

  function pairToolOutputs(steps) {
    const attachedByPlanner = new Map(); // plannerStep -> array of genericSteps
    const attachedSet = new Set();       // genericSteps consumed into a planner

    if (!state.attachToolOutputs) {
      return { attachedByPlanner, attachedSet };
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.type !== "PLANNER_RESPONSE" || !Array.isArray(s.tool_calls) || s.tool_calls.length === 0) {
        continue;
      }
      const need = s.tool_calls.length;
      const found = [];
      for (let j = i + 1; j < steps.length && found.length < need; j++) {
        const nxt = steps[j];
        if (nxt.type === "GENERIC") {
          found.push(nxt);
        } else if (nxt.type === "SYSTEM_MESSAGE" || nxt.type === "ERROR_MESSAGE") {
          continue;
        } else {
          break;
        }
      }
      if (found.length > 0) {
        attachedByPlanner.set(s, found);
        for (const g of found) attachedSet.add(g);
      }
    }
    return { attachedByPlanner, attachedSet };
  }

  function extractTag(text, tagName) {
    const re = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*</${tagName}>`, "i");
    const m = String(text || "").match(re);
    return m ? m[1] : null;
  }

  function parseEnvelopeSequence(slice, depth = 0) {
    if (depth > 8) return null;
    const len = slice.length;
    let pos = 0;
    while (pos < len && /\s/.test(slice[pos])) pos++;
    if (pos >= len) return [];
    const openM = slice.slice(pos).match(/^<([A-Z][A-Z0-9_]{1,40})>/);
    if (!openM) return null;
    const tag = openM[1].toUpperCase();
    const bodyStart = pos + openM[0].length;
    const closeRe = new RegExp(`</${tag}>`, "gi");
    closeRe.lastIndex = bodyStart;
    const candidates = [];
    let cm;
    while ((cm = closeRe.exec(slice)) !== null) {
      candidates.push({ start: cm.index, end: cm.index + cm[0].length });
    }
    for (let k = candidates.length - 1; k >= 0; k--) {
      const rest = parseEnvelopeSequence(slice.slice(candidates[k].end), depth + 1);
      if (rest !== null) {
        return [{ tag, body: slice.slice(bodyStart, candidates[k].start).trim() }, ...rest];
      }
    }
    return null;
  }

  const KNOWN_USER_TAGS = new Set(["USER_REQUEST", "ADDITIONAL_METADATA", "USER_SETTINGS_CHANGE"]);
  const KNOWN_TOP_TAGS = new Set(["USER_REQUEST", "ADDITIONAL_METADATA", "USER_SETTINGS_CHANGE", "SUMMARY", "SYSTEM_MESSAGE"]);

  function parseUserInputEnvelope(rawContent) {
    const str = String(rawContent || "");
    const mOpen = str.match(/^[ \t\r\n]*<USER_REQUEST>/i);
    let reqOpenStart = mOpen ? mOpen[0].length : -1;
    let leadingTags = [];

    if (reqOpenStart === -1) {
      const leadRe = /(?:^|\n)[ \t]*<USER_REQUEST>/i;
      const lm = str.match(leadRe);
      if (lm) {
        const prefixSeq = parseEnvelopeSequence(str.slice(0, lm.index));
        if (prefixSeq !== null) {
          leadingTags = prefixSeq;
          reqOpenStart = lm.index + lm[0].length;
        }
      }
    }

    if (reqOpenStart !== -1) {
      const closeRe = /<\/USER_REQUEST>/gi;
      closeRe.lastIndex = reqOpenStart;
      const closeHits = [];
      let cm;
      while ((cm = closeRe.exec(str)) !== null) {
        closeHits.push({ start: cm.index, end: cm.index + cm[0].length });
      }
      for (let k = closeHits.length - 1; k >= 0; k--) {
        const tailTags = parseEnvelopeSequence(str.slice(closeHits[k].end));
        if (tailTags !== null) {
          const allOuter = [...leadingTags, ...tailTags];
          const metaParts = [];
          const settingsParts = [];
          const extraTags = [];
          for (const t of allOuter) {
            if (t.tag === "ADDITIONAL_METADATA") metaParts.push(t.body);
            else if (t.tag === "USER_SETTINGS_CHANGE") settingsParts.push(t.body);
            else if (t.tag !== "USER_REQUEST") extraTags.push(t);
          }
          return {
            req: str.slice(reqOpenStart, closeHits[k].start).replace(/^\s*\n?/, "").replace(/\s+$/, ""),
            meta: metaParts.join("\n\n") || null,
            settings: settingsParts.join("\n\n") || null,
            extraTags,
          };
        }
      }
      // Unclosed outer <USER_REQUEST>: render everything without ever truncating!
      return {
        req: str.slice(reqOpenStart).replace(/^\s*\n?/, ""),
        meta: null,
        settings: null,
        extraTags: [],
      };
    }

    return {
      req: str,
      meta: null,
      settings: null,
      extraTags: extractTopLevelXmlTags(str, KNOWN_USER_TAGS),
    };
  }

  function extractTopLevelXmlTags(text, excludeSet = null) {
    if (!text) return [];
    const results = [];
    // Strip fenced code blocks before scanning so code snippets containing <TAG>...</TAG> don't trigger false badges
    let scanText = String(text).replace(/^[ \t]*(`{3,})[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
    const re = /(?:^|\n)[ \t]*<([A-Z][A-Z0-9_]{1,40})>\s*([\s\S]*?)\s*<\/\1>/g;
    let m;
    while ((m = re.exec(scanText)) !== null) {
      const tag = m[1].toUpperCase();
      if (excludeSet && excludeSet.has(tag)) continue;
      results.push({ tag, body: m[2] });
    }
    return results;
  }

  function extractModelNamesFromSettings(settingsText) {
    if (!settingsText) return null;
    const clean = unescapeNewlines(settingsText);
    const re = /The user changed setting\s+`Model Selection`\s+from\s+[\s\S]*?\s+to\s+(.+?)\.(?=\s*(?:No need to comment|The user changed setting|\r?\n|$))/gi;
    let last = null;
    let m;
    while ((m = re.exec(clean)) !== null) {
      const val = m[1].trim();
      if (!val || val.toLowerCase() === "none") last = "";
      else last = val;
    }
    return last;
  }

  function getSettingsChangeText(step) {
    if (!step || !step.content) return "";
    const env = parseUserInputEnvelope(step.content);
    if (env.settings) return env.settings;
    if (env.req === String(step.content || "")) {
      const m = extractTopLevelXmlTags(step.content, null).find((t) => t.tag === "USER_SETTINGS_CHANGE");
      return m ? m.body : "";
    }
    return "";
  }

  function updateStepModels(stepsList, reset = false) {
    if (reset) _lastDetectedModel = "";
    if (!Array.isArray(stepsList)) return;
    for (const s of stepsList) {
      if (!s) continue;
      if (s.type === "USER_INPUT" && s.content) {
        const settingsTxt = getSettingsChangeText(s);
        if (settingsTxt) {
          const foundModel = extractModelNamesFromSettings(settingsTxt);
          if (foundModel !== null) {
            _lastDetectedModel = foundModel;
          }
        }
      } else if (s.type === "PLANNER_RESPONSE") {
        if (_lastDetectedModel) stepModelMap.set(s, _lastDetectedModel);
        else stepModelMap.delete(s);
      }
    }
  }

  function parseHashNavigation(rawHash = window.location.hash) {
    const clean = String(rawHash || "").replace(/^#/, "");
    if (!clean) return { convId: "", targetStep: "" };
    const params = new URLSearchParams(clean);
    return {
      convId: params.get("conv") || "",
      targetStep: params.get("step") || "",
    };
  }

  function buildStepShareUrl(stepIndex) {
    const convId = state.activeId || "";
    const stepStr = String(stepIndex ?? "");
    const proj = state.activeMeta?.project || "";
    const logPath = state.activeLogPath || state.activeMeta?.path || "";
    const logFile = (logPath ? String(logPath).split(/[/\\]/).pop() : "") || "transcript_full.jsonl";
    const qs = new URLSearchParams();
    if (convId) qs.set("conv", convId);
    if (stepStr !== "") qs.set("step", stepStr);
    if (proj) qs.set("project", proj);
    if (logFile) qs.set("file", logFile);
    return `${window.location.origin}/#${qs.toString()}`;
  }

  function formatUnknownValPreview(val) {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    let str = typeof val === "string" ? val : "";
    if (typeof val !== "string") {
      try {
        str = JSON.stringify(val);
      } catch (_) {
        str = String(val);
      }
    }
    str = str.replace(/\s+/g, " ").trim();
    return str.length > 28 ? `${str.slice(0, 27)}…` : str;
  }

  function estimateCardHeight(step, attachedOutputs = null) {
    if (!step) return 240;
    const isFullMode = Boolean(state.expandAllOutputs || state.readDisplayMode === "full");
    const isHideMode = state.readDisplayMode === "hide";
    let lines = 4;
    if (step.thinking) lines += Math.min(36, Math.ceil(String(step.thinking).length / 80));
    if (step.content) {
      if (step.type === "GENERIC" && !isFullMode) {
        lines += isHideMode ? 4 : Math.min(18, Math.max(4, Math.ceil(String(step.content).length / 80)));
      } else {
        // Non-GENERIC markdown (e.g. CHECKPOINT / PLANNER_RESPONSE) renders unwrapped without a 50-line scrollbox
        lines += Math.min(isFullMode ? 320 : 220, Math.ceil(String(step.content).length / 72));
      }
    }
    if (Array.isArray(step.tool_calls)) {
      for (const tc of step.tool_calls) {
        lines += 4;
        if (tc && tc.args && typeof tc.args === "object") {
          const argLen = Object.values(tc.args).reduce((s, v) => s + (typeof v === "string" ? v.length : 32), 0);
          lines += isFullMode
            ? Math.min(120, Math.ceil(argLen / 75))
            : Math.min(17, Math.ceil(argLen / 75));
        }
      }
    }
    if (Array.isArray(step.media) && step.media.length > 0) lines += step.media.length * 14;
    if (Array.isArray(attachedOutputs)) {
      for (const g of attachedOutputs) {
        const len = g && g.content ? String(g.content).length : 0;
        if (isFullMode) {
          lines += Math.min(160, Math.max(4, Math.ceil(len / 75)));
        } else if (isHideMode) {
          lines += 3;
        } else {
          lines += Math.min(18, Math.max(4, Math.ceil(len / 80)));
        }
      }
    }
    const maxCap = isFullMode ? 10000 : 6200;
    return Math.max(120, Math.min(maxCap, lines * 20));
  }

  function estimateStepBytes(step, attachedOutputs = null) {
    if (!step) return 256;
    let bytes = 250;
    if (step.content) bytes += String(step.content).length;
    if (step.thinking) bytes += String(step.thinking).length;
    if (step.error) bytes += String(step.error).length;
    if (Array.isArray(step.tool_calls)) {
      for (const tc of step.tool_calls) {
        bytes += 120;
        if (tc && tc.args) {
          for (const v of Object.values(tc.args)) {
            bytes += typeof v === "string" ? v.length : 64;
          }
        }
      }
    }
    if (Array.isArray(attachedOutputs)) {
      for (const g of attachedOutputs) {
        if (!g) continue;
        bytes += 200;
        if (g.content) bytes += String(g.content).length;
        if (g.error) bytes += String(g.error).length;
      }
    }
    return bytes;
  }

  function summarizeToolArgs(name, args) {
    if (!args || typeof args !== "object") return { text: "", usedKey: null };
    if (args.toolSummary) return { text: args.toolSummary, usedKey: "toolSummary" };
    if (args.Path) return { text: args.Path, usedKey: "Path" };
    if (args.TargetFile) return { text: args.TargetFile, usedKey: "TargetFile" };
    if (args.query) return { text: args.query, usedKey: "query" };
    if (args.CommandLine) return { text: args.CommandLine, usedKey: "CommandLine" };
    if (args.Prompt) return { text: args.Prompt.slice(0, 80), usedKey: null };
    const keys = Object.keys(args);
    return keys.length
      ? { text: `${keys[0]}: ${String(args[keys[0]]).slice(0, 60)}`, usedKey: null }
      : { text: "", usedKey: null };
  }

  function isCommandErrorStep(step) {
    if (!step) return false;
    if (stepErrCache.has(step)) return stepErrCache.get(step);
    let err = false;
    if (step.type === "ERROR_MESSAGE" || step.status === "ERROR" || Boolean(step.error)) {
      err = true;
    } else if (step.type === "GENERIC" && step.content) {
      // Check ONLY leading metadata header lines — never match inside read_file contents or stdout!
      const headChunk = step.content.length > 2048 ? step.content.slice(0, 2048) : step.content;
      const lines = headChunk.split(/\r?\n/, 12);
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const ln = lines[i].trim();
        if (!ln) continue;
        if (/^(?:Created At:|Completed At:)/i.test(ln)) continue;
        if (/^Encountered error in step execution:/i.test(ln)) {
          err = true;
          break;
        }
        const m = ln.match(/^Command exited with code\s+(-?\d+)\.?$/i);
        if (m) {
          err = Number(m[1]) !== 0;
          break;
        }
        break;
      }
    }
    stepErrCache.set(step, err);
    return err;
  }

  const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

  function findTermOccurrences(raw, lower, termText, termLower, opts = {}, findAll = true) {
    const caseSensitive = Boolean(opts && opts.caseSensitive);
    const wholeWord = Boolean(opts && opts.wholeWord);
    const hay = caseSensitive ? String(raw || "") : String(lower || "");
    const needle = caseSensitive ? String(termText || "") : String(termLower || "");
    if (!needle || !hay) return [];
    const checkLeft = wholeWord && WORD_CHAR_RE.test(needle[0]);
    const checkRight = wholeWord && WORD_CHAR_RE.test(needle[needle.length - 1]);
    const hits = [];
    let pos = 0;
    while (pos <= hay.length - needle.length) {
      const idx = hay.indexOf(needle, pos);
      if (idx === -1) break;
      const end = idx + needle.length;
      const leftOk = !checkLeft || idx === 0 || !WORD_CHAR_RE.test(hay[idx - 1]);
      const rightOk = !checkRight || end === hay.length || !WORD_CHAR_RE.test(hay[end]);
      if (leftOk && rightOk) {
        hits.push([idx, end]);
        if (!findAll) return hits;
        pos = idx + Math.max(1, needle.length);
      } else {
        pos = idx + 1;
      }
    }
    return hits;
  }

  function getSearchOpts() {
    return {
      wholeWord: Boolean(state.searchWholeWord),
      caseSensitive: Boolean(state.searchCaseSensitive),
      acrossWholeTurn: Boolean(state.searchAcrossWholeTurn),
    };
  }

  function getStepSearchUnits(step) {
    if (!step) return [];
    const cached = stepSearchUnitsCache.get(step);
    if (cached !== undefined) return cached;

    const units = [];
    const addUnit = (kind, partsList, toolIdx = null) => {
      const raw = partsList.filter((x) => x !== undefined && x !== null && x !== "").join(" ");
      if (!raw) return;
      const u = { kind, raw, lower: raw.toLowerCase() };
      if (toolIdx !== null && toolIdx !== undefined) u.toolIdx = toolIdx;
      units.push(u);
    };

    const fmtN = typeof fmtNum === "function" ? fmtNum : (v) => String(v ?? 0);
    const tsTime = fmtStepTime(step.created_at);
    const tsFull = fmtFullDateTime(step.created_at);
    const activeModel = step.type === "PLANNER_RESPONSE" ? (stepModelMap.get(step) || "") : "";

    const headParts = [
      step.step_index,
      `#${step.step_index}`,
      step.type,
      step.status || "",
      step.source || "",
      step.created_at || "",
      tsTime,
      tsFull,
      activeModel,
      activeModel ? `🤖 ${activeModel}` : "",
    ];
    if (step.content) headParts.push(`txt:${fmtN(step.content.length)}`, `txt:${step.content.length}`);
    if (step.thinking) headParts.push(`think:${fmtN(step.thinking.length)}`, `think:${step.thinking.length}`);
    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      headParts.push(`tools:${step.tool_calls.length}`, `Tool Calls (${step.tool_calls.length})`);
    }
    if (
      step.input_tokens !== undefined ||
      step.cache_read_tokens !== undefined ||
      step.output_tokens !== undefined
    ) {
      const inp = Number(step.input_tokens || 0);
      const cache = Number(step.cache_read_tokens || 0);
      const out = Number(step.output_tokens || 0);
      const tot = inp + cache;
      const pct = tot > 0 ? ((cache / tot) * 100).toFixed(1) : "0.0";
      headParts.push(
        `in: ${inp}`, `in: ${fmtN(inp)}`,
        `cache: ${cache}`, `cache: ${fmtN(cache)}`, `(${pct}%)`, `${pct}%`,
        `out: ${out}`, `out: ${fmtN(out)}`
      );
    }
    if (typeof stepTaskMetaMap !== "undefined" && stepTaskMetaMap.has(step)) {
      const evs = stepTaskMetaMap.get(step) || [];
      for (const ev of evs) {
        if (ev.taskId) headParts.push(ev.taskId);
        if (ev.awaitedTaskId) headParts.push(ev.awaitedTaskId);
        if (typeof resolveTaskLinkDestination === "function") {
          const d = resolveTaskLinkDestination(ev.taskId || ev.awaitedTaskId, step, ev.role);
          if (d && d.label) headParts.push(d.label);
        }
      }
    }
    const knownKeys = new Set([
      "step_index", "source", "type", "status", "created_at",
      "content", "thinking", "tool_calls", "media", "error",
      "input_tokens", "cache_read_tokens", "output_tokens",
    ]);
    for (const k of Object.keys(step)) {
      if (!knownKeys.has(k)) {
        const preview = typeof formatUnknownValPreview === "function" ? formatUnknownValPreview(step[k]) : String(step[k]);
        headParts.push(`🆕 ${k}: ${preview}`, k);
        try { headParts.push(JSON.stringify(step[k])); } catch (_) {}
      }
    }
    if (Array.isArray(step.media) && step.media.length > 0) {
      headParts.push(`media:${step.media.length}`);
      for (const m of step.media) {
        if (!m) continue;
        if (m.uri) headParts.push(m.uri);
        if (m.mime_type) headParts.push(m.mime_type);
      }
    }
    if (step.type === "CHECKPOINT" && step.content && typeof extractInlineBrainImages === "function") {
      for (const imgP of extractInlineBrainImages(step.content)) headParts.push(imgP);
    }

    if (step.type === "GENERIC") {
      // A single GENERIC step is one tool output unit (badges, chips, line-stripped content, task pills)
      const gParts = [...headParts, "OUTPUT"];
      if (step.content) {
        const parsed = parseGenericOutput(step.content);
        if (parsed.chips.length) gParts.push(parsed.chips.map((c) => c.label).join(" "));
        const cleanContent = unescapeNewlines(step.content);
        gParts.push(cleanContent);
        if (typeof stripLineNumbers === "function") {
          const lnInfo = stripLineNumbers(cleanContent);
          if (lnInfo && lnInfo.hadNumbers && lnInfo.stripped) gParts.push(lnInfo.stripped);
          if (parsed.body) {
            const bln = stripLineNumbers(parsed.body);
            if (bln && bln.hadNumbers && bln.stripped) gParts.push(bln.stripped);
          }
        }
        if (typeof extractTopLevelXmlTags === "function") {
          const extra = extractTopLevelXmlTags(step.content, KNOWN_TOP_TAGS);
          for (const tObj of extra) gParts.push(`<${tObj.tag}>`, `🆕 <${tObj.tag}>`, unescapeNewlines(tObj.body || ""));
        }
      }
      if (typeof stepToolMetaMap !== "undefined") {
        const tm = stepToolMetaMap.get(step);
        if (tm) {
          if (tm.toolName) gParts.push(tm.toolName);
          if (tm.toolArgs && typeof summarizeToolArgs === "function") {
            const sumInfo = summarizeToolArgs(tm.toolName, tm.toolArgs);
            if (sumInfo.text) gParts.push(sumInfo.text);
          }
        }
      }
      if (step.error) gParts.push(unescapeNewlines(step.error));
      addUnit("generic", gParts);
      stepSearchUnitsCache.set(step, units);
      return units;
    }

    addUnit("header", headParts);

    if (step.content) {
      if (step.type === "USER_INPUT" && typeof parseUserInputEnvelope === "function") {
        const env = parseUserInputEnvelope(step.content);
        const reqStr = unescapeNewlines(env.req !== null ? env.req : step.content);
        const reqParts = [reqStr];
        if (typeof stripLineNumbers === "function") {
          const lnInfo = stripLineNumbers(reqStr);
          if (lnInfo && lnInfo.hadNumbers && lnInfo.stripped) reqParts.push(lnInfo.stripped);
        }
        addUnit("content", reqParts);
        const metaClean = (env.meta || "").replace(/The current local time is:[^\n]*/gi, "").trim();
        const metaCombined = [metaClean, env.settings].filter(Boolean).join("\n\n");
        if (metaCombined) addUnit("meta", [unescapeNewlines(metaCombined)]);
        if (Array.isArray(env.extraTags)) {
          for (const tObj of env.extraTags) {
            addUnit("tag", [`<${tObj.tag}>`, `🆕 <${tObj.tag}>`, unescapeNewlines(tObj.body || "")]);
          }
        }
      } else {
        const cleanContent = unescapeNewlines(step.content);
        const contentParts = [cleanContent];
        if (typeof stripLineNumbers === "function") {
          const lnInfo = stripLineNumbers(cleanContent);
          if (lnInfo && lnInfo.hadNumbers && lnInfo.stripped) contentParts.push(lnInfo.stripped);
        }
        addUnit("content", contentParts);
        if (typeof extractTopLevelXmlTags === "function") {
          const extra = extractTopLevelXmlTags(step.content, KNOWN_TOP_TAGS);
          for (const tObj of extra) {
            addUnit("tag", [`<${tObj.tag}>`, `🆕 <${tObj.tag}>`, unescapeNewlines(tObj.body || "")]);
          }
        }
      }
    }

    if (step.thinking) {
      const thinkLbl = `Thinking (${fmtN(step.thinking.length)})`;
      addUnit("thinking", [thinkLbl, unescapeNewlines(step.thinking)]);
    }

    if (step.error) {
      addUnit("error", [unescapeNewlines(step.error)]);
    }

    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      const stepTaskEvs = typeof stepTaskMetaMap !== "undefined" ? (stepTaskMetaMap.get(step) || []) : [];
      step.tool_calls.forEach((tc, tcIdx) => {
        const tcParts = [tc.name || ""];
        const tcEv = stepTaskEvs.find((ev) => ev.toolIdx === tcIdx && ev.taskId);
        if (tcEv && typeof resolveTaskLinkDestination === "function") {
          const tcDest = resolveTaskLinkDestination(tcEv.taskId, step, tcEv.role);
          if (tcDest && tcDest.label) tcParts.push(tcDest.label);
        }
        if (tc.args && typeof tc.args === "object") {
          if (typeof summarizeToolArgs === "function") {
            const sumInfo = summarizeToolArgs(tc.name, tc.args);
            if (sumInfo.text) tcParts.push(sumInfo.text);
          }
          for (const [ak, av] of Object.entries(tc.args)) {
            tcParts.push(ak, typeof av === "string" ? unescapeNewlines(av) : JSON.stringify(av));
          }
        }
        addUnit("tool", tcParts, tcIdx);
      });
    }

    stepSearchUnitsCache.set(step, units);
    return units;
  }

  function getStepSearchBlob(step) {
    if (!step) return { raw: "", lower: "" };
    const cached = stepSearchBlobCache.get(step);
    if (cached !== undefined) return cached;
    const units = getStepSearchUnits(step);
    const raw = units.map((u) => u.raw).join(" ");
    const res = { raw, lower: raw.toLowerCase() };
    stepSearchBlobCache.set(step, res);
    return res;
  }

  let _cachedSearchAstRaw = null;
  let _cachedSearchAst = null;

  function parseSearchQuery(rawQuery) {
    const raw = String(rawQuery || "").trim();
    if (!raw) return null;
    const tokens = [];
    let i = 0;
    const n = raw.length;
    while (i < n) {
      if (/\s/.test(raw[i])) {
        i++;
        continue;
      }
      if (raw[i] === "(") {
        tokens.push({ type: "LPAREN" });
        i++;
        continue;
      }
      if (raw[i] === ")") {
        tokens.push({ type: "RPAREN" });
        i++;
        continue;
      }
      if (raw[i] === "|") {
        tokens.push({ type: "OR" });
        i += raw[i + 1] === "|" ? 2 : 1;
        continue;
      }
      if (raw[i] === "!") {
        tokens.push({ type: "NOT" });
        i++;
        continue;
      }
      if (raw[i] === '"') {
        i++;
        let buf = "";
        while (i < n && raw[i] !== '"') {
          if (raw[i] === "\\" && i + 1 < n && (raw[i + 1] === '"' || raw[i + 1] === "\\")) {
            buf += raw[i + 1];
            i += 2;
          } else {
            buf += raw[i];
            i++;
          }
        }
        if (i < n && raw[i] === '"') i++;
        if (buf.length > 0) {
          tokens.push({ type: "TERM", text: buf, lower: buf.toLowerCase(), quoted: true });
        }
        continue;
      }
      let start = i;
      while (i < n && !/[\s()|"]/.test(raw[i])) {
        i++;
      }
      const w = raw.slice(start, i);
      if (!w) continue;
      if (w === "OR") {
        tokens.push({ type: "OR" });
      } else if (w === "AND") {
        tokens.push({ type: "AND" });
      } else if (w === "NOT") {
        tokens.push({ type: "NOT" });
      } else {
        tokens.push({ type: "TERM", text: w, lower: w.toLowerCase(), quoted: false });
      }
    }
    if (!tokens.length) return null;

    let pos = 0;
    const peek = () => tokens[pos] || null;
    const consume = () => tokens[pos++];

    const canStartPrimary = (tok) =>
      tok && (tok.type === "TERM" || tok.type === "LPAREN" || tok.type === "NOT");

    const parseOr = () => {
      let left = parseAnd();
      while (peek() && peek().type === "OR") {
        consume();
        if (!peek() || peek().type === "RPAREN") break;
        const right = parseAnd();
        if (left && right) left = { type: "OR", left, right };
        else left = left || right;
      }
      return left;
    };

    const parseAnd = () => {
      let left = parseUnary();
      while (peek()) {
        const t = peek();
        if (t.type === "AND") {
          consume();
          if (!peek() || peek().type === "RPAREN" || peek().type === "OR") break;
          const right = parseUnary();
          if (left && right) left = { type: "AND", left, right };
          else left = left || right;
        } else if (canStartPrimary(t)) {
          const right = parseUnary();
          if (left && right) left = { type: "AND", left, right };
          else left = left || right;
        } else {
          break;
        }
      }
      return left;
    };

    const parseUnary = () => {
      const t = peek();
      if (t && t.type === "NOT") {
        consume();
        const child = parseUnary();
        return child ? { type: "NOT", child } : null;
      }
      return parsePrimary();
    };

    const parsePrimary = () => {
      const t = peek();
      if (!t) return null;
      if (t.type === "LPAREN") {
        consume();
        const inner = parseOr();
        if (peek() && peek().type === "RPAREN") consume();
        return inner;
      }
      if (t.type === "TERM") {
        consume();
        return t;
      }
      // Recover gracefully from stray operators
      consume();
      return null;
    };

    return parseOr();
  }

  function getCachedSearchAst(rawQuery) {
    const q = String(rawQuery || "");
    if (q !== _cachedSearchAstRaw) {
      _cachedSearchAstRaw = q;
      _cachedSearchAst = parseSearchQuery(q);
    }
    return _cachedSearchAst;
  }

  function evalSearchAst(node, target, opts = {}) {
    if (!node) return true;
    const rawText = typeof target === "string" ? target : String(target?.raw || "");
    const lowerText = typeof target === "string" ? target.toLowerCase() : String(target?.lower || rawText.toLowerCase());
    if (node.type === "TERM") {
      if (!node.lower && !node.text) return true;
      if (!opts.caseSensitive && !opts.wholeWord) {
        return lowerText.includes(node.lower);
      }
      return findTermOccurrences(rawText, lowerText, node.text, node.lower, opts, false).length > 0;
    }
    if (node.type === "NOT") return node.child ? !evalSearchAst(node.child, target, opts) : true;
    if (node.type === "AND") return evalSearchAst(node.left, target, opts) && evalSearchAst(node.right, target, opts);
    if (node.type === "OR") return evalSearchAst(node.left, target, opts) || evalSearchAst(node.right, target, opts);
    return true;
  }

  function getPositiveSearchTermObjs(node, negated = false, out = null) {
    const acc = out || new Map();
    if (!node) return [];
    if (node.type === "TERM") {
      if (!negated && node.text) {
        const key = `${node.text}\x00${node.lower}`;
        if (!acc.has(key)) acc.set(key, { text: node.text, lower: node.lower });
      }
    } else if (node.type === "NOT") {
      if (node.child) getPositiveSearchTermObjs(node.child, !negated, acc);
    } else if (node.type === "AND" || node.type === "OR") {
      getPositiveSearchTermObjs(node.left, negated, acc);
      getPositiveSearchTermObjs(node.right, negated, acc);
    }
    if (!out) {
      return Array.from(acc.values()).sort((a, b) => b.text.length - a.text.length);
    }
    return null;
  }

  function getPositiveSearchTerms(node, negated = false, out = null) {
    return getPositiveSearchTermObjs(node, negated, out).map((o) => o.lower);
  }

  function getTurnSearchBlob(step, attachedOutputs = null) {
    const base = getStepSearchBlob(step);
    if (!Array.isArray(attachedOutputs) || !attachedOutputs.length) return base;
    const att = attachedOutputs.map(getStepSearchBlob);
    const raw = `${base.raw} ${att.map((a) => a.raw).join(" ")}`;
    const lower = `${base.lower} ${att.map((a) => a.lower).join(" ")}`;
    return { raw, lower };
  }

  function getTurnSearchUnits(step, attachedOutputs = null) {
    const baseUnits = getStepSearchUnits(step);
    if (!Array.isArray(attachedOutputs) || attachedOutputs.length === 0) {
      return baseUnits;
    }
    if (step && step.type === "PLANNER_RESPONSE") {
      const out = [];
      const pairedOutIdxs = new Set();
      for (const u of baseUnits) {
        if (u.kind === "tool" && u.toolIdx !== undefined && attachedOutputs[u.toolIdx]) {
          pairedOutIdxs.add(u.toolIdx);
          const gUnits = getStepSearchUnits(attachedOutputs[u.toolIdx]);
          if (gUnits.length > 0) {
            const extraRaw = gUnits.map((g) => g.raw).join("\n");
            const combinedRaw = `${u.raw}\n${extraRaw}`;
            out.push({
              kind: "tool",
              toolIdx: u.toolIdx,
              raw: combinedRaw,
              lower: combinedRaw.toLowerCase(),
            });
            continue;
          }
        }
        out.push(u);
      }
      for (let i = 0; i < attachedOutputs.length; i++) {
        if (!pairedOutIdxs.has(i) && attachedOutputs[i]) {
          out.push(...getStepSearchUnits(attachedOutputs[i]));
        }
      }
      return out;
    }
    const units = [...baseUnits];
    for (const g of attachedOutputs) {
      units.push(...getStepSearchUnits(g));
    }
    return units;
  }

  function getStepMatchingCmdKeys(step, attachedOutputs = null) {
    const matched = [];
    if (!step) return matched;
    const keys = state.cmdMapKeys;
    if (!keys || keys.size === 0) return matched;

    if (keys.has(`type:${step.type}`)) matched.push(`type:${step.type}`);
    if (step.status && keys.has(`status:${step.status}`)) matched.push(`status:${step.status}`);
    if (isCommandErrorStep(step) && keys.has("sub:errors")) matched.push("sub:errors");
    if (step.thinking && keys.has("sub:thinking")) matched.push("sub:thinking");
    if (Array.isArray(step.media) && step.media.length > 0 && keys.has("sub:media")) matched.push("sub:media");
    if (
      step.type === "PLANNER_RESPONSE" &&
      step.content &&
      (!Array.isArray(step.tool_calls) || step.tool_calls.length === 0) &&
      keys.has("sub:final")
    ) {
      matched.push("sub:final");
    }

    if (Array.isArray(step.tool_calls)) {
      step.tool_calls.forEach((tc, idx) => {
        const name = tc.name || "tool";
        const out = attachedOutputs && attachedOutputs[idx];
        const isErr = out ? isCommandErrorStep(out) : false;
        const isOk = out ? !isErr && out.status === "DONE" : false;
        if (keys.has(`tool:${name}`)) matched.push(name);
        if (isOk && keys.has(`tool:${name}:ok`)) matched.push(`${name} ✓`);
        if (isErr && keys.has(`tool:${name}:err`)) matched.push(`${name} ⚠`);
      });
    }
    return matched;
  }

  function stepMatchesFilter(step, attachedOutputs = null) {
    if (state.filter === "dialog") {
      if (step.type === "GENERIC" || step.type === "SYSTEM_MESSAGE") return false;
      if (step.type === "PLANNER_RESPONSE" && !step.content) return false;
    } else if (state.filter === "errors") {
      const attErr = Array.isArray(attachedOutputs) && attachedOutputs.some((g) => isCommandErrorStep(g));
      if (!isCommandErrorStep(step) && !attErr) return false;
    }

    if (state.onlyCmdErrors) {
      const attErr = Array.isArray(attachedOutputs) && attachedOutputs.some((g) => isCommandErrorStep(g));
      if (!isCommandErrorStep(step) && !attErr) return false;
    }

    if (state.cmdMapFilterOnly && state.cmdMapKeys.size > 0) {
      const hits = getStepMatchingCmdKeys(step, attachedOutputs);
      const attHits = Array.isArray(attachedOutputs)
        ? attachedOutputs.some((g) => getStepMatchingCmdKeys(g, null).length > 0)
        : false;
      if (hits.length === 0 && !attHits) return false;
    }

    if (state.stepQuery) {
      const ast = getCachedSearchAst(state.stepQuery);
      if (!ast) return true;
      const sOpts = getSearchOpts();
      if (sOpts.acrossWholeTurn) {
        return evalSearchAst(ast, getTurnSearchBlob(step, attachedOutputs), sOpts);
      }
      const units = getTurnSearchUnits(step, attachedOutputs);
      const hasPositives = getPositiveSearchTermObjs(ast).length > 0;
      if (hasPositives) {
        return units.some((u) => evalSearchAst(ast, u, sOpts));
      }
      return units.every((u) => evalSearchAst(ast, u, sOpts));
    }
    return true;
  }

  function buildStepElement(step, attachedOutputs = null, existingCard = null) {
    const card = existingCard || document.createElement("article");
    if (existingCard) {
      existingCard.innerHTML = "";
    }
    rawStepMap.set(card, step);
    const statusCls = step.status ? `status-${step.status}` : "";
    const hasAnyErr =
      isCommandErrorStep(step) ||
      (Array.isArray(attachedOutputs) && attachedOutputs.some((g) => isCommandErrorStep(g)));
    card.className = `step type-${step.type || "GENERIC"} ${statusCls}${hasAnyErr ? " has-any-error" : ""}`;
    card.dataset.stepIndex = String(step.step_index ?? "");
    card.dataset.hydrated = "1";

    // Header with ALL technical step parameters + rich tooltips
    const head = document.createElement("div");
    head.className = "step-head";

    const typeDesc = tDoc("types", step.type, "card.unknownTypeDesc");
    const srcDesc = tDoc("sources", step.source, "card.unknownSourceDesc");
    const stDesc = tDoc("statuses", step.status, "card.unknownStatusDesc");
    const isFinalPlanner =
      step.type === "PLANNER_RESPONSE" &&
      Boolean(step.content) &&
      (!Array.isArray(step.tool_calls) || step.tool_calls.length === 0);

    const tsIsoRaw = step.created_at || "";
    const tsUserLocalRaw = step.type === "USER_INPUT" ? extractUserLocalTimeStr(step.content) : null;
    const tzLabel = formatTzOffsetLabel(getEffectiveTzOffsetMin());
    const tzSourceNote =
      state.userTzSource === "transcript"
        ? t("card.tzTranscript", { tz: tzLabel, sample: state.userTzCalibSample })
        : t("card.tzBrowser", { tz: tzLabel });
    const tsDesc =
      t("card.tsTooltipDesc", {
        source: tzSourceNote,
        localRaw: tsUserLocalRaw ? t("card.tsTooltipLocalRaw", { val: tsUserLocalRaw }) : "",
      });

    const activeModel = step.type === "PLANNER_RESPONSE" ? (stepModelMap.get(step) || "") : "";
    const shareStepUrl = buildStepShareUrl(step.step_index);
    const taskHeaderPillsHtml = getHeaderTaskPillsHtml(step, "step");

    let headHtml = `
      <span class="badge badge-${escHtml(step.type)}${isFinalPlanner ? " is-final" : ""}" ${makeTipAttrs(
        `type: ${step.type}${isFinalPlanner ? t("card.typeFinalSuffix") : ""}`,
        isFinalPlanner
          ? t("card.typeFinalDesc")
          : typeDesc,
        `"type": ${JSON.stringify(step.type)}`
      )}>${escHtml(step.type)}</span>

      <span class="step-num-chip" data-copy-step="${escHtml(step.step_index)}" ${makeTipAttrs(
        t("card.stepIndexTitle", { step: step.step_index }),
        t("card.stepIndexDesc"),
        shareStepUrl
      )}>#${escHtml(step.step_index)}</span>

      ${taskHeaderPillsHtml}

      ${activeModel ? `<span class="meta-chip meta-chip-model" ${makeTipAttrs(
        t("card.modelTitle", { model: activeModel }),
        t("card.modelDesc"),
        `Model Selection: ${activeModel}`
      )}>🤖 ${escHtml(activeModel)}</span>` : ""}

      <span class="meta-chip" ${makeTipAttrs(
        `source: ${step.source || "—"}`,
        srcDesc,
        `"source": ${JSON.stringify(step.source)}`
      )}>${escHtml(step.source || "—")}</span>

      <span class="status-pill ${escHtml(step.status)}" ${makeTipAttrs(
        `status: ${step.status || "—"}`,
        stDesc,
        `"status": ${JSON.stringify(step.status)}`
      )}>${escHtml(step.status || "—")}</span>

      <span class="step-ts" ${makeTipAttrs(
        t("card.createdAtTitle"),
        tsDesc,
        `"created_at": ${JSON.stringify(tsIsoRaw)}`
      )}>${escHtml(step.type === "USER_INPUT" ? fmtFullDateTime(tsIsoRaw) : fmtStepTime(tsIsoRaw))}</span>
    `;

    // Technical presence chips for optional fields & any unknown keys (new Antigravity parameters)
    const knownKeys = new Set([
      "step_index", "source", "type", "status", "created_at",
      "content", "thinking", "tool_calls", "media", "error",
      "input_tokens", "cache_read_tokens", "output_tokens",
    ]);
    if (step.content) {
      headHtml += `<span class="meta-chip" ${makeTipAttrs(
        t("card.contentTitle"),
        t("card.contentDesc"),
        `"content": "<string, ${step.content.length} chars>"`
      )}>txt:${fmtNum(step.content.length)}</span>`;
    }
    if (step.thinking) {
      headHtml += `<span class="meta-chip" ${makeTipAttrs(
        t("card.thinkingMetaTitle"),
        t("card.thinkingMetaDesc"),
        `"thinking": "<string, ${step.thinking.length} chars>"`
      )}>think:${fmtNum(step.thinking.length)}</span>`;
    }
    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      headHtml += `<span class="meta-chip" ${makeTipAttrs(
        t("card.toolCallsMetaTitle"),
        t("card.toolCallsMetaDesc"),
        `"tool_calls": [${step.tool_calls.map((t) => `{"name":"${t.name}",...}`).join(", ")}]`
      )}>tools:${step.tool_calls.length}</span>`;
    }
    if (Array.isArray(step.media) && step.media.length > 0) {
      headHtml += `<span class="meta-chip" ${makeTipAttrs(
        t("card.mediaMetaTitle"),
        t("card.mediaMetaDesc"),
        `"media": ${JSON.stringify(step.media)}`
      )}>media:${step.media.length}</span>`;
    }
    for (const k of Object.keys(step)) {
      if (!knownKeys.has(k)) {
        const valPreview = formatUnknownValPreview(step[k]);
        let valFull = "";
        try {
          valFull = JSON.stringify(step[k], null, 2);
        } catch (_) {
          valFull = String(step[k]);
        }
        headHtml += `<span class="meta-chip meta-chip-unknown" ${makeTipAttrs(
          t("card.unknownKeyTitle", { key: k }),
          t("card.unknownKeyDesc"),
          `"${k}": ${valFull.slice(0, 500)}`
        )}>🆕 ${escHtml(k)}: ${escHtml(valPreview)}</span>`;
      }
    }

    // Tokens & Cache Hit badge
    let tokHtml = "";
    if (
      step.input_tokens !== undefined ||
      step.cache_read_tokens !== undefined ||
      step.output_tokens !== undefined
    ) {
      const inp = Number(step.input_tokens || 0);
      const cache = Number(step.cache_read_tokens || 0);
      const out = Number(step.output_tokens || 0);
      const totIn = inp + cache;
      const hitPct = totIn > 0 ? (cache / totIn) * 100 : 0;
      const hitStr = hitPct.toFixed(1);
      const lvl = getCacheLevel(hitPct, totIn);

      tokHtml += `
        <span class="meta-chip" ${makeTipAttrs(
          t("card.inTokTitle"),
          t("card.inTokDesc"),
          `"input_tokens": ${inp}`
        )}>in: ${fmtNum(inp)}</span>
        <span class="cache-pill ${lvl.cls}" ${makeTipAttrs(
          t("card.cacheTitle", { pct: hitStr, label: lvl.label }),
          t("card.cacheDesc", { cache: fmtNum(cache), inp: fmtNum(inp), pct: hitStr }),
          `"cache_read_tokens": ${cache},\n"input_tokens": ${inp}`
        )}>cache: ${fmtNum(cache)} (${hitStr}%)</span>
        <span class="meta-chip" ${makeTipAttrs(
          t("card.outTokTitle"),
          t("card.outTokDesc"),
          `"output_tokens": ${out}`
        )}>out: ${fmtNum(out)}</span>
      `;
    }

    tokHtml += `<button type="button" class="raw-btn" ${makeTipAttrs(
      t("card.rawStepTitle"),
      t("card.rawStepDesc"),
      `{"step_index": ${step.step_index}, ...}`
    )}>{ }</button>`;

    headHtml += `<span class="tok-bar">${tokHtml}</span>`;
    head.innerHTML = headHtml;

    const rawBtn = head.querySelector(".raw-btn");
    rawBtn.addEventListener("click", () => toggleInlineRaw(card, step, rawBtn));
    card.appendChild(head);

    const stepBody = document.createElement("div");
    stepBody.className = "step-body";
    card.appendChild(stepBody);

    // Thinking block (collapsible, respects state.detailsDefaultOpen)
    if (step.thinking) {
      try {
        const det = document.createElement("details");
        det.className = "block block-thinking";
        det.open = state.detailsDefaultOpen !== false;
        det.innerHTML = `
          <summary ${makeTipAttrs(
            t("card.thinkingTipTitle"),
            t("card.thinkingTipDesc"),
            `"thinking": "**Thinking**\\n..."`
          )}>${escHtml(t("card.thinkingHeader", { n: fmtNum(step.thinking.length) }))}</summary>
          <div class="block-body md">${renderMarkdown(unescapeNewlines(step.thinking))}</div>
        `;
        stepBody.appendChild(det);
      } catch (err) {
        const fallback = document.createElement("pre");
        fallback.className = "generic-pre";
        fallback.textContent = String(step.thinking || err);
        stepBody.appendChild(fallback);
      }
    }

    // Tool calls block (collapsible, respects state.detailsDefaultOpen)
    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      try {
        const det = document.createElement("details");
        det.className = "block block-tools";
        det.open = state.detailsDefaultOpen !== false;
        const summary = document.createElement("summary");
        summary.textContent = t("card.toolsHeader", { n: step.tool_calls.length });
        summary.dataset.tipTitle = t("card.toolsTipTitle");
        summary.dataset.tipDesc = t("card.toolsTipDesc");
        summary.dataset.tipRaw = `"tool_calls": [{"name": "${step.tool_calls[0]?.name || ""}", "args": {...}}]`;
        det.appendChild(summary);

        const CONTENT_ARGS_TOOLS = new Set([
          "edit_file",
          "replace_file_content",
          "multi_replace_file_content",
          "write_file",
          "write_to_file",
          "invoke_subagent",
          "define_subagent",
          "send_message",
          "schedule",
          "ask_question",
        ]);

        const body = document.createElement("div");
        body.className = "block-body";
        step.tool_calls.forEach((tc, tcIdx) => {
          const tcCard = document.createElement("div");
          tcCard.className = "tool-card";
          tcCard.dataset.toolIdx = String(tcIdx);
          const sumInfo = summarizeToolArgs(tc.name, tc.args);
          const toolDoc = tDoc("tools", tc.name, "card.toolFallbackDoc");
          const outStep = attachedOutputs && attachedOutputs[tcIdx];
          const outHasErr = outStep ? isCommandErrorStep(outStep) : false;
          const outIsOk = outStep && !outHasErr && outStep.status === "DONE";

          const skipKeys = new Set();
          if (sumInfo.usedKey && sumInfo.usedKey !== "CommandLine") {
            skipKeys.add(sumInfo.usedKey);
          }
          const argsContainer = renderToolArgsStructured(tc.args || {}, skipKeys);
          const estArgLines = Number(argsContainer.dataset.estLines || 0);
          const totalArgChars = Number(argsContainer.dataset.totalChars || 0);
          const isReadCall = tc.name === "read_file" || tc.name === "view_file";
          const isTallArgs = estArgLines > 14 || totalArgChars > 550;
          const hasArgsModeCtrl = !isReadCall && (CONTENT_ARGS_TOOLS.has(tc.name) || isTallArgs);
          const showArgsFullBtns = hasArgsModeCtrl && isTallArgs;

          const tcHead = document.createElement("div");
          tcHead.className = "tool-head";
          const initArgsMode = state.expandAllOutputs || state.readDisplayMode === "full" ? "full" : "scroll";
          let tcTaskPillHtml = "";
          const stepTaskEvs = stepTaskMetaMap.get(step) || [];
          const tcEv = stepTaskEvs.find((ev) => ev.toolIdx === tcIdx && ev.taskId);
          if (tcEv) {
            const tcDest = resolveTaskLinkDestination(tcEv.taskId, step, tcEv.role);
            if (tcDest && tcDest.kind === "to-result") {
              const tcUrl = buildStepShareUrl(tcDest.destStepIndex);
              tcTaskPillHtml = `<a class="task-link-pill task-link-to-result" href="${escHtml(tcUrl)}" data-jump-step="${escHtml(tcDest.destStepIndex)}" ${makeTipAttrs(
                t("card.taskLinkToResult"),
                tcDest.desc,
                tcUrl
              )}>${escHtml(tcDest.label)}</a>`;
            }
          }

          tcHead.innerHTML = `
            <span class="tool-name" ${makeTipAttrs(
              t("card.toolBadgeTitle", { name: tc.name }),
              toolDoc,
              `{"name": "${tc.name}", "args": ...}`
            )}>${escHtml(tc.name || "tool")}</span>
            ${outIsOk ? `<span class="tool-ok-badge" title="${escHtml(t("card.toolOkTitle"))}">✓</span>` : ""}
            ${outHasErr ? `<span class="tool-err-badge" title="${escHtml(t("card.toolErrTitle"))}">⚠</span>` : ""}
            ${tcTaskPillHtml}
            <span class="tool-summary"></span>
            <button type="button" class="raw-btn" ${makeTipAttrs(
              t("card.toolRawTitle"),
              t("card.toolRawDesc"),
              `{"name": "${tc.name}", ...}`
            )}>{ }</button>
          `;
          const summarySpan = tcHead.querySelector(".tool-summary");
          if (sumInfo.usedKey === "CommandLine") {
            renderCommandLineWithHighlight(summarySpan, sumInfo.text);
          } else {
            summarySpan.textContent = sumInfo.text;
          }

          const tcRawBtn = tcHead.querySelector(".raw-btn");

          tcCard.appendChild(tcHead);
          tcCard.appendChild(argsContainer);

          // 2-state button toggle (scroll / full) + hide recovery for edit_file, write_file, invoke_subagent, send_message, schedule, and any tall args
          let syncRawWithArgsCtrl = null;
          let tcRawOpen = false;
          if (hasArgsModeCtrl) {
            let curArgsMode = initArgsMode;
            const argsFullBtns = [];
            const argsHiddenNote = document.createElement("div");
            argsHiddenNote.className = "read-hidden-note";
            argsHiddenNote.innerHTML = `<span>${escHtml(t("card.paramsHidden"))}</span>`;
            const aShowScroll = document.createElement("button");
            aShowScroll.type = "button";
            aShowScroll.className = "show-more-btn";
            aShowScroll.style.marginTop = "0";
            aShowScroll.textContent = t("card.showInScroll");
            const aShowFull = document.createElement("button");
            aShowFull.type = "button";
            aShowFull.className = "show-more-btn";
            aShowFull.style.marginTop = "0";
            aShowFull.textContent = t("card.showFull");
            argsHiddenNote.appendChild(aShowScroll);
            argsHiddenNote.appendChild(aShowFull);
            tcCard.appendChild(argsHiddenNote);

            let argsBottomFullBtn = null;
            if (showArgsFullBtns) {
              const argsTopFullBtn = document.createElement("button");
              argsTopFullBtn.type = "button";
              argsTopFullBtn.className = "head-raw-btn";
              argsTopFullBtn.title = t("card.toggleArgsTitle");
              tcHead.insertBefore(argsTopFullBtn, tcRawBtn);
              argsFullBtns.push(argsTopFullBtn);

              argsBottomFullBtn = document.createElement("button");
              argsBottomFullBtn.type = "button";
              argsBottomFullBtn.className = "show-more-btn";
              tcCard.appendChild(argsBottomFullBtn);
              argsFullBtns.push(argsBottomFullBtn);
              registerOverflowCheck(card, argsContainer, argsFullBtns, () => curArgsMode === "full");
            }

            const applyArgsModeUI = (mode, isInit = false) => {
              curArgsMode = mode;
              argsContainer.classList.toggle("is-full", mode === "full");
              argsContainer.classList.toggle("is-scroll", mode === "scroll");
              argsContainer.classList.toggle("hidden", tcRawOpen || mode === "hide");
              argsHiddenNote.classList.toggle("hidden", tcRawOpen || mode !== "hide");
              const lbl = mode === "full" ? t("card.collapseToScroll") : t("card.showFull");
              for (const b of argsFullBtns) {
                b.textContent = lbl;
                b.classList.toggle("hidden", tcRawOpen || mode === "hide");
                if (b.classList.contains("head-raw-btn")) {
                  b.classList.toggle("active", mode === "full");
                }
              }
              if (!isInit && mode === "scroll") {
                const rr = toolArgsReplaceRowMap.get(argsContainer);
                if (rr) scheduleEditScroll(argsContainer, rr);
              }
            };

            const setArgsMode = (nextMode, triggerEl = null) => {
              if (nextMode !== "scroll" && nextMode !== "full" && nextMode !== "hide") return;
              const isBottomTrigger = Boolean(triggerEl && triggerEl.classList.contains("show-more-btn"));
              const anchorEl = nextMode === "full" && isBottomTrigger ? argsContainer : triggerEl;
              preserveScrollAnchor(() => applyArgsModeUI(nextMode, false), anchorEl);
              scheduleCardOverflowCheck(card);
              requestAnimationFrame(scheduleMinimapSync);
            };

            aShowScroll.addEventListener("click", () => setArgsMode("scroll", aShowScroll));
            aShowFull.addEventListener("click", () => setArgsMode("full", aShowFull));
            for (const b of argsFullBtns) {
              b.addEventListener("click", () => setArgsMode(curArgsMode === "full" ? "scroll" : "full", b));
            }
            syncRawWithArgsCtrl = (rawOpen) => {
              tcRawOpen = rawOpen;
              applyArgsModeUI(curArgsMode, true);
            };
            applyArgsModeUI(curArgsMode, true);
          }

          let tcRawPre = null;
          tcRawBtn.addEventListener("click", () => {
            preserveScrollAnchor(() => {
              if (tcRawPre) {
                tcRawPre.remove();
                tcRawPre = null;
                if (syncRawWithArgsCtrl) syncRawWithArgsCtrl(false);
                else argsContainer.classList.remove("hidden");
                tcRawBtn.classList.remove("active");
              } else {
                if (syncRawWithArgsCtrl) syncRawWithArgsCtrl(true);
                else argsContainer.classList.add("hidden");
                tcRawPre = document.createElement("pre");
                tcRawPre.className = "inline-raw-pre inner-scroll";
                attachInnerScrollGuard(tcRawPre);
                tcRawPre.textContent = JSON.stringify(tc, null, 2);
                tcCard.insertBefore(tcRawPre, argsContainer.nextSibling);
                tcRawBtn.classList.add("active");
              }
            }, tcRawBtn);
          });

          // Attached tool output (GENERIC step)
          if (outStep) {
            const resBox = document.createElement("div");
            resBox.className = `tool-result status-${outStep.status || "DONE"}${outHasErr ? " has-any-error" : ""}`;
            resBox.dataset.stepIndex = String(outStep.step_index ?? "");

            const resHead = document.createElement("div");
            resHead.className = "tool-result-head";

            const parsedPreview = parseGenericOutput(outStep.content || "");
            const extraChipsHtml = parsedPreview.chips
              .map(
                (c) =>
                  `<span class="meta-chip ${c.cls}" ${makeTipAttrs(c.title, c.desc, c.raw)}>${escHtml(
                    c.label
                  )}</span>`
              )
              .join("");
            const resTaskPillsHtml = getHeaderTaskPillsHtml(outStep, "result-box");

            resHead.innerHTML = `
              <span class="badge badge-GENERIC" ${makeTipAttrs(
                t("card.outputBadgeTitle"),
                tDoc("types", "GENERIC", "card.unknownTypeDesc"),
                `"type": "GENERIC"`
              )}>OUTPUT</span>
              <span class="step-num-chip" data-copy-step="${escHtml(outStep.step_index)}" ${makeTipAttrs(
                t("card.outputStepIndexTitle", { step: outStep.step_index }),
                t("card.outputStepIndexDesc"),
                buildStepShareUrl(outStep.step_index)
              )}>#${escHtml(outStep.step_index)}</span>
              ${resTaskPillsHtml}
              <span class="meta-chip" ${makeTipAttrs(
                `source: ${outStep.source}`,
                tDoc("sources", outStep.source, "card.unknownSourceDesc"),
                `"source": ${JSON.stringify(outStep.source)}`
              )}>${escHtml(outStep.source || "MODEL")}</span>
              <span class="status-pill ${escHtml(outStep.status)}" ${makeTipAttrs(
                `status: ${outStep.status}`,
                tDoc("statuses", outStep.status, "card.unknownStatusDesc"),
                `"status": ${JSON.stringify(outStep.status)}`
              )}>${escHtml(outStep.status || "DONE")}</span>
              ${extraChipsHtml}
              <button type="button" class="raw-btn" ${makeTipAttrs(
                t("card.outputRawTitle"),
                t("card.outputRawDesc"),
                `{"step_index": ${outStep.step_index}, ...}`
              )}>{ }</button>
            `;

            resBox.appendChild(resHead);
            const genRes = renderGenericContent(resBox, outStep.content || "", tc.name || "", tc.args || null, parsedPreview, card);
            const { contentWrap } = genRes;

            const resRawBtn = resHead.querySelector(".raw-btn");
            if (genRes.hasModeCtrl && genRes.registerFullBtn) {
              const headFullBtn = document.createElement("button");
              headFullBtn.type = "button";
              headFullBtn.className = "head-raw-btn";
              headFullBtn.title = t("card.toggleOutputTitle");
              resHead.insertBefore(headFullBtn, resRawBtn);
              genRes.registerFullBtn(headFullBtn);
            }
            if (genRes.rawLabel) {
              const headRawBtn = document.createElement("button");
              headRawBtn.type = "button";
              headRawBtn.className = "head-raw-btn";
              headRawBtn.textContent = genRes.rawLabel;
              headRawBtn.title = t("card.toggleFormattedRawLinesTitle");
              resHead.insertBefore(headRawBtn, resRawBtn);
              genRes.registerRawBtn(headRawBtn);
            }

            let resRawPre = null;
            resRawBtn.addEventListener("click", () => {
              preserveScrollAnchor(() => {
                if (resRawPre) {
                  resRawPre.remove();
                  resRawPre = null;
                  contentWrap.classList.remove("hidden");
                  resRawBtn.classList.remove("active");
                } else {
                  contentWrap.classList.add("hidden");
                  resRawPre = document.createElement("pre");
                  resRawPre.className = "inline-raw-pre inner-scroll";
                  attachInnerScrollGuard(resRawPre);
                  resRawPre.textContent = JSON.stringify(outStep);
                  resBox.appendChild(resRawPre);
                  resRawBtn.classList.add("active");
                }
              }, resRawBtn);
            });

            tcCard.appendChild(resBox);
          }

          body.appendChild(tcCard);
        });
        det.appendChild(body);
        stepBody.appendChild(det);
      } catch (err) {
        const fallback = document.createElement("pre");
        fallback.className = "generic-pre inner-scroll";
        attachInnerScrollGuard(fallback);
        fallback.textContent = JSON.stringify(step.tool_calls, null, 2);
        stepBody.appendChild(fallback);
      }
    }

    // Error
    if (step.error) {
      const errDiv = document.createElement("div");
      errDiv.className = "md";
      errDiv.innerHTML = `<pre><code>${escHtml(unescapeNewlines(step.error))}</code></pre>`;
      stepBody.appendChild(errDiv);
    }

    // Content + forward-compatible unknown XML <TAG> detection
    if (step.content) {
      const prependUnknownTagChips = (tags) => {
        if (!tags || !tags.length) return;
        const tokBar = head.querySelector(".tok-bar");
        const span = document.createElement("span");
        span.innerHTML = tags
          .map(
            (tg) =>
              `<span class="meta-chip meta-chip-newtag" ${makeTipAttrs(
                t("card.unknownTagTitle", { tag: tg.tag }),
                t("card.unknownTagDesc"),
                `<${tg.tag}>\n${tg.body.slice(0, 260)}`
              )}>🆕 &lt;${escHtml(tg.tag)}&gt;</span>`
          )
          .join("");
        if (tokBar) head.insertBefore(span, tokBar);
        else head.appendChild(span);
      };

      const appendUnknownTagDrawers = (tags) => {
        for (const tg of tags) {
          const det = document.createElement("details");
          det.className = "block block-unknown-tag";
          det.innerHTML = `
            <summary>${escHtml(t("card.unknownTagDrawer", { tag: tg.tag, n: fmtNum(tg.body.length) }))}</summary>
            <div class="block-body"><pre class="generic-pre inner-scroll">${escHtml(unescapeNewlines(tg.body))}</pre></div>
          `;
          det.querySelectorAll(".inner-scroll").forEach(attachInnerScrollGuard);
          stepBody.appendChild(det);
        }
      };

      try {
        if (step.type === "USER_INPUT") {
          const env = parseUserInputEnvelope(step.content);
          const req = env.req;
          const meta = env.meta;
          const settings = env.settings;
          const extraTags = env.extraTags;

          const mainDiv = document.createElement("div");
          mainDiv.className = "md";
          mainDiv.innerHTML = renderMarkdown(unescapeNewlines(req !== null ? req : step.content));
          stepBody.appendChild(mainDiv);

          if (meta || settings) {
            // Skip metadata drawer if it only contains the standard "The current local time is: ..." line
            const metaClean = (meta || "").replace(/The current local time is:[^\n]*/gi, "").trim();
            const hasUsefulMeta = Boolean(metaClean) || Boolean(settings);
            if (hasUsefulMeta) {
              const det = document.createElement("details");
              det.className = "block block-meta";
              const parts = [metaClean, settings].filter(Boolean).join("\n\n");
              det.innerHTML = `
                <summary>${escHtml(t("card.requestMetaSummary"))}</summary>
                <div class="block-body"><pre class="generic-pre inner-scroll">${escHtml(unescapeNewlines(parts))}</pre></div>
              `;
              det.querySelectorAll(".inner-scroll").forEach(attachInnerScrollGuard);
              stepBody.appendChild(det);
            }
          }
          if (extraTags.length > 0) {
            prependUnknownTagChips(extraTags);
            appendUnknownTagDrawers(extraTags);
          }
        } else if (step.type === "GENERIC") {
          const stepToolMeta = stepToolMetaMap.get(step);
          const genRes = renderGenericContent(
            stepBody,
            step.content,
            stepToolMeta ? stepToolMeta.toolName : "",
            stepToolMeta ? stepToolMeta.toolArgs : null,
            null,
            card
          );
          const { chips, contentWrap } = genRes;
          const tokBar = head.querySelector(".tok-bar");
          const cardRawBtn = head.querySelector(".raw-btn");
          if (genRes.hasModeCtrl && tokBar && cardRawBtn) {
            if (genRes.registerFullBtn) {
              const headFullBtn = document.createElement("button");
              headFullBtn.type = "button";
              headFullBtn.className = "head-raw-btn";
              headFullBtn.title = t("card.toggleOutputTitle");
              tokBar.insertBefore(headFullBtn, cardRawBtn);
              genRes.registerFullBtn(headFullBtn);
            }
          }
          if (genRes.rawLabel) {
            if (tokBar && cardRawBtn) {
              const headRawBtn = document.createElement("button");
              headRawBtn.type = "button";
              headRawBtn.className = "head-raw-btn";
              headRawBtn.textContent = genRes.rawLabel;
              headRawBtn.title = t("card.toggleFormattedRawTitle");
              tokBar.insertBefore(headRawBtn, cardRawBtn);
              genRes.registerRawBtn(headRawBtn);
            }
          }
          if (chips.length > 0) {
            const chipsHtml = chips
              .map(
                (c) =>
                  `<span class="meta-chip ${c.cls}" ${makeTipAttrs(c.title, c.desc, c.raw)}>${escHtml(
                    c.label
                  )}</span>`
              )
              .join("");
            const span = document.createElement("span");
            span.innerHTML = chipsHtml;
            if (tokBar) {
              head.insertBefore(span, tokBar);
            } else {
              head.appendChild(span);
            }
          }
          // Add local { } button inside GENERIC body too
          const localRawBtn = document.createElement("button");
          localRawBtn.type = "button";
          localRawBtn.className = "show-more-btn";
          localRawBtn.textContent = t("card.localRawShow");
          let localRawPre = null;
          localRawBtn.addEventListener("click", () => {
            preserveScrollAnchor(() => {
              if (localRawPre) {
                localRawPre.remove();
                localRawPre = null;
                contentWrap.classList.remove("hidden");
                localRawBtn.textContent = t("card.localRawShow");
              } else {
                contentWrap.classList.add("hidden");
                localRawPre = document.createElement("pre");
                localRawPre.className = "inline-raw-pre inner-scroll";
                attachInnerScrollGuard(localRawPre);
                localRawPre.textContent = step.content;
                stepBody.insertBefore(localRawPre, localRawBtn);
                localRawBtn.textContent = t("card.localRawHide");
              }
            }, localRawBtn);
          });
          stepBody.appendChild(localRawBtn);
        } else if (step.type === "SYSTEM_MESSAGE") {
          const extraTags = extractTopLevelXmlTags(step.content, KNOWN_TOP_TAGS);
          if (extraTags.length > 0) prependUnknownTagChips(extraTags);

          const sysDiv = document.createElement("div");
          sysDiv.className = "system-msg-body";
          sysDiv.innerHTML = renderSystemMessageBody(unescapeNewlines(step.content));
          stepBody.appendChild(sysDiv);
        } else {
          const extraTags = extractTopLevelXmlTags(step.content, KNOWN_TOP_TAGS);
          if (extraTags.length > 0) prependUnknownTagChips(extraTags);

          let cleanContent = unescapeNewlines(step.content);
          if (step.type === "CHECKPOINT") {
            cleanContent = cleanContent
              .replace(/<summary>\s*/gi, "\n### Summary\n")
              .replace(/\s*<\/summary>/gi, "\n");
          }
          const mdDiv = document.createElement("div");
          mdDiv.className = "md";
          mdDiv.innerHTML = renderMarkdown(cleanContent, { highlightOlNums: step.type === "CHECKPOINT" });
          stepBody.appendChild(mdDiv);
        }
      } catch (err) {
        const fallback = document.createElement("pre");
        fallback.className = "generic-pre inner-scroll";
        attachInnerScrollGuard(fallback);
        fallback.textContent = typeof step.content === "string" ? step.content : JSON.stringify(step.content, null, 2);
        stepBody.appendChild(fallback);
      }
    }

    // Media attachments (explicit media[] + inline brain images in CHECKPOINT/content)
    const mediaUris = new Set();
    if (Array.isArray(step.media)) {
      for (const m of step.media) {
        if (m && m.uri) mediaUris.add(m.uri);
      }
    }
    if (step.type === "CHECKPOINT" && step.content) {
      for (const imgP of extractInlineBrainImages(step.content)) {
        mediaUris.add(imgP);
      }
    }

    if (mediaUris.size > 0) {
      card.classList.add("has-media");
      const strip = document.createElement("div");
      strip.className = "media-strip";
      for (const uri of mediaUris) {
        const img = document.createElement("img");
        img.className = "media-thumb";
        img.loading = "lazy";
        img.src = `/api/file?path=${encodeURIComponent(uri)}`;
        img.title = uri;
        img.addEventListener("click", () => {
          els.lightboxImg.src = img.src;
          els.lightbox.classList.remove("hidden");
        });
        strip.appendChild(img);
      }
      stepBody.appendChild(strip);
    }

    if (card.querySelector(".md img")) {
      card.classList.add("has-media");
    }
    if (card.querySelector(".arg-val-replacement")) {
      card.dataset.hasEditDiff = "1";
    }
    return card;
  }

  const _hasRIC = typeof window.requestIdleCallback === "function";
  let _cardRenderConfigKey = "";
  let _dragSettleTimer = 0;
  let _prewarmTimer = 0;
  let _prewarmIsIdle = false;
  let _upgradeRaf = 0;
  let _lastScrollFrameTs = 0;
  let _lastScrollFrameTop = 0;

  function getRenderConfigKey() {
    return [
      state.lang || "en",
      state.attachToolOutputs ? 1 : 0,
      state.expandAllOutputs ? 1 : 0,
      state.monoOutputs ? 1 : 0,
      state.readDisplayMode || "scroll",
      state.folderOpenMode || "browser",
      state.disableAutoLinks ? 1 : 0,
      state.linkifyProjectFiles ? 1 : 0,
    ].join("|");
  }

  function clearCardHighlight(card) {
    if (!card) return;
    const hitEls = card.querySelectorAll(".search-hit-target, .search-hit-sub");
    for (const hEl of hitEls) {
      hEl.classList.remove("search-hit-target", "search-hit-sub");
    }
    card.classList.remove("search-hit-target", "search-hit-sub");
    card.classList.remove("has-search-omitted", "is-search-untrimmed");
    const omittedEls = card.querySelectorAll(".search-omitted");
    for (const oEl of omittedEls) {
      oEl.classList.remove("search-omitted");
    }
    const revealBars = card.querySelectorAll(".search-reveal-bar");
    for (const rb of revealBars) {
      rb.remove();
    }
    const marks = card.querySelectorAll("mark.hl");
    for (const mark of marks) {
      const p = mark.parentNode;
      if (!p) continue;
      p.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      p.normalize();
    }
    delete card.dataset.hlQuery;
    _highlightedCards.delete(card);
  }

  function invalidateCardRenderCache() {
    _lruMap.clear();
    for (const it of _vItems) it.el = null;
    _highlightedCards.clear();
    _tocBaseCache = null;
  }

  function getHighlightSig() {
    if (!state.stepQuery) return "";
    return `${state.stepQuery}\x01${state.searchWholeWord ? 1 : 0}\x01${state.searchCaseSensitive ? 1 : 0}\x01${state.searchAcrossWholeTurn ? 1 : 0}\x01${state.searchFocusedOnly ? 1 : 0}\x01${state.lang || "en"}`;
  }

  function enhanceCardNow(card) {
    if (!card) return;
    if (card.dataset.enhanced !== "1") {
      card.dataset.enhanced = "1";
      linkifyTaskIdsInElement(card, rawStepMap.get(card) || null);
      linkifyElement(card);
    }
    const hlSig = getHighlightSig();
    if (state.stepQuery) {
      if (card.dataset.hlQuery !== hlSig) {
        if (card.dataset.hlQuery) clearCardHighlight(card);
        highlightMatches(card, state.stepQuery, {
          ...getSearchOpts(),
          trimNonMatching: state.searchFocusedOnly && card.tagName === "ARTICLE",
          cardEl: card,
        });
        card.dataset.hlQuery = hlSig;
        _highlightedCards.add(card);
        if (card.isConnected) applyInitialSearchScrolls(card);
      }
    } else if (card.dataset.hlQuery) {
      clearCardHighlight(card);
      if (card.isConnected && card.dataset.hasEditDiff === "1") applyInitialEditScrolls(card);
    }
  }

  function findVItemAtY(yInList) {
    const n = _vItems.length;
    if (!n) return 0;
    let lo = 0;
    let hi = n - 1;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (_vItems[mid].offsetY <= yInList) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  function recomputeVItemOffsets(startIdx = 0) {
    const n = _vItems.length;
    if (n === 0) {
      _vTotalHeight = 0;
      return;
    }
    let y = startIdx > 0 ? (_vItems[startIdx - 1].offsetY + _vItems[startIdx - 1].height) : 0;
    for (let i = startIdx; i < n; i++) {
      _vItems[i].offsetY = y;
      y += _vItems[i].height;
    }
    _vTotalHeight = Math.max(0, y - CARD_GAP);
  }

  function getVListBaseTop() {
    return _vListBox ? _vListBox.offsetTop : 16;
  }

  function updateVSpacers() {
    if (!_vSpacerTop || !_vSpacerBottom || !_vItems.length) {
      if (_vSpacerTop) _vSpacerTop.style.height = "0px";
      if (_vSpacerBottom) _vSpacerBottom.style.height = "0px";
      return;
    }
    if (_winEnd < _winStart) {
      // Preserve total virtual height while _vWindow is unmounted so Chrome never clamps scrollTop to 0
      _vSpacerTop.style.height = "0px";
      _vSpacerBottom.style.height = `${Math.max(0, _vTotalHeight)}px`;
      return;
    }
    const topH = _vItems[_winStart].offsetY;
    const n = _vItems.length;
    const botH = _winEnd < n - 1
      ? Math.max(0, _vTotalHeight - _vItems[_winEnd + 1].offsetY + CARD_GAP)
      : 0;
    _vSpacerTop.style.height = `${topH}px`;
    _vSpacerBottom.style.height = `${botH}px`;
  }

  function measureMountedVWindowNow() {
    if (!_vItems.length || !_vWindow) return false;
    let minChangedIdx = _vItems.length;
    for (const el of _vWindow.children) {
      if (!el.isConnected || el.dataset.isSkeleton === "1") continue;
      const item = _vElToItemMap.get(el);
      if (!item) continue;
      const boxH = Math.ceil(el.getBoundingClientRect().height);
      if (boxH <= 0) continue;
      const newH = boxH + CARD_GAP;
      if (Math.abs(newH - item.height) >= 1) {
        item.height = newH;
        item.measured = true;
        if (item.idx < minChangedIdx) minChangedIdx = item.idx;
      }
    }
    if (minChangedIdx < _vItems.length) {
      recomputeVItemOffsets(minChangedIdx);
      updateVSpacers();
      return true;
    }
    return false;
  }

  function touchLruItem(item, el, cfgKey) {
    item.el = el;
    item.cfgKey = cfgKey;
    _vElToItemMap.set(el, item);
    if (_lruMap.has(item)) _lruMap.delete(item);
    _lruMap.set(item, true);
    if (_lruMap.size > CARD_LRU_MAX) {
      for (const oldItem of _lruMap.keys()) {
        if (_lruMap.size <= CARD_LRU_MAX) break;
        if (oldItem.idx >= _winStart && oldItem.idx <= _winEnd) continue;
        _lruMap.delete(oldItem);
        oldItem.el = null;
      }
    }
  }

  function ensureRealVElement(item) {
    const cfgKey = _cardRenderConfigKey || getRenderConfigKey();
    if (item.el && item.cfgKey === cfgKey) {
      enhanceCardNow(item.el);
      touchLruItem(item, item.el, cfgKey);
      return item.el;
    }
    let el;
    if (item.kind === "expand") {
      el = createDialogExpandRow(item.hiddenSteps, item.attachedByPlanner);
    } else {
      el = buildStepElement(item.step, item.attached);
      enhanceCardNow(el);
    }
    el.dataset.vIdx = String(item.idx);
    touchLruItem(item, el, cfgKey);
    return el;
  }

  function buildDragSkeleton(item) {
    const sk = document.createElement(item.kind === "expand" ? "div" : "article");
    if (item.kind === "expand") {
      sk.className = "dialog-expand-wrap";
      sk.style.minHeight = `${Math.max(28, item.height - CARD_GAP)}px`;
      sk.dataset.isSkeleton = "1";
      sk.dataset.vIdx = String(item.idx);
      _vElToItemMap.set(sk, item);
      return sk;
    }
    const s = item.step;
    const statusCls = s.status ? `status-${s.status}` : "";
    sk.className = `step type-${s.type || "GENERIC"} ${statusCls}${item.hasErr ? " has-any-error" : ""} step-drag-skeleton`;
    sk.style.height = `${Math.max(56, item.height - CARD_GAP)}px`;
    sk.dataset.stepIndex = item.stepKey;
    sk.dataset.isSkeleton = "1";
    sk.dataset.vIdx = String(item.idx);
    let hint = "";
    if (Array.isArray(s.tool_calls) && s.tool_calls.length) {
      hint = "🛠 " + s.tool_calls.map((t) => t.name || "tool").join(", ");
    } else if (s.content) {
      hint = String(s.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    }
    sk.innerHTML =
      `<div class="step-head">` +
        `<span class="badge badge-${escHtml(s.type)}">${escHtml(s.type)}</span>` +
        `<span class="step-num-chip">#${escHtml(s.step_index)}</span>` +
        `<span class="status-pill ${escHtml(s.status)}">${escHtml(s.status || "—")}</span>` +
        `<span class="step-ts">${escHtml(fmtStepTime(s.created_at))}</span>` +
      `</div>` +
      `<div class="step-body step-shell-placeholder">${escHtml(hint || t("app.scrollingPlaceholder"))}</div>`;
    _vElToItemMap.set(sk, item);
    return sk;
  }

  // Zero-Forced-Reflow measurement for currently mounted window cards via ResizeObserver
  const vResizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          if (!_vItems.length || !_vWindow) return;
          const fw = els.feedWrap;
          const vBaseTop = getVListBaseTop();
          const viewTopInList = fw ? Math.max(0, fw.scrollTop - vBaseTop) : 0;
          const canCompensate =
            fw &&
            !_scrollbarDragging &&
            performance.now() >= _suppressRoScrollCompUntil &&
            fw.scrollTop > 20;
          const jumpLockValid = Boolean(
            fw &&
              !_scrollbarDragging &&
              _activeJumpLock &&
              performance.now() < _activeJumpLock.expiresAt &&
              _vItems[_activeJumpLock.item?.idx] === _activeJumpLock.item
          );
          const anchorLockValid = Boolean(
            fw &&
              !_scrollbarDragging &&
              !jumpLockValid &&
              _activeAnchorLock &&
              performance.now() < _activeAnchorLock.expiresAt &&
              _activeAnchorLock.el &&
              isAnchorVisible(_activeAnchorLock.el) &&
              (!_activeAnchorLock.item || _vItems[_activeAnchorLock.item.idx] === _activeAnchorLock.item)
          );
          const keepPinnedBottom = Boolean(
            fw &&
              !_scrollbarDragging &&
              !jumpLockValid &&
              !anchorLockValid &&
              (performance.now() < _pinBottomLockUntil || (els.followToggle?.checked && !state.userScrolledUp))
          );

          let minChangedIdx = _vItems.length;
          let scrollAdjust = 0;

          for (const entry of entries) {
            const el = entry.target;
            const item = _vElToItemMap.get(el);
            if (!item || !el.isConnected || el.dataset.isSkeleton === "1") continue;
            const boxH = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
            const newCardH = Math.ceil(boxH);
            if (newCardH <= 0) continue;
            const newH = newCardH + CARD_GAP;
            const diff = newH - item.height;
            if (Math.abs(diff) >= 1) {
              if (canCompensate && item.offsetY + item.height <= viewTopInList + 8) {
                scrollAdjust += diff;
              }
              item.height = newH;
              item.measured = true;
              if (item.idx < minChangedIdx) minChangedIdx = item.idx;
            }
          }

          if (minChangedIdx < _vItems.length) {
            recomputeVItemOffsets(minChangedIdx);
            updateVSpacers();
            if (keepPinnedBottom) {
              _suppressScrollTsUntil = performance.now() + 100;
              fw.scrollTop = fw.scrollHeight;
              _lastScrollFrameTop = fw.scrollTop;
            } else if (jumpLockValid) {
              _suppressScrollTsUntil = performance.now() + 120;
              if (typeof _activeJumpLock.alignFn === "function") {
                _activeJumpLock.alignFn();
              } else {
                fw.scrollTop = Math.max(0, getVListBaseTop() + _activeJumpLock.item.offsetY - _activeJumpLock.desiredTop);
              }
              _lastScrollFrameTop = fw.scrollTop;
            } else if (anchorLockValid) {
              _suppressScrollTsUntil = performance.now() + 100;
              if (_activeAnchorLock.item) {
                fw.scrollTop = Math.max(
                  0,
                  getVListBaseTop() + _activeAnchorLock.item.offsetY + _activeAnchorLock.cardOffset - _activeAnchorLock.top
                );
              } else {
                const d = _activeAnchorLock.el.getBoundingClientRect().top - _activeAnchorLock.top;
                if (Math.abs(d) > 1) fw.scrollTop = Math.max(0, fw.scrollTop + d);
              }
              _lastScrollFrameTop = fw.scrollTop;
            } else if (scrollAdjust !== 0) {
              _suppressScrollTsUntil = performance.now() + 100;
              fw.scrollTop = Math.max(0, fw.scrollTop + scrollAdjust);
              _lastScrollFrameTop = fw.scrollTop;
            }
            scheduleMinimapSync();
          }
        })
      : null;

  function clearVWindowDom() {
    if (vResizeObserver && _vWindow) {
      for (const ch of _vWindow.children) {
        vResizeObserver.unobserve(ch);
      }
    }
    if (_vWindow) _vWindow.innerHTML = "";
    _winStart = 0;
    _winEnd = -1;
  }

  function cancelPrewarmLru() {
    if (_prewarmTimer) {
      if (_prewarmIsIdle && _hasRIC) {
        try { window.cancelIdleCallback(_prewarmTimer); } catch (_) {}
      }
      clearTimeout(_prewarmTimer);
      _prewarmTimer = 0;
      _prewarmIsIdle = false;
    }
  }

  function cancelVirtualTimers() {
    clearTimeout(_dragSettleTimer);
    _dragSettleTimer = 0;
    if (_upgradeRaf) {
      cancelAnimationFrame(_upgradeRaf);
      _upgradeRaf = 0;
    }
    cancelPrewarmLru();
  }

  // Background detached LRU warm-up (+/- 1 MB around visible center) — zero DOM / compositor cost!
  function _runPrewarmLruSlice(deadline = null) {
    _prewarmTimer = 0;
    _prewarmIsIdle = false;
    if (!_vItems.length || !els.feedWrap || _scrollbarDragging) return;
    const now = Date.now();
    if (now - _lastUserScrollMs < 220 || now - _lastComposerTypeMs < 300) {
      _schedulePrewarmLru(240);
      return;
    }
    const n = _vItems.length;
    const centerIdx = Math.min(n - 1, Math.max(0, (_winStart + _winEnd) >> 1));
    const maxRadius = Math.floor((CARD_LRU_MAX - 10) / 2);
    let upBytes = 0;
    let downBytes = 0;
    let started = performance.now();
    let builtAny = false;
    let hasMore = false;

    for (let d = 1; d <= maxRadius; d++) {
      const rem = deadline && typeof deadline.timeRemaining === "function" ? deadline.timeRemaining() : 99;
      if (performance.now() - started >= 6 || rem < 2) {
        hasMore = true;
        break;
      }
      const downIdx = centerIdx + d;
      if (downIdx < n && downBytes < PREWARM_SIDE_BYTES) {
        const it = _vItems[downIdx];
        downBytes += it.bytes;
        if (!it.el || it.cfgKey !== _cardRenderConfigKey) {
          ensureRealVElement(it);
          builtAny = true;
        }
      }
      if (performance.now() - started >= 6) {
        hasMore = true;
        break;
      }
      const upIdx = centerIdx - d;
      if (upIdx >= 0 && upBytes < PREWARM_SIDE_BYTES) {
        const it = _vItems[upIdx];
        upBytes += it.bytes;
        if (!it.el || it.cfgKey !== _cardRenderConfigKey) {
          ensureRealVElement(it);
          builtAny = true;
        }
      }
    }
    if (hasMore || builtAny) {
      _schedulePrewarmLru(hasMore ? 60 : 120);
    }
  }

  function _schedulePrewarmLru(delayMs = 180) {
    if (_prewarmTimer || !_vItems.length || _scrollbarDragging) return;
    if (_hasRIC && delayMs <= 120) {
      _prewarmIsIdle = true;
      _prewarmTimer = window.requestIdleCallback(_runPrewarmLruSlice, { timeout: 300 });
    } else {
      _prewarmIsIdle = false;
      _prewarmTimer = setTimeout(() => {
        if (_hasRIC) {
          _prewarmIsIdle = true;
          _prewarmTimer = window.requestIdleCallback(_runPrewarmLruSlice, { timeout: 300 });
        } else {
          _runPrewarmLruSlice(null);
        }
      }, delayMs);
    }
  }

  function syncVirtualWindow(opts = {}) {
    if (!_vWindow || !_vListBox || !_vItems.length || !els.feedWrap) return;
    const fw = els.feedWrap;
    const scrollTop = fw.scrollTop;
    const clientH = Math.max(200, fw.clientHeight);
    const n = _vItems.length;

    const now = performance.now();
    const dt = Math.max(1, now - _lastScrollFrameTs);
    const dy = Math.abs(scrollTop - _lastScrollFrameTop);
    _lastScrollFrameTs = now;
    _lastScrollFrameTop = scrollTop;
    const pxPerSec = (dy / dt) * 1000;
    const isUserScrollNow = now >= _suppressScrollTsUntil;
    const isActiveDragOrFlick = Boolean(
      !opts.forceRender &&
      !opts.settledDrag &&
      (_scrollbarDragging || (isUserScrollNow && (dy > Math.max(900, clientH * 1.25) || (dy > 260 && pxPerSec > clientH * 6.5))))
    );

    const overscan = isActiveDragOrFlick ? 450 : 950;
    const vBaseTop = getVListBaseTop();
    const viewTop = Math.max(0, scrollTop - vBaseTop);
    const viewBottom = Math.max(viewTop + clientH, clientH);

    let nextStart = findVItemAtY(Math.max(0, viewTop - overscan));
    let nextEnd = findVItemAtY(Math.min(_vTotalHeight, viewBottom + overscan));
    if (nextEnd < nextStart) nextEnd = nextStart;

    // Hard cap live DOM count to ~42 cards around viewport center so Chrome Style/Composite stays <1ms
    if (nextEnd - nextStart + 1 > 42) {
      const midIdx = findVItemAtY(viewTop + clientH * 0.5);
      nextStart = Math.max(0, midIdx - 20);
      nextEnd = Math.min(n - 1, midIdx + 21);
    }

    const windowSame = nextStart === _winStart && nextEnd === _winEnd;
    if (windowSame && !opts.upgradeSkeletons && !opts.forceRender) {
      return;
    }

    const cfgKey = _cardRenderConfigKey || getRenderConfigKey();
    const sliceStart = performance.now();
    let hasSkeletonsLeft = false;

    const getMountNode = (item) => {
      if (item.el && item.cfgKey === cfgKey) {
        enhanceCardNow(item.el);
        touchLruItem(item, item.el, cfgKey);
        return item.el;
      }
      if (isActiveDragOrFlick) {
        hasSkeletonsLeft = true;
        return buildDragSkeleton(item);
      }
      const inCoreViewport = item.offsetY + item.height >= viewTop - 160 && item.offsetY <= viewBottom + 160;
      if (!opts.forceRender && !inCoreViewport && (_scrollbarDragging || performance.now() - sliceStart > 12)) {
        hasSkeletonsLeft = true;
        return buildDragSkeleton(item);
      }
      return ensureRealVElement(item);
    };

    const prevStart = _winStart;
    const prevEnd = _winEnd;
    const overlaps = prevEnd >= prevStart && nextStart <= prevEnd && nextEnd >= prevStart;

    if (!overlaps) {
      if (vResizeObserver) {
        for (const ch of _vWindow.children) vResizeObserver.unobserve(ch);
      }
      const frag = document.createDocumentFragment();
      const editNodes = [];
      const checkNodes = [];
      for (let i = nextStart; i <= nextEnd; i++) {
        const node = getMountNode(_vItems[i]);
        frag.appendChild(node);
        if (node.dataset.hasEditDiff === "1") editNodes.push(node);
        if (node.dataset.isSkeleton !== "1") checkNodes.push(node);
        if (vResizeObserver && node.dataset.isSkeleton !== "1") vResizeObserver.observe(node);
      }
      _vWindow.innerHTML = "";
      _vWindow.appendChild(frag);
      for (const en of editNodes) applyInitialEditScrolls(en);
      if (state.stepQuery) for (const cn of checkNodes) applyInitialSearchScrolls(cn);
      for (const cn of checkNodes) scheduleCardOverflowCheck(cn);
    } else {
      // Remove top elements outside new window
      while (_vWindow.firstElementChild) {
        const el = _vWindow.firstElementChild;
        const idx = Number(el.dataset.vIdx);
        if (!Number.isNaN(idx) && idx < nextStart) {
          if (vResizeObserver) vResizeObserver.unobserve(el);
          el.remove();
        } else {
          break;
        }
      }
      // Remove bottom elements outside new window
      while (_vWindow.lastElementChild) {
        const el = _vWindow.lastElementChild;
        const idx = Number(el.dataset.vIdx);
        if (!Number.isNaN(idx) && idx > nextEnd) {
          if (vResizeObserver) vResizeObserver.unobserve(el);
          el.remove();
        } else {
          break;
        }
      }
      // Prepend missing top elements
      if (nextStart < prevStart) {
        const topFrag = document.createDocumentFragment();
        const topEditNodes = [];
        const topCheckNodes = [];
        for (let i = nextStart; i < prevStart; i++) {
          const node = getMountNode(_vItems[i]);
          topFrag.appendChild(node);
          if (node.dataset.hasEditDiff === "1") topEditNodes.push(node);
          if (node.dataset.isSkeleton !== "1") topCheckNodes.push(node);
          if (vResizeObserver && node.dataset.isSkeleton !== "1") vResizeObserver.observe(node);
        }
        _vWindow.prepend(topFrag);
        for (const en of topEditNodes) applyInitialEditScrolls(en);
        if (state.stepQuery) for (const cn of topCheckNodes) applyInitialSearchScrolls(cn);
        for (const cn of topCheckNodes) scheduleCardOverflowCheck(cn);
      }
      // Append missing bottom elements
      if (nextEnd > prevEnd) {
        const botFrag = document.createDocumentFragment();
        const botEditNodes = [];
        const botCheckNodes = [];
        for (let i = prevEnd + 1; i <= nextEnd; i++) {
          const node = getMountNode(_vItems[i]);
          botFrag.appendChild(node);
          if (node.dataset.hasEditDiff === "1") botEditNodes.push(node);
          if (node.dataset.isSkeleton !== "1") botCheckNodes.push(node);
          if (vResizeObserver && node.dataset.isSkeleton !== "1") vResizeObserver.observe(node);
        }
        _vWindow.appendChild(botFrag);
        for (const en of botEditNodes) applyInitialEditScrolls(en);
        if (state.stepQuery) for (const cn of botCheckNodes) applyInitialSearchScrolls(cn);
        for (const cn of botCheckNodes) scheduleCardOverflowCheck(cn);
      }
      // Upgrade skeletons: visible viewport skeletons FIRST, then overscan within budget
      if (!isActiveDragOrFlick && (opts.upgradeSkeletons || opts.forceRender)) {
        const skels = Array.from(_vWindow.querySelectorAll('[data-is-skeleton="1"]'));
        const coreSkels = [];
        const edgeSkels = [];
        for (const sk of skels) {
          const idx = Number(sk.dataset.vIdx);
          const item = _vItems[idx];
          if (!item) continue;
          const inCore = item.offsetY + item.height >= viewTop - 160 && item.offsetY <= viewBottom + 160;
          if (inCore) coreSkels.push([sk, item]);
          else edgeSkels.push([sk, item]);
        }
        for (const [sk, item] of coreSkels) {
          const realNode = ensureRealVElement(item);
          sk.replaceWith(realNode);
          if (realNode.dataset.hasEditDiff === "1") applyInitialEditScrolls(realNode);
          if (state.stepQuery) applyInitialSearchScrolls(realNode);
          scheduleCardOverflowCheck(realNode);
          if (vResizeObserver) vResizeObserver.observe(realNode);
        }
        for (const [sk, item] of edgeSkels) {
          if (!opts.forceRender && (_scrollbarDragging || performance.now() - sliceStart > 12)) {
            hasSkeletonsLeft = true;
            continue;
          }
          const realNode = ensureRealVElement(item);
          sk.replaceWith(realNode);
          if (realNode.dataset.hasEditDiff === "1") applyInitialEditScrolls(realNode);
          if (state.stepQuery) applyInitialSearchScrolls(realNode);
          scheduleCardOverflowCheck(realNode);
          if (vResizeObserver) vResizeObserver.observe(realNode);
        }
      } else if (isActiveDragOrFlick) {
        hasSkeletonsLeft = hasSkeletonsLeft || Boolean(_vWindow.querySelector('[data-is-skeleton="1"]'));
      }
    }

    _winStart = nextStart;
    _winEnd = nextEnd;
    updateVSpacers();

    if (hasSkeletonsLeft) {
      if (isActiveDragOrFlick) {
        clearTimeout(_dragSettleTimer);
        _dragSettleTimer = setTimeout(() => {
          _dragSettleTimer = 0;
          syncVirtualWindow({ upgradeSkeletons: true, settledDrag: true });
        }, 65);
      } else if (!_scrollbarDragging && !_upgradeRaf) {
        _upgradeRaf = requestAnimationFrame(() => {
          _upgradeRaf = 0;
          syncVirtualWindow({ upgradeSkeletons: true });
        });
      }
    } else {
      _schedulePrewarmLru(160);
    }
  }

  // ---------- Feed & Totals ----------
  function renderSessionStats() {
    const { inTok, cacheTok, outTok } = state.totals;
    const totIn = inTok + cacheTok;
    const hitPct = totIn > 0 ? ((cacheTok / totIn) * 100).toFixed(1) : "0.0";
    els.sessionStats.textContent = t("app.stepsStatsBar", {
      steps: state.steps.length,
      inTok: fmtNum(inTok),
      cacheTok: fmtNum(cacheTok),
      hitPct,
      outTok: fmtNum(outTok),
    });
  }

  function recomputeTotals() {
    let inTok = 0, cacheTok = 0, outTok = 0;
    for (const s of state.steps) {
      inTok += Number(s.input_tokens || 0);
      cacheTok += Number(s.cache_read_tokens || 0);
      outTok += Number(s.output_tokens || 0);
    }
    state.totals = { inTok, cacheTok, outTok };
    renderSessionStats();
  }

  function addStepTotals(newSteps) {
    for (const s of newSteps) {
      state.totals.inTok += Number(s.input_tokens || 0);
      state.totals.cacheTok += Number(s.cache_read_tokens || 0);
      state.totals.outTok += Number(s.output_tokens || 0);
    }
    renderSessionStats();
  }

  function jumpToStep(stepIndex, opts = {}) {
    const key = String(stepIndex);
    let item = _vStepToItemMap.get(key);
    if (!item) {
      if (opts.resetFiltersOnMissing === false) return false;
      // Reset filters so the target step becomes visible
      state.filter = "all";
      state.stepQuery = "";
      state.onlyCmdErrors = false;
      state.cmdMapFilterOnly = false;
      els.stepSearch.value = "";
      if (els.onlyCmdErrorsToggle) els.onlyCmdErrorsToggle.checked = false;
      if (els.cmdMapFilterOnly) els.cmdMapFilterOnly.checked = false;
      document.querySelectorAll(".filter-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.filter === "all");
      });
      renderFullFeed();
      item = _vStepToItemMap.get(key);
    }
    if (!item || !els.feedWrap) return;

    const desiredTop = opts.topOffset !== undefined ? opts.topOffset : 4;
    const subStepKey = opts.toolOutStep !== undefined && opts.toolOutStep !== null ? String(opts.toolOutStep) : "";
    const toolIdxKey = opts.toolIdx !== undefined && opts.toolIdx !== null ? String(opts.toolIdx) : "";
    const subAnchor = opts.subAnchor && typeof opts.subAnchor === "object" ? opts.subAnchor : null;
    const topCard = ensureRealVElement(item);
    // Warm immediate +/- 2 neighbors cleanly before scroll
    for (let k = Math.max(0, item.idx - 2); k <= Math.min(_vItems.length - 1, item.idx + 2); k++) {
      ensureRealVElement(_vItems[k]);
    }

    const queryByIdx = (root, sel, idx) => {
      if (!root || !sel) return null;
      try {
        const list = root.querySelectorAll(sel);
        const i = Number.isFinite(idx) ? idx : 0;
        return list[i] || list[0] || null;
      } catch (_) {
        return null;
      }
    };

    const resolveTarget = () => {
      const resEl = subStepKey ? topCard.querySelector(`[data-step-index="${CSS.escape(subStepKey)}"]`) : null;
      const tcEl = !resEl && toolIdxKey ? topCard.querySelector(`.tool-card[data-tool-idx="${CSS.escape(toolIdxKey)}"]`) : null;
      if (subAnchor && subAnchor.sel) {
        if (subAnchor.scope === "res" && resEl) {
          const hit = queryByIdx(resEl, subAnchor.sel, subAnchor.idx);
          if (hit) return hit;
        } else if (subAnchor.scope === "tc" && tcEl) {
          const hit = queryByIdx(tcEl, subAnchor.sel, subAnchor.idx);
          if (hit) return hit;
        } else if (subAnchor.scope === "card") {
          const hit = queryByIdx(topCard, subAnchor.sel, subAnchor.idx);
          if (hit) return hit;
        }
      }
      if (resEl) return resEl;
      if (tcEl) return tcEl;
      return topCard.querySelector(`[data-step-index="${CSS.escape(key)}"]`) || topCard;
    };

    let target = resolveTarget();
    let p = target.parentElement;
    while (p && p !== els.feed) {
      if (p.tagName === "DETAILS" && !p.open) p.open = true;
      p = p.parentElement;
    }

    const alignToTarget = () => {
      if (!target.isConnected) {
        const baseNow = getVListBaseTop();
        _suppressScrollTsUntil = Math.max(_suppressScrollTsUntil, performance.now() + 260);
        els.feedWrap.scrollTop = Math.max(0, baseNow + item.offsetY - desiredTop);
        _lastScrollFrameTop = els.feedWrap.scrollTop;
        syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
        measureMountedVWindowNow();
        target = resolveTarget();
      }
      if (!target.isConnected) return 0;
      const wrapRect = els.feedWrap.getBoundingClientRect();
      const tgtRect = target.getBoundingClientRect();
      const delta = tgtRect.top - wrapRect.top - desiredTop;
      if (Math.abs(delta) > 1.5) {
        _suppressScrollTsUntil = Math.max(_suppressScrollTsUntil, performance.now() + 240);
        els.feedWrap.scrollTop = Math.max(0, els.feedWrap.scrollTop + delta);
        _lastScrollFrameTop = els.feedWrap.scrollTop;
      }
      return delta;
    };

    _pinBottomLockUntil = 0;
    _activeAnchorLock = null;
    const jumpLock = { item, desiredTop, expiresAt: performance.now() + 1200, alignFn: alignToTarget };
    _activeJumpLock = jumpLock;
    _suppressScrollTsUntil = performance.now() + 320;
    _suppressRoScrollCompUntil = performance.now() + 360;
    const baseTop = getVListBaseTop();
    els.feedWrap.scrollTop = Math.max(0, baseTop + item.offsetY - desiredTop);
    _lastScrollFrameTop = els.feedWrap.scrollTop;

    let lastDelta = 0;
    for (let pass = 0; pass < 5; pass++) {
      syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
      measureMountedVWindowNow();
      target = resolveTarget();
      p = target.parentElement;
      while (p && p !== els.feed) {
        if (p.tagName === "DETAILS" && !p.open) p.open = true;
        p = p.parentElement;
      }
      lastDelta = alignToTarget();
      if (Math.abs(lastDelta) <= 2) break;
    }
    if (Math.abs(lastDelta) > 2) {
      syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
      measureMountedVWindowNow();
      target = resolveTarget();
      alignToTarget();
    }

    requestAnimationFrame(() => {
      if (_activeJumpLock !== jumpLock) return;
      syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
      measureMountedVWindowNow();
      target = resolveTarget();
      alignToTarget();
    });
    setTimeout(() => {
      if (_activeJumpLock !== jumpLock || performance.now() >= jumpLock.expiresAt) return;
      syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
      measureMountedVWindowNow();
      target = resolveTarget();
      alignToTarget();
    }, 90);

    target.classList.remove("step-flash");
    void target.offsetWidth;
    target.classList.add("step-flash");
    setTimeout(() => target.classList.remove("step-flash"), 1800);
  }

  function extractMatchSnippet(step, query, attachedOutputs = null) {
    const ast = getCachedSearchAst(query);
    const termObjs = getPositiveSearchTermObjs(ast);
    const sOpts = getSearchOpts();
    const attachedChips = Array.isArray(attachedOutputs)
      ? attachedOutputs.flatMap((g) => (g.content ? parseGenericOutput(g.content).chips.map((c) => c.label) : [])).join(" ")
      : "";
    const attachedText = Array.isArray(attachedOutputs)
      ? attachedOutputs.map((g) => `#${g.step_index} ${g.status || ""} ${g.error || ""} ${g.content || ""}`).join("\n")
      : "";
    const selfChips =
      step.type === "GENERIC" && step.content
        ? parseGenericOutput(step.content).chips.map((c) => c.label).join(" ")
        : "";
    const taskEvs = typeof stepTaskMetaMap !== "undefined" ? (stepTaskMetaMap.get(step) || []) : [];
    const taskLabels = taskEvs
      .map((ev) => {
        const d = typeof resolveTaskLinkDestination === "function"
          ? resolveTaskLinkDestination(ev.taskId || ev.awaitedTaskId, step, ev.role)
          : null;
        return [ev.taskId || "", ev.awaitedTaskId || "", d ? d.label : ""].join(" ");
      })
      .join(" ");
    const modelLbl = stepModelMap.get(step) ? `🤖 ${stepModelMap.get(step)}` : "";
    const metaLabel = `#${step.step_index} ${step.type || ""} ${step.status || ""} ${step.source || ""} ${fmtStepTime(step.created_at)} ${modelLbl} ${taskLabels} ${selfChips} ${attachedChips}`;
    const sources = [];
    if (step.content) sources.push(["content", step.content]);
    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      step.tool_calls.forEach((tc, tcIdx) => {
        const out = Array.isArray(attachedOutputs) ? attachedOutputs[tcIdx] : null;
        const outPart = out ? ` #${out.step_index} ${out.status || ""} ${out.error || ""} ${out.content || ""}` : "";
        sources.push([tc.name || "tool", `${tc.name || ""} ${JSON.stringify(tc.args || {})}${outPart}`]);
      });
    } else if (attachedText) {
      sources.push(["output", attachedText]);
    }
    if (step.thinking) sources.push(["thinking", step.thinking]);
    if (step.error) sources.push(["error", step.error]);
    sources.push(["meta", metaLabel]);

    if (termObjs.length > 0) {
      const renderSliceHtml = (label, clean, idx, termLen) => {
        const start = Math.max(0, idx - 34);
        const end = Math.min(clean.length, idx + termLen + 48);
        const prefix = start > 0 ? "…" : "";
        const suffix = end < clean.length ? "…" : "";
        const before = escHtml(clean.slice(start, idx));
        const match = escHtml(clean.slice(idx, idx + termLen));
        const after = escHtml(clean.slice(idx + termLen, end));
        const tag = label === "content" ? "" : `[${label}] `;
        const winRaw = clean.slice(start, end);
        return {
          html: `${escHtml(tag)}${prefix}${before}<mark class="hl">${match}</mark>${after}${suffix}`,
          windowRaw: winRaw,
          windowLower: winRaw.toLowerCase(),
        };
      };

      const prepared = sources
        .filter(([, raw]) => Boolean(raw))
        .map(([label, raw]) => {
          const clean = unescapeNewlines(raw).replace(/\s+/g, " ").trim();
          return { label, clean, lower: clean.toLowerCase() };
        })
        .filter((s) => s.clean.length > 0);
      const astMatchedSources =
        !sOpts.acrossWholeTurn && ast
          ? prepared.filter((s) => evalSearchAst(ast, { raw: s.clean, lower: s.lower }, sOpts))
          : [];
      const activeSources = astMatchedSources.length > 0 ? astMatchedSources : prepared;

      let firstSnip = null;
      for (const s of activeSources) {
        let bestIdx = -1;
        let bestTerm = null;
        for (const tObj of termObjs) {
          const hits = findTermOccurrences(s.clean, s.lower, tObj.text, tObj.lower, sOpts, false);
          const idx = hits.length ? hits[0][0] : -1;
          if (idx !== -1 && (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && tObj.text.length > bestTerm.text.length))) {
            bestIdx = idx;
            bestTerm = tObj;
          }
        }
        if (bestIdx !== -1 && bestTerm) {
          firstSnip = renderSliceHtml(s.label, s.clean, bestIdx, bestTerm.text.length);
          break;
        }
      }
      if (firstSnip) {
        const missingTerm = termObjs.find(
          (tObj) => findTermOccurrences(firstSnip.windowRaw, firstSnip.windowLower, tObj.text, tObj.lower, sOpts, false).length === 0
        );
        if (missingTerm) {
          for (const s of activeSources) {
            const mHits = findTermOccurrences(s.clean, s.lower, missingTerm.text, missingTerm.lower, sOpts, false);
            const idx = mHits.length ? mHits[0][0] : -1;
            if (idx !== -1) {
              const secondSnip = renderSliceHtml(s.label, s.clean, idx, missingTerm.text.length);
              return `${firstSnip.html} <span style="opacity:.6">·</span> ${secondSnip.html}`;
            }
          }
        }
        return firstSnip.html;
      }
    }
    const fallbackSrc = unescapeNewlines(step.content || step.thinking || step.error || "").replace(/\s+/g, " ").trim();
    return escHtml(fallbackSrc ? `[${step.type}] #${step.step_index}: ${fallbackSrc.slice(0, 80)}` : `[${step.type}] #${step.step_index}`);
  }

  function extractPlainMatchSnippet(step, query, attachedOutputs = null) {
    const html = extractMatchSnippet(step, query, attachedOutputs) || "";
    const txt = html
      .replace(/<\/?mark\b[^>]*>/gi, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    return txt;
  }

  function renderCacheMapAndToc(preAttachedByPlanner = null) {
    const existing = document.getElementById("cacheMapCard");
    if (existing) existing.remove();
    if (!state.steps.length) return;

    const isFiltered = state.filter !== "all" || Boolean(state.stepQuery) || state.onlyCmdErrors || (state.cmdMapFilterOnly && state.cmdMapKeys.size > 0);
    const card = document.createElement("section");
    card.id = "cacheMapCard";
    card.className = "cache-map-card";

    const tzMin = getEffectiveTzOffsetMin();
    let hasTokBars = false;
    let barsHtml = "";
    let rowsHtml = "";
    let entryCount = 0;

    if (
      !isFiltered &&
      _tocBaseCache &&
      _tocBaseCache.activeId === state.activeId &&
      _tocBaseCache.stepsLen === state.steps.length &&
      _tocBaseCache.tzMin === tzMin &&
      _tocBaseCache.lang === (state.lang || "en")
    ) {
      hasTokBars = _tocBaseCache.hasTokBars;
      barsHtml = _tocBaseCache.barsHtml;
      rowsHtml = _tocBaseCache.rowsHtml;
      entryCount = _tocBaseCache.count;
    } else {
      // Build timeline entries: when filtered, include all matching steps; otherwise USER_INPUT + token steps
      const attachedByPlanner = isFiltered
        ? (preAttachedByPlanner || pairToolOutputs(state.steps).attachedByPlanner)
        : null;
      const entries = [];
      let prevTokenTs = null;
      let maxIn = 1;

      for (const s of state.steps) {
        if (isFiltered) {
          const attached = attachedByPlanner.get(s) || null;
          if (!stepMatchesFilter(s, attached)) continue;
        }

        const hasTok =
          s.input_tokens !== undefined ||
          s.cache_read_tokens !== undefined ||
          s.output_tokens !== undefined;
        if (!isFiltered && s.type !== "USER_INPUT" && !hasTok && s.type !== "CHECKPOINT") continue;

        const tsMs = s.created_at ? Date.parse(s.created_at) : NaN;
        let deltaSec = null;
        if (!Number.isNaN(tsMs) && prevTokenTs !== null) {
          deltaSec = Math.max(0, (tsMs - prevTokenTs) / 1000);
        }
        if (!Number.isNaN(tsMs) && (hasTok || s.type === "USER_INPUT" || isFiltered)) {
          prevTokenTs = tsMs;
        }

        const inp = Number(s.input_tokens || 0);
        const cache = Number(s.cache_read_tokens || 0);
        const out = Number(s.output_tokens || 0);
        const totIn = inp + cache;
        if (totIn > maxIn) maxIn = totIn;

        let snippetHtml = "";
        let rawFirstLineSource = "";
        if (s.type === "USER_INPUT") {
          rawFirstLineSource = parseUserInputEnvelope(s.content || "").req || s.content || "";
        } else if (s.type === "CHECKPOINT") {
          rawFirstLineSource = s.content || "🟣 Compaction";
        } else if (s.type === "PLANNER_RESPONSE") {
          if (s.content) rawFirstLineSource = s.content;
          else if (Array.isArray(s.tool_calls) && s.tool_calls.length > 0) {
            const tc0 = s.tool_calls[0];
            const sum0 = summarizeToolArgs(tc0.name, tc0.args || {}).text;
            rawFirstLineSource = `🛠 ${s.tool_calls.map((t) => t.name).join(", ")}${sum0 ? ` — ${sum0}` : ""}`;
          } else if (s.thinking) {
            rawFirstLineSource = `💭 ${s.thinking}`;
          }
        } else {
          rawFirstLineSource = s.content || s.error || s.type || "";
        }
        const firstNonEmpty = unescapeNewlines(rawFirstLineSource)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0) || s.type || "";
        const firstLine = firstNonEmpty.length > 140 ? `${firstNonEmpty.slice(0, 139)}…` : firstNonEmpty;

        if (state.stepQuery) {
          const att = attachedByPlanner ? (attachedByPlanner.get(s) || null) : null;
          snippetHtml = extractMatchSnippet(s, state.stepQuery, att);
        } else if (s.type === "USER_INPUT") {
          snippetHtml = escHtml("👤 " + rawFirstLineSource.replace(/\s+/g, " ").trim().slice(0, 90));
        } else if (s.type === "CHECKPOINT") {
          snippetHtml = escHtml(t("toc.compactionRow"));
        } else if (Array.isArray(s.tool_calls) && s.tool_calls.length > 0) {
          snippetHtml = escHtml("🛠 " + s.tool_calls.map((t) => t.name).join(", "));
        } else if (s.content) {
          snippetHtml = escHtml("💬 " + s.content.replace(/\s+/g, " ").trim().slice(0, 90));
        } else {
          snippetHtml = escHtml(s.type);
        }

        entries.push({
          stepIndex: s.step_index,
          type: s.type,
          time: fmtStepTime(s.created_at),
          deltaSec,
          hasTok,
          inp,
          cache,
          out,
          totIn,
          hitPct: totIn > 0 ? (cache / totIn) * 100 : 0,
          firstLine,
          snippetHtml,
        });
      }

      // Visual square grid strip (for steps with tokens; all visible wrapped rows without horizontal scroll)
      const tokEntries = entries.filter((e) => e.hasTok && e.totIn > 0);
      hasTokBars = tokEntries.length > 0;
      barsHtml = tokEntries
        .map((e) => {
          const lvl = getCacheLevel(e.hitPct, e.totIn);
          const deltaStr = fmtDeltaSec(e.deltaSec);
          return `<button type="button" class="cache-bar ${lvl.cls}" data-toc-step="${escHtml(e.stepIndex)}" data-tip-delay="80" ${makeTipAttrs(
            t("toc.barTipTitle", { step: e.stepIndex, time: e.time, delta: deltaStr }),
            t("toc.barTipDesc", {
              firstLine: e.firstLine,
              hitPct: e.hitPct.toFixed(1),
              cache: fmtNum(e.cache),
              totIn: fmtNum(e.totIn),
            }),
            `in=${e.inp}, cache=${e.cache}, out=${e.out}`
          )}></button>`;
        })
        .join("");

      rowsHtml = entries
        .map((e) => {
          const deltaStr = fmtDeltaSec(e.deltaSec);
          const isGapWarn = e.deltaSec !== null && e.deltaSec >= 300 && e.hasTok && e.hitPct < 50;
          const deltaCls = isGapWarn ? "toc-gap-warn" : "";
          let cacheCell = "—";
          let tokCell = "—";
          if (e.hasTok) {
            const lvl = getCacheLevel(e.hitPct, e.totIn);
            cacheCell = `<span class="cache-pill ${lvl.cls}">${e.hitPct.toFixed(1)}%</span>`;
            tokCell = `${fmtNum(e.inp)} / ${fmtNum(e.cache)} / ${fmtNum(e.out)}`;
          }
          const rowCls = e.type === "USER_INPUT" ? "is-user" : (e.type === "CHECKPOINT" ? "is-checkpoint" : "");
          return `
            <tr class="toc-row ${rowCls}" tabindex="-1" data-jump="${escHtml(e.stepIndex)}">
              <td class="toc-mono">#${escHtml(e.stepIndex)}</td>
              <td class="toc-mono">${escHtml(e.time)}</td>
              <td class="toc-mono ${deltaCls}">${escHtml(deltaStr)}</td>
              <td class="toc-snippet">${e.snippetHtml}</td>
              <td class="toc-mono">${tokCell}</td>
              <td class="toc-mono">${cacheCell}</td>
            </tr>
          `;
        })
        .join("");
      entryCount = entries.length;

      if (!isFiltered) {
        _tocBaseCache = {
          activeId: state.activeId,
          stepsLen: state.steps.length,
          tzMin,
          lang: state.lang || "en",
          hasTokBars,
          barsHtml,
          rowsHtml,
          count: entryCount,
        };
      }
    }

    let mapTitle = t("toc.title");
    if (isFiltered) {
      const parts = [];
      if (state.filter === "dialog") parts.push(t("toc.filterDialog"));
      if (state.filter === "errors") parts.push(t("toc.filterErrors"));
      if (state.onlyCmdErrors) parts.push(t("toc.filterCmdErrors"));
      if (state.cmdMapFilterOnly && state.cmdMapKeys.size > 0) parts.push(t("toc.filterCmdMap", { count: state.cmdMapKeys.size }));
      if (state.stepQuery) parts.push(`«${state.stepQuery}»`);
      mapTitle = t("toc.titleFiltered", { filters: parts.join(" + "), count: entryCount });
    }

    card.innerHTML = `
      <details class="cache-map-details" open>
        <summary>
          <h3>${escHtml(mapTitle)}</h3>
          <div class="cache-legend">
            <span class="cache-pill cache-lvl-5">≥90%</span>
            <span class="cache-pill cache-lvl-4">70–89%</span>
            <span class="cache-pill cache-lvl-3">40–69%</span>
            <span class="cache-pill cache-lvl-2">1–39%</span>
            <span class="cache-pill cache-lvl-1">${escHtml(t("toc.legend0"))}</span>
          </div>
        </summary>
        <div class="cache-formula">
          ${t("toc.formula")}
        </div>
        ${hasTokBars ? `<div class="cache-strip">${barsHtml}</div>` : ""}
        <div class="toc-wrap">
          <table class="toc-table">
            <thead>
              <tr>
                <th>${escHtml(t("toc.colStep"))}</th>
                <th>${escHtml(t("toc.colTime"))}</th>
                <th>${escHtml(t("toc.colDelta"))}</th>
                <th>${escHtml(state.stepQuery ? t("toc.colSnippetSearch") : t("toc.colSnippetDefault"))}</th>
                <th>${escHtml(t("toc.colTokens"))}</th>
                <th>${escHtml(t("toc.colCache"))}</th>
              </tr>
            </thead>
            <tbody>${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:var(--text-dim)">${escHtml(t("toc.noMatches"))}</td></tr>`}</tbody>
          </table>
        </div>
        <div class="toc-options">
          <label class="toc-option-check">
            <input type="checkbox" id="optAttachTools" ${state.attachToolOutputs ? "checked" : ""}>
            <span>${escHtml(t("toc.optAttachTools"))}</span>
          </label>
          <label class="toc-option-check">
            <input type="checkbox" id="optExpandOutputs" ${state.expandAllOutputs ? "checked" : ""}>
            <span>${escHtml(t("toc.optExpandOutputs"))}</span>
          </label>
          <label class="toc-option-check">
            <input type="checkbox" id="optMonoOutputs" ${state.monoOutputs ? "checked" : ""}>
            <span>${escHtml(t("toc.optMonoOutputs"))}</span>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optReadModeTitle"))}">
            <span>${escHtml(t("toc.optReadModeLabel"))}</span>
            <select id="optReadDisplayMode" class="select-sm">
              <option value="scroll" ${state.readDisplayMode === "scroll" ? "selected" : ""}>${escHtml(t("toc.optReadScroll"))}</option>
              <option value="full" ${state.readDisplayMode === "full" ? "selected" : ""}>${escHtml(t("toc.optReadFull"))}</option>
              <option value="hide" ${state.readDisplayMode === "hide" ? "selected" : ""}>${escHtml(t("toc.optReadHide"))}</option>
            </select>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optDisableAutoLinksTitle"))}">
            <input type="checkbox" id="optDisableAutoLinks" ${state.disableAutoLinks ? "checked" : ""}>
            <span>${escHtml(t("toc.optDisableAutoLinks"))}</span>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optLinkifyShortTitle"))}">
            <input type="checkbox" id="optLinkifyShort" ${state.linkifyProjectFiles ? "checked" : ""} ${state.disableAutoLinks ? "disabled" : ""}>
            <span>${escHtml(t("toc.optLinkifyShort"))}</span>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optFolderTitle"))}">
            <span>${escHtml(t("toc.optFolderLabel"))}</span>
            <select id="optFolderOpenMode" class="select-sm">
              <option value="browser" ${state.folderOpenMode === "browser" ? "selected" : ""}>${escHtml(t("toc.optFolderBrowser"))}</option>
              ${state.capabilities?.is_windows !== false
                ? `<option value="explorer" ${state.folderOpenMode === "explorer" ? "selected" : ""}>${escHtml(t("toc.optFolderExplorer"))}</option>
                   <option value="totalcmd" ${state.folderOpenMode === "totalcmd" ? "selected" : ""}>${escHtml(t("toc.optFolderTotalCmd"))}</option>`
                : (state.capabilities?.open_folder_os
                  ? `<option value="system" ${state.folderOpenMode === "system" ? "selected" : ""}>${escHtml(t("toc.optFolderSystem"))}</option>`
                  : "")}
            </select>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optFileTitle"))}">
            <span>${escHtml(t("toc.optFileLabel"))}</span>
            <select id="optFileOpenMode" class="select-sm">
              <option value="ask" ${state.fileOpenMode === "ask" ? "selected" : ""}>${escHtml(t("toc.optFileAsk"))}</option>
              <option value="browser_fmt" ${state.fileOpenMode === "browser_fmt" ? "selected" : ""}>${escHtml(t("toc.optFileBrowserFmt"))}</option>
              <option value="browser_raw" ${state.fileOpenMode === "browser_raw" ? "selected" : ""}>${escHtml(t("toc.optFileBrowserRaw"))}</option>
              ${state.capabilities?.open_notepadpp
                ? `<option value="notepadpp" ${state.fileOpenMode === "notepadpp" ? "selected" : ""}>${escHtml(t("toc.optFileNotepad"))}</option>`
                : ""}
              <option value="system" ${state.fileOpenMode === "system" ? "selected" : ""}>${escHtml(t("toc.optFileSystem"))}</option>
            </select>
            <button type="button" id="optFileOpenReset" class="file-mode-reset-btn${state.fileOpenMode === "ask" ? " hidden" : ""}" title="${escHtml(t("toc.optFileResetTitle"))}">${escHtml(t("toc.optFileReset"))}</button>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optSearchFocusedTitle"))}">
            <input type="checkbox" id="optSearchFocused" data-search-opt="searchFocusedOnly" ${state.searchFocusedOnly ? "checked" : ""}>
            <span>${escHtml(t("toc.optSearchFocused"))}</span>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optSearchWholeTurnTitle"))}">
            <input type="checkbox" id="optSearchWholeTurn" data-search-opt="searchAcrossWholeTurn" ${state.searchAcrossWholeTurn ? "checked" : ""}>
            <span>${escHtml(t("toc.optSearchWholeTurn"))}</span>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optSearchWholeWordTitle"))}">
            <input type="checkbox" id="optSearchWholeWord" data-search-opt="searchWholeWord" ${state.searchWholeWord ? "checked" : ""}>
            <span>${escHtml(t("toc.optSearchWholeWord"))}</span>
          </label>
          <label class="toc-option-check" title="${escHtml(t("toc.optSearchCaseTitle"))}">
            <input type="checkbox" id="optSearchCase" data-search-opt="searchCaseSensitive" ${state.searchCaseSensitive ? "checked" : ""}>
            <span>${escHtml(t("toc.optSearchCase"))}</span>
          </label>
        </div>
      </details>
    `;

    card.querySelector("#optAttachTools").addEventListener("change", (e) => {
      state.attachToolOutputs = e.target.checked;
      renderFullFeed();
    });
    card.querySelector("#optExpandOutputs").addEventListener("change", (e) => {
      state.expandAllOutputs = e.target.checked;
      renderFullFeed();
    });
    card.querySelector("#optMonoOutputs").addEventListener("change", (e) => {
      state.monoOutputs = e.target.checked;
      renderFullFeed();
    });
    card.querySelector("#optReadDisplayMode").addEventListener("change", (e) => {
      state.readDisplayMode = e.target.value;
      try {
        localStorage.setItem("tv_read_mode", state.readDisplayMode);
      } catch (_) {}
      renderFullFeed();
    });
    card.querySelector("#optDisableAutoLinks").addEventListener("change", (e) => {
      state.disableAutoLinks = e.target.checked;
      try {
        localStorage.setItem("tv_disable_auto_links", state.disableAutoLinks ? "1" : "0");
      } catch (_) {}
      renderFullFeed();
    });
    card.querySelector("#optLinkifyShort").addEventListener("change", (e) => {
      state.linkifyProjectFiles = e.target.checked;
      try {
        localStorage.setItem("tv_linkify_short", state.linkifyProjectFiles ? "1" : "0");
      } catch (_) {}
      renderFullFeed();
    });
    card.querySelector("#optFolderOpenMode").addEventListener("change", (e) => {
      state.folderOpenMode = e.target.value;
      try {
        localStorage.setItem("tv_folder_mode", state.folderOpenMode);
      } catch (_) {}
      renderFullFeed();
    });
    const fileModeSel = card.querySelector("#optFileOpenMode");
    const fileModeReset = card.querySelector("#optFileOpenReset");
    fileModeSel.addEventListener("change", (e) => {
      state.fileOpenMode = e.target.value;
      try {
        localStorage.setItem("tv_file_mode", state.fileOpenMode);
      } catch (_) {}
      fileModeReset.classList.toggle("hidden", state.fileOpenMode === "ask");
    });
    fileModeReset.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.fileOpenMode = "ask";
      fileModeSel.value = "ask";
      fileModeReset.classList.add("hidden");
      try {
        localStorage.setItem("tv_file_mode", "ask");
      } catch (_) {}
    });
    card.querySelectorAll("input[data-search-opt]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        setSearchOption(e.target.dataset.searchOpt, e.target.checked);
      });
    });

    const tocWrap = card.querySelector(".toc-wrap");
    attachInnerScrollGuard(tocWrap, { scrollOnHover: true });
    _tocDirty = false;
    const tocDet = card.querySelector(".cache-map-details");
    if (tocDet) {
      tocDet.addEventListener("toggle", () => {
        if (tocDet.open && _tocDirty) {
          scheduleTocRefresh(true);
        }
      });
    }

    let selectedTocStep = null;
    const selectTocStep = (stepKey, focusRow = false) => {
      const keyStr = String(stepKey ?? "");
      if (!keyStr) return;
      selectedTocStep = keyStr;
      card.querySelectorAll(".cache-bar.is-selected, .toc-row.is-selected").forEach((el) => {
        el.classList.remove("is-selected");
      });
      const bar = card.querySelector(`.cache-bar[data-toc-step="${CSS.escape(keyStr)}"]`);
      if (bar) bar.classList.add("is-selected");
      const row = card.querySelector(`.toc-row[data-jump="${CSS.escape(keyStr)}"]`);
      if (row) {
        row.classList.add("is-selected");
        if (tocWrap) {
          const rowRect = row.getBoundingClientRect();
          const wrapRect = tocWrap.getBoundingClientRect();
          const targetTop = tocWrap.scrollTop + (rowRect.top - wrapRect.top) - Math.max(28, (tocWrap.clientHeight - rowRect.height) / 2);
          tocWrap.scrollTop = Math.max(0, targetTop);
        }
        if (focusRow) {
          row.focus({ preventScroll: true });
        }
      }
    };

    card.addEventListener("click", (ev) => {
      const bar = ev.target.closest(".cache-bar[data-toc-step]");
      if (bar) {
        selectTocStep(bar.dataset.tocStep, true);
        return;
      }
      const row = ev.target.closest(".toc-row[data-jump]");
      if (row) {
        selectTocStep(row.dataset.jump, false);
        clearHashStepIfScrolledAway();
        jumpToStep(row.dataset.jump);
      }
    });

    card.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        const rows = Array.from(card.querySelectorAll(".toc-row[data-jump]"));
        if (!rows.length) return;
        const curIdx = selectedTocStep ? rows.findIndex((r) => r.dataset.jump === selectedTocStep) : -1;
        const nextIdx = ev.key === "ArrowDown"
          ? Math.min(rows.length - 1, curIdx + 1)
          : Math.max(0, (curIdx === -1 ? 0 : curIdx - 1));
        ev.preventDefault();
        selectTocStep(rows[nextIdx].dataset.jump, true);
        return;
      }
      if (ev.key === "Enter") {
        const active = document.activeElement;
        if (active && (active.tagName === "INPUT" || active.tagName === "SELECT" || active.tagName === "SUMMARY")) return;
        const rowTarget = ev.target.closest(".toc-row[data-jump]");
        if (rowTarget) {
          ev.preventDefault();
          clearHashStepIfScrolledAway();
          jumpToStep(rowTarget.dataset.jump);
        } else if (selectedTocStep) {
          ev.preventDefault();
          clearHashStepIfScrolledAway();
          jumpToStep(selectedTocStep);
        }
      }
    });

    // Place TOC & Cache Map at the TOP of the feed so it never blocks new messages
    els.feed.prepend(card);
  }

  function highlightMatches(rootEl, query, opts = {}) {
    if (!rootEl || !query) return;
    const ast = getCachedSearchAst(query);
    const termObjs = getPositiveSearchTermObjs(ast);
    if (!termObjs.length) return;
    const sOpts = {
      caseSensitive: Boolean(opts && opts.caseSensitive),
      wholeWord: Boolean(opts && opts.wholeWord),
      acrossWholeTurn: Boolean(opts && opts.acrossWholeTurn),
    };
    const isCard = rootEl.tagName === "ARTICLE";
    const isStandaloneGeneric = isCard && rootEl.classList.contains("type-GENERIC");
    const stepHeadEl = isCard ? rootEl.querySelector(":scope > .step-head") : null;
    const stepBodyEl = isCard ? rootEl.querySelector(":scope > .step-body") : null;

    const BLOCK_TAGS = new Set([
      "ARTICLE", "SECTION", "DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6",
      "LI", "UL", "OL", "BLOCKQUOTE", "PRE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
      "SUMMARY", "DETAILS",
    ]);
    const INLINE_RUN_ISOLATE_SEL =
      ".tool-name, .badge, .step-num-chip, .meta-chip, .status-pill, .task-link-pill, .step-ts";

    const getRunScope = (textNode) => {
      let cur = textNode.parentElement;
      if (!cur) return rootEl;
      const isolated = cur.closest(INLINE_RUN_ISOLATE_SEL);
      if (isolated && rootEl.contains(isolated)) return isolated;
      while (cur && cur !== rootEl) {
        if (
          BLOCK_TAGS.has(cur.tagName) ||
          cur.classList.contains("tool-summary") ||
          cur.classList.contains("arg-val-inline") ||
          cur.classList.contains("arg-key")
        ) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return rootEl;
    };

    const getUnitScopeEl = (textNode) => {
      if (!isCard || isStandaloneGeneric) return rootEl;
      const p = textNode.parentElement;
      if (!p) return rootEl;
      if (stepHeadEl && stepHeadEl.contains(p)) return stepHeadEl;
      const tc = p.closest(".tool-card");
      if (tc && rootEl.contains(tc)) return tc;
      const think = p.closest(".block-thinking");
      if (think && rootEl.contains(think)) return think;
      const toolsSum = p.closest("details.block-tools > summary");
      if (toolsSum && rootEl.contains(toolsSum)) return toolsSum;
      if (stepBodyEl && stepBodyEl.contains(p)) {
        let cur = p;
        while (cur && cur.parentElement !== stepBodyEl) {
          cur = cur.parentElement;
        }
        if (cur) return cur;
      }
      return rootEl;
    };

    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length === 0) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (
          p.tagName === "BUTTON" ||
          p.tagName === "SCRIPT" ||
          p.tagName === "STYLE" ||
          p.closest("button, script, style, .copy-bar, .code-gutter-num, .md-gutter-num, .compaction-num")
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const runs = [];
    let curScope = null;
    let curUnitScope = null;
    let curNodes = [];
    let curNode;
    while ((curNode = walker.nextNode())) {
      const scope = getRunScope(curNode);
      const unitScope = getUnitScopeEl(curNode);
      if (scope !== curScope || unitScope !== curUnitScope) {
        if (curNodes.length) runs.push({ nodes: curNodes, unitScope: curUnitScope });
        curScope = scope;
        curUnitScope = unitScope;
        curNodes = [curNode];
      } else {
        curNodes.push(curNode);
      }
    }
    if (curNodes.length) runs.push({ nodes: curNodes, unitScope: curUnitScope });

    const preparedRuns = runs.map((run) => {
      let totalLen = 0;
      const segs = run.nodes.map((n) => {
        const txt = n.nodeValue;
        const s = totalLen;
        totalLen += txt.length;
        return { node: n, text: txt, start: s, end: totalLen };
      });
      const fullText = segs.map((sg) => sg.text).join("");
      return {
        segs,
        unitScope: run.unitScope,
        fullText,
        fullLower: fullText.toLowerCase(),
      };
    });

    // When searchAcrossWholeTurn is false (default), check the full search AST per logical unit
    // so partial hits (e.g. a lone "-c" inside an unrelated read_file) are never highlighted or shown.
    let matchedUnitScopes = null;
    if (!sOpts.acrossWholeTurn) {
      if (isCard && !isStandaloneGeneric) {
        matchedUnitScopes = new Set();
        const unitTexts = new Map();
        for (const r of preparedRuns) {
          let arr = unitTexts.get(r.unitScope);
          if (!arr) {
            arr = [];
            unitTexts.set(r.unitScope, arr);
          }
          if (r.fullText) arr.push(r.fullText);
        }
        for (const [uEl, parts] of unitTexts.entries()) {
          const combinedRaw = parts.join(" ");
          if (evalSearchAst(ast, { raw: combinedRaw, lower: combinedRaw.toLowerCase() }, sOpts)) {
            matchedUnitScopes.add(uEl);
          }
        }
      } else if (!isCard) {
        const ownerUnit = rootEl.closest(
          ".tool-card, .block-thinking, .md, .system-msg-body, .generic-content-wrap, .block-meta, .block-unknown-tag"
        );
        if (ownerUnit) {
          const walkOwner = document.createTreeWalker(ownerUnit, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
              const p = node.parentElement;
              if (!p) return NodeFilter.FILTER_REJECT;
              if (
                p.tagName === "BUTTON" ||
                p.tagName === "SCRIPT" ||
                p.tagName === "STYLE" ||
                p.closest("button, script, style, .copy-bar, .code-gutter-num, .md-gutter-num, .compaction-num")
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          });
          const ownerParts = [];
          let on;
          while ((on = walkOwner.nextNode())) ownerParts.push(on.nodeValue);
          const ownerRaw = ownerParts.join(" ");
          if (!evalSearchAst(ast, { raw: ownerRaw, lower: ownerRaw.toLowerCase() }, sOpts)) {
            return;
          }
        }
      }
    }

    const findMatchRanges = (fullText, fullLower) => {
      const candidates = [];
      for (const tObj of termObjs) {
        const hits = findTermOccurrences(fullText, fullLower, tObj.text, tObj.lower, sOpts, true);
        for (const h of hits) candidates.push(h);
      }
      if (!candidates.length) return [];
      candidates.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
      const nonOverlapping = [];
      let lastEnd = 0;
      for (const [s, e] of candidates) {
        if (s >= lastEnd) {
          nonOverlapping.push([s, e]);
          lastEnd = e;
        }
      }
      return nonOverlapping;
    };

    const createdMarks = [];
    for (const run of preparedRuns) {
      if (matchedUnitScopes && !matchedUnitScopes.has(run.unitScope)) continue;
      const ranges = findMatchRanges(run.fullText, run.fullLower);
      if (!ranges.length) continue;

      let rIdx = 0;
      for (const sg of run.segs) {
        while (rIdx < ranges.length && ranges[rIdx][1] <= sg.start) rIdx++;
        if (rIdx >= ranges.length) break;
        const firstR = rIdx;
        if (ranges[firstR][0] >= sg.end) continue;

        const frag = document.createDocumentFragment();
        let localPos = 0;
        let curR = firstR;
        while (curR < ranges.length && ranges[curR][0] < sg.end) {
          const overlapStart = Math.max(0, ranges[curR][0] - sg.start);
          const overlapEnd = Math.min(sg.text.length, ranges[curR][1] - sg.start);
          if (overlapStart > localPos) {
            frag.appendChild(document.createTextNode(sg.text.slice(localPos, overlapStart)));
          }
          if (overlapEnd > overlapStart) {
            const mark = document.createElement("mark");
            mark.className = "hl";
            mark.textContent = sg.text.slice(overlapStart, overlapEnd);
            frag.appendChild(mark);
            createdMarks.push(mark);
          }
          localPos = Math.max(localPos, overlapEnd);
          if (ranges[curR][1] <= sg.end) curR++;
          else break;
        }
        rIdx = curR;
        if (localPos < sg.text.length) {
          frag.appendChild(document.createTextNode(sg.text.slice(localPos)));
        }
        if (sg.node.parentNode) {
          sg.node.parentNode.replaceChild(frag, sg.node);
        }
      }
    }

    const MACRO_HIT_SEL = [
      ".tool-card",
      "details.block-thinking",
      "details.block-meta",
      "details.block-unknown-tag",
      ".step-head",
      ".step-body > .md",
      ".step-body > .system-msg-body",
      ".step-body > .generic-content-wrap",
      ".step-body > details.block-tools > summary",
    ].join(", ");

    const SUB_HIT_SEL = [
      ".code-gutter-row",
      ".md-gutter-row",
      ".arg-row",
      ".tool-head",
      ".tool-result-head",
      ".md > p",
      ".md li",
      ".md h1",
      ".md h2",
      ".md h3",
      ".md h4",
      ".md h5",
      ".md h6",
      ".md > pre",
      ".md > blockquote",
      ".md > table",
    ].join(", ");

    if (createdMarks.length > 0) {
      const macroTargets = new Set();
      const subTargets = new Set();
      for (const mark of createdMarks) {
        let p = mark.parentElement;
        while (p && p !== rootEl) {
          if (p.tagName === "DETAILS" && !p.open) p.open = true;
          p = p.parentElement;
        }
        const macro = mark.closest(MACRO_HIT_SEL);
        if (macro && (rootEl === macro || rootEl.contains(macro) || !isCard)) {
          macroTargets.add(macro);
        } else if (isCard) {
          macroTargets.add(rootEl);
        }
        const sub = mark.closest(SUB_HIT_SEL);
        if (sub && sub !== macro && (rootEl === sub || rootEl.contains(sub))) {
          subTargets.add(sub);
        } else {
          const resBox = mark.closest(".tool-result");
          if (resBox && resBox !== macro && (rootEl === resBox || rootEl.contains(resBox))) {
            subTargets.add(resBox);
          }
        }
      }

      for (const mEl of macroTargets) {
        mEl.classList.add("search-hit-target");
      }
      const subList = Array.from(subTargets);
      for (const sEl of subList) {
        if (macroTargets.has(sEl)) continue;
        let hasDescendant = false;
        for (const other of subList) {
          if (other !== sEl && sEl.contains(other)) {
            hasDescendant = true;
            break;
          }
        }
        if (!hasDescendant) {
          sEl.classList.add("search-hit-sub");
        }
      }
    }

    // Hide sibling tools and blocks without matches, while ALWAYS keeping matched tool calls + their outputs visible
    if (opts && opts.trimNonMatching && isCard && !isStandaloneGeneric && stepBodyEl) {
      if (matchedUnitScopes && matchedUnitScopes.size === 0 && createdMarks.length === 0) {
        return;
      }
      const hasAnyMark = (el) => Boolean(el && (el.matches?.("mark.hl") || el.querySelector("mark.hl")));
      const isUnitMatched = (el) => (matchedUnitScopes ? matchedUnitScopes.has(el) : hasAnyMark(el));

      let omittedCount = 0;
      for (const child of Array.from(stepBodyEl.children)) {
        if (
          child.classList.contains("search-reveal-bar") ||
          child.classList.contains("inline-raw-pre") ||
          child.classList.contains("show-more-btn") ||
          child.classList.contains("read-hidden-note")
        ) {
          continue;
        }
        if (child.classList.contains("block-tools")) {
          const toolCards = Array.from(child.querySelectorAll(":scope > .block-body > .tool-card"));
          let matchedTools = 0;
          let omittedTools = 0;
          for (const tcCard of toolCards) {
            if (isUnitMatched(tcCard)) {
              matchedTools++;
              // Keep the entire matched tool-card (header, args, AND its .tool-result output) visible
            } else {
              tcCard.classList.add("search-omitted");
              omittedTools++;
            }
          }
          if (matchedTools > 0) {
            child.open = true;
            omittedCount += omittedTools;
          } else {
            for (const tcCard of toolCards) tcCard.classList.remove("search-omitted");
            child.classList.add("search-omitted");
            omittedCount += Math.max(1, toolCards.length);
          }
        } else if (!isUnitMatched(child)) {
          child.classList.add("search-omitted");
          omittedCount++;
          if (child.classList.contains("generic-content-wrap")) {
            for (const extra of stepBodyEl.querySelectorAll(":scope > .show-more-btn, :scope > .read-hidden-note")) {
              extra.classList.add("search-omitted");
            }
          }
        } else if (child.tagName === "DETAILS") {
          child.open = true;
        }
      }

      if (omittedCount > 0) {
        rootEl.classList.add("has-search-omitted");
        const bar = document.createElement("div");
        bar.className = "search-reveal-bar";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "search-reveal-btn";
        btn.textContent = t("card.searchRevealTurn", { count: omittedCount });
        btn.addEventListener("click", () => {
          preserveScrollAnchor(() => {
            const untrimmed = rootEl.classList.toggle("is-search-untrimmed");
            btn.textContent = untrimmed
              ? t("card.searchHideTurn", { count: omittedCount })
              : t("card.searchRevealTurn", { count: omittedCount });
            scheduleCardOverflowCheck(rootEl);
          }, btn);
          requestAnimationFrame(scheduleMinimapSync);
        });
        bar.appendChild(btn);
        stepBodyEl.appendChild(bar);
      }
    }
  }

  function appendBottomTocLink() {
    const oldBar = document.getElementById("bottomTocBar");
    if (oldBar) oldBar.remove();
    if (!state.steps.length) return;
    const bar = document.createElement("div");
    bar.id = "bottomTocBar";
    bar.className = "bottom-toc-bar";
    bar.innerHTML = `<button type="button" class="btn-sm">${escHtml(t("toc.backToToc"))}</button>`;
    bar.querySelector("button").addEventListener("click", () => {
      scrollToTop(true);
    });
    els.feed.appendChild(bar);
  }

  function createDialogExpandRow(hiddenSteps, attachedByPlanner) {
    const wrap = document.createElement("div");
    wrap.className = "dialog-expand-wrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dialog-expand-btn";
    const labelClosed = t("toc.showHiddenDialog", { count: hiddenSteps.length });
    const labelOpen = t("toc.hideHiddenDialog", { count: hiddenSteps.length });
    btn.textContent = labelClosed;

    let inlineBox = null;
    btn.addEventListener("click", () => {
      preserveScrollAnchor(() => {
        if (inlineBox) {
          inlineBox.remove();
          inlineBox = null;
          btn.textContent = labelClosed;
        } else {
          inlineBox = document.createElement("div");
          inlineBox.className = "dialog-inline-steps";
          for (const hs of hiddenSteps) {
            const card = buildStepElement(hs, attachedByPlanner.get(hs) || null);
            enhanceCardNow(card);
            inlineBox.appendChild(card);
          }
          wrap.appendChild(inlineBox);
          applyInitialEditScrolls(inlineBox);
          if (state.stepQuery) applyInitialSearchScrolls(inlineBox);
          for (const ch of inlineBox.children) scheduleCardOverflowCheck(ch);
          btn.textContent = labelOpen;
        }
      }, btn);
    });

    wrap.appendChild(btn);
    return wrap;
  }

  function registerVItem(item) {
    _vItems.push(item);
    if (item.kind === "step") {
      if (item.stepKey) _vStepToItemMap.set(item.stepKey, item);
      if (item.attached) {
        for (const g of item.attached) {
          const gk = String(g.step_index ?? "");
          if (gk) _vStepToItemMap.set(gk, item);
        }
      }
    }
  }

  function renderFullFeed(opts = {}) {
    _activeAnchorLock = null;
    _activeJumpLock = null;
    cancelVirtualTimers();
    clearVWindowDom();

    const cfgKey = getRenderConfigKey();
    const sameCfg = cfgKey === _cardRenderConfigKey;
    const prevByStep = sameCfg ? new WeakMap() : null;
    if (prevByStep) {
      for (const oldIt of _lruMap.keys()) {
        if (oldIt.kind === "step" && oldIt.step && oldIt.el) {
          prevByStep.set(oldIt.step, oldIt);
        }
      }
    }

    _lruMap.clear();
    _vItems = [];
    _vTotalHeight = 0;
    _vStepToItemMap.clear();
    _userNotchCoords = [];
    _lastMinimapTotalH = 0;
    _lastActiveUserNotch = null;
    if (!sameCfg) {
      _tocBaseCache = null;
      _cardRenderConfigKey = cfgKey;
    }
    const curSearchTrim = Boolean(state.stepQuery && state.searchFocusedOnly);
    els.feed.classList.toggle("is-read-full", state.readDisplayMode === "full" || state.expandAllOutputs);
    els.feed.classList.toggle("is-search-focused", curSearchTrim);

    // Strip stale search highlights ONLY from the small set of previously highlighted cards
    const curHlSig = getHighlightSig();
    for (const hCard of Array.from(_highlightedCards)) {
      if (!state.stepQuery || hCard.dataset.hlQuery !== curHlSig) {
        clearCardHighlight(hCard);
      }
    }

    els.feed.innerHTML = "";
    const { attachedByPlanner, attachedSet } = pairToolOutputs(state.steps);
    let shown = 0;
    let hiddenBetween = [];

    const pushExpandItem = (stepsList) => {
      _vItems.push({
        idx: _vItems.length,
        kind: "expand",
        hiddenSteps: stepsList,
        attachedByPlanner,
        stepKey: "",
        hasErr: false,
        bytes: 256,
        estHeight: 40,
        height: 40,
        measured: false,
        offsetY: 0,
        el: null,
        cfgKey,
      });
    };

    const pushStepItem = (s, attached) => {
      const attCount = attached ? attached.length : 0;
      const prev = prevByStep ? prevByStep.get(s) : null;
      const reusePrev = prev && prev.attachedCount === attCount && prev.el;
      // Never reuse a measured height from a trimmed search view after search clears or focus-trim changes
      const canReuseMeasured = Boolean(
        reusePrev &&
        prev.measured &&
        Boolean(prev.searchTrimmed) === curSearchTrim &&
        (!curSearchTrim || prev.hlSig === curHlSig)
      );
      const estH = canReuseMeasured ? prev.height : estimateCardHeight(s, attached) + CARD_GAP;
      const hasErr =
        isCommandErrorStep(s) ||
        (Array.isArray(attached) && attached.some((g) => isCommandErrorStep(g)));
      const item = {
        idx: _vItems.length,
        kind: "step",
        step: s,
        attached,
        attachedCount: attCount,
        stepKey: String(s.step_index ?? ""),
        hasErr,
        bytes: estimateStepBytes(s, attached),
        estHeight: estH,
        height: estH,
        measured: canReuseMeasured,
        searchTrimmed: curSearchTrim,
        hlSig: curHlSig,
        offsetY: 0,
        el: reusePrev ? prev.el : null,
        cfgKey,
      };
      if (item.el) {
        item.el.dataset.vIdx = String(item.idx);
        if (item.el.dataset.hasEditDiff === "1") {
          const argWraps = item.el.querySelectorAll(".tool-args");
          for (const aw of argWraps) {
            const rr = toolArgsReplaceRowMap.get(aw);
            if (rr) scheduleEditScroll(aw, rr);
          }
        }
        touchLruItem(item, item.el, cfgKey);
      }
      registerVItem(item);
    };

    for (const s of state.steps) {
      if (attachedSet.has(s)) continue;
      const attached = attachedByPlanner.get(s) || null;
      if (stepMatchesFilter(s, attached)) {
        if (state.filter === "dialog" && hiddenBetween.length > 0 && shown > 0) {
          pushExpandItem(hiddenBetween);
          hiddenBetween = [];
        }
        pushStepItem(s, attached);
        shown++;
      } else if (state.filter === "dialog" && !state.stepQuery) {
        hiddenBetween.push(s);
      }
    }
    if (state.filter === "dialog" && hiddenBetween.length > 0 && shown > 0) {
      pushExpandItem(hiddenBetween);
    }

    recomputeVItemOffsets(0);

    _vListBox = document.createElement("div");
    _vListBox.id = "vListBox";
    _vListBox.className = "v-list-box";
    _vSpacerTop = document.createElement("div");
    _vSpacerTop.id = "vSpacerTop";
    _vSpacerTop.className = "v-spacer";
    _vWindow = document.createElement("div");
    _vWindow.id = "vWindow";
    _vWindow.className = "v-window";
    _vSpacerBottom = document.createElement("div");
    _vSpacerBottom.id = "vSpacerBottom";
    _vSpacerBottom.className = "v-spacer";
    _vListBox.appendChild(_vSpacerTop);
    _vListBox.appendChild(_vWindow);
    _vListBox.appendChild(_vSpacerBottom);

    if (shown === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-hint";
      empty.textContent = t("app.emptyFeedFilter");
      _vWindow.appendChild(empty);
    }

    els.feed.appendChild(_vListBox);
    updateVSpacers();
    renderCacheMapAndToc(attachedByPlanner);
    appendBottomTocLink();
    recomputeTotals();

    const wantBottom = els.followToggle.checked && !state.userScrolledUp;
    if (wantBottom && !opts.skipWindowSync) {
      scrollToBottom();
    } else {
      if (!opts.skipWindowSync) {
        syncVirtualWindow({ forceRender: true });
      }
      if (state.firstUnreadStepIndex !== null && !_vStepToItemMap.has(String(state.firstUnreadStepIndex))) {
        state.firstUnreadStepIndex = null;
      }
      syncJumpBottomButtonState(_lastShowBottom);
    }
    scheduleMinimapRender();
  }

  function syncJumpBottomButtonState(showBottom = Boolean(_lastShowBottom)) {
    if (!els.jumpBottomBtn) return;
    const visible = Boolean(showBottom);
    const hasUnread = visible && state.firstUnreadStepIndex !== null;
    els.jumpBottomBtn.classList.toggle("hidden", !visible);
    els.jumpBottomBtn.classList.toggle("flash-yellow", hasUnread);
    const wantText = hasUnread ? t("minimap.jumpNewMessage") : t("minimap.jumpBottom");
    if (els.jumpBottomBtn.textContent !== wantText) {
      els.jumpBottomBtn.textContent = wantText;
    }
  }

  function notifyNewMessageButton() {
    _lastShowBottom = true;
    syncJumpBottomButtonState(true);
  }

  let _tocRefreshTimer = null;
  function refreshTocNowIfNeeded() {
    const det = document.querySelector("#cacheMapCard .cache-map-details");
    const detOpen = Boolean(det && det.open);
    if (!detOpen || (els.feedWrap && els.feedWrap.scrollTop >= 600)) {
      _tocDirty = true;
      return false;
    }
    _tocDirty = false;
    const prevH = els.feedWrap.scrollHeight;
    const prevTop = els.feedWrap.scrollTop;
    const oldMap = document.getElementById("cacheMapCard");
    if (oldMap) oldMap.remove();
    renderCacheMapAndToc();
    if (!detOpen) {
      const newDet = document.querySelector("#cacheMapCard .cache-map-details");
      if (newDet) newDet.open = false;
    }
    if (state.userScrolledUp) {
      const delta = els.feedWrap.scrollHeight - prevH;
      if (delta !== 0) {
        _suppressScrollTsUntil = performance.now() + 90;
        els.feedWrap.scrollTop = prevTop + delta;
      }
    }
    return true;
  }

  function scheduleTocRefresh(immediate = false) {
    if (immediate) {
      if (_tocRefreshTimer) {
        clearTimeout(_tocRefreshTimer);
        _tocRefreshTimer = null;
      }
      refreshTocNowIfNeeded();
      return;
    }
    if (els.feedWrap && els.feedWrap.scrollTop >= 600) {
      _tocDirty = true;
      return;
    }
    if (_tocRefreshTimer) return;
    _tocRefreshTimer = setTimeout(() => {
      _tocRefreshTimer = null;
      refreshTocNowIfNeeded();
    }, 2000);
  }

  function appendNewSteps(newSteps) {
    if (!newSteps.length) return;
    const fw = els.feedWrap;
    const savedScrollTop = fw ? fw.scrollTop : 0;
    const wasFollowing = Boolean(els.followToggle.checked && !state.userScrolledUp);

    for (const s of newSteps) {
      state.steps.push(s);
    }
    updateStepModels(newSteps, false);
    const prevTaskResMap = new Map();
    for (const [tid, t] of taskIndexMap.entries()) {
      prevTaskResMap.set(tid, t.resultStepIndex);
    }
    buildStepMetadataAndTaskIndex(state.steps);
    const touchedEarlierSteps = new Set();
    for (const [tid, t] of taskIndexMap.entries()) {
      if (t.resultStepIndex !== prevTaskResMap.get(tid)) {
        if (t.callerStepIndex !== null) touchedEarlierSteps.add(String(t.callerStepIndex));
        if (t.launchStepIndex !== null) touchedEarlierSteps.add(String(t.launchStepIndex));
        for (const ws of t.waitSteps) touchedEarlierSteps.add(String(ws));
        for (const cs of t.cancelSteps) touchedEarlierSteps.add(String(cs));
      }
    }
    _tocBaseCache = null;
    if (state.userTzSource !== "transcript" && newSteps.some((s) => s.type === "USER_INPUT")) {
      if (calibrateUserTimezone(state.steps)) {
        stepSearchBlobCache = new WeakMap();
        stepSearchUnitsCache = new WeakMap();
        invalidateCardRenderCache();
      }
    }
    const cfgKey = getRenderConfigKey();
    if (!_cardRenderConfigKey) _cardRenderConfigKey = cfgKey;
    els.feed.classList.toggle("is-read-full", state.readDisplayMode === "full" || state.expandAllOutputs);
    els.feed.classList.toggle("is-search-focused", Boolean(state.stepQuery && state.searchFocusedOnly));

    const newStepSet = new Set(newSteps);
    const renderedNewIndices = new Set();

    const hint = _vWindow ? _vWindow.querySelector(".empty-hint") : els.feed.querySelector(".empty-hint");
    if (hint) hint.remove();

    let addedVisible = 0;
    let dirtyFromIdx = _vItems.length;

    const pushTailItem = (s, attached) => {
      const estH = estimateCardHeight(s, attached) + CARD_GAP;
      const hasErr =
        isCommandErrorStep(s) ||
        (Array.isArray(attached) && attached.some((g) => isCommandErrorStep(g)));
      const item = {
        idx: _vItems.length,
        kind: "step",
        step: s,
        attached,
        attachedCount: attached ? attached.length : 0,
        stepKey: String(s.step_index ?? ""),
        hasErr,
        bytes: estimateStepBytes(s, attached),
        estHeight: estH,
        height: estH,
        measured: false,
        offsetY: 0,
        el: null,
        cfgKey,
      };
      registerVItem(item);
      if (newStepSet.has(s)) renderedNewIndices.add(s.step_index);
      if (attached) {
        for (const g of attached) {
          if (newStepSet.has(g)) renderedNewIndices.add(g.step_index);
        }
      }
      if (newStepSet.has(s) || (attached && attached.some((g) => newStepSet.has(g)))) {
        addedVisible++;
      }
    };

    const needPairBackwalk =
      state.attachToolOutputs &&
      state.filter !== "dialog" &&
      newSteps.some((s) => s.type === "GENERIC" || s.type === "SYSTEM_MESSAGE" || s.type === "ERROR_MESSAGE");

    if (needPairBackwalk) {
      let tailStart = Math.max(0, state.steps.length - newSteps.length - 1);
      while (tailStart > 0) {
        const st = state.steps[tailStart];
        if (st.type === "USER_INPUT") break;
        if (st.type === "PLANNER_RESPONSE" && tailStart <= state.steps.length - newSteps.length - 1) {
          break;
        }
        if (state.steps.length - tailStart >= 60) break;
        tailStart--;
      }
      const tailSlice = state.steps.slice(tailStart);
      const { attachedByPlanner, attachedSet } = pairToolOutputs(tailSlice);

      let spliceIdx = _vItems.length;
      for (const s of tailSlice) {
        const idxKey = String(s.step_index ?? "");
        const oldIt = _vStepToItemMap.get(idxKey);
        if (oldIt) {
          if (oldIt.idx < spliceIdx) spliceIdx = oldIt.idx;
          _lruMap.delete(oldIt);
          if (oldIt.el) {
            if (vResizeObserver) vResizeObserver.unobserve(oldIt.el);
            _highlightedCards.delete(oldIt.el);
            if (oldIt.el.isConnected) oldIt.el.remove();
            oldIt.el = null;
          }
          _vStepToItemMap.delete(idxKey);
        }
      }
      if (spliceIdx < _vItems.length) {
        // Also strip any removed items from _vItems and force window resync cleanly if overlap occurred
        const removed = _vItems.splice(spliceIdx);
        for (const r of removed) {
          if (r.stepKey) _vStepToItemMap.delete(r.stepKey);
          if (r.attached) {
            for (const g of r.attached) {
              const gk = String(g.step_index ?? "");
              if (gk) _vStepToItemMap.delete(gk);
            }
          }
          _lruMap.delete(r);
          if (r.el && r.el.isConnected) {
            if (vResizeObserver) vResizeObserver.unobserve(r.el);
            r.el.remove();
          }
        }
        if (spliceIdx <= _winStart) {
          clearVWindowDom();
        } else if (spliceIdx <= _winEnd && _vWindow) {
          for (const ch of Array.from(_vWindow.children)) {
            const chIdx = Number(ch.dataset.vIdx);
            if (Number.isNaN(chIdx) || chIdx >= spliceIdx) {
              if (vResizeObserver) vResizeObserver.unobserve(ch);
              ch.remove();
            }
          }
          _winEnd = Math.max(_winStart - 1, spliceIdx - 1);
        }
      }
      dirtyFromIdx = Math.min(dirtyFromIdx, spliceIdx);

      for (const s of tailSlice) {
        if (attachedSet.has(s)) continue;
        const attached = attachedByPlanner.get(s) || null;
        if (stepMatchesFilter(s, attached)) {
          pushTailItem(s, attached);
        }
      }
    } else {
      for (const s of newSteps) {
        if (stepMatchesFilter(s)) {
          pushTailItem(s, null);
        }
      }
    }

    let invalidatedEarlier = false;
    let needClearWindow = false;
    if (touchedEarlierSteps.size > 0) {
      for (const sk of touchedEarlierSteps) {
        const oldIt = _vStepToItemMap.get(sk);
        if (!oldIt) continue;
        stepSearchBlobCache.delete(oldIt.step);
        stepSearchUnitsCache.delete(oldIt.step);
        if (Array.isArray(oldIt.attached)) {
          for (const g of oldIt.attached) {
            stepSearchBlobCache.delete(g);
            stepSearchUnitsCache.delete(g);
          }
        }
        if (oldIt.idx >= dirtyFromIdx) continue;
        if (oldIt.idx >= _winStart && oldIt.idx <= _winEnd) {
          needClearWindow = true;
        }
        _lruMap.delete(oldIt);
        if (oldIt.el) {
          if (vResizeObserver) vResizeObserver.unobserve(oldIt.el);
          _highlightedCards.delete(oldIt.el);
          if (oldIt.el.isConnected) oldIt.el.remove();
          oldIt.el = null;
        }
        oldIt.measured = false;
        invalidatedEarlier = true;
      }
      if (needClearWindow) {
        clearVWindowDom();
      }
    }

    recomputeVItemOffsets(dirtyFromIdx);
    updateVSpacers();
    appendBottomTocLink();
    addStepTotals(newSteps);

    let firstNewVisibleIdx = null;
    for (const s of newSteps) {
      if (s.step_index !== undefined && s.step_index !== null && renderedNewIndices.has(s.step_index)) {
        firstNewVisibleIdx = s.step_index;
        break;
      }
    }
    if (firstNewVisibleIdx === null && renderedNewIndices.size > 0) {
      firstNewVisibleIdx = renderedNewIndices.values().next().value;
    }

    const isFilteredNow = state.filter !== "all" || Boolean(state.stepQuery) || state.onlyCmdErrors || (state.cmdMapFilterOnly && state.cmdMapKeys.size > 0);
    const affectsToc = isFilteredNow || newSteps.some(
      (s) =>
        s.type === "USER_INPUT" ||
        s.type === "CHECKPOINT" ||
        s.input_tokens !== undefined ||
        s.cache_read_tokens !== undefined ||
        s.output_tokens !== undefined
    );
    if (affectsToc) scheduleTocRefresh();

    const affectsMinimapNotches =
      Boolean(state.stepQuery) ||
      (state.cmdMapKeys && state.cmdMapKeys.size > 0) ||
      newSteps.some(
        (s) =>
          s.type === "USER_INPUT" ||
          s.type === "CHECKPOINT" ||
          ((state.onlyCmdErrors || state.filter === "errors") && isCommandErrorStep(s))
      );
    if (affectsMinimapNotches) {
      scheduleMinimapRender();
    } else {
      scheduleMinimapSettledSync();
    }
    if (!els.cmdMapModal.classList.contains("hidden")) {
      renderCommandMapModal();
    }

    if (wasFollowing) {
      scrollToBottom();
    } else {
      const forceWin = _winEnd < _winStart || dirtyFromIdx <= _winEnd || invalidatedEarlier;
      if (fw && savedScrollTop > 0) {
        const maxTop = Math.max(0, fw.scrollHeight - fw.clientHeight);
        const targetTop = Math.min(maxTop, savedScrollTop);
        if (Math.abs(fw.scrollTop - targetTop) > 1) {
          _suppressScrollTsUntil = performance.now() + 120;
          fw.scrollTop = targetTop;
          _lastScrollFrameTop = fw.scrollTop;
        }
      }
      syncVirtualWindow({ forceRender: forceWin, upgradeSkeletons: true });
      if (fw && savedScrollTop > 0) {
        const maxTop = Math.max(0, fw.scrollHeight - fw.clientHeight);
        const targetTop = Math.min(maxTop, savedScrollTop);
        if (Math.abs(fw.scrollTop - targetTop) > 1) {
          _suppressScrollTsUntil = performance.now() + 120;
          fw.scrollTop = targetTop;
          _lastScrollFrameTop = fw.scrollTop;
        }
      }
      if (firstNewVisibleIdx !== null) {
        if (state.firstUnreadStepIndex === null) {
          state.firstUnreadStepIndex = firstNewVisibleIdx;
        }
        notifyNewMessageButton();
      } else if (addedVisible > 0) {
        if (state.firstUnreadStepIndex === null) {
          const fallbackStep = newSteps.find((s) => s && s.step_index !== undefined && s.step_index !== null);
          if (fallbackStep) state.firstUnreadStepIndex = fallbackStep.step_index;
        }
        if (state.firstUnreadStepIndex !== null) notifyNewMessageButton();
      }
    }
  }

  function clearHashStepIfScrolledAway() {
    if (!state.activeId) return;
    const h = window.location.hash || "";
    if (!/(?:^|[#&])step=/.test(h)) return;
    _suppressHashChange = true;
    try {
      history.replaceState(null, "", `#conv=${encodeURIComponent(state.activeId)}`);
    } catch (_) {}
    setTimeout(() => {
      _suppressHashChange = false;
    }, 0);
  }

  function scrollToTop(openToc = false) {
    if (!els.feedWrap) return;
    _activeAnchorLock = null;
    _activeJumpLock = null;
    _pinBottomLockUntil = 0;
    clearHashStepIfScrolledAway();
    _suppressScrollTsUntil = performance.now() + 180;
    _suppressRoScrollCompUntil = performance.now() + 250;
    if (openToc) {
      const det = document.querySelector("#cacheMapCard .cache-map-details");
      if (det && !det.open) det.open = true;
      if (_tocDirty) refreshTocNowIfNeeded();
    }
    els.feedWrap.scrollTop = 0;
    _lastScrollFrameTop = 0;
    syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
    els.feedWrap.scrollTop = 0;
    _lastScrollFrameTop = 0;
    updateScrollUiOnFrame();
    requestAnimationFrame(() => {
      if (!els.feedWrap) return;
      if (els.feedWrap.scrollTop > 0 && performance.now() < _suppressScrollTsUntil) {
        els.feedWrap.scrollTop = 0;
        _lastScrollFrameTop = 0;
      }
      scheduleMinimapSync();
    });
  }

  function scrollToBottom() {
    if (!els.feedWrap) return;
    _activeAnchorLock = null;
    _activeJumpLock = null;
    _pinBottomLockUntil = performance.now() + 650;
    clearHashStepIfScrolledAway();
    _suppressScrollTsUntil = performance.now() + 180;
    _suppressRoScrollCompUntil = performance.now() + 200;
    state.userScrolledUp = false;
    state.firstUnreadStepIndex = null;
    _lastShowBottom = false;
    syncJumpBottomButtonState(false);
    els.feedWrap.scrollTop = els.feedWrap.scrollHeight;
    _lastScrollFrameTop = els.feedWrap.scrollTop;
    syncVirtualWindow({ forceRender: true, upgradeSkeletons: true });
    els.feedWrap.scrollTop = els.feedWrap.scrollHeight;
    _lastScrollFrameTop = els.feedWrap.scrollTop;
    requestAnimationFrame(() => {
      if (!els.feedWrap || state.userScrolledUp) return;
      _suppressScrollTsUntil = performance.now() + 120;
      els.feedWrap.scrollTop = els.feedWrap.scrollHeight;
      _lastScrollFrameTop = els.feedWrap.scrollTop;
    });
  }

  // ---------- Sidebar & Transcript Loading ----------
  let _lastTranscriptSig = "";
  let _lastCapsSig = "";
  async function loadTranscriptList() {
    try {
      const res = await fetch("/api/transcripts");
      if (!res.ok) return;
      const data = await res.json();
      if (data.brain_dir) state.brainDir = data.brain_dir;
      if (data.capabilities) {
        const capsSig = JSON.stringify(data.capabilities);
        if (capsSig !== _lastCapsSig) {
          _lastCapsSig = capsSig;
          state.capabilities = data.capabilities;
          applyCapabilitiesUI();
        }
      }
      const list = data.transcripts || [];
      const sig = list.map((t) => `${t.id}:${t.mtime}:${t.size}`).join("|");
      if (sig === _lastTranscriptSig) return;
      _lastTranscriptSig = sig;
      state.transcripts = list;
      els.transcriptCount.textContent = String(state.transcripts.length);
      updateProjectDropdown();
      renderTranscriptList();
    } catch (_) {
      // Ignore transient network errors during auto-refresh
    }
  }

  function updateProjectDropdown() {
    const projects = Array.from(new Set(state.transcripts.map((tItem) => tItem.project))).sort();
    const cur = els.projectFilter.value;
    els.projectFilter.innerHTML = `<option value="">${escHtml(t("sidebar.allProjectsCount", { count: projects.length }))}</option>`;
    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      els.projectFilter.appendChild(opt);
    }
    if (projects.includes(cur)) els.projectFilter.value = cur;
  }

  function renderTranscriptList() {
    const q = state.sidebarQuery.toLowerCase();
    const proj = state.projectFilter;
    const filtered = state.transcripts.filter((tr) => {
      if (proj && tr.project !== proj) return false;
      if (q) {
        const hay = `${tr.title} ${tr.project} ${tr.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      els.transcriptList.innerHTML = `<div class="empty-hint">${escHtml(t("app.emptySearchSidebar"))}</div>`;
      return;
    }

    const nowSec = Date.now() / 1000;
    const frag = document.createDocumentFragment();
    for (const tr of filtered) {
      const el = document.createElement("div");
      el.className = `t-item${tr.id === state.activeId ? " active" : ""}`;
      const isFresh = nowSec - tr.mtime < 120;
      el.innerHTML = `
        <div class="t-item-top">
          <span class="t-project" title="${escHtml(tr.project)}">${escHtml(tr.project)}</span>
          <span class="t-time" title="${escHtml(tr.mtime_iso)}">
            ${isFresh ? `<span class="fresh-dot" title="${escHtml(t("sidebar.freshDotTitle"))}"></span>` : ""}
            ${escHtml(fmtRelTime(tr.mtime))}
          </span>
        </div>
        <div class="t-title">${escHtml(tr.title)}</div>
        <div class="t-sub">
          <span>${escHtml(tr.id.slice(0, 8))}</span>
          <span>${escHtml(t("sidebar.sessionMeta", { lines: fmtNum(tr.lines), size: fmtBytes(tr.size) }))}</span>
        </div>
      `;
      el.addEventListener("click", () => selectTranscript(tr.id));
      frag.appendChild(el);
    }
    els.transcriptList.innerHTML = "";
    els.transcriptList.appendChild(frag);
  }

  function closeStream() {
    if (_sseFlushTimer) {
      clearTimeout(_sseFlushTimer);
      _sseFlushTimer = null;
    }
    _pendingSseSteps = [];
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
  }

  function setLiveStatus(mode, text) {
    els.livePill.className = `live-pill ${mode}`;
    els.liveText.textContent = text;
  }

  let _lastComposerTypeMs = 0;
  let _pendingSseSteps = [];
  let _sseFlushTimer = null;

  function flushPendingSseSteps() {
    if (_sseFlushTimer) {
      clearTimeout(_sseFlushTimer);
      _sseFlushTimer = null;
    }
    if (!_pendingSseSteps.length) return;
    const now = Date.now();
    if (now - _lastComposerTypeMs < 400 || now - _lastUserScrollMs < 240) {
      _sseFlushTimer = setTimeout(flushPendingSseSteps, 280);
      return;
    }
    const batch = _pendingSseSteps.splice(0, _pendingSseSteps.length);
    appendNewSteps(batch);
  }

  function startStream(convId, offset) {
    closeStream();
    _pendingSseSteps = [];
    setLiveStatus("", t("topbar.liveConnecting"));
    const es = new EventSource(`/api/stream/${encodeURIComponent(convId)}?offset=${offset}`);
    state.eventSource = es;

    es.onopen = () => {
      if (state.eventSource !== es || state.activeId !== convId) return;
      setLiveStatus("connected", "Live");
    };

    es.addEventListener("steps", (ev) => {
      if (state.eventSource !== es || state.activeId !== convId) return;
      try {
        const payload = JSON.parse(ev.data);
        if (payload.reset) {
          let anchorStepKey = "";
          const wasScrolledUp = state.userScrolledUp && els.feedWrap && _vItems.length > 0;
          if (wasScrolledUp) {
            const viewTop = Math.max(0, els.feedWrap.scrollTop - getVListBaseTop()) + 18;
            const anchorIt = _vItems[findVItemAtY(viewTop)];
            if (anchorIt && anchorIt.stepKey) anchorStepKey = anchorIt.stepKey;
          }
          if (_sseFlushTimer) {
            clearTimeout(_sseFlushTimer);
            _sseFlushTimer = null;
          }
          _pendingSseSteps = [];
          stepSearchBlobCache = new WeakMap();
          stepSearchUnitsCache = new WeakMap();
          invalidateCardRenderCache();
          state.steps = payload.steps || [];
          state.offset = payload.offset || 0;
          calibrateUserTimezone(state.steps);
          updateStepModels(state.steps, true);
          buildStepMetadataAndTaskIndex(state.steps);
          renderFullFeed({ skipWindowSync: Boolean(wasScrolledUp && anchorStepKey) });
          if (wasScrolledUp && anchorStepKey) {
            if (_vStepToItemMap.has(String(anchorStepKey))) {
              jumpToStep(anchorStepKey, { topOffset: 4 });
            } else {
              syncVirtualWindow({ forceRender: true });
            }
            requestAnimationFrame(updateScrollUiOnFrame);
          }
        } else {
          state.offset = payload.offset || state.offset;
          const incoming = payload.steps || [];
          if (!incoming.length) return;
          // Pause DOM updates while actively typing/scrolling; preserve strict FIFO order if queued batches exist
          const now = Date.now();
          if (now - _lastComposerTypeMs < 400 || now - _lastUserScrollMs < 240) {
            _pendingSseSteps.push(...incoming);
            if (!_sseFlushTimer) {
              _sseFlushTimer = setTimeout(flushPendingSseSteps, now - _lastComposerTypeMs < 400 ? 420 : 280);
            }
          } else if (_pendingSseSteps.length > 0) {
            if (_sseFlushTimer) {
              clearTimeout(_sseFlushTimer);
              _sseFlushTimer = null;
            }
            const combined = _pendingSseSteps.splice(0, _pendingSseSteps.length);
            combined.push(...incoming);
            appendNewSteps(combined);
          } else {
            appendNewSteps(incoming);
          }
        }
      } catch (_) {}
    });

    es.onerror = () => {
      if (state.eventSource !== es || state.activeId !== convId) return;
      setLiveStatus("error", t("topbar.liveReconnecting"));
    };
  }

  async function selectTranscript(convId, opts = {}) {
    if (!convId) return;
    const loadSeq = ++_activeLoadSeq;
    const targetStep = opts && opts.targetStep !== undefined && opts.targetStep !== null ? String(opts.targetStep) : "";
    _pendingNavStep = targetStep;
    closeStream();
    cancelVirtualTimers();
    clearVWindowDom();
    _lruMap.clear();
    _vItems = [];
    _vTotalHeight = 0;
    _vStepToItemMap.clear();
    state.activeId = convId;
    state.activeLogPath = "";
    state.userScrolledUp = Boolean(targetStep);
    state.firstUnreadStepIndex = null;
    _lastShowBottom = false;
    syncJumpBottomButtonState(false);
    _suppressHashChange = true;
    try {
      history.replaceState(
        null,
        "",
        targetStep
          ? `#conv=${encodeURIComponent(convId)}&step=${encodeURIComponent(targetStep)}`
          : `#conv=${encodeURIComponent(convId)}`
      );
    } catch (_) {}
    setTimeout(() => { _suppressHashChange = false; }, 0);
    renderTranscriptList();

    els.feed.innerHTML = `<div class="empty-hint">${escHtml(t("app.loadingTranscript"))}</div>`;
    setLiveStatus("", t("topbar.liveLoading"));

    try {
      const res = await fetch(`/api/transcript/${encodeURIComponent(convId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (loadSeq !== _activeLoadSeq) return;
      const resolvedTargetStep = _pendingNavStep || targetStep;
      _pendingNavStep = "";
      state.userScrolledUp = Boolean(resolvedTargetStep);
      const meta = data.meta || {};
      state.activeMeta = meta;
      state.activeLogPath = data.path || "";
      state.projectRoot = data.project_root || "";
      state.projectFiles = Array.isArray(data.project_files) ? data.project_files : [];
      state.projectDirs = new Set(
        state.projectFiles.filter((f) => !/\.[A-Za-z0-9]{1,8}$/.test(f.split(/[/\\]/).pop() || "")).map((f) => f.toLowerCase())
      );
      rebuildProjectFilesRegex();
      stepSearchBlobCache = new WeakMap();
      stepSearchUnitsCache = new WeakMap();
      invalidateCardRenderCache();
      state.steps = data.steps || [];
      state.offset = data.offset || 0;
      calibrateUserTimezone(state.steps);
      updateStepModels(state.steps, true);
      buildStepMetadataAndTaskIndex(state.steps);

      if (resolvedTargetStep && state.activeId === convId) {
        const canonicalHash = buildStepShareUrl(resolvedTargetStep).split("#")[1];
        if (canonicalHash) {
          _suppressHashChange = true;
          try {
            history.replaceState(null, "", `#${canonicalHash}`);
          } catch (_) {}
          setTimeout(() => { _suppressHashChange = false; }, 0);
        }
      }

      els.convTitle.textContent = meta.title || convId;
      els.convMeta.textContent = `[${meta.project || "general"}] ${convId} · ${data.path || ""}`;
      linkifyElement(els.convMeta, { treatTranscriptAsFile: true });

      renderFullFeed({ skipWindowSync: Boolean(resolvedTargetStep) });
      if (resolvedTargetStep) {
        if (jumpToStep(resolvedTargetStep, { topOffset: 4 }) === false) {
          syncVirtualWindow({ forceRender: true });
        }
      }
      if (els.feedWrap) els.feedWrap.focus({ preventScroll: true });
      if (!els.cmdMapModal.classList.contains("hidden")) {
        renderCommandMapModal();
      }
      startStream(convId, state.offset);
      checkAntigravityWindow();
    } catch (err) {
      els.feed.innerHTML = `<div class="empty-hint">${escHtml(t("app.loadError", { error: err.message }))}</div>`;
      setLiveStatus("error", t("topbar.liveError"));
    }
  }

  // ---------- Event Listeners ----------
  els.refreshListBtn.addEventListener("click", loadTranscriptList);
  els.sidebarSearch.addEventListener("input", (e) => {
    state.sidebarQuery = e.target.value;
    renderTranscriptList();
  });
  els.projectFilter.addEventListener("change", (e) => {
    state.projectFilter = e.target.value;
    renderTranscriptList();
  });

  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filter = btn.dataset.filter;
      renderFullFeed();
    });
  });

  els.onlyCmdErrorsToggle.addEventListener("change", (e) => {
    state.onlyCmdErrors = e.target.checked;
    renderFullFeed();
  });

  window.addEventListener("resize", () => scheduleMinimapSync(), { passive: true });

  function captureSearchContextAnchor() {
    const fw = els.feedWrap;
    if (!fw || !_vItems.length || !state.steps.length) return null;
    const wrapRect = fw.getBoundingClientRect();

    const getScrollBoxState = (el, card) => {
      let cur = el ? el.parentElement : null;
      let outerBox = null;
      const elRect = el.getBoundingClientRect();
      while (cur && cur !== card) {
        if (
          cur.classList.contains("read-scroll-box") ||
          cur.classList.contains("tool-args") ||
          cur.classList.contains("generic-pre") ||
          cur.classList.contains("inline-raw-pre")
        ) {
          if (cur.scrollHeight > cur.clientHeight + 2) {
            const boxRect = cur.getBoundingClientRect();
            if (elRect.bottom <= boxRect.top + 4 || elRect.top >= boxRect.bottom - 4) {
              return { visible: false, outerBox: null };
            }
            outerBox = cur;
          }
        }
        cur = cur.parentElement;
      }
      return { visible: true, outerBox };
    };

    const findWithin = (root, sel, node) => {
      if (!root || !node) return null;
      try {
        const list = Array.from(root.querySelectorAll(sel));
        const idx = list.findIndex((el) => el === node || el.contains(node));
        return idx >= 0 ? { el: list[idx], idx } : null;
      } catch (_) {
        return null;
      }
    };

    const buildAnchorFromEl = (card, rawEl) => {
      const boxState = getScrollBoxState(rawEl, card);
      const targetEl = boxState.outerBox || rawEl;
      const resEl = targetEl.closest(".tool-result[data-step-index]");
      const tcEl = targetEl.closest(".tool-card[data-tool-idx]");
      let subAnchor = null;
      let anchorEl = resEl || tcEl || card;

      if (resEl && card.contains(resEl)) {
        const resSelectors = [
          ".tool-result-head",
          ".code-gutter-row",
          ".md-gutter-row",
          ".md li",
          ".md tr",
          ".md p",
          ".md pre",
          ".md > *",
          ".read-scroll-box",
          ".generic-pre",
          ".inline-raw-pre",
          "pre",
          "p",
          "li",
        ];
        for (const sel of resSelectors) {
          const found = findWithin(resEl, sel, targetEl);
          if (found) {
            subAnchor = { scope: "res", sel, idx: found.idx };
            anchorEl = found.el;
            break;
          }
        }
      } else if (tcEl && card.contains(tcEl)) {
        const tcSelectors = [
          ":scope > .tool-head",
          ".arg-row .diff-line",
          ".arg-row .md li",
          ".arg-row .md tr",
          ".arg-row .md > *",
          ".arg-row",
          ".tool-args",
        ];
        for (const sel of tcSelectors) {
          const found = findWithin(tcEl, sel, targetEl);
          if (found) {
            subAnchor = { scope: "tc", sel, idx: found.idx };
            anchorEl = found.el;
            break;
          }
        }
      } else {
        const cardSelectors = [
          ":scope > .step-head",
          ":scope > .step-body > details.block-tools > summary",
          ":scope > .step-body > details.block-tools",
          ":scope > .step-body > details.block-thinking > .md li",
          ":scope > .step-body > details.block-thinking > .md tr",
          ":scope > .step-body > details.block-thinking > .md p",
          ":scope > .step-body > details.block-thinking > .md pre",
          ":scope > .step-body > details.block-thinking > .md > *",
          ":scope > .step-body > details.block-thinking",
          ":scope > .step-body > .md li",
          ":scope > .step-body > .md tr",
          ":scope > .step-body > .md p",
          ":scope > .step-body > .md pre",
          ":scope > .step-body > .md > *",
          ":scope > .step-body > .md",
          ":scope > .step-body > .system-msg-body",
          ":scope > .step-body > .generic-content-wrap .code-gutter-row",
          ":scope > .step-body > .generic-content-wrap .md-gutter-row",
          ":scope > .step-body > .generic-content-wrap .md li",
          ":scope > .step-body > .generic-content-wrap .md tr",
          ":scope > .step-body > .generic-content-wrap .md > *",
          ":scope > .step-body > .generic-content-wrap .read-scroll-box",
          ":scope > .step-body > .generic-content-wrap .generic-pre",
          ":scope > .step-body > .generic-content-wrap",
          ":scope > .step-body > details.block-meta",
          ":scope > .step-body > details.block-unknown-tag",
        ];
        for (const sel of cardSelectors) {
          const found = findWithin(card, sel, targetEl);
          if (found) {
            subAnchor = { scope: "card", sel, idx: found.idx };
            anchorEl = found.el;
            break;
          }
        }
      }

      const anchorRect = anchorEl.getBoundingClientRect();
      return {
        stepIndex: card.dataset.stepIndex,
        toolOutStep: resEl ? resEl.dataset.stepIndex : null,
        toolIdx: !resEl && tcEl ? tcEl.dataset.toolIdx : null,
        subAnchor,
        topInWrap: anchorRect.top - wrapRect.top,
      };
    };

    if (_vWindow) {
      const cards = Array.from(_vWindow.children).filter(
        (el) => el.tagName === "ARTICLE" && el.dataset.isSkeleton !== "1" && el.dataset.stepIndex
      );
      const visibleCards = cards
        .map((card) => ({ card, rect: card.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > wrapRect.top + 8 && rect.top < wrapRect.bottom - 8);

      const pickAcrossCards = (selectorList) => {
        for (const sel of selectorList) {
          const candidates = [];
          for (const { card } of visibleCards) {
            for (const el of card.querySelectorAll(sel)) {
              const r = el.getBoundingClientRect();
              if (r.height <= 0 || r.bottom <= wrapRect.top + 6 || r.top >= wrapRect.bottom - 6) continue;
              const st = getScrollBoxState(el, card);
              if (!st.visible) continue;
              const visEl = st.outerBox || el;
              const vr = st.outerBox ? visEl.getBoundingClientRect() : r;
              if (vr.height <= 0 || vr.bottom <= wrapRect.top + 6 || vr.top >= wrapRect.bottom - 6) continue;
              candidates.push({ card, el: visEl, rect: vr });
            }
          }
          if (candidates.length > 0) {
            const inView = candidates.find(({ rect }) => rect.top >= wrapRect.top - 12);
            return inView || candidates[0];
          }
        }
        return null;
      };

      if (visibleCards.length > 0) {
        // Prefer the most specific visible matched element across ALL visible cards before falling back to outer hit boxes
        const hitPick = pickAcrossCards([
          "mark.hl",
          ".search-hit-sub",
          ".tool-result[data-step-index].search-hit-target, .tool-card.search-hit-target",
          ".search-hit-target",
        ]);
        if (hitPick) return buildAnchorFromEl(hitPick.card, hitPick.el);

        // Fallback: anchor to the topmost visible block (for negation-only search or scrolled long cards)
        const structPick = pickAcrossCards([
          ".step-head, .tool-head, .tool-result-head, .code-gutter-row, .md-gutter-row, .arg-row, details.block-thinking > .md > *, .step-body > .md > *, .tool-result .md > *",
          "details.block-thinking, .tool-result[data-step-index], .tool-card[data-tool-idx], .step-body > .md, .step-body > .system-msg-body, .step-body > .generic-content-wrap",
        ]);
        if (structPick) return buildAnchorFromEl(structPick.card, structPick.el);

        const chosen =
          visibleCards.find(({ rect }) => rect.top >= wrapRect.top - 10) ||
          visibleCards[0];
        return {
          stepIndex: chosen.card.dataset.stepIndex,
          toolOutStep: null,
          toolIdx: null,
          subAnchor: null,
          topInWrap: chosen.rect.top - wrapRect.top,
        };
      }
    }

    const viewTop = Math.max(0, fw.scrollTop - getVListBaseTop()) + 18;
    const vIt = _vItems[findVItemAtY(viewTop)];
    if (vIt && vIt.stepKey) {
      return { stepIndex: vIt.stepKey, toolOutStep: null, toolIdx: null, subAnchor: null, topInWrap: 4 };
    }
    return null;
  }

  function applySearchQueryChange(nextVal) {
    const val = String(nextVal || "").trim();
    if (val === state.stepQuery) return;
    const prevQuery = state.stepQuery;
    const isClearing = Boolean(prevQuery && val === "");
    const hadActiveSearch = Boolean(prevQuery);
    const anchor = (isClearing || hadActiveSearch || state.userScrolledUp) ? captureSearchContextAnchor() : null;

    state.stepQuery = val;
    if (anchor) {
      state.userScrolledUp = true;
    }
    renderFullFeed({ skipWindowSync: Boolean(anchor && anchor.stepIndex) });
    if (anchor && anchor.stepIndex) {
      let targetStep = String(anchor.stepIndex);
      if (!_vStepToItemMap.has(targetStep) && isClearing) {
        const anchorNum = Number(targetStep);
        const nearest = _vItems.find((it) => it.kind === "step" && it.stepKey && Number(it.stepKey) >= anchorNum)
          || [..._vItems].reverse().find((it) => it.kind === "step" && it.stepKey);
        if (nearest) targetStep = nearest.stepKey;
      }
      if (_vStepToItemMap.has(targetStep)) {
        const useSub = targetStep === String(anchor.stepIndex);
        jumpToStep(targetStep, {
          topOffset: useSub ? anchor.topInWrap : 4,
          toolOutStep: useSub ? anchor.toolOutStep : null,
          toolIdx: useSub ? anchor.toolIdx : null,
          subAnchor: useSub ? anchor.subAnchor : null,
          resetFiltersOnMissing: false,
        });
        requestAnimationFrame(updateScrollUiOnFrame);
      } else if (!isClearing && els.feedWrap && _vItems.length > 0) {
        els.feedWrap.scrollTop = 0;
        _lastScrollFrameTop = 0;
        syncVirtualWindow({ forceRender: true });
        updateScrollUiOnFrame();
      } else if (els.feedWrap && _vItems.length > 0) {
        syncVirtualWindow({ forceRender: true });
        updateScrollUiOnFrame();
      }
    }
  }

  let searchTimer = null;
  els.stepSearch.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const val = e.target.value.trim();
    if (val === "") {
      applySearchQueryChange("");
      return;
    }
    searchTimer = setTimeout(() => {
      applySearchQueryChange(val);
    }, 200);
  });

  els.stepSearch.addEventListener("search", (e) => {
    clearTimeout(searchTimer);
    applySearchQueryChange(e.target.value.trim());
  });

  function isSearchPopoverOpen() {
    return Boolean(els.searchPopover && !els.searchPopover.classList.contains("hidden"));
  }

  function openSearchPopover() {
    if (!els.searchPopover) return;
    if (!els.searchPopover.dataset.rendered) renderSearchPopover();
    els.searchPopover.classList.remove("hidden");
    if (els.searchOptsBtn) {
      els.searchOptsBtn.classList.add("active");
      els.searchOptsBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeSearchPopover() {
    if (!els.searchPopover) return;
    els.searchPopover.classList.add("hidden");
    if (els.searchOptsBtn) {
      els.searchOptsBtn.classList.remove("active");
      els.searchOptsBtn.setAttribute("aria-expanded", "false");
    }
  }

  function syncSearchOptionInputs() {
    const map = {
      searchFocusedOnly: Boolean(state.searchFocusedOnly),
      searchAcrossWholeTurn: Boolean(state.searchAcrossWholeTurn),
      searchWholeWord: Boolean(state.searchWholeWord),
      searchCaseSensitive: Boolean(state.searchCaseSensitive),
    };
    document.querySelectorAll("input[data-search-opt]").forEach((cb) => {
      const k = cb.dataset.searchOpt;
      if (k in map) cb.checked = map[k];
    });
  }

  function setSearchOption(optKey, checked) {
    const val = Boolean(checked);
    const storageKeys = {
      searchFocusedOnly: "tv_search_focused",
      searchAcrossWholeTurn: "tv_search_whole_turn",
      searchWholeWord: "tv_search_whole_word",
      searchCaseSensitive: "tv_search_case",
    };
    if (!(optKey in storageKeys)) return;
    state[optKey] = val;
    try {
      localStorage.setItem(storageKeys[optKey], val ? "1" : "0");
    } catch (_) {}
    syncSearchOptionInputs();
    if (state.stepQuery) {
      const anchor = captureSearchContextAnchor();
      if (anchor) state.userScrolledUp = true;
      renderFullFeed({ skipWindowSync: Boolean(anchor && anchor.stepIndex) });
      if (anchor && anchor.stepIndex) {
        if (_vStepToItemMap.has(String(anchor.stepIndex))) {
          jumpToStep(anchor.stepIndex, {
            topOffset: anchor.topInWrap,
            toolOutStep: anchor.toolOutStep,
            toolIdx: anchor.toolIdx,
            subAnchor: anchor.subAnchor,
            resetFiltersOnMissing: false,
          });
          requestAnimationFrame(updateScrollUiOnFrame);
        } else {
          syncVirtualWindow({ forceRender: true });
          updateScrollUiOnFrame();
        }
      }
    }
  }

  function renderSearchPopover() {
    if (!els.searchPopover) return;
    const examples = [
      'pwsh -c git diff',
      '"git diff"',
      'error OR warning !cache',
      '(edit_file OR write_file) NOT failed',
    ];
    els.searchPopover.innerHTML = `
      <div class="search-popover-title">${escHtml(t("searchPopover.header"))}</div>
      <div class="search-popover-checks">
        <label class="search-pop-opt">
          <input type="checkbox" data-search-opt="searchFocusedOnly" ${state.searchFocusedOnly ? "checked" : ""}>
          <span class="search-pop-opt-text">
            <span class="search-pop-opt-lbl">${escHtml(t("searchPopover.focusedOnly"))}</span>
            <span class="search-pop-opt-desc">${escHtml(t("searchPopover.focusedOnlyDesc"))}</span>
          </span>
        </label>
        <label class="search-pop-opt">
          <input type="checkbox" data-search-opt="searchAcrossWholeTurn" ${state.searchAcrossWholeTurn ? "checked" : ""}>
          <span class="search-pop-opt-text">
            <span class="search-pop-opt-lbl">${escHtml(t("searchPopover.wholeTurn"))}</span>
            <span class="search-pop-opt-desc">${escHtml(t("searchPopover.wholeTurnDesc"))}</span>
          </span>
        </label>
        <label class="search-pop-opt">
          <input type="checkbox" data-search-opt="searchWholeWord" ${state.searchWholeWord ? "checked" : ""}>
          <span class="search-pop-opt-text">
            <span class="search-pop-opt-lbl">${escHtml(t("searchPopover.wholeWord"))}</span>
            <span class="search-pop-opt-desc">${escHtml(t("searchPopover.wholeWordDesc"))}</span>
          </span>
        </label>
        <label class="search-pop-opt">
          <input type="checkbox" data-search-opt="searchCaseSensitive" ${state.searchCaseSensitive ? "checked" : ""}>
          <span class="search-pop-opt-text">
            <span class="search-pop-opt-lbl">${escHtml(t("searchPopover.caseSensitive"))}</span>
            <span class="search-pop-opt-desc">${escHtml(t("searchPopover.caseSensitiveDesc"))}</span>
          </span>
        </label>
      </div>
      <div class="search-popover-title">${escHtml(t("searchPopover.syntaxTitle"))}</div>
      <div class="search-syntax-list">
        <code>word1 word2</code><span class="search-syntax-desc">${escHtml(t("searchPopover.synAnd"))}</span>
        <code>"exact phrase"</code><span class="search-syntax-desc">${escHtml(t("searchPopover.synPhrase"))}</span>
        <code>foo OR bar | baz</code><span class="search-syntax-desc">${escHtml(t("searchPopover.synOr"))}</span>
        <code>!word / NOT word</code><span class="search-syntax-desc">${escHtml(t("searchPopover.synNot"))}</span>
        <code>(a OR b) !error</code><span class="search-syntax-desc">${escHtml(t("searchPopover.synGroup"))}</span>
      </div>
      <div class="search-popover-title">${escHtml(t("searchPopover.examplesTitle"))}</div>
      <div class="search-examples-row">
        ${examples.map((ex) => `<button type="button" class="search-ex-chip" data-search-ex="${escHtml(ex)}">${escHtml(ex)}</button>`).join("")}
      </div>
    `;
    els.searchPopover.dataset.rendered = "1";
    els.searchPopover.querySelectorAll("input[data-search-opt]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        setSearchOption(e.target.dataset.searchOpt, e.target.checked);
      });
    });
    els.searchPopover.querySelectorAll("button[data-search-ex]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const ex = chip.dataset.searchEx || "";
        els.stepSearch.value = ex;
        applySearchQueryChange(ex);
        els.stepSearch.focus();
      });
    });
  }

  if (els.searchOptsBtn) {
    els.searchOptsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isSearchPopoverOpen()) closeSearchPopover();
      else openSearchPopover();
    });
  }
  document.addEventListener("mousedown", (e) => {
    if (!isSearchPopoverOpen()) return;
    if (els.searchBoxWrap && !els.searchBoxWrap.contains(e.target)) {
      closeSearchPopover();
    }
  });

  if (els.langSelect) {
    els.langSelect.addEventListener("change", (e) => {
      setLanguage(e.target.value);
    });
  }

  els.expandAllBtn.addEventListener("click", () => {
    state.detailsDefaultOpen = true;
    preserveScrollAnchor(() => {
      const seenEls = new Set();
      if (_vWindow) {
        for (const ch of _vWindow.children) {
          seenEls.add(ch);
          ch.querySelectorAll("details.block-thinking, details.block-tools").forEach((d) => {
            d.open = true;
          });
        }
      }
      for (const it of _lruMap.keys()) {
        if (!it.el || seenEls.has(it.el)) continue;
        it.el.querySelectorAll("details.block-thinking, details.block-tools").forEach((d) => {
          d.open = true;
        });
        it.measured = false;
      }
    });
    scheduleMinimapSettledSync();
  });

  els.collapseAllBtn.addEventListener("click", () => {
    state.detailsDefaultOpen = false;
    preserveScrollAnchor(() => {
      const seenEls = new Set();
      if (_vWindow) {
        for (const ch of _vWindow.children) {
          seenEls.add(ch);
          ch.querySelectorAll("details.block-thinking, details.block-tools").forEach((d) => {
            d.open = false;
          });
        }
      }
      for (const it of _lruMap.keys()) {
        if (!it.el || seenEls.has(it.el)) continue;
        it.el.querySelectorAll("details.block-thinking, details.block-tools").forEach((d) => {
          d.open = false;
        });
        it.measured = false;
      }
    });
    scheduleMinimapSettledSync();
  });

  // ---------- Prompt Minimap (Scrollbar Notches for USER_INPUT) ----------
  let _minimapRaf = 0;
  let _minimapSyncRaf = 0;
  let _minimapSettleTimer = 0;
  function scheduleMinimapRender() {
    if (_minimapRaf) return;
    _minimapRaf = requestAnimationFrame(() => {
      _minimapRaf = 0;
      renderPromptMinimap();
    });
  }

  function scheduleMinimapSync() {
    if (_minimapSyncRaf) return;
    _minimapSyncRaf = requestAnimationFrame(() => {
      _minimapSyncRaf = 0;
      syncMinimapPositions();
    });
  }

  function scheduleMinimapSettledSync() {
    clearTimeout(_minimapSettleTimer);
    _minimapSettleTimer = setTimeout(() => {
      _minimapSettleTimer = 0;
      if (_scrollbarDragging || Date.now() - _lastUserScrollMs < 450) {
        scheduleMinimapSettledSync();
        return;
      }
      syncMinimapPositions();
    }, 750);
  }

  // Zero-DOM offsetY math (no card.offsetTop queries across 1,000+ DOM nodes)
  function syncMinimapPositions(totalHOverride = 0) {
    if (!els.promptMinimap) return;
    const baseTop = getVListBaseTop();
    const totalH = Math.max(1, totalHOverride || baseTop + _vTotalHeight + 60);
    const allNotches = els.promptMinimap.children;
    const updates = [];
    const nextUserCoords = [];
    for (const notch of allNotches) {
      const it = notchItemMap.get(notch);
      if (it && _vItems[it.idx] === it) {
        const top = baseTop + it.offsetY;
        const pct = Math.min(99.2, Math.max(0.8, ((top + 12) / totalH) * 100));
        updates.push([notch, `${pct.toFixed(2)}%`]);
        if (notch.classList.contains("minimap-notch")) {
          nextUserCoords.push({ top, bottom: top + it.height, notch });
        }
      }
    }
    for (const [notch, topPct] of updates) {
      notch.style.top = topPct;
    }
    nextUserCoords.sort((a, b) => a.top - b.top);
    _userNotchCoords = nextUserCoords;
    _lastMinimapTotalH = totalH;
    updateActiveMinimapNotch();
  }

  // Only re-sync minimap notch positions when container WIDTH changes (text reflow) or a <details> toggles — NEVER trigger ResizeObserver on vertical scroll!
  if (typeof ResizeObserver !== "undefined" && els.feedWrap) {
    let _lastFeedWrapW = els.feedWrap.clientWidth;
    const _feedWrapResizeObserver = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? els.feedWrap.clientWidth;
      if (Math.abs(w - _lastFeedWrapW) > 1) {
        _lastFeedWrapW = w;
        scheduleMinimapSync();
        if (_vWindow) {
          for (const ch of _vWindow.children) scheduleCardOverflowCheck(ch);
        }
      }
    });
    _feedWrapResizeObserver.observe(els.feedWrap);
  }
  if (els.feed) {
    let _pendingDetailsSnap = null;
    els.feed.addEventListener(
      "click",
      (e) => {
        const sum = e.target.closest ? e.target.closest("summary") : null;
        const det = sum ? sum.parentElement : null;
        if (det && det.tagName === "DETAILS") {
          _pendingDetailsSnap = { det, snap: captureScrollAnchor(sum), ts: performance.now() };
        }
      },
      true
    );
    els.feed.addEventListener(
      "toggle",
      (e) => {
        if (_pendingDetailsSnap && _pendingDetailsSnap.det === e.target && performance.now() - _pendingDetailsSnap.ts < 250) {
          const snap = _pendingDetailsSnap.snap;
          _pendingDetailsSnap = null;
          restoreScrollAnchor(snap);
        }
        if (e.target && e.target.open) {
          const stepCard = e.target.closest("article.step");
          applyInitialEditScrolls(stepCard || e.target);
          if (state.stepQuery) applyInitialSearchScrolls(stepCard || e.target);
          scheduleCardOverflowCheck(stepCard || e.target);
        }
        requestAnimationFrame(() => {
          syncVirtualWindow();
          syncMinimapPositions();
        });
      },
      true
    );
    els.feed.addEventListener("click", (e) => {
      if (e.target.closest(".show-more-btn, .raw-btn, .head-raw-btn, .dialog-expand-btn")) {
        requestAnimationFrame(scheduleMinimapSync);
      }
    });
  }

  function setActiveUserNotch(notch) {
    if (_lastActiveUserNotch === notch) return;
    if (_lastActiveUserNotch) _lastActiveUserNotch.classList.remove("active");
    _lastActiveUserNotch = notch || null;
    if (_lastActiveUserNotch) _lastActiveUserNotch.classList.add("active");
  }

  // Zero-DOM O(log N) binary-search highlight over cached coords; if scrollHeight changed while scrolling, resync only after scroll settles
  function updateActiveMinimapNotch(scrollTopArg, clientHArg, scrollHArg) {
    if (!els.promptMinimap) return;
    const scrollTop = scrollTopArg !== undefined ? scrollTopArg : els.feedWrap.scrollTop;
    const clientH = clientHArg !== undefined ? clientHArg : els.feedWrap.clientHeight;
    const scrollH = scrollHArg !== undefined ? scrollHArg : els.feedWrap.scrollHeight;
    const totalH = Math.max(1, scrollH);
    if (Math.abs(totalH - _lastMinimapTotalH) > 64) {
      scheduleMinimapSettledSync();
    }

    const coords = _userNotchCoords;
    if (!coords.length) {
      setActiveUserNotch(null);
      return;
    }

    const anchor = scrollTop + Math.min(clientH * 0.22, 160);
    const atBottom = scrollTop + clientH >= scrollH - 24;
    if (atBottom) {
      for (let i = coords.length - 1; i >= 0; i--) {
        if (coords[i].bottom > scrollTop && coords[i].top < scrollTop + clientH) {
          setActiveUserNotch(coords[i].notch);
          return;
        }
      }
    }

    let lo = 0;
    let hi = coords.length - 1;
    let best = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (coords[mid].top <= anchor) {
        best = coords[mid].notch;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    setActiveUserNotch(best);
  }

  function renderPromptMinimap() {
    if (!els.promptMinimap) return;
    userNotchByStep.clear();
    _lastActiveUserNotch = null;

    const baseTop = getVListBaseTop();
    const totalH = Math.max(1, baseTop + _vTotalHeight + 60);
    _lastMinimapTotalH = totalH;
    const nextUserCoords = [];
    const frag = document.createDocumentFragment();
    const showErrors = state.onlyCmdErrors || state.filter === "errors";
    const hasCmdSelection = Boolean(state.cmdMapKeys && state.cmdMapKeys.size > 0);

    for (const it of _vItems) {
      if (it.kind !== "step" || !it.step) continue;
      const st = it.step;
      const stepIdx = it.stepKey;
      const top = baseTop + it.offsetY;
      const pct = Math.min(99.2, Math.max(0.8, ((top + 12) / totalH) * 100));

      if (st.type === "USER_INPUT") {
        let previewText = "";
        let cachedMeta = minimapMetaCache.get(st);
        if (!cachedMeta) {
          if (st.content) {
            const reqText = parseUserInputEnvelope(st.content).req;
            const clean = unescapeNewlines(reqText !== null ? reqText : st.content)
              .replace(/<[^>]+>/g, " ")
              .trim();
            const cleanLines = clean.split("\n");
            previewText = cleanLines.slice(0, 3).join("\n").slice(0, 180);
            if (clean.length > 180 || cleanLines.length > 3) previewText += "…";
          }
          cachedMeta = { previewText };
          minimapMetaCache.set(st, cachedMeta);
        } else {
          previewText = cachedMeta.previewText;
        }
        const notch = document.createElement("button");
        notch.type = "button";
        notch.className = "minimap-notch";
        notch.style.top = `${pct.toFixed(2)}%`;
        notch.dataset.jump = stepIdx;
        notch.dataset.preview = previewText || t("minimap.userPromptFallback", { step: stepIdx });
        notch.dataset.meta = t("minimap.userPromptMeta", {
          step: stepIdx,
          time: st.created_at ? " · " + fmtStepTime(st.created_at) : "",
        });
        notchItemMap.set(notch, it);
        if (stepIdx) userNotchByStep.set(stepIdx, notch);
        nextUserCoords.push({ top, bottom: top + it.height, notch });
        frag.appendChild(notch);
      }

      if (st.type === "CHECKPOINT") {
        const cpNotch = document.createElement("button");
        cpNotch.type = "button";
        cpNotch.className = "minimap-notch-cp";
        cpNotch.textContent = "📦";
        cpNotch.style.top = `${pct.toFixed(2)}%`;
        cpNotch.dataset.jump = stepIdx;
        cpNotch.dataset.meta = t("minimap.checkpointMeta", {
          step: stepIdx,
          time: st.created_at ? " · " + fmtStepTime(st.created_at) : "",
        });
        cpNotch.dataset.preview = t("minimap.checkpointPreview");
        notchItemMap.set(cpNotch, it);
        frag.appendChild(cpNotch);
      }

      if (showErrors && it.hasErr) {
        let errPreview = t("minimap.errorPreviewDefault");
        if (st.error) {
          errPreview = unescapeNewlines(st.error).trim().slice(0, 140);
        } else if (Array.isArray(it.attached)) {
          const errOut = it.attached.find((g) => isCommandErrorStep(g));
          if (errOut) {
            errPreview = unescapeNewlines(errOut.error || errOut.content || t("minimap.errorPreviewDefault")).trim().slice(0, 140);
          }
        }
        const errNotch = document.createElement("button");
        errNotch.type = "button";
        errNotch.className = "minimap-notch-err";
        errNotch.textContent = "⚠";
        errNotch.style.top = `${pct.toFixed(2)}%`;
        errNotch.dataset.jump = stepIdx;
        errNotch.dataset.meta = t("minimap.errorMeta", { step: stepIdx });
        errNotch.dataset.preview = errPreview;
        notchItemMap.set(errNotch, it);
        frag.appendChild(errNotch);
      }

      if (hasCmdSelection) {
        const hits = getStepMatchingCmdKeys(st, it.attached);
        const attHits = it.attached ? it.attached.flatMap((g) => getStepMatchingCmdKeys(g, null)) : [];
        const allHits = Array.from(new Set([...hits, ...attHits]));
        if (allHits.length > 0) {
          const selNotch = document.createElement("button");
          selNotch.type = "button";
          selNotch.className = "minimap-notch-sel";
          selNotch.textContent = "★";
          selNotch.style.top = `${pct.toFixed(2)}%`;
          selNotch.dataset.jump = stepIdx;
          selNotch.dataset.meta = t("minimap.mapSelMeta", { hits: allHits.join(", "), step: stepIdx });
          let snippet = "";
          if (Array.isArray(st.tool_calls) && st.tool_calls.length) {
            snippet = st.tool_calls
              .map((tc) => `${tc.name}: ${summarizeToolArgs(tc.name, tc.args).text}`)
              .join("\n");
          } else {
            snippet = unescapeNewlines(st.content || st.error || "").trim();
          }
          selNotch.dataset.preview = snippet.slice(0, 180) || `${st.type} #${stepIdx}`;
          notchItemMap.set(selNotch, it);
          frag.appendChild(selNotch);
        }
      }

      if (state.stepQuery) {
        const qNotch = document.createElement("button");
        qNotch.type = "button";
        qNotch.className = "minimap-notch-search";
        qNotch.setAttribute("aria-label", t("minimap.searchAria", { step: stepIdx }));
        qNotch.style.top = `${pct.toFixed(2)}%`;
        qNotch.dataset.jump = stepIdx;
        qNotch.dataset.meta = t("minimap.searchMeta", {
          step: stepIdx,
          time: st.created_at ? " · " + fmtStepTime(st.created_at) : "",
        });
        qNotch.dataset.preview = extractPlainMatchSnippet(st, state.stepQuery, it.attached) || `${st.type} #${stepIdx}`;
        notchItemMap.set(qNotch, it);
        frag.appendChild(qNotch);
      }
    }

    _userNotchCoords = nextUserCoords;
    els.promptMinimap.innerHTML = "";
    els.promptMinimap.appendChild(frag);
    updateActiveMinimapNotch();
  }

  els.promptMinimap.addEventListener("click", (e) => {
    const notch = e.target.closest(
      ".minimap-notch, .minimap-notch-cp, .minimap-notch-err, .minimap-notch-sel, .minimap-notch-search"
    );
    if (!notch) return;
    clearHashStepIfScrolledAway();
    jumpToStep(notch.dataset.jump);
  });

  els.promptMinimap.addEventListener("mouseover", (e) => {
    const notch = e.target.closest(
      ".minimap-notch, .minimap-notch-cp, .minimap-notch-err, .minimap-notch-sel, .minimap-notch-search"
    );
    if (!notch) {
      els.minimapPreview.classList.add("hidden");
      els.promptMinimap.setAttribute("title", t("minimap.trackTitle"));
      return;
    }
    if (els.promptMinimap.hasAttribute("title")) {
      els.promptMinimap.removeAttribute("title");
    }
    const rect = notch.getBoundingClientRect();
    els.minimapPreview.innerHTML =
      `<div class="minimap-preview-meta">${escHtml(notch.dataset.meta || "")}</div>` +
      `<div>${escHtml(notch.dataset.preview || "")}</div>`;
    els.minimapPreview.style.top = `${Math.max(12, Math.min(window.innerHeight - 110, rect.top - 14))}px`;
    els.minimapPreview.classList.remove("hidden");
  });

  els.promptMinimap.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget || !els.promptMinimap.contains(e.relatedTarget)) {
      els.minimapPreview.classList.add("hidden");
      els.promptMinimap.setAttribute("title", t("minimap.trackTitle"));
    }
  });

  let _scrollUiRaf = 0;
  function updateScrollUiOnFrame() {
    _scrollUiRaf = 0;
    if (state.suppressScrollCheck) return;
    const scrollTop = els.feedWrap.scrollTop;
    const clientH = els.feedWrap.clientHeight;
    const scrollH = els.feedWrap.scrollHeight;

    const showTop = scrollTop > 200;
    if (showTop !== _lastShowTop) {
      _lastShowTop = showTop;
      els.jumpTopBtn.classList.toggle("hidden", !showTop);
    }

    const dist = scrollH - scrollTop - clientH;
    const showBottom = dist > 80;
    if (showBottom) {
      state.userScrolledUp = true;
      if (state.firstUnreadStepIndex !== null) {
        const unreadIt = _vStepToItemMap.get(String(state.firstUnreadStepIndex));
        if (!unreadIt) {
          state.firstUnreadStepIndex = null;
        } else if (!_activeJumpLock) {
          const viewBottomInList = Math.max(0, scrollTop - getVListBaseTop()) + clientH;
          if (viewBottomInList >= unreadIt.offsetY + Math.min(72, Math.max(24, unreadIt.height * 0.35))) {
            state.firstUnreadStepIndex = null;
          }
        }
      }
    } else {
      state.userScrolledUp = false;
      state.firstUnreadStepIndex = null;
    }
    _lastShowBottom = showBottom;
    syncJumpBottomButtonState(showBottom);

    syncVirtualWindow();
    updateActiveMinimapNotch(scrollTop, clientH, scrollH);
    if (_tocDirty && scrollTop < 500) {
      refreshTocNowIfNeeded();
    }
  }

  if (els.feedWrap) {
    const cancelAutoLocksOnUserInput = () => {
      _activeJumpLock = null;
      _activeAnchorLock = null;
      _pinBottomLockUntil = 0;
    };
    els.feedWrap.addEventListener("wheel", cancelAutoLocksOnUserInput, { passive: true });
    els.feedWrap.addEventListener("touchstart", cancelAutoLocksOnUserInput, { passive: true });
    els.feedWrap.addEventListener("mousedown", (e) => {
      cancelAutoLocksOnUserInput();
      if (e.target === els.feedWrap && (e.offsetX >= els.feedWrap.clientWidth || e.offsetY >= els.feedWrap.clientHeight)) {
        _scrollbarDragging = true;
        _suppressRoScrollCompUntil = Infinity;
        cancelPrewarmLru();
      }
    });
    const endScrollbarDrag = () => {
      if (!_scrollbarDragging) return;
      _scrollbarDragging = false;
      _suppressRoScrollCompUntil = performance.now() + 40;
      syncVirtualWindow({ upgradeSkeletons: true, settledDrag: true });
    };
    window.addEventListener("mouseup", endScrollbarDrag, { passive: true });
    window.addEventListener("pointerup", endScrollbarDrag, { passive: true });
    window.addEventListener("blur", endScrollbarDrag, { passive: true });
  }

  els.feedWrap.addEventListener(
    "scroll",
    () => {
      const matchesProgrammaticTop =
        (_activeJumpLock || _activeAnchorLock) &&
        Math.abs(els.feedWrap.scrollTop - _lastScrollFrameTop) <= 2;
      if (performance.now() >= _suppressScrollTsUntil && !matchesProgrammaticTop) {
        _lastUserScrollMs = Date.now();
        if (!_activeJumpLock && !_activeAnchorLock) {
          clearHashStepIfScrolledAway();
        }
        _activeJumpLock = null;
        _activeAnchorLock = null;
        _pinBottomLockUntil = 0;
      }
      if (state.suppressScrollCheck || _scrollUiRaf) return;
      _scrollUiRaf = requestAnimationFrame(updateScrollUiOnFrame);
    },
    { passive: true }
  );

  els.jumpTopBtn.addEventListener("click", () => {
    scrollToTop(false);
  });

  els.jumpBottomBtn.addEventListener("click", () => {
    if (state.firstUnreadStepIndex !== null) {
      const targetIdx = state.firstUnreadStepIndex;
      state.firstUnreadStepIndex = null;
      syncJumpBottomButtonState(_lastShowBottom);
      clearHashStepIfScrolledAway();
      jumpToStep(targetIdx, { topOffset: 4 });
      requestAnimationFrame(updateScrollUiOnFrame);
    } else {
      scrollToBottom();
    }
  });

  // File Viewer Choice Modal & Delegated Local Link / Copy Handling
  let _pendingFilePath = "";

  function makeApiFileUrl(localPath, extraQuery = "") {
    const convPart = state.activeId ? `&conv=${encodeURIComponent(state.activeId)}` : "";
    const rootPart = state.projectRoot ? `&root=${encodeURIComponent(state.projectRoot)}` : "";
    const langPart = `&lang=${encodeURIComponent(state.lang || "en")}`;
    return `/api/file?path=${encodeURIComponent(localPath)}${convPart}${rootPart}${langPart}${extraQuery}`;
  }

  async function executeFileOpen(localPath, mode) {
    if (!localPath) return;
    if (mode === "browser_fmt") {
      window.open(makeApiFileUrl(localPath, "&fmt=1"), "_blank", "noopener,noreferrer");
      return;
    }
    if (mode === "browser_raw") {
      window.open(makeApiFileUrl(localPath, "&raw=1"), "_blank", "noopener,noreferrer");
      return;
    }
    if (mode === "system" || mode === "notepadpp") {
      try {
        const res = await fetch("/api/open-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: localPath,
            mode,
            conv: state.activeId || "",
            root: state.projectRoot || "",
            lang: state.lang || "en",
          }),
        });
        const data = await res.json();
        if (!data.ok) alert(data.error || t("fileModal.openFileError"));
      } catch (err) {
        alert(err.message);
      }
    }
  }

  function openFileChoiceModal(localPath) {
    _pendingFilePath = localPath;
    const expanded = expandLocalTemplatePath(localPath);
    const fileName = expanded.split(/[/\\]/).filter(Boolean).pop() || expanded;
    els.fileOpenTitle.textContent = t("fileModal.titlePrefix", { name: fileName });
    els.fileOpenPathPreview.textContent = expanded;
    els.fileOpenRememberCheck.checked = false;
    els.fileOpenModal.classList.remove("hidden");
  }

  els.fileOpenCloseBtn.addEventListener("click", () => els.fileOpenModal.classList.add("hidden"));
  els.fileOpenModal.addEventListener("click", (e) => {
    if (e.target === els.fileOpenModal) {
      els.fileOpenModal.classList.add("hidden");
      return;
    }
    const choiceBtn = e.target.closest(".file-choice-btn");
    if (!choiceBtn || !_pendingFilePath) return;
    const mode = choiceBtn.dataset.fileMode;
    const targetPath = _pendingFilePath;
    if (els.fileOpenRememberCheck.checked && mode) {
      state.fileOpenMode = mode;
      try {
        localStorage.setItem("tv_file_mode", mode);
      } catch (_) {}
      const sel = document.getElementById("optFileOpenMode");
      const rst = document.getElementById("optFileOpenReset");
      if (sel) sel.value = mode;
      if (rst) rst.classList.remove("hidden");
    }
    els.fileOpenModal.classList.add("hidden");
    executeFileOpen(targetPath, mode);
  });

  els.fileOpenCopyPathBtn.addEventListener("click", () => {
    const txt = els.fileOpenPathPreview.textContent || _pendingFilePath;
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => {
      const orig = els.fileOpenCopyPathBtn.textContent;
      els.fileOpenCopyPathBtn.textContent = t("fileModal.copiedPath");
      setTimeout(() => (els.fileOpenCopyPathBtn.textContent = orig), 1200);
    });
  });

  async function handleLocalAnchorActivation(anchor, forceNewTabBrowser = false) {
    if (anchor.classList.contains("transcript-link")) {
      const cid = anchor.dataset.convId;
      if (cid) selectTranscript(cid);
      return;
    }
    const localPath = anchor.dataset.localPath || "";
    if (!localPath) return;

    if (anchor.dataset.isDir === "1") {
      if (state.folderOpenMode === "browser" || forceNewTabBrowser) {
        window.open(makeApiFileUrl(localPath), "_blank", "noopener,noreferrer");
        return;
      }
      try {
        const res = await fetch("/api/open-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: localPath,
            mode: state.folderOpenMode,
            conv: state.activeId || "",
            root: state.projectRoot || "",
            lang: state.lang || "en",
          }),
        });
        const data = await res.json();
        if (data.is_file && data.file_url) {
          window.open(data.file_url, "_blank", "noopener,noreferrer");
        } else if (!data.ok) {
          alert(data.error || t("fileModal.openFolderError"));
        }
      } catch (err) {
        alert(err.message);
      }
      return;
    }

    if (forceNewTabBrowser) {
      executeFileOpen(localPath, state.fileOpenMode === "browser_raw" ? "browser_raw" : "browser_fmt");
      return;
    }
    if (state.fileOpenMode && state.fileOpenMode !== "ask") {
      executeFileOpen(localPath, state.fileOpenMode);
    } else {
      openFileChoiceModal(localPath);
    }
  }

  // Event delegation for local file/folder/transcript links across feed + topbar meta, plus Copy buttons
  document.addEventListener("click", (e) => {
    const taskJump = e.target.closest("[data-jump-step]");
    if (taskJump && els.feed.contains(taskJump) && e.button === 0 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const jumpStep = taskJump.dataset.jumpStep;
      const toolOutStep = taskJump.dataset.jumpToolOut || null;
      clearHashStepIfScrolledAway();
      jumpToStep(jumpStep, { topOffset: 4, toolOutStep });
      return;
    }

    const stepChip = e.target.closest(".step-num-chip[data-copy-step]");
    if (stepChip && els.feed.contains(stepChip)) {
      e.preventDefault();
      e.stopPropagation();
      const stepIdx = stepChip.dataset.copyStep;
      const shareUrl = buildStepShareUrl(stepIdx);
      const origText = stepChip.dataset.origLabel || stepChip.textContent;
      stepChip.dataset.origLabel = origText;
      navigator.clipboard?.writeText(shareUrl).then(() => {
        stepChip.classList.add("copied");
        stepChip.textContent = `✓ #${stepIdx}`;
        clearTimeout(Number(stepChip.dataset.copyTimer || 0));
        const tid = setTimeout(() => {
          stepChip.classList.remove("copied");
          stepChip.textContent = origText;
        }, 1200);
        stepChip.dataset.copyTimer = String(tid);
      }).catch(() => {});
      return;
    }

    const link = e.target.closest("a.transcript-link, a.local-path-link");
    if (link && (els.feed.contains(link) || els.convMeta.contains(link))) {
      if (e.button === 0) {
        e.preventDefault();
        handleLocalAnchorActivation(link, Boolean(e.ctrlKey || e.metaKey));
      }
      return;
    }

    const btn = e.target.closest(".copy-btn");
    if (!btn || !els.feed.contains(btn)) return;
    const preEl = btn.closest("pre");
    const code = preEl ? preEl.querySelector("code") : btn.parentElement.querySelector("code");
    if (!code) return;
    const mode = btn.dataset.copyMode || "exact";
    const textToCopy = formatShellForCopy(code.textContent, mode);
    const origLabel = btn.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
      btn.textContent = "✓";
      setTimeout(() => (btn.textContent = origLabel), 1200);
    });
  });

  document.addEventListener("auxclick", (e) => {
    if (e.button !== 1) return;
    const link = e.target.closest("a.transcript-link, a.local-path-link");
    if (link && (els.feed.contains(link) || els.convMeta.contains(link))) {
      e.preventDefault();
      handleLocalAnchorActivation(link, true);
    }
  });

  // Collapsible Sidebar, Header & Composer
  function syncFloatingButtons() {
    const sbCollapsed = els.appRoot.classList.contains("sidebar-collapsed");
    const hdrCollapsed = els.appRoot.classList.contains("header-collapsed");
    els.expandSidebarBtn.classList.toggle("hidden", !sbCollapsed);
    els.floatingTopBar.classList.toggle("hidden", !hdrCollapsed);
    els.floatingSidebarBtn.classList.toggle("hidden", !(sbCollapsed && hdrCollapsed));
  }

  function applySidebarCollapsed(collapsed) {
    els.appRoot.classList.toggle("sidebar-collapsed", collapsed);
    syncFloatingButtons();
    try {
      localStorage.setItem("tv_sidebar_collapsed", collapsed ? "1" : "0");
    } catch (_) {}
  }

  function applyHeaderCollapsed(collapsed) {
    els.appRoot.classList.toggle("header-collapsed", collapsed);
    syncFloatingButtons();
    try {
      localStorage.setItem("tv_header_collapsed", collapsed ? "1" : "0");
    } catch (_) {}
  }

  function applyComposerCollapsed(collapsed) {
    els.appRoot.classList.toggle("composer-collapsed", collapsed);
    els.expandComposerBtn.classList.toggle("hidden", !collapsed);
    try {
      localStorage.setItem("tv_composer_collapsed", collapsed ? "1" : "0");
    } catch (_) {}
  }

  els.collapseSidebarBtn.addEventListener("click", () => applySidebarCollapsed(true));
  els.expandSidebarBtn.addEventListener("click", () => applySidebarCollapsed(false));
  els.floatingSidebarBtn.addEventListener("click", () => applySidebarCollapsed(false));
  els.collapseHeaderBtn.addEventListener("click", () => applyHeaderCollapsed(true));
  els.expandHeaderBtn.addEventListener("click", () => applyHeaderCollapsed(false));
  els.collapseComposerBtn.addEventListener("click", () => applyComposerCollapsed(true));
  els.expandComposerBtn.addEventListener("click", () => {
    applyComposerCollapsed(false);
    els.promptInput.focus();
  });

  els.lightbox.addEventListener("click", () => {
    els.lightbox.classList.add("hidden");
    els.lightboxImg.src = "";
  });

  // ---------- Theme Toggle (Day / Night) ----------
  function applyTheme(theme) {
    if (theme === "day") {
      document.documentElement.setAttribute("data-theme", "day");
      els.themeToggle.textContent = t("topbar.themeNightLabel");
    } else {
      document.documentElement.removeAttribute("data-theme");
      els.themeToggle.textContent = t("topbar.themeDayLabel");
    }
    try {
      localStorage.setItem("tv_theme", theme);
    } catch (_) {}
  }

  els.themeToggle.addEventListener("click", () => {
    const isDay = document.documentElement.getAttribute("data-theme") === "day";
    applyTheme(isDay ? "night" : "day");
  });

  // ---------- Inline Raw JSON Toggle (replaces card body in-place, no popups!) ----------
  function toggleInlineRaw(card, step, rawBtn) {
    if (!card || !step) return;
    preserveScrollAnchor(() => {
      const bodyEl = card.querySelector(".step-body");
      const existingRaw = card.querySelector(".inline-raw-pre");
      if (existingRaw) {
        existingRaw.remove();
        if (bodyEl) bodyEl.classList.remove("hidden");
        if (rawBtn) rawBtn.classList.remove("active");
      } else {
        if (bodyEl) bodyEl.classList.add("hidden");
        const pre = document.createElement("pre");
        pre.className = "inline-raw-pre inner-scroll";
        attachInnerScrollGuard(pre);
        pre.textContent = JSON.stringify(step);
        card.appendChild(pre);
        if (rawBtn) rawBtn.classList.add("active");
      }
    }, rawBtn || card);
  }

  els.feed.addEventListener("contextmenu", (e) => {
    if (!e.shiftKey) return; // Native browser context menu remains untouched!
    const card = e.target.closest("article.step");
    if (!card) return;
    const step = rawStepMap.get(card);
    if (!step) return;
    e.preventDefault();
    toggleInlineRaw(card, step, card.querySelector(".raw-btn"));
  });

  // Localized focus-gated mouse wheel scrolling: inner boxes attach attachInnerScrollGuard() individually
  // so main #feedWrap keeps native compositor-thread smooth scrolling everywhere else.
  const INNER_SCROLL_SEL =
    ".inner-scroll, .tool-args, .read-scroll-box, .generic-pre, .inline-raw-pre, .toc-wrap";

  if (els.feed && els.feedWrap) {
    // Clicking empty/non-interactive feed space returns focus to #feedWrap (deactivating inner scroll)
    els.feedWrap.addEventListener("click", (e) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      if (e.target.closest(`${INNER_SCROLL_SEL}, a, button, input, select, textarea, summary, label`)) return;
      els.feedWrap.focus({ preventScroll: true });
    });
  }

  let isTooltipVisible = false;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modalWasOpen =
        !els.lightbox.classList.contains("hidden") ||
        !els.cmdMapModal.classList.contains("hidden") ||
        !els.fileOpenModal.classList.contains("hidden") ||
        isSearchPopoverOpen();
      els.lightbox.classList.add("hidden");
      isTooltipVisible = false;
      els.tooltip.classList.add("hidden");
      els.cmdMapModal.classList.add("hidden");
      els.fileOpenModal.classList.add("hidden");
      closeSearchPopover();
      if (!modalWasOpen && document.activeElement && document.activeElement.closest(INNER_SCROLL_SEL)) {
        if (els.feedWrap) els.feedWrap.focus({ preventScroll: true });
      }
      return;
    }

    const activeEl = document.activeElement;
    const tag = activeEl?.tagName || "";
    const inEditable = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || activeEl?.isContentEditable;
    const modalOpen =
      !els.cmdMapModal.classList.contains("hidden") ||
      !els.fileOpenModal.classList.contains("hidden") ||
      !els.lightbox.classList.contains("hidden");
    const isSlashShortcut =
      e.key === "/" && !e.ctrlKey && !e.altKey && !e.metaKey && !inEditable;
    const isCtrlDotShortcut =
      e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.shiftKey &&
      (e.key === "." || e.key === "/" || e.code === "Slash");
    if (!modalOpen && (isSlashShortcut || isCtrlDotShortcut)) {
      e.preventDefault();
      if (els.appRoot.classList.contains("header-collapsed")) {
        applyHeaderCollapsed(false);
      }
      els.stepSearch.focus();
      return;
    }

    // Reliable PgDn / PgUp / Home / End routing to #feedWrap even if focus sits on a toolbar/sidebar button
    if (
      !inEditable &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      (e.key === "PageDown" || e.key === "PageUp" || e.key === "Home" || e.key === "End")
    ) {
      if (modalOpen) return;
      if (activeEl && activeEl.closest(`.sidebar, ${INNER_SCROLL_SEL}`)) {
        return;
      }
      e.preventDefault();
      _activeJumpLock = null;
      _activeAnchorLock = null;
      _pinBottomLockUntil = 0;
      _lastUserScrollMs = Date.now();
      const fw = els.feedWrap;
      const stepPx = Math.max(160, Math.round(fw.clientHeight * 0.88));
      if (e.key === "PageDown") fw.scrollTop += stepPx;
      else if (e.key === "PageUp") fw.scrollTop = Math.max(0, fw.scrollTop - stepPx);
      else if (e.key === "Home") fw.scrollTop = 0;
      else if (e.key === "End") fw.scrollTop = fw.scrollHeight;
    }
  });

  els.jumpMapBtn.addEventListener("click", () => {
    scrollToTop(true);
  });

  // ---------- Delayed Rich Tooltip (1.2s hover) ----------
  let activeTipTarget = null;
  let hoverTimer = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function positionTooltip(x, y) {
    const pad = 12;
    const rect = els.tooltip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 16;
    if (left + rect.width + pad > window.innerWidth) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height + pad > window.innerHeight) {
      top = Math.max(pad, y - rect.height - 12);
    }
    els.tooltip.style.left = `${left}px`;
    els.tooltip.style.top = `${top}px`;
  }

  document.addEventListener(
    "mouseover",
    (e) => {
      const el = e.target.closest("[data-tip-title]");
      if (!el || el === activeTipTarget) return;
      clearTimeout(hoverTimer);
      isTooltipVisible = false;
      els.tooltip.classList.add("hidden");
      activeTipTarget = el;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      const rawDelay = el.dataset.tipDelay;
      const tipDelay = rawDelay !== undefined && rawDelay !== "" ? Math.max(0, Number(rawDelay)) : 1200;

      hoverTimer = setTimeout(() => {
        if (activeTipTarget !== el) return;
        const title = el.dataset.tipTitle || "";
        const desc = el.dataset.tipDesc || "";
        const raw = el.dataset.tipRaw || "";
        const rawLabel = el.dataset.tipRawLabel !== undefined ? el.dataset.tipRawLabel : t("card.rawTipLabel");
        const rawPrefix = rawLabel ? `${escHtml(rawLabel)} ` : "";
        els.tooltip.innerHTML =
          `<div class="tooltip-title">${escHtml(title)}</div>` +
          (desc ? `<div class="tooltip-desc">${escHtml(desc).replace(/\n/g, "<br>")}</div>` : "") +
          (raw ? `<div class="tooltip-raw">${rawPrefix}${escHtml(raw)}</div>` : "");
        isTooltipVisible = true;
        els.tooltip.classList.remove("hidden");
        positionTooltip(lastMouseX, lastMouseY);
      }, Number.isFinite(tipDelay) ? tipDelay : 1200);
    },
    { passive: true }
  );

  document.addEventListener(
    "mousemove",
    (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      if (isTooltipVisible && activeTipTarget) {
        positionTooltip(e.clientX, e.clientY);
      }
    },
    { passive: true }
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!activeTipTarget) return;
      if (!e.relatedTarget || !activeTipTarget.contains(e.relatedTarget)) {
        clearTimeout(hoverTimer);
        activeTipTarget = null;
        isTooltipVisible = false;
        els.tooltip.classList.add("hidden");
      }
    },
    { passive: true }
  );

  // ---------- Command Map Modal (Statistics & Minimap/Feed Filter) ----------
  function updateCmdMapButtonLabel() {
    const n = state.cmdMapKeys.size;
    els.openCmdMapBtn.textContent = n > 0 ? t("toolbar.cmdMapCount", { count: n }) : t("toolbar.cmdMap");
  }

  function buildCommandMapStats() {
    const { attachedByPlanner } = pairToolOutputs(state.steps);
    const typeCounts = new Map();
    const statusCounts = new Map();
    const toolStats = new Map(); // name -> { total, ok, err, files: Set }
    let subFinal = 0;
    let subThinking = 0;
    let subMedia = 0;
    let subErrors = 0;
    let totalTools = 0;

    for (const s of state.steps) {
      typeCounts.set(s.type || "UNKNOWN", (typeCounts.get(s.type || "UNKNOWN") || 0) + 1);
      if (s.status) statusCounts.set(s.status, (statusCounts.get(s.status) || 0) + 1);
      if (isCommandErrorStep(s)) subErrors++;
      if (s.thinking) subThinking++;
      if (Array.isArray(s.media) && s.media.length > 0) subMedia++;
      if (
        s.type === "PLANNER_RESPONSE" &&
        s.content &&
        (!Array.isArray(s.tool_calls) || s.tool_calls.length === 0)
      ) {
        subFinal++;
      }

      if (Array.isArray(s.tool_calls)) {
        const attached = attachedByPlanner.get(s) || [];
        s.tool_calls.forEach((tc, idx) => {
          totalTools++;
          const name = tc.name || "tool";
          if (!toolStats.has(name)) {
            toolStats.set(name, { total: 0, ok: 0, err: 0, files: new Set() });
          }
          const st = toolStats.get(name);
          st.total++;
          const out = attached[idx];
          if (out) {
            if (isCommandErrorStep(out)) st.err++;
            else if (out.status === "DONE") st.ok++;
          }
          const args = tc.args || {};
          const fpath = args.Path || args.TargetFile || args.DirectoryPath;
          if (fpath) st.files.add(String(fpath).split(/[/\\]/).pop());
        });
      }
    }
    return { typeCounts, statusCounts, toolStats, subFinal, subThinking, subMedia, subErrors, totalTools };
  }

  function applyCmdMapSelectionChange() {
    updateCmdMapButtonLabel();
    if (state.cmdMapFilterOnly) {
      renderFullFeed();
    } else {
      scheduleMinimapRender();
    }
  }

  function renderCommandMapModal() {
    const stats = buildCommandMapStats();
    const allSelectableKeys = [];
    const chk = (key) => {
      allSelectableKeys.push(key);
      return state.cmdMapKeys.has(key) ? "checked" : "";
    };

    const totIn = state.totals.inTok + state.totals.cacheTok;
    const hitPct = totIn > 0 ? ((state.totals.cacheTok / totIn) * 100).toFixed(1) : "0.0";

    const toolsSorted = Array.from(stats.toolStats.entries()).sort((a, b) => b[1].total - a[1].total);
    const toolsHtml = toolsSorted
      .map(([name, info]) => {
        const filesList = Array.from(info.files).slice(0, 6).join(", ");
        return `
          <div class="cmd-group-card">
            <div class="cmd-group-head">
              <label class="cmd-check-label">
                <input type="checkbox" data-cmd-key="tool:${escHtml(name)}" ${chk(`tool:${name}`)}>
                <span>${escHtml(name)}</span>
              </label>
              <span class="meta-chip">${escHtml(t("cmdMap.callsChip", { count: info.total }))}</span>
            </div>
            <div class="cmd-sub-row">
              <label class="cmd-sub-check is-ok">
                <input type="checkbox" data-cmd-key="tool:${escHtml(name)}:ok" ${chk(`tool:${name}:ok`)}>
                <span>${escHtml(t("cmdMap.okCount", { count: info.ok }))}</span>
              </label>
              <label class="cmd-sub-check is-err">
                <input type="checkbox" data-cmd-key="tool:${escHtml(name)}:err" ${chk(`tool:${name}:err`)}>
                <span>${escHtml(t("cmdMap.errCount", { count: info.err }))}</span>
              </label>
            </div>
            ${filesList ? `<div class="cmd-files-note" title="${escHtml(filesList)}">${escHtml(t("cmdMap.filesLabel", { files: filesList }))}</div>` : ""}
          </div>
        `;
      })
      .join("");

    const typesHtml = Array.from(stats.typeCounts.entries())
      .map(
        ([tName, cnt]) => `
        <label class="cmd-sub-check">
          <input type="checkbox" data-cmd-key="type:${escHtml(tName)}" ${chk(`type:${tName}`)}>
          <span>${escHtml(tName)}: ${cnt}</span>
        </label>
      `
      )
      .join("");

    const statusesHtml = Array.from(stats.statusCounts.entries())
      .map(
        ([st, cnt]) => `
        <label class="cmd-sub-check">
          <input type="checkbox" data-cmd-key="status:${escHtml(st)}" ${chk(`status:${st}`)}>
          <span>status=${escHtml(st)}: ${cnt}</span>
        </label>
      `
      )
      .join("");

    const subtypesHtml = `
      <label class="cmd-sub-check"><input type="checkbox" data-cmd-key="sub:final" ${chk("sub:final")}><span>${escHtml(t("cmdMap.subFinal", { count: stats.subFinal }))}</span></label>
      <label class="cmd-sub-check"><input type="checkbox" data-cmd-key="sub:thinking" ${chk("sub:thinking")}><span>${escHtml(t("cmdMap.subThinking", { count: stats.subThinking }))}</span></label>
      <label class="cmd-sub-check"><input type="checkbox" data-cmd-key="sub:media" ${chk("sub:media")}><span>${escHtml(t("cmdMap.subMedia", { count: stats.subMedia }))}</span></label>
      <label class="cmd-sub-check is-err"><input type="checkbox" data-cmd-key="sub:errors" ${chk("sub:errors")}><span>${escHtml(t("cmdMap.subErrors", { count: stats.subErrors }))}</span></label>
    `;

    els.cmdMapBody.dataset.allKeys = JSON.stringify(allSelectableKeys);
    els.cmdMapBody.innerHTML = `
      <div class="cmd-map-summary">
        <span>${t("cmdMap.totalSteps", { count: state.steps.length })}</span>
        <span>${t("cmdMap.totalTools", { total: stats.totalTools, kinds: toolsSorted.length })}</span>
        <span>${t("cmdMap.totalErrors", { count: stats.subErrors })}</span>
        <span>${t("cmdMap.totalTokens", {
          inTok: fmtNum(state.totals.inTok),
          cacheTok: fmtNum(state.totals.cacheTok),
          hitPct,
          outTok: fmtNum(state.totals.outTok),
        })}</span>
      </div>
      <div>
        <h4 class="cmd-map-section-title">${escHtml(t("cmdMap.sectionTypes"))}</h4>
        <div class="cmd-sub-row" style="padding-left:0;">${typesHtml}${statusesHtml}${subtypesHtml}</div>
      </div>
      <div>
        <h4 class="cmd-map-section-title">${escHtml(t("cmdMap.sectionTools"))}</h4>
        <div class="cmd-map-grid">${toolsHtml || `<div class="empty-hint">${escHtml(t("cmdMap.noToolsYet"))}</div>`}</div>
      </div>
    `;
  }

  els.openCmdMapBtn.addEventListener("click", () => {
    renderCommandMapModal();
    els.cmdMapFilterOnly.checked = state.cmdMapFilterOnly;
    els.cmdMapModal.classList.remove("hidden");
  });

  els.cmdMapClose.addEventListener("click", () => els.cmdMapModal.classList.add("hidden"));
  els.cmdMapModal.addEventListener("click", (e) => {
    if (e.target === els.cmdMapModal) els.cmdMapModal.classList.add("hidden");
  });

  els.cmdMapBody.addEventListener("change", (e) => {
    const inp = e.target.closest("input[data-cmd-key]");
    if (!inp) return;
    const key = inp.dataset.cmdKey;
    if (inp.checked) state.cmdMapKeys.add(key);
    else state.cmdMapKeys.delete(key);
    applyCmdMapSelectionChange();
  });

  els.cmdMapFilterOnly.addEventListener("change", (e) => {
    state.cmdMapFilterOnly = e.target.checked;
    renderFullFeed();
  });

  els.cmdMapSelectAll.addEventListener("click", () => {
    try {
      const keys = JSON.parse(els.cmdMapBody.dataset.allKeys || "[]");
      keys.forEach((k) => state.cmdMapKeys.add(k));
    } catch (_) {}
    renderCommandMapModal();
    applyCmdMapSelectionChange();
  });

  els.cmdMapClear.addEventListener("click", () => {
    state.cmdMapKeys.clear();
    state.cmdMapFilterOnly = false;
    els.cmdMapFilterOnly.checked = false;
    renderCommandMapModal();
    renderFullFeed();
    updateCmdMapButtonLabel();
  });

  // ---------- Prompt Composer (Windows: paste into Antigravity.exe; Linux/macOS: clipboard mode) ----------
  let _agWindowPollTimer = 0;
  let _copiedResetTimer = 0;

  function applyCapabilitiesUI() {
    const caps = state.capabilities || {};
    const isWin = caps.is_windows !== false;
    const canPaste = caps.antigravity_paste !== false;

    if (!isWin && (state.folderOpenMode === "explorer" || state.folderOpenMode === "totalcmd")) {
      state.folderOpenMode = "browser";
      try {
        localStorage.setItem("tv_folder_mode", "browser");
      } catch (_) {}
      const sel = document.getElementById("optFolderOpenMode");
      if (sel) sel.value = "browser";
    }
    if (els.fileOpenSystemChoice) {
      els.fileOpenSystemChoice.classList.toggle("hidden", caps.open_file_os === false);
    }
    if (els.fileOpenNotepadChoice) {
      els.fileOpenNotepadChoice.classList.toggle("hidden", caps.open_notepadpp === false);
    }
    if (caps.open_notepadpp === false && state.fileOpenMode === "notepadpp") {
      state.fileOpenMode = "ask";
      try {
        localStorage.setItem("tv_file_mode", "ask");
      } catch (_) {}
      const sel = document.getElementById("optFileOpenMode");
      if (sel) sel.value = "ask";
    }

    if (!canPaste) {
      if (_agWindowPollTimer) {
        clearInterval(_agWindowPollTimer);
        _agWindowPollTimer = 0;
      }
      setComposerStatus("clipboard_only");
      if (els.composerSendBtn) {
        els.composerSendBtn.textContent = t("composer.sendBtnPosix");
        els.composerSendBtn.title = t("composer.sendBtnPosixTitle");
      }
      if (els.promptInput) {
        els.promptInput.placeholder = t("composer.placeholderPosix");
      }
    } else {
      if (els.composerSendBtn) {
        els.composerSendBtn.textContent = t("composer.sendBtnWin");
        els.composerSendBtn.title = t("composer.sendBtnWinTitle");
      }
      if (els.promptInput) {
        els.promptInput.placeholder = t("composer.placeholderWin");
      }
      if (!_agWindowPollTimer) {
        _agWindowPollTimer = setInterval(checkAntigravityWindow, 10000);
      }
    }
  }

  let _lastComposerStatusMode = "";
  let _lastComposerWindowTitle = "";
  function setComposerStatus(mode, windowTitle = "") {
    _lastComposerStatusMode = mode;
    _lastComposerWindowTitle = windowTitle;
    if (mode === "clipboard_only") {
      els.composerStatus.textContent = t("composer.clipboardModeLabel");
      els.composerStatus.dataset.tipTitle = t("composer.clipboardModeTitle");
      els.composerStatus.dataset.tipDesc = t("composer.clipboardModeDesc");
      els.composerStatus.dataset.tipRaw = `os: ${state.capabilities?.os || "posix"}, antigravity_paste: false`;
    } else if (mode === "copied") {
      els.composerStatus.textContent = t("composer.copiedLabel");
      els.composerStatus.dataset.tipTitle = t("composer.copiedTitle");
      els.composerStatus.dataset.tipDesc = t("composer.copiedDesc");
      els.composerStatus.dataset.tipRaw = "status: copied";
      clearTimeout(_copiedResetTimer);
      _copiedResetTimer = setTimeout(() => {
        if (state.capabilities && state.capabilities.antigravity_paste === false) {
          setComposerStatus("clipboard_only");
        }
      }, 2200);
    } else if (mode === "found") {
      els.composerStatus.textContent = t("composer.agFoundLabel", { title: windowTitle });
      els.composerStatus.dataset.tipTitle = t("composer.agFoundTitle");
      els.composerStatus.dataset.tipDesc = t("composer.agFoundDesc");
      els.composerStatus.dataset.tipRaw = t("composer.agFoundRaw", { title: windowTitle });
    } else if (mode === "not_found") {
      els.composerStatus.textContent = t("composer.agNotFoundLabel");
      els.composerStatus.dataset.tipTitle = t("composer.agNotFoundTitle");
      els.composerStatus.dataset.tipDesc = t("composer.agNotFoundDesc");
      els.composerStatus.dataset.tipRaw = "found: false";
    } else if (mode === "sending") {
      els.composerStatus.textContent = t("composer.agSendingLabel");
      els.composerStatus.dataset.tipTitle = t("composer.agSendingTitle");
      els.composerStatus.dataset.tipDesc = t("composer.agSendingDesc");
      els.composerStatus.dataset.tipRaw = "sending...";
    } else if (mode === "pasted") {
      els.composerStatus.textContent = t("composer.agPastedLabel");
      els.composerStatus.dataset.tipTitle = t("composer.agPastedTitle");
      els.composerStatus.dataset.tipDesc = t("composer.agPastedDesc");
      els.composerStatus.dataset.tipRaw = "status: pasted";
    } else {
      els.composerStatus.textContent = `⚠ ${windowTitle}`;
      els.composerStatus.dataset.tipTitle = t("composer.agErrorTitle");
      els.composerStatus.dataset.tipDesc = t("composer.agErrorDesc", { msg: windowTitle });
      els.composerStatus.dataset.tipRaw = windowTitle;
    }
  }

  async function checkAntigravityWindow() {
    if (state.capabilities && state.capabilities.antigravity_paste === false) return;
    try {
      const qs = new URLSearchParams();
      if (state.activeMeta?.project) qs.set("project", state.activeMeta.project);
      if (state.activeMeta?.title) qs.set("title", state.activeMeta.title);
      const res = await fetch(`/api/antigravity-window?${qs.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.supported === false) {
        state.capabilities.antigravity_paste = false;
        applyCapabilitiesUI();
        return;
      }
      setComposerStatus(data.found ? "found" : "not_found", data.title || "");
    } catch (_) {}
  }

  async function submitToAntigravity() {
    const text = els.promptInput.value;
    if (!text.trim()) return;
    if (state.capabilities && state.capabilities.antigravity_paste === false) {
      try {
        await navigator.clipboard.writeText(text);
        els.promptInput.value = "";
        setComposerStatus("copied");
      } catch (err) {
        setComposerStatus("error", err?.message || t("composer.clipboardUnavailable"));
      }
      return;
    }
    setComposerStatus("sending");
    try {
      const res = await fetch("/api/send-to-antigravity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          project: state.activeMeta?.project || "",
          title: state.activeMeta?.title || "",
          lang: state.lang || "en",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        els.promptInput.value = "";
        setComposerStatus("pasted");
      } else {
        try { await navigator.clipboard.writeText(text); } catch (_) {}
        setComposerStatus("error", t("composer.copiedErrorSuffix", { msg: data.info || data.error || t("topbar.liveError") }));
      }
    } catch (err) {
      setComposerStatus("error", err.message);
    }
  }

  els.promptInput.addEventListener("input", () => {
    _lastComposerTypeMs = Date.now();
  });
  els.promptInput.addEventListener("blur", flushPendingSseSteps);

  els.promptInput.addEventListener("keydown", (e) => {
    _lastComposerTypeMs = Date.now();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitToAntigravity();
    }
  });

  els.composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitToAntigravity();
  });

  // Smooth vertical drag-resizer for composer input height (persisted in localStorage)
  if (els.composerResizer) {
    let dragging = false;
    let startY = 0;
    let startH = 72;
    els.composerResizer.addEventListener("mousedown", (e) => {
      dragging = true;
      startY = e.clientY;
      startH = els.promptInput.getBoundingClientRect().height;
      els.composerResizer.classList.add("dragging");
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const newH = Math.max(46, Math.min(360, Math.round(startH + (startY - e.clientY))));
      els.promptInput.style.height = `${newH}px`;
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      els.composerResizer.classList.remove("dragging");
      try {
        localStorage.setItem("tv_composer_height", els.promptInput.style.height);
      } catch (_) {}
    });
  }

  async function setLanguage(lang) {
    await loadLocale(lang);
    applyStaticTranslations();
    syncJumpBottomButtonState(_lastShowBottom);
    applyTheme(document.documentElement.getAttribute("data-theme") === "day" ? "day" : "night");
    applyCapabilitiesUI();
    if (_lastComposerStatusMode) {
      setComposerStatus(_lastComposerStatusMode, _lastComposerWindowTitle);
    }
    renderSearchPopover();
    updateCmdMapButtonLabel();
    _tocBaseCache = null;
    stepSearchBlobCache = new WeakMap();
    stepSearchUnitsCache = new WeakMap();
    minimapMetaCache = new WeakMap();
    invalidateCardRenderCache();
    if (state.transcripts.length > 0) {
      updateProjectDropdown();
      renderTranscriptList();
    }
    if (state.steps.length > 0) {
      buildStepMetadataAndTaskIndex(state.steps);
      const anchor = state.userScrolledUp ? captureSearchContextAnchor() : null;
      renderFullFeed({ skipWindowSync: Boolean(anchor && anchor.stepIndex) });
      if (anchor && anchor.stepIndex) {
        if (_vStepToItemMap.has(String(anchor.stepIndex))) {
          jumpToStep(anchor.stepIndex, {
            topOffset: anchor.topInWrap,
            toolOutStep: anchor.toolOutStep,
            toolIdx: anchor.toolIdx,
            subAnchor: anchor.subAnchor,
            resetFiltersOnMissing: false,
          });
          requestAnimationFrame(updateScrollUiOnFrame);
        } else {
          syncVirtualWindow({ forceRender: true });
          updateScrollUiOnFrame();
        }
      }
      if (!els.cmdMapModal.classList.contains("hidden")) {
        renderCommandMapModal();
      }
    }
    if (els.livePill?.classList.contains("connected")) {
      setLiveStatus("connected", "Live");
    } else if (els.livePill?.classList.contains("error")) {
      setLiveStatus("error", t("topbar.liveReconnecting"));
    }
  }

  // ---------- Init ----------
  (async () => {
    let savedLang = "en";
    let savedTheme = "night";
    let savedCollapsed = false;
    let savedHeaderCollapsed = false;
    let savedComposerCollapsed = false;
    let savedComposerHeight = "";
    let savedFolderMode = "browser";
    let savedFileMode = "ask";
    let savedReadMode = "scroll";
    let savedLinkifyShort = true;
    let savedDisableAutoLinks = false;
    let savedSearchFocused = true;
    let savedSearchWholeTurn = false;
    let savedSearchWholeWord = false;
    let savedSearchCase = false;
    try {
      const lsLang = localStorage.getItem("tv_lang");
      if (lsLang === "ru" || lsLang === "en") savedLang = lsLang;
      savedTheme = localStorage.getItem("tv_theme") || "night";
      savedCollapsed = localStorage.getItem("tv_sidebar_collapsed") === "1";
      savedHeaderCollapsed = localStorage.getItem("tv_header_collapsed") === "1";
      savedComposerCollapsed = localStorage.getItem("tv_composer_collapsed") === "1";
      savedComposerHeight = localStorage.getItem("tv_composer_height") || "";
      savedFolderMode = localStorage.getItem("tv_folder_mode") || "browser";
      savedFileMode = localStorage.getItem("tv_file_mode") || "ask";
      savedReadMode = localStorage.getItem("tv_read_mode") || "scroll";
      const lsShort = localStorage.getItem("tv_linkify_short");
      savedLinkifyShort = lsShort === null ? true : lsShort === "1";
      savedDisableAutoLinks = localStorage.getItem("tv_disable_auto_links") === "1";
      const lsFocused = localStorage.getItem("tv_search_focused");
      savedSearchFocused = lsFocused === null ? true : lsFocused === "1";
      savedSearchWholeTurn = localStorage.getItem("tv_search_whole_turn") === "1";
      savedSearchWholeWord = localStorage.getItem("tv_search_whole_word") === "1";
      savedSearchCase = localStorage.getItem("tv_search_case") === "1";
    } catch (_) {}
    state.folderOpenMode = savedFolderMode;
    state.fileOpenMode = savedFileMode;
    state.readDisplayMode = ["scroll", "full", "hide"].includes(savedReadMode) ? savedReadMode : "scroll";
    state.linkifyProjectFiles = savedLinkifyShort;
    state.disableAutoLinks = savedDisableAutoLinks;
    state.searchFocusedOnly = savedSearchFocused;
    state.searchAcrossWholeTurn = savedSearchWholeTurn;
    state.searchWholeWord = savedSearchWholeWord;
    state.searchCaseSensitive = savedSearchCase;
    await loadLocale(savedLang);
    applyStaticTranslations();
    renderSearchPopover();
    updateCmdMapButtonLabel();
    applyTheme(savedTheme);
    applySidebarCollapsed(savedCollapsed);
    applyHeaderCollapsed(savedHeaderCollapsed);
    applyComposerCollapsed(savedComposerCollapsed);
    if (savedComposerHeight) els.promptInput.style.height = savedComposerHeight;
    await loadTranscriptList();
    checkAntigravityWindow();
    const initialNav = parseHashNavigation(window.location.hash);
    if (initialNav.convId) {
      selectTranscript(initialNav.convId, { targetStep: initialNav.targetStep });
    } else if (state.transcripts.length > 0) {
      selectTranscript(state.transcripts[0].id);
    }
    window.addEventListener("hashchange", () => {
      if (_suppressHashChange) return;
      const nav = parseHashNavigation(window.location.hash);
      if (!nav.convId) return;
      if (nav.convId !== state.activeId) {
        selectTranscript(nav.convId, { targetStep: nav.targetStep });
      } else if (state.steps.length === 0 || !document.getElementById("cacheMapCard")) {
        _pendingNavStep = nav.targetStep || "";
      } else if (nav.targetStep) {
        state.userScrolledUp = true;
        jumpToStep(nav.targetStep, { topOffset: 4 });
      }
    });
    // Periodically refresh sidebar list (Antigravity window polling timer is managed by applyCapabilitiesUI)
    setInterval(loadTranscriptList, 4000);
  })();
})();
