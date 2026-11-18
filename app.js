import {
  MODULES,
  PHISHING_CASES,
  URL_CHALLENGES,
  QUIZ_QUESTIONS,
  CHECKLIST_CATEGORIES
} from "./data.js";

const STORAGE_KEYS = {
  progress: "csa-learning-progress-v1",
  scheme: "csa-color-scheme"
};

const DEFAULT_PROGRESS = {
  completedModules: [],
  moduleQuizAnswers: {}, // { [moduleId]: { [qId]: { selectedIndex: number, isCorrect: boolean } } }
  phishingAnswers: {}, // { [caseId]: boolean (isCorrect) }
  urlAnswers: {}, // { [urlId]: { selectedIndex: number, isCorrect: boolean } }
  quizAnswers: {}, // { [qId]: number (selectedIndex) }
  checklist: [] // array of checked item IDs
};

function isModuleQuizPassed(mod, moduleQuizAnswers) {
  if (!mod || !Array.isArray(mod.quiz) || mod.quiz.length === 0) return false;
  const answers = moduleQuizAnswers?.[mod.id] || {};
  return mod.quiz.every((q) => answers[q.id]?.isCorrect === true);
}

function getModuleQuizCorrectCount(mod, moduleQuizAnswers) {
  if (!mod || !Array.isArray(mod.quiz)) return 0;
  const answers = moduleQuizAnswers?.[mod.id] || {};
  return mod.quiz.filter((q) => answers[q.id]?.isCorrect === true).length;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.progress);
    if (!raw) return structuredClone(DEFAULT_PROGRESS);
    const parsed = JSON.parse(raw);
    const moduleQuizAnswers =
      parsed.moduleQuizAnswers && typeof parsed.moduleQuizAnswers === "object"
        ? parsed.moduleQuizAnswers
        : {};
    const rawCompleted = Array.isArray(parsed.completedModules) ? parsed.completedModules : [];
    const completedModules = rawCompleted.filter((id) => {
      const mod = MODULES.find((m) => m.id === id);
      return mod && isModuleQuizPassed(mod, moduleQuizAnswers);
    });
    return {
      completedModules,
      moduleQuizAnswers,
      phishingAnswers: parsed.phishingAnswers && typeof parsed.phishingAnswers === "object" ? parsed.phishingAnswers : {},
      urlAnswers: parsed.urlAnswers && typeof parsed.urlAnswers === "object" ? parsed.urlAnswers : {},
      quizAnswers: parsed.quizAnswers && typeof parsed.quizAnswers === "object" ? parsed.quizAnswers : {},
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist : []
    };
  } catch {
    return structuredClone(DEFAULT_PROGRESS);
  }
}

