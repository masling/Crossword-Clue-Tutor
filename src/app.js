import { clueHubCandidates, normalizeClue, normalizePattern, solveClues } from "/assets/solver.mjs";

const dataPromise = Promise.all([
  fetch("/assets/clues.json").then((response) => response.json()),
  fetch("/assets/answers.json").then((response) => response.json()),
  fetch("/assets/clue-hubs.json").then((response) => response.json())
]).then(([clues, answers, clueHubs]) => {
  const hubClues = clueHubCandidates(clueHubs);
  return { clues, answers, clueHubs, hubClues, solverClues: [...clues, ...hubClues] };
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

setupSavedClueButtons();
setupSavedCluesPage();

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
    const { solverClues } = await dataPromise;
    const matches = solveClues(solverClues, { clue, pattern, length }).slice(0, 5);
    renderSolveResults(results, matches, { clue, pattern, length });
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
    const data = await dataPromise;
    const candidates = solveClues(data.solverClues, { clue, length: answer.length }).filter((item) => item.answer === answer);
    const exact = candidates.find((item) => normalizeClue(item.clue) === normalizeClue(clue));
    const close = candidates[0];
    const profile = data.answers.find((item) => item.answer === answer);
    renderExplanation(results, exact ?? close, profile, { clue, answer, exact: Boolean(exact) });
  });
}

function renderSolveResults(container, matches, query) {
  container.replaceChildren();
  if (!matches.length) {
    container.append(emptyState(
      "No reviewed match yet",
      "Try fewer clue words or remove one uncertain crossing letter. This validation build does not invent an answer when its reviewed set has no fit."
    ));
    return;
  }

  const heading = element("div", "results-heading");
  heading.append(
    element("p", "", `${matches.length} reviewed ${matches.length === 1 ? "match" : "matches"}`),
    element("span", "", query.pattern ? `Pattern ${query.pattern}` : query.length ? `${query.length} letters` : "Ranked by clue fit")
  );
  container.append(heading);
  for (const [index, item] of matches.entries()) container.append(solveResult(item, index));
}

function solveResult(item, index) {
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
  explain.hidden = true;
  actions.append(nextHint, reveal, explain);

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
  article.append(status, title, cells, grid, link);
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
