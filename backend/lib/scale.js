// SCALE — Student Competency and Activity Ledger for Education.
//
// Canonical indicator catalogue. Indicator weights are within their
// domain (sum to 100% per domain). Composite weights are how much each
// domain contributes to the 100-point overall score. Both are baked
// here as defaults; the composite weights can be overridden per-school
// via app_settings.scale.weights ({ A, E, C, B }).
//
// Each indicator is scored on its own scale (see SCALE_SCALES): 1-10,
// Yes/No, or Good/Very Good/Excellent. Raw scores are always 1-based (1..max).
// Term aggregate per indicator = average of all entries for that student ×
// indicator over the date range, scaled to 0-100: ((avg - 1) / (max - 1)) * 100.
//
// Domain score = Σ (indicator avg × indicator weight).
// Composite   = Σ (domain score × domain weight).

export const SCALE_DOMAINS = [
  { key: "A", label: "Academic output",  short: "Academic",   color: "#1f3f8b" },
  { key: "E", label: "Expression",       short: "Expression", color: "#1f7a3a" },
  { key: "C", label: "Creativity & play",short: "Creativity", color: "#e8530e" },
  { key: "B", label: "Behaviour & habits", short: "Behaviour", color: "#c11d1d" },
];

// Scale types. Each indicator is scored on one of these. Raw scores are
// always 1-based (1..max) so the 0-100 normalisation is uniform:
//   normalised = ((rawAvg - 1) / (max - 1)) * 100
// `options` drives the picker UI (value stored + button/label shown).
export const SCALE_SCALES = {
  num4:  { max: 4,  hint: "1–4",                options: [1, 2, 3, 4].map((v) => ({ v, label: String(v) })) },
  num10: { max: 10, hint: "1–10",               options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v, label: String(v) })) },
  yesno: { max: 2,  hint: "No / Yes",           options: [{ v: 1, label: "No" }, { v: 2, label: "Yes" }] },
  gbe:   { max: 3,  hint: "Good · Very Good · Excellent", options: [{ v: 1, label: "Good" }, { v: 2, label: "Very Good" }, { v: 3, label: "Excellent" }] },
};

export const SCALE_INDICATORS = [
  // A — Academic output
  { key: "A.lesson_test",       domain: "A", label: "Lesson test score",     indicatorWeight: 40, scaleType: "num10" },
  { key: "A.worksheet",         domain: "A", label: "Worksheet completion", indicatorWeight: 20, scaleType: "yesno" },
  { key: "A.oral_response",     domain: "A", label: "Oral response quality", indicatorWeight: 20, scaleType: "yesno" },
  { key: "A.homework_return",   domain: "A", label: "Homework return rate", indicatorWeight: 20, scaleType: "yesno" },
  // E — Expression
  { key: "E.handwriting",       domain: "E", label: "Handwriting clarity",  indicatorWeight: 25, scaleType: "num10" },
  { key: "E.reading_fluency",   domain: "E", label: "Reading fluency",      indicatorWeight: 25, scaleType: "num10" },
  { key: "E.speaking",          domain: "E", label: "Speaking confidence",  indicatorWeight: 25, scaleType: "num10" },
  { key: "E.presentation",      domain: "E", label: "Presentation structure", indicatorWeight: 25, scaleType: "num10" },
  // C — Creativity & play
  { key: "C.initiates",         domain: "C", label: "Initiates activity ideas", indicatorWeight: 30, scaleType: "gbe" },
  { key: "C.participates",      domain: "C", label: "Participates in play",     indicatorWeight: 30, scaleType: "gbe" },
  { key: "C.invents_rules",     domain: "C", label: "Invents rules / roles",    indicatorWeight: 20, scaleType: "gbe" },
  { key: "C.cross_domain",      domain: "C", label: "Cross-domain thinking",    indicatorWeight: 20, scaleType: "gbe" },
  // B — Behaviour & habits
  { key: "B.punctuality",       domain: "B", label: "Punctuality / turnout",   indicatorWeight: 30, scaleType: "gbe" },
  { key: "B.discipline",        domain: "B", label: "Discipline in class",     indicatorWeight: 30, scaleType: "gbe" },
  { key: "B.screen_free",       domain: "B", label: "Screen-free engagement",  indicatorWeight: 20, scaleType: "gbe" },
  { key: "B.peer_tone",         domain: "B", label: "Peer interaction tone",   indicatorWeight: 20, scaleType: "gbe" },
];

// Max raw value per indicator key (from its scale type), for normalisation.
const INDICATOR_MAX = Object.fromEntries(
  SCALE_INDICATORS.map((i) => [i.key, (SCALE_SCALES[i.scaleType] || SCALE_SCALES.num4).max])
);
export function indicatorMax(key) {
  return INDICATOR_MAX[key] || 4;
}