function saveProgress(state) {
  try {
    localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(state));
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

let progress = loadProgress();
let activePhishingCaseId = PHISHING_CASES[0].id;
let activeModuleId = null;
let passkeyStep = 0;

/* ==========================================================================
   Utility DOM Helper
   ========================================================================== */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (val === undefined || val === null || val === false) continue;
    if (key === "class") {
      node.className = val;
    } else if (key === "text") {
      node.textContent = val;
    } else if (key === "dataset") {
      Object.assign(node.dataset, val);
    } else if (key === "checked" || key === "disabled" || key === "hidden") {
      node[key] = val;
    } else {
      node.setAttribute(key, String(val));
    }
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

/* ==========================================================================
   Progress Dashboard
   ========================================================================== */

function updateDashboard() {
  const modDone = progress.completedModules.length;
  const phishDone = Object.keys(progress.phishingAnswers).length;
  const urlDone = Object.keys(progress.urlAnswers).length;
  const quizDoneCount = Object.keys(progress.quizAnswers).length;
  const quizFinished = quizDoneCount === QUIZ_QUESTIONS.length ? 1 : 0;
  const chkDone = progress.checklist.length;
  const chkTotal = CHECKLIST_CATEGORIES.reduce((sum, c) => sum + c.items.length, 0);

  const totalUnits = MODULES.length + PHISHING_CASES.length + URL_CHALLENGES.length + 1 + chkTotal;
  const completedUnits = modDone + phishDone + urlDone + quizFinished + chkDone;
  const pct = Math.round((completedUnits / totalUnits) * 100);

  const progressBar = document.getElementById("overall-progress");
  const progressText = document.getElementById("overall-progress-text");
  progressBar.value = pct;
  progressText.textContent = `${pct}%`;

  document.getElementById("stat-modules").textContent = `${modDone} / ${MODULES.length} 完了`;
  document.getElementById("stat-phishing").textContent = `${phishDone} / ${PHISHING_CASES.length} 判定`;
  document.getElementById("stat-urls").textContent = `${urlDone} / ${URL_CHALLENGES.length} 完了`;

  if (quizDoneCount === 0) {
    document.getElementById("stat-quiz").textContent = "未受験";
  } else {
    const score = QUIZ_QUESTIONS.filter((q) => progress.quizAnswers[q.id] === q.correctIndex).length;
    document.getElementById("stat-quiz").textContent =
      quizDoneCount === QUIZ_QUESTIONS.length
        ? `${score} / ${QUIZ_QUESTIONS.length} 正解`
        : `回答中 (${quizDoneCount}/${QUIZ_QUESTIONS.length})`;
  }

  document.getElementById("stat-checklist").textContent = `${chkDone} / ${chkTotal} 実践中`;
  document.getElementById("checklist-score-text").textContent = `${chkDone} / ${chkTotal}`;

  const rankBadge = document.getElementById("rank-badge");
  if (pct >= 85) {
    rankBadge.textContent = "🛡️ サイバーガーディアン";
    rankBadge.className = "badge badge-safe";
  } else if (pct >= 50) {
    rankBadge.textContent = "⚡ セキュリティディフェンダー";
    rankBadge.className = "badge badge-info";
  } else if (pct >= 20) {
    rankBadge.textContent = "📘 アウェアネス実践者";
    rankBadge.className = "badge badge-warn";
  } else {
    rankBadge.textContent = "🌱 ビギナー";
    rankBadge.className = "badge badge-info";
  }
}

/* ==========================================================================
   Chapter 1: Learning Modules & Native <dialog>
   ========================================================================== */

const moduleDialog = document.getElementById("module-dialog");

function renderModules() {
  const grid = document.getElementById("module-grid");
  grid.replaceChildren();

  for (const mod of MODULES) {
    const passed = isModuleQuizPassed(mod, progress.moduleQuizAnswers);
    const isCompleted = progress.completedModules.includes(mod.id) && passed;
    const correctCount = getModuleQuizCorrectCount(mod, progress.moduleQuizAnswers);
    const totalQ = mod.quiz.length;

    let badgeText = mod.tag;
    let badgeClass = "badge-info";
    if (isCompleted) {
      badgeText = "✓ 学習完了";
      badgeClass = "badge-safe";
    } else if (passed) {
      badgeText = "✓ クイズ合格（未記録）";
      badgeClass = "badge-warn";
    }

    let actionLabel = "詳しく学ぶ・確認クイズ";
    if (isCompleted) {
      actionLabel = "内容を復習する";
    } else if (correctCount > 0) {
      actionLabel = `続きを学ぶ（クイズ ${correctCount}/${totalQ} 正解）`;
    }

    const card = el("article", {
      class: `module-card${isCompleted ? " is-completed" : ""}`
    }, [
      el("div", { class: "module-top" }, [
        el("div", { class: "module-icon", "aria-hidden": "true", text: mod.icon }),
        el("span", {
          class: `badge ${badgeClass}`,
          text: badgeText
        })
      ]),
      el("div", {}, [
        el("h3", { text: mod.title }),
        el("p", { class: "module-summary", text: mod.summary })
      ]),
      el("div", { class: "module-actions" }, [
        (() => {
          const btn = el("button", {
            type: "button",
            class: `btn ${isCompleted ? "btn-outline" : "btn-primary"} btn-sm`,
            text: actionLabel
          });
          btn.addEventListener("click", () => openModuleDialog(mod.id));
          return btn;
        })()
      ])
    ]);
    grid.append(card);
  }
}

function updateModuleDialogFooter(mod) {
  const passed = isModuleQuizPassed(mod, progress.moduleQuizAnswers);
  const isCompleted = progress.completedModules.includes(mod.id) && passed;
  const correctCount = getModuleQuizCorrectCount(mod, progress.moduleQuizAnswers);
  const totalQ = mod.quiz.length;

  const completeBtn = document.getElementById("module-dialog-complete-btn");
  const statusEl = document.getElementById("module-dialog-quiz-status");

  completeBtn.disabled = !passed;
  statusEl.classList.toggle("is-passed", passed);

  if (isCompleted) {
    statusEl.textContent = "✓ 知識確認クイズ合格済み・学習完了として記録されています。";
    completeBtn.textContent = "✓ 学習完了済み（閉じる）";
  } else if (passed) {
    statusEl.textContent = `✓ クイズ全${totalQ}問に正解しました！「学習完了として記録する」を押して完了してください。`;
    completeBtn.textContent = "学習完了として記録する";
  } else {
    statusEl.textContent = `知識確認クイズ（現在 ${correctCount} / ${totalQ} 問正解）：すべて正解すると完了できます。`;
    completeBtn.textContent = "クイズ全問正解で完了可能";
  }
}

function renderModuleQuizSection(mod) {
  const answers = progress.moduleQuizAnswers[mod.id] || {};
  const totalQ = mod.quiz.length;

  const quizSection = el("section", {
    class: "module-quiz-block",
    "aria-labelledby": "module-quiz-heading"
  }, [
    el("h3", { id: "module-quiz-heading", text: `📝 知識確認クイズ（全${totalQ}問）` }),
    el("p", {
      class: "module-quiz-lead",
      text: "学んだ内容を確認しましょう。全問に正解すると「学習完了として記録する」ボタンが有効になります。"
    })
  ]);

  mod.quiz.forEach((q, qIdx) => {
    const saved = answers[q.id];
    const isSolved = saved?.isCorrect === true;

    const card = el("article", { class: "module-quiz-card" }, [
      el("h4", { text: `Q${qIdx + 1}. ${q.prompt}` }),
      el("div", { class: "module-quiz-options" }, q.options.map((optText, optIdx) => {
        let extraClass = "";
        if (saved && saved.selectedIndex === optIdx) {
          extraClass = saved.isCorrect ? " is-correct" : " is-wrong";
        }
        const btn = el("button", {
          type: "button",
          class: `module-quiz-option${extraClass}`,
          disabled: isSolved,
          "aria-pressed": String(Boolean(saved && saved.selectedIndex === optIdx)),
          text: optText
        });
        btn.addEventListener("click", () => {
          if (!progress.moduleQuizAnswers[mod.id]) {
            progress.moduleQuizAnswers[mod.id] = {};
          }
          progress.moduleQuizAnswers[mod.id][q.id] = {
            selectedIndex: optIdx,
            isCorrect: optIdx === q.correctIndex
          };
          saveProgress(progress);
          renderModuleDialogBody(mod);
          updateModuleDialogFooter(mod);
          renderModules();
        });
        return btn;
      }))
    ]);

    if (saved) {
      card.append(
        el("p", {
          class: `module-quiz-feedback ${saved.isCorrect ? "is-correct" : "is-wrong"}`,
          "aria-live": "polite",
          text: saved.isCorrect
            ? `✓ 正解！ ${q.rationale}`
            : "✕ 不正解です。本文を見直して、別の選択肢を選び直してください。"
        })
      );
    }

    quizSection.append(card);
  });

  return quizSection;
}

function renderModuleDialogBody(mod) {
  const body = document.getElementById("module-dialog-body");
  const prevScrollTop = body.scrollTop;
  body.replaceChildren(
    el("div", { class: "module-detail-block" }, [
      el("h3", { text: "なぜ重要か（脅威の背景）" }),
      el("p", { text: mod.overview })
    ]),
    el("div", { class: "module-detail-block" }, [
      el("h3", { text: "注意すべき兆候・サイン" }),
      el("ul", {}, mod.signs.map((s) => el("li", { text: s })))
    ]),
    el("div", { class: "module-detail-block ng-box" }, [
      el("h3", { text: "✕ やってはいけないNG行動" }),
      el("ul", {}, mod.ngActions.map((s) => el("li", { text: s })))
    ]),
    el("div", { class: "module-detail-block ok-box" }, [
      el("h3", { text: "✓ 今日から実践する対策" }),
      el("ul", {}, mod.bestPractices.map((s) => el("li", { text: s })))
    ]),
    renderModuleQuizSection(mod)
  );
  body.scrollTop = prevScrollTop;
}

function openModuleDialog(moduleId) {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return;

  activeModuleId = moduleId;

  document.getElementById("module-dialog-tag").textContent = mod.tag;
  document.getElementById("module-dialog-title").textContent = `${mod.icon} ${mod.title}`;

  renderModuleDialogBody(mod);
  updateModuleDialogFooter(mod);

  moduleDialog.showModal();
  document.getElementById("module-dialog-body").scrollTop = 0;
}

function toggleModuleComplete(moduleId, forceComplete = null) {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return;
  const idx = progress.completedModules.indexOf(moduleId);
  const shouldComplete = forceComplete !== null ? forceComplete : idx === -1;
  if (shouldComplete && !isModuleQuizPassed(mod, progress.moduleQuizAnswers)) {
    return;
  }
  if (shouldComplete && idx === -1) {
    progress.completedModules.push(moduleId);
  } else if (!shouldComplete && idx !== -1) {
    progress.completedModules.splice(idx, 1);
  }
  saveProgress(progress);
  renderModules();
  updateDashboard();
}

moduleDialog.addEventListener("close", () => {
  if (moduleDialog.returnValue === "complete" && activeModuleId) {
    toggleModuleComplete(activeModuleId, true);
  }
  moduleDialog.returnValue = "";
  activeModuleId = null;
});

/* ==========================================================================
   Chapter 2: Tabs with focusgroup + Progressive Enhancement Fallback
   ========================================================================== */

function initTabs() {
  const tabsRoot = document.getElementById("lab-tabs");
  const tablist = tabsRoot.querySelector(".tablist");
  const tabs = Array.from(tablist.querySelectorAll("button"));
  const panels = tabs.map((tab) => document.querySelector(`[aria-labelledby="${tab.id}"]`));

  const nativeFocusgroup = Object.hasOwn(HTMLElement.prototype, "focusGroup");
  if (!nativeFocusgroup) {
    tablist.setAttribute("role", "tablist");
    for (const tab of tabs) {
      tab.setAttribute("role", "tab");
    }
  }

  function selectTab(targetTab, { moveFocus = false } = {}) {
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const panel = panels[i];
      const isSelected = tab === targetTab;

      tab.setAttribute("aria-selected", String(isSelected));
      tab.toggleAttribute("focusgroupstart", isSelected);
      if (!nativeFocusgroup) {
        tab.tabIndex = isSelected ? 0 : -1;
      }

      if (isSelected) {
        panel.hidden = false;
        panel.tabIndex = 0;
      } else {
        panel.hidden = "until-found";
        panel.removeAttribute("tabindex");
      }
    }

    targetTab.scrollIntoView({ block: "nearest", inline: "nearest", container: "nearest" });
    if (moveFocus) {
      targetTab.focus();
    }
  }

  // Initial sync
  const initialSelected = tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
  selectTab(initialSelected);

  for (const tab of tabs) {
    tab.addEventListener("click", () => selectTab(tab));

    // Selection follows focus when focusgroup moves focus
    tab.addEventListener("focus", () => {
      if (tab.getAttribute("aria-selected") !== "true") {
        selectTab(tab);
      }
    });
  }

  // Keyboard fallback for browsers without native focusgroup
  if (!nativeFocusgroup) {
    tablist.addEventListener("keydown", (event) => {
      const currentIdx = tabs.indexOf(document.activeElement);
      if (currentIdx === -1) return;

      let nextIdx = null;
      if (event.key === "ArrowRight") {
        nextIdx = (currentIdx + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIdx = 0;
      } else if (event.key === "End") {
        nextIdx = tabs.length - 1;
      }

      if (nextIdx !== null) {
        event.preventDefault();
        selectTab(tabs[nextIdx], { moveFocus: true });
      }
    });
  }

  // Sync tab state when browser find-in-page reveals a hidden="until-found" panel
  for (let i = 0; i < panels.length; i++) {
    panels[i].addEventListener("beforematch", () => {
      selectTab(tabs[i]);
    });
  }
}

/* ==========================================================================
   Lab 01: Phishing Email / SMS Inspector
   ========================================================================== */

function renderPhishingLab() {
  const btnGroup = document.getElementById("phishing-case-buttons");
  btnGroup.replaceChildren();

  for (const c of PHISHING_CASES) {
    const answered = Object.hasOwn(progress.phishingAnswers, c.id);
    const btn = el("button", {
      type: "button",
      class: `case-btn${c.id === activePhishingCaseId ? " is-active" : ""}${answered ? " is-done" : ""}`,
      text: c.label
    });
    btn.addEventListener("click", () => {
      activePhishingCaseId = c.id;
      renderPhishingLab();
    });
    btnGroup.append(btn);
  }

  const current = PHISHING_CASES.find((c) => c.id === activePhishingCaseId) || PHISHING_CASES[0];
  const workspace = document.getElementById("phishing-workspace");
  workspace.replaceChildren();

  const urlPreviewText = el("div", { class: "url-preview-box" }, [
    el("span", { text: "リンク先プレビュー: " }),
    el("strong", { text: "（ボタンにカーソル／フォーカスを合わせると表示）" })
  ]);

  const mockCtaBtn = el("button", {
    type: "button",
    class: "mock-link-btn",
    text: current.ctaLabel
  });

  const revealUrl = () => {
    urlPreviewText.replaceChildren(
      el("span", { text: "遷移先URL: " }),
      el("strong", { text: current.ctaUrl })
    );
  };
  mockCtaBtn.addEventListener("mouseenter", revealUrl);
  mockCtaBtn.addEventListener("focus", revealUrl);
  mockCtaBtn.addEventListener("click", revealUrl);

  const mockMessage = el("article", { class: "mock-message", "aria-label": `${current.label}のシミュレーション画面` }, [
    el("div", { class: "mock-msg-bar" }, [
      el("span", { text: `受信チャネル: ${current.channel}` }),
      el("span", { class: "badge badge-warn", text: "訓練用サンプル" })
    ]),
    el("div", { class: "mock-msg-headers" }, [
      el("div", { class: "header-row" }, [
        el("span", { class: "hdr-label", text: "差出人:" }),
        el("strong", { text: current.senderName }),
        el("code", { text: `<${current.senderAddress}>` })
      ]),
      el("div", { class: "header-row" }, [
        el("span", { class: "hdr-label", text: "件名:" }),
        el("strong", { text: current.subject })
      ])
    ]),
    el("div", { class: "mock-msg-body" }, [
      ...current.body.map((p) => el("p", { text: p })),
      el("div", { class: "mock-cta-wrap" }, [
        mockCtaBtn,
        urlPreviewText
      ])
    ])
  ]);

  const savedAnswer = progress.phishingAnswers[current.id];
  const hasAnswered = typeof savedAnswer === "boolean";

  const judgeSafeBtn = el("button", {
    type: "button",
    class: "btn btn-outline",
    text: "✓ 正規（安全）と判定"
  });
  const judgePhishBtn = el("button", {
    type: "button",
    class: "btn btn-danger-outline",
    text: "⚠ フィッシング（危険）と判定"
  });

  const submitJudgment = (userSaysPhishing) => {
    const isCorrect = userSaysPhishing === current.isPhishing;
    progress.phishingAnswers[current.id] = isCorrect;
    saveProgress(progress);
    renderPhishingLab();
    updateDashboard();
  };

  judgeSafeBtn.addEventListener("click", () => submitJudgment(false));
  judgePhishBtn.addEventListener("click", () => submitJudgment(true));

  const judgePanelChildren = [
    el("h4", { text: "あなたの判定を選択してください" }),
    el("div", { class: "judge-buttons" }, [judgeSafeBtn, judgePhishBtn])
  ];

  if (hasAnswered) {
    const resultTitle = savedAnswer
      ? `✓ 正解！（これは${current.isPhishing ? "フィッシング詐欺" : "正規の通知"}です）`
      : `✕ 不正解（正解は「${current.isPhishing ? "フィッシング詐欺" : "正規の通知"}」です）`;

    judgePanelChildren.push(
      el("div", {
        class: `judge-result ${savedAnswer ? "is-correct" : "is-wrong"}`,
        "aria-live": "polite"
      }, [
        el("strong", { text: resultTitle }),
        el("p", { text: current.explanation, style: "margin: 0.5rem 0 0;" }),
        el("ul", { class: "redflag-list" }, current.redFlags.map((flag) => el("li", { text: flag })))
      ])
    );
  } else {
    judgePanelChildren.push(
      el("div", { class: "judge-result" }, [
        el("p", {
          text: "左のメッセージの「差出人アドレス」「文面の急かし」「ボタンにカーソルを合わせたときの遷移先URL」を確認してから判定しましょう。",
          style: "margin: 0;"
        })
      ])
    );
  }

  const judgePanel = el("div", { class: "judge-panel" }, judgePanelChildren);
  workspace.append(mockMessage, judgePanel);
}

/* ==========================================================================
   Lab 02: Password Strength & Passkey Simulator
   ========================================================================== */

function evaluatePasswordStrength(pw) {
  if (!pw) {
    return {
      score: 0,
      label: "未入力",
      crackTime: "—",
      lengthOk: false,
      varietyOk: false,
      commonOk: false,
      feedback: "文字列を入力すると、リスクと改善ポイントが表示されます。"
    };
  }

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^a-zA-Z0-9\s]/.test(pw);
  const hasSeparator = /[-_.\s]/.test(pw);
  const words = pw.split(/[-_.\s]+/).filter((w) => w.length >= 3);
  const isPassphrase = words.length >= 4 && pw.length >= 16;

  let charsetSize = 0;
  if (hasLower) charsetSize += 26;
  if (hasUpper) charsetSize += 26;
  if (hasDigit) charsetSize += 10;
  if (hasSymbol || hasSeparator) charsetSize += 32;
  if (charsetSize === 0) charsetSize = 64;

  const lowerPw = pw.toLowerCase();
  const commonPatterns = ["password", "123456", "qwerty", "admin", "welcome", "letmein", "taro", "2024", "2025", "2026"];
  const hasCommonPattern =
    commonPatterns.some((p) => lowerPw.includes(p)) || /(.)\1{3,}/.test(pw);

  let entropy = pw.length * Math.log2(charsetSize);
  if (hasCommonPattern) entropy = Math.min(entropy * 0.45, 32);

  // Offline GPU cracking estimate (~10^10 guesses/sec for fast hash)
  const guesses = 2 ** Math.min(entropy, 90);
  const seconds = guesses / 1e10;

  let crackTime = "一瞬（数秒未満）";
  if (seconds >= 3.15e10) crackTime = "数千年〜数億年以上";
  else if (seconds >= 3.15e7) crackTime = `約 ${Math.round(seconds / 3.15e7)} 年`;
  else if (seconds >= 86400) crackTime = `約 ${Math.round(seconds / 86400)} 日`;
  else if (seconds >= 3600) crackTime = `約 ${Math.round(seconds / 3600)} 時間`;
  else if (seconds >= 60) crackTime = `約 ${Math.round(seconds / 60)} 分`;

  const lengthOk = pw.length >= 12;
  const varietyOk = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length >= 3 || isPassphrase;
  const commonOk = !hasCommonPattern;

  let score = Math.min(100, Math.round((entropy / 80) * 100));
  if (!lengthOk) score = Math.min(score, 45);
  if (hasCommonPattern) score = Math.min(score, 25);

  let label = "危険（非常に弱い）";
  let feedback = "文字数を増やし、推測されやすい単語や年号を避けてください。";

  if (score >= 85) {
    label = "非常に強力";
    feedback = isPassphrase
      ? "長いパスフレーズ形式は人間にも覚えやすく、総当たり攻撃に対して極めて高い耐性があります。"
      : "十分な長さと複雑さがあります。サービスごとに異なる文字列を使い、MFA/パスキーと併用しましょう。";
  } else if (score >= 60) {
    label = "まずまず（改善の余地あり）";
    feedback = "16文字以上に伸ばすか、無関係な4単語以上をつなげたパスフレーズにするとさらに安全です。";
  } else if (score >= 35) {
    label = "やや弱い";
    feedback = "短いか、推測されやすいパターン（名前+年号など）が含まれています。長さを12〜16文字以上にしましょう。";
  }

  return { score, label, crackTime, lengthOk, varietyOk, commonOk, feedback };
}

