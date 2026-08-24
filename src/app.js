import { clueHubCandidates, normalizeClue, normalizePattern, solveClues } from "/assets/solver.mjs";

const dataPromise = Promise.all([
  fetch("/assets/clues.json").then((response) => response.json()),
  fetch("/assets/answers.json").then((response) => response.json()),
  fetch("/assets/clue-hubs.json").then((response) => response.json()),
  fetch("/assets/classroom-clues.json").then((response) => response.json())
]).then(([clues, answers, clueHubs, classroomClues]) => {
  const hubClues = clueHubCandidates(clueHubs);
  return { clues, answers, clueHubs, classroomClues, hubClues, solverClues: [...clues, ...hubClues] };
});

for (const link of document.querySelectorAll(".primary-nav a")) {
  if (link.pathname !== "/" && location.pathname.startsWith(link.pathname)) link.setAttribute("aria-current", "page");
}

for (const root of document.querySelectorAll("[data-tool-root]")) {
  setupTabs(root);
  setupExamples(root);
  setupSolveForm(root);
  setupExplainForm(root);
}

const savedCluesKey = "crossword-clue-tutor:saved-clues";
const recentCluesKey = "crossword-clue-tutor:recent-clues";
const dailyPracticeKey = "crossword-clue-tutor:daily-practice:v1";
const analyticsConsentKey = "crossword-clue-tutor:ga4-consent:v1";
const pendingProductEvents = [];

setupSavedClueButtons();
setupSavedCluesPage();
setupAnswerReveals();
setupRecentClues();
setupDailyPractice();
setupClassroomExamples();
setupTrackedLinks();
setupFeedbackForm();
setupPrintButtons();
setupInstallApp();
setupGoogleAnalytics();

function setupInstallApp() {
  const controls = [...document.querySelectorAll("[data-install-app]")];
  if (!controls.length) return;

  let installPrompt = null;
  const setVisible = (visible) => {
    for (const control of controls) control.hidden = !visible;
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    setVisible(true);
    trackProductEvent("pwa_install_available", { page_path: location.pathname });
  });

  for (const control of controls) {
    control.addEventListener("click", async () => {
      if (!installPrompt) return;
      trackProductEvent("pwa_install_prompt", { page_path: location.pathname });
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      trackProductEvent("pwa_install_choice", { outcome: choice.outcome, page_path: location.pathname });
      installPrompt = null;
      setVisible(false);
    });
  }

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    setVisible(false);
    trackProductEvent("pwa_installed", { page_path: location.pathname });
  });
}

async function setupGoogleAnalytics() {
  const measurementId = document.querySelector('meta[name="google-analytics-measurement-id"]')?.content;
  const banner = document.querySelector("[data-analytics-consent]");
  const settings = [...document.querySelectorAll("[data-analytics-settings]")];
  if (!measurementId || !banner) {
    for (const control of settings) control.hidden = true;
    return;
  }

  const showBanner = () => { banner.hidden = false; };
  const hideBanner = () => { banner.hidden = true; };
  for (const control of settings) control.addEventListener("click", showBanner);

  banner.querySelector("[data-analytics-accept]")?.addEventListener("click", () => {
    saveAnalyticsChoice("accepted");
    hideBanner();
    loadGoogleAnalytics(measurementId);
  });
  banner.querySelector("[data-analytics-decline]")?.addEventListener("click", () => {
    const wasLoaded = Boolean(document.querySelector("script[data-ga4-loader]"));
    saveAnalyticsChoice("declined");
    deleteGoogleAnalyticsCookies();
    hideBanner();
    if (wasLoaded) location.reload();
  });

  const savedChoice = readAnalyticsChoice();
  if (savedChoice === "accepted") {
    loadGoogleAnalytics(measurementId);
    return;
  }
  if (savedChoice === "declined") return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch("/api/analytics-region", { credentials: "same-origin", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error("Region lookup failed.");
    const region = await response.json();
    if (region.consentRequired) showBanner();
    else loadGoogleAnalytics(measurementId);
  } catch {
    loadGoogleAnalytics(measurementId);
  }
}

function loadGoogleAnalytics(measurementId) {
  if (document.querySelector("script[data-ga4-loader]")) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  window.gtag("js", new Date());
  window.gtag("config", measurementId);
  const script = document.createElement("script");
  script.async = true;
  script.dataset.ga4Loader = "";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);
  for (const [name, parameters] of pendingProductEvents.splice(0)) window.gtag("event", name, parameters);
}