// Default composite weights — Academic deliberately heavier than the
// other three so academic outcomes lead, but creativity and behaviour
// matter enough that a disruptive-but-brilliant kid doesn't look worse
// than a quietly-compliant one. Admin can override in Settings.
export const SCALE_DEFAULT_DOMAIN_WEIGHTS = { A: 35, E: 20, C: 20, B: 25 };

// Per-domain band → narrative label. Used on the report card.
export function bandFor(score) {
  if (score == null || Number.isNaN(score)) return { label: "—",         tone: "info" };
  if (score >= 85) return { label: "Exceeds standard", tone: "ok" };
  if (score >= 65) return { label: "Meets standard",   tone: "ok" };
  if (score >= 45) return { label: "Developing",       tone: "warn" };
  return                  { label: "Needs support",    tone: "bad" };
}

export function compositeBand(score) {
  if (score == null || Number.isNaN(score)) return "—";
  if (score >= 85) return "Outstanding";
  if (score >= 70) return "Progressing well";
  if (score >= 55) return "On track · attention needed";
  if (score >= 40) return "At risk · support plan";
  return "Needs intervention";
}

// Compute one student's profile from a flat list of scale_entries.
// Returns { perIndicator, perDomain, composite } where each numeric
// value is a 0-100 score (or null when no entries exist for it).
export function computeProfile(entries, domainWeights = SCALE_DEFAULT_DOMAIN_WEIGHTS) {
  // Average raw score (1-4) per indicator.
  const byInd = new Map();
  for (const e of entries || []) {
    if (!e || typeof e.score !== "number") continue;
    if (!byInd.has(e.indicatorKey)) byInd.set(e.indicatorKey, { sum: 0, n: 0 });
    const acc = byInd.get(e.indicatorKey);
    acc.sum += e.score; acc.n += 1;
  }

  const perIndicator = {};
  for (const ind of SCALE_INDICATORS) {
    const acc = byInd.get(ind.key);
    // Normalise the raw average (1..max) to 0-100 using this indicator's
    // own scale max — 1-10, Yes/No (max 2), Good/Very Good/Excellent (max 3), etc.
    const max = indicatorMax(ind.key);
    perIndicator[ind.key] = acc && acc.n
      ? Math.round(((acc.sum / acc.n - 1) / Math.max(1, max - 1)) * 100)
      : null;
  }

  // Domain score = Σ (indicator score × indicator weight). Skip
  // indicators with no data — re-normalise the surviving weights so a
  // teacher who only scored 2 of 4 indicators still gets a fair domain
  // average rather than a depressed one.
  const perDomain = {};
  for (const dom of SCALE_DOMAINS) {
    let weighted = 0, weightSum = 0;
    for (const ind of SCALE_INDICATORS) {
      if (ind.domain !== dom.key) continue;
      const v = perIndicator[ind.key];
      if (v == null) continue;
      weighted  += v * ind.indicatorWeight;
      weightSum += ind.indicatorWeight;
    }
    perDomain[dom.key] = weightSum > 0 ? Math.round(weighted / weightSum) : null;
  }

  // Composite score — same re-normalisation.
  let cw = 0, csum = 0;
  for (const dom of SCALE_DOMAINS) {
    const v = perDomain[dom.key];
    if (v == null) continue;
    const w = Number(domainWeights?.[dom.key]) || 0;
    cw  += v * w;
    csum += w;
  }
  const composite = csum > 0 ? Math.round(cw / csum) : null;

  return { perIndicator, perDomain, composite };
}

// ---------- Narrative generation ----------
// Template-based, deliberately. Real prose comes from the teacher's
// observation field at the bottom of the report. These templates give
// factual context — band + strongest / weakest indicator within the
// domain — so the parent has a structured starting point to read.

function indicatorLabel(key) {
  return SCALE_INDICATORS.find((i) => i.key === key)?.label || key;
}

const NARRATIVE_TEMPLATES = {
  A: {
    ok:   "Solid academic engagement across lesson tasks and assessments. Strongest in {strong}; the most useful next stretch is {weak}.",
    warn: "Academic engagement is uneven this term. {strong} is reliable, but {weak} is holding the composite back — that's the area to focus on first.",
    bad:  "Academic output needs urgent attention. {weak} is well below grade expectations. Begin with diagnosing whether the gap is conceptual, attentional, or skill-based before adding more practice.",
  },
  E: {
    ok:   "Expression channels are functional and developing. {strong} is working well; targeted practice on {weak} would unlock the rest.",
    warn: "Expression is the area that needs deliberate attention. {weak} shows the largest gap. This is rarely a confidence ceiling — it's an untrained skill that responds quickly to short, structured practice.",
    bad:  "Expression skills are well below grade level. {weak} in particular is preventing the student from showing what they actually know in other domains. Prioritise structured remediation here.",
  },
  C: {
    ok:   "A genuine asset and one of this student's strongest channels. {strong} stands out; {weak} is the only area where creative output isn't yet showing through.",
    warn: "Creativity is present but inconsistently expressed. {strong} surfaces when the lesson invites it; {weak} suggests the channel isn't being given enough room.",
    bad:  "Creative engagement is low across the indicators. Consider whether the lesson formats are giving this student opportunity to express; this is more often a curriculum-design issue than a student deficit.",
  },
  B: {
    ok:   "Habits and behaviour are reliable. Strongest in {strong}. Continued attention on {weak} will keep this band steady.",
    warn: "Behaviour is adequate but not yet a strength. {weak} is the most actionable improvement — small, structured changes tend to move this score quickly. A high creativity score with low behaviour is a known pattern: students with strong creative drive find structured routine unstimulating.",
    bad:  "Behaviour patterns need a structured response. {weak} requires a clear plan — consistent routines, brief movement breaks, and giving this student a structured role during transitions (helper, leader, timer-keeper) usually improve scores without punitive measures.",
  },
};