function initPasswordAndPasskeyLab() {
  const pwInput = document.getElementById("pw-input");
  const toggleBtn = document.getElementById("toggle-pw-visibility");
  const strengthLabel = document.getElementById("pw-strength-label");
  const crackTimeEl = document.getElementById("pw-crack-time");
  const strengthBar = document.getElementById("pw-strength-bar");
  const criteriaList = document.getElementById("pw-criteria-list");
  const feedbackEl = document.getElementById("pw-feedback");

  const updateMeter = () => {
    const res = evaluatePasswordStrength(pwInput.value);
    strengthLabel.textContent = res.label;
    crackTimeEl.textContent = res.crackTime;
    strengthBar.value = res.score;
    feedbackEl.textContent = res.feedback;

    criteriaList.querySelector('[data-check="length"]').classList.toggle("is-met", res.lengthOk);
    criteriaList.querySelector('[data-check="variety"]').classList.toggle("is-met", res.varietyOk);
    criteriaList.querySelector('[data-check="common"]').classList.toggle("is-met", res.commonOk);
  };

  pwInput.addEventListener("input", updateMeter);

  toggleBtn.addEventListener("click", () => {
    const isPassword = pwInput.type === "password";
    pwInput.type = isPassword ? "text" : "password";
    toggleBtn.setAttribute("aria-pressed", String(isPassword));
    toggleBtn.textContent = isPassword ? "隠す" : "表示";
    toggleBtn.setAttribute("aria-label", isPassword ? "入力文字列を隠す" : "入力文字列を表示する");
  });

  for (const chip of document.querySelectorAll(".chip-btn[data-sample]")) {
    chip.addEventListener("click", () => {
      pwInput.value = chip.dataset.sample;
      updateMeter();
      pwInput.focus();
    });
  }

  // Passkey step simulator
  const steps = Array.from(document.querySelectorAll("#passkey-stepper .sim-step"));
  const nextBtn = document.getElementById("passkey-next-btn");
  const spoofBtn = document.getElementById("passkey-spoof-btn");
  const simResult = document.getElementById("passkey-sim-result");

  const renderSteps = () => {
    steps.forEach((s, idx) => s.classList.toggle("is-active", idx === passkeyStep));
  };

  nextBtn.addEventListener("click", () => {
    passkeyStep = (passkeyStep + 1) % steps.length;
    renderSteps();
    simResult.classList.remove("is-blocked");
    if (passkeyStep === 0) {
      simResult.textContent = "ステップ1: サーバーが使い捨ての暗号チャレンジを生成しました。";
    } else if (passkeyStep === 1) {
      simResult.textContent = "ステップ2: ブラウザが正規ドメイン example.co.jp であることを検証しました。";
    } else {
      simResult.textContent = "ステップ3: 端末内の秘密鍵で署名し安全にログイン完了！秘密鍵がネットワークに流れることはありません。";
    }
  });

  spoofBtn.addEventListener("click", () => {
    passkeyStep = 1;
    renderSteps();
    simResult.classList.add("is-blocked");
    simResult.textContent =
      "🛡️ ブロック成功！偽サイト（examp1e.co.jp）は正規ドメインと一致しないため、ブラウザがステップ2でパスキーの署名を自動拒否しました。ユーザーが騙されても認証情報が盗まれません。";
  });
}