function trackProductEvent(name, parameters = {}) {
  if (!document.querySelector('meta[name="google-analytics-measurement-id"]')) return;
  if (typeof window.gtag !== "function" || !document.querySelector("script[data-ga4-loader]")) {
    pendingProductEvents.push([name, parameters]);
    return;
  }
  window.gtag("event", name, parameters);
}

function readAnalyticsChoice() {
  try { return localStorage.getItem(analyticsConsentKey); } catch { return null; }
}

function saveAnalyticsChoice(value) {
  try { localStorage.setItem(analyticsConsentKey, value); } catch { /* private browsing may disable storage */ }
}

function deleteGoogleAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (!name || (name !== "_ga" && !name.startsWith("_ga_"))) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.crosswordcluetutor.com; SameSite=Lax`;
  }
}

function setupPrintButtons() {
  for (const control of document.querySelectorAll("[data-print-page]")) {
    control.addEventListener("click", () => window.print());
  }
}

function setupDailyPractice() {
  const root = document.querySelector("[data-daily-practice]");
  const button = root?.querySelector("[data-daily-practice-complete]");
  const title = root?.querySelector("[data-daily-practice-title]");
  const status = root?.querySelector("[data-daily-practice-status]");
  const clinicDate = root?.dataset.clinicDate;
  if (!root || !button || !title || !status || !/^\d{4}-\d{2}-\d{2}$/.test(clinicDate ?? "")) return;

  const readState = () => {
    try {
      const value = JSON.parse(localStorage.getItem(dailyPracticeKey) ?? "null");
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.lastDate ?? "")) return { lastDate: null, streak: 0, completions: 0 };
      return { lastDate: value.lastDate, streak: Math.max(0, Number(value.streak) || 0), completions: Math.max(0, Number(value.completions) || 0) };
    } catch {
      return { lastDate: null, streak: 0, completions: 0 };
    }
  };

  const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  const render = (state) => {
    if (state.lastDate === clinicDate) {
      title.textContent = `${state.streak}-day practice streak`;
      status.textContent = `${state.completions} clinic${state.completions === 1 ? "" : "s"} completed on this device. Return for the next reviewed set.`;
      button.textContent = "Clinic completed";
      button.disabled = true;
      return;
    }
    if (state.streak > 0) {
      title.textContent = `Continue your ${state.streak}-day practice streak.`;
      status.textContent = "Complete this latest clinic to keep the routine moving. Practice history stays only in this browser.";
    }
  };

  render(readState());
  button.addEventListener("click", () => {
    const previous = readState();
    if (previous.lastDate === clinicDate) return;
    const difference = previous.lastDate ? daysBetween(previous.lastDate, clinicDate) : null;
    const next = {
      lastDate: clinicDate,
      streak: difference === 1 ? previous.streak + 1 : 1,
      completions: previous.completions + 1
    };
    try { localStorage.setItem(dailyPracticeKey, JSON.stringify(next)); } catch { /* private browsing may disable storage */ }
    render(next);
    trackProductEvent("daily_clinic_complete", { clinic_date: clinicDate, streak_days: next.streak });
  });
}

async function setupClassroomExamples() {
  const select = document.querySelector("[data-classroom-example]");
  const root = document.querySelector('[data-tool-context="classroom"]');
  const form = root?.querySelector("[data-solve-form]");
  if (!select || !root || !form) return;

  const { classroomClues } = await dataPromise;
  const bySlug = new Map(classroomClues.map((item) => [item.slug, item]));
  select.addEventListener("change", () => {
    const item = bySlug.get(select.value);
    if (!item) return;
    form.elements.namedItem("clue").value = item.clue;
    form.elements.namedItem("pattern").value = "";
    form.elements.namedItem("length").value = item.answer.length;
    trackProductEvent("classroom_example_select", { skill: item.skill, difficulty: item.difficulty });
    root.scrollIntoView({ block: "start" });
  });
}

function feedbackHref({ mode = "general", pagePath = location.pathname, clue = "", answer = "" } = {}) {
  const query = new URLSearchParams({ mode, page: pagePath });
  if (clue) query.set("clue", clue);
  if (answer) query.set("answer", answer);
  return `/feedback/?${query}`;
}

function setupFeedbackForm() {
  const form = document.querySelector("[data-feedback-form]");
  if (!form) return;

  const params = new URLSearchParams(location.search);
  const context = form.querySelector("[data-feedback-context]");
  const pagePath = params.get("page")?.startsWith("/") && !params.get("page").startsWith("//") ? params.get("page") : "/feedback/";
  const mode = ["solver", "explain", "clue", "answer", "hub", "general"].includes(params.get("mode")) ? params.get("mode") : "general";
  const clue = params.get("clue")?.slice(0, 300) ?? "";
  const answer = params.get("answer")?.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 50) ?? "";

  form.elements.pagePath.value = pagePath;
  form.elements.mode.value = mode;
  form.elements.clue.value = clue;
  form.elements.answer.value = answer;
  if (pagePath !== "/feedback/" || clue || answer) {
    const details = [pagePath, clue ? `Clue: ${clue}` : "", answer ? `Answer: ${answer}` : ""].filter(Boolean);
    context.textContent = `Attached context · ${details.join(" · ")}`;
    context.hidden = false;
  }

  const submit = form.querySelector("[data-feedback-submit]");
  const status = form.querySelector("[data-feedback-status]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    submit.disabled = true;
    submit.textContent = "Sending…";
    status.hidden = true;
    status.dataset.state = "";
    const payload = Object.fromEntries(new FormData(form));

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Feedback could not be sent.");
      status.textContent = result.id ? `Thank you. Your report ID is ${result.id}.` : "Thank you. Your feedback was received.";
      status.dataset.state = "success";
      status.hidden = false;
      submit.textContent = "Feedback sent";
    } catch (error) {
      status.textContent = error.message || "Feedback could not be sent. Please try again.";
      status.dataset.state = "error";
      status.hidden = false;
      submit.disabled = false;
      submit.textContent = "Send feedback";
    }
  });
}

function readSavedClues() {
  try {
    const value = JSON.parse(localStorage.getItem(savedCluesKey) ?? "[]");
    return Array.isArray(value) ? value.filter((slug) => typeof slug === "string") : [];
  } catch {
    return [];
  }
}

function writeSavedClues(slugs) {
  try {
    localStorage.setItem(savedCluesKey, JSON.stringify([...new Set(slugs)]));
    return true;
  } catch {
    return false;
  }
}

function readRecentClues() {
  try {
    const value = JSON.parse(localStorage.getItem(recentCluesKey) ?? "[]");
    return Array.isArray(value) ? value.filter((slug) => typeof slug === "string") : [];
  } catch {
    return [];
  }
}

function writeRecentClues(slugs) {
  try {
    localStorage.setItem(recentCluesKey, JSON.stringify([...new Set(slugs)].slice(0, 8)));
    return true;
  } catch {
    return false;
  }
}

function setupAnswerReveals() {
  for (const reveal of document.querySelectorAll("[data-answer-reveal]")) {
    let tracked = false;
    reveal.addEventListener("toggle", () => {
      if (!reveal.open || tracked) return;
      tracked = true;
      trackProductEvent("answer_reveal", { page_path: location.pathname, content_type: "clue_explainer" });
    });
  }
}

async function setupRecentClues() {
  const article = document.querySelector("[data-current-clue]");
  if (!article) return;
  const slug = article.dataset.currentClue;
  const previous = readRecentClues();
  if (previous.includes(slug)) trackProductEvent("clue_revisit", { clue_slug: slug });
  writeRecentClues([slug, ...previous.filter((item) => item !== slug)]);

  const root = article.querySelector("[data-recent-clues]");
  const container = root?.querySelector("[data-recent-clue-items]");
  const recent = previous.filter((item) => item !== slug).slice(0, 3);
  if (!root || !container || !recent.length) return;

  try {
    const { clues } = await dataPromise;
    const bySlug = new Map(clues.map((clue) => [clue.slug, clue]));
    for (const recentSlug of recent) {
      const clue = bySlug.get(recentSlug);
      if (!clue) continue;
      const link = element("a", "recent-clue-link");
      link.href = `/explainers/${clue.slug}/`;
      link.append(
        element("strong", "", clue.clue),
        element("span", "", `${clue.publication ?? "Reviewed clue"} · ${clue.answer.length} letters`)
      );
      link.addEventListener("click", () => trackProductEvent("recent_clue_open", { clue_slug: clue.slug }));
      container.append(link);
    }
    root.hidden = !container.childElementCount;
  } catch {
    root.hidden = true;
  }
}

function setupTrackedLinks() {
  for (const link of document.querySelectorAll("[data-return-link]")) {
    link.addEventListener("click", () => trackProductEvent("return_path_click", {
      destination: link.dataset.returnLink,
      page_path: location.pathname
    }));
  }
  for (const section of document.querySelectorAll("[data-related-clues]")) {
    section.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (link) trackProductEvent("related_clue_click", { page_path: location.pathname });
    });
  }
  for (const section of document.querySelectorAll("[data-same-puzzle-clues]")) {
    section.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (link) trackProductEvent("same_puzzle_clue_click", {
        page_path: location.pathname,
        destination_path: link.pathname
      });
    });
  }
}

function setupSavedClueButtons() {
  for (const control of document.querySelectorAll("[data-save-clue]")) {
    const status = control.parentElement?.querySelector("[data-save-clue-status]");
    const sync = () => {
      const saved = readSavedClues().includes(control.dataset.clueSlug);
      control.setAttribute("aria-pressed", String(saved));
      control.textContent = saved ? "Saved" : "Save clue";
    };
    sync();
    control.addEventListener("click", () => {
      const slug = control.dataset.clueSlug;
      const saved = readSavedClues();
      const isSaved = saved.includes(slug);
      const next = isSaved ? saved.filter((item) => item !== slug) : [slug, ...saved];
      if (!writeSavedClues(next)) {
        control.disabled = true;
        if (status) status.textContent = "Saving is unavailable in this browser.";
        return;
      }
      sync();
      if (status) status.textContent = isSaved ? "Removed from saved clues." : "Saved in this browser.";
      trackProductEvent(isSaved ? "unsave_clue" : "save_clue", { clue_slug: slug });
    });
  }
}

function setupSavedCluesPage() {
  const root = document.querySelector("[data-saved-clues-root]");
  if (!root) return;
  const empty = root.querySelector("[data-saved-empty]");
  const list = root.querySelector("[data-saved-list]");
  const items = root.querySelector("[data-saved-items]");
  const count = root.querySelector("[data-saved-count]");

  const render = async () => {
    const saved = readSavedClues();
    const { clues } = await dataPromise;
    const bySlug = new Map(clues.map((clue) => [clue.slug, clue]));
    const matches = saved.map((slug) => bySlug.get(slug)).filter(Boolean);
    if (matches.length !== saved.length) writeSavedClues(matches.map((clue) => clue.slug));
    items.replaceChildren(...matches.map((clue) => savedClueRow(clue, render)));
    empty.hidden = matches.length > 0;
    list.hidden = matches.length === 0;
    count.textContent = `${matches.length} saved ${matches.length === 1 ? "clue" : "clues"} on this device`;
  };

  render();
}

function savedClueRow(clue, onRemove) {
  const row = element("article", "saved-clue-row");
  const link = element("a", "saved-clue-link");
  link.href = `/explainers/${clue.slug}/`;
  link.append(
    element("strong", "", clue.clue),
    element("span", "", `${clue.publication ?? "Reviewed clue"} · ${clue.answer.length} letters`)
  );
  const remove = button("Remove", "button button-quiet saved-clue-remove");
  remove.setAttribute("aria-label", `Remove ${clue.clue} from saved clues`);
  remove.addEventListener("click", () => {
    writeSavedClues(readSavedClues().filter((slug) => slug !== clue.slug));
    onRemove();
  });
  row.append(link, remove);
  return row;
}

function setupTabs(root) {
  const tabs = [...root.querySelectorAll("[role='tab']")];
  const select = (selected) => {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      root.querySelector(`#${tab.getAttribute("aria-controls")}`).hidden = !active;
    }
    selected.focus({ preventScroll: true });
  };

  for (const tab of tabs) {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      select(tabs[(tabs.indexOf(tab) + offset + tabs.length) % tabs.length]);
    });
  }
}