// Pick the 1-2 strongest and weakest indicators within a domain.
function indicatorExtremes(perIndicator, domainKey) {
  const rows = SCALE_INDICATORS
    .filter((i) => i.domain === domainKey)
    .map((i) => ({ key: i.key, label: i.label, score: perIndicator[i.key] }))
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score);
  return {
    strong: rows[0] || null,
    weak:   rows.length > 1 ? rows[rows.length - 1] : null,
  };
}

// Public — returns the narrative paragraph for one domain, or a
// no-data placeholder if nothing was scored.
export function narrativeFor(domainKey, perDomainScore, perIndicator) {
  if (perDomainScore == null) {
    return "No SCALE entries recorded for this domain yet — score a few sessions before drawing conclusions.";
  }
  const tone = perDomainScore >= 65 ? "ok" : perDomainScore >= 45 ? "warn" : "bad";
  const tpl = NARRATIVE_TEMPLATES[domainKey]?.[tone] || "";
  const ext = indicatorExtremes(perIndicator, domainKey);
  return tpl
    .replace("{strong}", ext.strong?.label?.toLowerCase() || "no consistent strength")
    .replace("{weak}",   ext.weak?.label?.toLowerCase()   || "no clear weakness");
}

// Returns the 3-4 lowest-scoring indicators across all domains as
// concrete actions for the term ahead. We prefer one-liner imperatives
// keyed off the indicator key so the language stays specific.
const ACTION_BY_INDICATOR = {
  "A.lesson_test":     "Daily 5-minute pre-test recall — link prior lesson before the new one starts.",
  "A.worksheet":       "Worksheet completion rate to be tracked daily; one missed = 1:1 conversation, not a write-off.",
  "A.oral_response":   "Cold-call this student in every lesson. No volunteers-only days.",
  "A.homework_return": "Homework return drilled into the start-of-day ritual; defaulters meet the class teacher.",
  "E.handwriting":     "Targeted 10-minute daily handwriting drill, not mixed with other work.",
  "E.reading_fluency": "Daily timed reading aloud — 2 minutes per session, with a familiar text.",
  "E.speaking":        "2 minutes structured speaking practice per week minimum — show-and-tell, peer interview, oral summary.",
  "E.presentation":    "Weekly 1-slide presentation task — building structure habits, not content depth.",
  "C.initiates":       "Use creative strengths as the entry point for academic tasks wherever possible.",
  "C.participates":    "Pair this student with a less-engaged peer in group activities — engagement transfers.",
  "C.invents_rules":   "Design one leadership role per week in daily routine to channel the creative energy constructively.",
  "C.cross_domain":    "Project tasks that explicitly cross subjects (e.g. science via art) once a week.",
  "B.punctuality":     "Daily timekeeper role rotated — including this student weekly.",
  "B.discipline":      "Structured role during lesson transitions (helper, materials manager) before unstructured time.",
  "B.screen_free":     "Replace screen-allowed periods with structured movement or building activity, not silent waiting.",
  "B.peer_tone":       "Restorative-conversation script with a trained teacher when peer issues arise — not punitive.",
};

export function priorityFocusFor(perIndicator, perDomain, max = 4) {
  // Rank scored indicators ascending; tie-break by the indicator's
  // weight in its domain so the most-load-bearing weak ones come first.
  const ranked = SCALE_INDICATORS
    .map((i) => ({
      key: i.key,
      label: i.label,
      domainKey: i.domain,
      weight: i.indicatorWeight,
      score: perIndicator[i.key],
    }))
    .filter((r) => r.score != null && r.score < 70)
    .sort((a, b) => (a.score - b.score) || (b.weight - a.weight));

  const out = [];
  for (const r of ranked) {
    const action = ACTION_BY_INDICATOR[r.key];
    if (!action) continue;
    out.push({ indicator: r.label, score: r.score, action });
    if (out.length >= max) break;
  }
  return out;
}