/* ==========================================================================
   Lab 03: URL Anatomy Lab
   ========================================================================== */

function renderUrlLab() {
  const container = document.getElementById("url-quiz-list");
  container.replaceChildren();

  for (const item of URL_CHALLENGES) {
    const saved = progress.urlAnswers[item.id];
    const card = el("article", { class: "url-card" }, [
      el("div", { class: "url-display", text: item.url }),
      el("p", { text: item.question, style: "margin: 0; font-weight: 700;" }),
      el("div", { class: "url-options" }, item.options.map((optText, idx) => {
        const isSelected = saved && saved.selectedIndex === idx;
        const btn = el("button", {
          type: "button",
          class: `btn btn-sm ${isSelected ? (saved.isCorrect ? "btn-primary" : "btn-danger-outline") : "btn-outline"}`,
          "aria-pressed": String(Boolean(isSelected)),
          text: optText
        });
        btn.addEventListener("click", () => {
          progress.urlAnswers[item.id] = {
            selectedIndex: idx,
            isCorrect: idx === item.correctIndex
          };
          saveProgress(progress);
          renderUrlLab();
          updateDashboard();
        });
        return btn;
      }))
    ]);

    if (saved) {
      card.append(
        el("p", {
          class: `url-feedback ${saved.isCorrect ? "is-correct" : "is-wrong"}`,
          text: `${saved.isCorrect ? "✓ 正解: " : "✕ 不正解: "}${item.explanation}`
        })
      );
    }

    container.append(card);
  }
}