function setupExamples(root) {
  for (const button of root.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.example;
      const tab = root.querySelector(`[data-tab="${mode}"]`);
      if (tab?.getAttribute("aria-selected") !== "true") tab?.click();
      if (mode === "solve") {
        root.querySelector("[data-solve-form] [name='clue']").value = "Contractor's detail, for short";
        root.querySelector("[data-solve-form] [name='pattern']").value = "S?E?";
        root.querySelector("[data-solve-form] [name='length']").value = "4";
        root.querySelector("[data-solve-form]").requestSubmit();
      } else {
        root.querySelector("[data-explain-form] [name='clue']").value = "Contractor's detail, for short";
        root.querySelector("[data-explain-form] [name='answer']").value = "SPEC";
        root.querySelector("[data-explain-form]").requestSubmit();
      }
    });
  }
}

function setupSolveForm(root) {
  const form = root.querySelector("[data-solve-form]");
  if (!form) return;
  const results = root.querySelector("[data-solve-results]");
  const error = root.querySelector("[data-solve-error]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const values = new FormData(form);
    const clue = String(values.get("clue") ?? "").trim();
    const pattern = normalizePattern(String(values.get("pattern") ?? ""));
    const length = String(values.get("length") ?? "").trim();
    if (!clue && !pattern && !length) {
      showError(error, "Enter a clue, known letters, or an answer length to begin.");
      return;
    }
    if (length && (Number(length) < 2 || Number(length) > 30)) {
      showError(error, "Answer length must be between 2 and 30 letters.");
      return;
    }
    const context = root.dataset.toolContext || "standalone";
    trackProductEvent("solver_submit", {
      tool_context: context,
      has_clue: Boolean(clue),
      has_pattern: Boolean(pattern),
      has_length: Boolean(length)
    });
    const { solverClues, classroomClues } = await dataPromise;
    const candidatePool = context === "classroom" ? [...classroomClues, ...solverClues] : solverClues;
    const matches = solveClues(candidatePool, { clue, pattern, length }).slice(0, 5);
    renderSolveResults(results, matches, { clue, pattern, length, context });
  });
}