/* ==========================================================================
   Lab 04: Comprehensive Quiz
   ========================================================================== */

function renderQuizLab() {
  const container = document.getElementById("quiz-container");
  container.replaceChildren();

  QUIZ_QUESTIONS.forEach((q, qIdx) => {
    const chosen = progress.quizAnswers[q.id];
    const isAnswered = typeof chosen === "number";

    const card = el("article", { class: "quiz-question-card" }, [
      el("h4", { text: `Q${qIdx + 1}. ${q.prompt}` }),
      el("div", { class: "quiz-options" }, q.options.map((optText, optIdx) => {
        let extraClass = "";
        if (isAnswered) {
          if (optIdx === q.correctIndex) extraClass = " is-chosen-correct";
          else if (optIdx === chosen) extraClass = " is-chosen-wrong";
        }
        const btn = el("button", {
          type: "button",
          class: `quiz-option-btn${extraClass}`,
          disabled: isAnswered,
          text: optText
        });
        btn.addEventListener("click", () => {
          progress.quizAnswers[q.id] = optIdx;
          saveProgress(progress);
          renderQuizLab();
          updateDashboard();
        });
        return btn;
      }))
    ]);

    if (isAnswered) {
      const isRight = chosen === q.correctIndex;
      card.append(
        el("div", { class: "quiz-rationale", "aria-live": "polite" }, [
          el("strong", { text: isRight ? "✓ 正解！" : "✕ もう一度確認しよう" }),
          el("p", { text: q.rationale, style: "margin: 0.35rem 0 0;" })
        ])
      );
    }

    container.append(card);
  });
}

document.getElementById("quiz-reset-btn").addEventListener("click", () => {
  progress.quizAnswers = {};
  saveProgress(progress);
  renderQuizLab();
  updateDashboard();
});

/* ==========================================================================
   Chapter 3: Daily Hygiene Checklist
   ========================================================================== */

function renderChecklist() {
  const grid = document.getElementById("checklist-grid");
  grid.replaceChildren();

  for (const cat of CHECKLIST_CATEGORIES) {
    const group = el("section", { class: "checklist-group", "aria-labelledby": `chk-head-${cat.id}` }, [
      el("h3", { id: `chk-head-${cat.id}`, text: cat.title }),
      el("ul", { class: "checklist-items" }, cat.items.map((item) => {
        const isChecked = progress.checklist.includes(item.id);
        const checkbox = el("input", {
          type: "checkbox",
          id: item.id,
          checked: isChecked
        });
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            if (!progress.checklist.includes(item.id)) progress.checklist.push(item.id);
          } else {
            progress.checklist = progress.checklist.filter((id) => id !== item.id);
          }
          saveProgress(progress);
          updateDashboard();
        });

        return el("li", { class: "check-item" }, [
          checkbox,
          el("label", { for: item.id }, [
            el("strong", { text: item.title }),
            el("small", { text: item.detail })
          ])
        ]);
      }))
    ]);
    grid.append(group);
  }
}