function setupExplainForm(root) {
  const form = root.querySelector("[data-explain-form]");
  if (!form) return;
  const results = root.querySelector("[data-explain-results]");
  const error = root.querySelector("[data-explain-error]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const values = new FormData(form);
    const clue = String(values.get("clue") ?? "").trim();
    const answer = String(values.get("answer") ?? "").toUpperCase().replace(/[^A-Z]/g, "");
    if (!clue || !answer) {
      showError(error, "Enter both the clue and the answer you already have.");
      return;
    }
    trackProductEvent("explanation_submit", { tool_context: root.dataset.toolContext || "standalone" });
    const data = await dataPromise;
    const context = root.dataset.toolContext || "standalone";
    const candidatePool = context === "classroom" ? [...data.classroomClues, ...data.solverClues] : data.solverClues;
    const candidates = solveClues(candidatePool, { clue, length: answer.length }).filter((item) => item.answer === answer);
    const exact = candidates.find((item) => normalizeClue(item.clue) === normalizeClue(clue));
    const close = candidates[0];
    const profile = data.answers.find((item) => item.answer === answer);
    renderExplanation(results, exact ?? close, profile, { clue, answer, exact: Boolean(exact) });
  });
}

function renderSolveResults(container, matches, query) {
  container.replaceChildren();
  trackProductEvent("solver_results", { tool_context: query.context, result_count: matches.length });
  if (!matches.length) {
    const state = emptyState(
      "No reviewed match yet",
      "Try fewer clue words or remove one uncertain crossing letter. This validation build does not invent an answer when its reviewed set has no fit."
    );
    const report = element("a", "text-link", "Report a missing answer →");
    report.href = feedbackHref({ mode: "solver", clue: query.clue });
    state.append(report);
    container.append(state);
    return;
  }

  const heading = element("div", "results-heading");
  heading.append(
    element("p", "", `${matches.length} reviewed ${matches.length === 1 ? "match" : "matches"}`),
    element("span", "", query.pattern ? `Pattern ${query.pattern}` : query.length ? `${query.length} letters` : "Ranked by clue fit")
  );
  container.append(heading);
  for (const [index, item] of matches.entries()) container.append(solveResult(item, index, query.context));
}

function solveResult(item, index, context = "standalone") {
  const article = element("article", "solve-result");
  const head = element("div", "solve-result-head");
  const meta = element("span", "result-rank", `Match ${index + 1}`);
  const title = element("h3", "", item.clue);
  const length = element("span", "length-badge", String(item.answer.length));
  head.append(meta, title, length);

  const signal = element("div", "hint-line");
  signal.append(element("span", "hint-label", "Clue signal"), element("p", "", item.signal));

  const hint = element("div", "hint-line hint-secondary");
  hint.hidden = true;
  hint.append(element("span", "hint-label", "Semantic hint"), element("p", "", item.hint));

  const answerBlock = element("div", "result-answer");
  answerBlock.hidden = true;
  answerBlock.append(element("span", "hint-label", "Answer"), answerCells(item.answer));

  const why = element("div", "result-why");
  why.hidden = true;
  why.append(element("span", "hint-label", "Why it fits"), element("p", "", item.explanation));

  const actions = element("div", "result-actions");
  const nextHint = button("Show another hint", "button button-quiet");
  const reveal = button("Reveal answer", "button button-outline");
  const explain = button("Explain the answer", "button button-quiet");
  const report = element("a", "text-link result-feedback-link", "Report this result →");
  report.href = feedbackHref({ mode: "solver", clue: item.clue, answer: item.answer });
  report.hidden = true;
  explain.hidden = true;
  actions.append(nextHint, reveal, explain, report);

  nextHint.addEventListener("click", () => {
    hint.hidden = false;
    nextHint.hidden = true;
  });
  reveal.addEventListener("click", () => {
    hint.hidden = false;
    answerBlock.hidden = false;
    nextHint.hidden = true;
    reveal.hidden = true;
    explain.hidden = false;
    report.hidden = false;
    trackProductEvent("solver_answer_reveal", { tool_context: context, result_rank: index + 1 });
  });
  explain.addEventListener("click", () => {
    why.hidden = false;
    explain.hidden = true;
  });

  article.append(head, signal, hint, answerBlock, why, actions);
  if (item.hubSlug) {
    const compare = element("a", "text-link hub-result-link", `Compare all ${item.clue} answers by length →`);
    compare.href = `/crossword-clues/${item.hubSlug}/`;
    article.append(compare);
  }
  return article;
}