/* ==========================================================================
   Chapter 4: Accordion Expand/Collapse All + Fallback
   ========================================================================== */

function initAccordionControls() {
  const syncExpandButton = (accordion) => {
    const button = accordion.querySelector(':scope > .accordion-header [command="--toggle-all"]');
    if (!button) return;
    const items = accordion.querySelectorAll(":scope > details");
    const allOpen = Array.prototype.every.call(items, (d) => d.open);
    button.setAttribute("aria-expanded", String(allOpen));
  };

  document.addEventListener("toggle", (event) => {
    if (!event.target.matches(".accordion > details")) return;
    syncExpandButton(event.target.parentElement);
  }, { capture: true });

  const toggleAllHandler = (accordion, button) => {
    const expand = button.getAttribute("aria-expanded") !== "true";
    for (const details of accordion.querySelectorAll(":scope > details")) {
      details.open = expand;
    }
    syncExpandButton(accordion);
  };

  document.addEventListener("command", (event) => {
    if (event.command !== "--toggle-all") return;
    toggleAllHandler(event.target, event.source);
  }, { capture: true });

  // Fallback for browsers without native Invoker Commands (command / commandfor)
  if (!("commandForElement" in HTMLButtonElement.prototype)) {
    document.addEventListener("click", (event) => {
      const btn = event.target.closest("button[command][commandfor]");
      if (!btn) return;
      const target = document.getElementById(btn.getAttribute("commandfor"));
      if (!target) return;
      const cmd = btn.getAttribute("command");
      if (cmd === "show-modal" && target instanceof HTMLDialogElement) {
        target.showModal();
      } else if (cmd === "close" && target instanceof HTMLDialogElement) {
        target.close();
      } else if (cmd === "--toggle-all") {
        toggleAllHandler(target, btn);
      }
    });
  }
}

/* ==========================================================================
   Dialog Light-Dismiss Fallback & Settings (Color Scheme + Progress Reset)
   ========================================================================== */

function initDialogsAndSettings() {
  // Light-dismiss fallback for browsers without <dialog closedby="any"> (e.g., Safari)
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener("pointerdown", (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener("pointerup", (e) => {
        if (pressedOutside && outside(e, dialog)) dialog.close();
      });
    }
  }

  const settingsDialog = document.getElementById("settings-dialog");
  settingsDialog.addEventListener("close", () => {
    settingsDialog.returnValue = "";
    document.getElementById("reset-status-msg").textContent = "";
  });

  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  const radios = Array.from(document.querySelectorAll('input[name="color-scheme-choice"]'));
  const sysLabel = document.getElementById("system-scheme-label");
  const darkMql = window.matchMedia("(prefers-color-scheme: dark)");

  const updateSystemLabel = () => {
    sysLabel.textContent = `現在: ${darkMql.matches ? "ダーク" : "ライト"}`;
  };
  updateSystemLabel();
  darkMql.addEventListener("change", updateSystemLabel);

  const syncThemeUI = () => {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEYS.scheme);
    } catch {
      stored = null;
    }
    const activeChoice = stored === "light" || stored === "dark" ? stored : "system";
    metaScheme.content = activeChoice === "system" ? "light dark" : activeChoice;
    for (const r of radios) {
      r.checked = r.value === activeChoice;
    }
  };

  syncThemeUI();

  for (const r of radios) {
    r.addEventListener("change", () => {
      const val = r.value;
      try {
        if (val === "system") {
          localStorage.removeItem(STORAGE_KEYS.scheme);
        } else {
          localStorage.setItem(STORAGE_KEYS.scheme, val);
        }
      } catch {
        // ignore
      }
      metaScheme.content = val === "system" ? "light dark" : val;
    });
  }

  // Sync theme & progress across tabs
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEYS.scheme) {
      syncThemeUI();
    } else if (e.key === STORAGE_KEYS.progress) {
      progress = loadProgress();
      renderModules();
      renderPhishingLab();
      renderUrlLab();
      renderQuizLab();
      renderChecklist();
      updateDashboard();
    }
  });

  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    progress = structuredClone(DEFAULT_PROGRESS);
    saveProgress(progress);
    renderModules();
    renderPhishingLab();
    renderUrlLab();
    renderQuizLab();
    renderChecklist();
    updateDashboard();
    document.getElementById("reset-status-msg").textContent = "✓ 学習進捗をすべてリセットしました。";
  });
}

/* ==========================================================================
   Bootstrap
   ========================================================================== */

renderModules();
initTabs();
renderPhishingLab();
initPasswordAndPasskeyLab();
renderUrlLab();
renderQuizLab();
renderChecklist();
initAccordionControls();
initDialogsAndSettings();
updateDashboard();