function renderExplanation(container, item, profile, query) {
  container.replaceChildren();
  if (!item && !profile) {
    container.append(emptyState(
      "This pairing is not reviewed yet",
      `We do not have a verified explanation for “${query.clue}” → ${query.answer}. Check the crossings rather than trusting a made-up rationale.`
    ));
    return;
  }

  if (!item && profile) {
    const state = emptyState(
      "The answer is known; the pairing is not",
      `We have a reviewed meaning for ${profile.answer}, but not a verified explanation connecting it to this exact clue.`
    );
    const link = element("a", "text-link", `Read ${profile.answer} meaning and clue patterns →`);
    link.href = `/crosswordese/${profile.slug}/`;
    state.append(link);
    container.append(state);
    return;
  }

  const article = element("article", "explanation-result");
  const status = element("div", "explanation-status");
  status.append(element("span", "review-dot"), element("p", "", query.exact ? "Exact reviewed pairing" : "Closest reviewed pairing"));
  const title = element("h3", "", `${item.clue} → ${item.answer}`);
  const cells = answerCells(item.answer);
  const grid = element("div", "explanation-grid");
  grid.append(
    explanationSection("Why it fits", item.explanation),
    explanationSection("Clue signal", item.signal),
    explanationSection(`${item.answer} meaning here`, item.definition)
  );
  const link = element("a", "text-link", item.hubSlug ? `Compare all ${item.clue} answers by length →` : "Open the full reviewed explanation →");
  link.href = item.hubSlug ? `/crossword-clues/${item.hubSlug}/` : `/explainers/${item.slug}/`;
  const report = element("a", "text-link explanation-feedback-link", "Report this explanation →");
  report.href = feedbackHref({ mode: "explain", clue: query.clue, answer: query.answer });
  article.append(status, title, cells, grid, link, report);
  container.append(article);
}

function explanationSection(title, content) {
  const section = element("section");
  section.append(element("h4", "", title), element("p", "", content));
  return section;
}

function emptyState(title, body) {
  const state = element("div", "empty-state");
  const mark = element("div", "empty-mark");
  mark.setAttribute("aria-hidden", "true");
  mark.append(element("i"), element("i"), element("i"), element("i"));
  state.append(mark, element("h3", "", title), element("p", "", body));
  return state;
}

function answerCells(answer) {
  const cells = element("div", "answer-cells");
  cells.setAttribute("aria-label", answer.split("").join(" "));
  for (const letter of answer) cells.append(element("span", "", letter));
  return cells;
}

function showError(target, message) {
  target.textContent = message;
  target.hidden = false;
}

function button(label, className) {
  const item = element("button", className, label);
  item.type = "button";
  return item;
}

function element(tag, className = "", text = "") {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text) item.textContent = text;
  return item;
}
