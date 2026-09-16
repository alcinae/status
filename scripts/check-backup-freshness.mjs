#!/usr/bin/env node
// Contrôle horaire de fraîcheur des sauvegardes (T5, SPEC-status-page-maison).
//
// Lit le fichier public écrit par le VPS après chaque sauvegarde réussie
// (modèle "pull", aucun secret côté VPS), decide si l'état est "ok" ou
// "incident", et ouvre/commente/ferme une issue GitHub unique en
// conséquence. Node sans dépendance (fetch et AbortController natifs,
// Node >= 18), testé par `node --test`.
//
// Contrat exact du fichier lu (fixé par SPEC.md, commun à l'agent qui
// l'écrit côté VPS) :
//   { "daily": "<ISO 8601 UTC arrondi à l'heure inférieure>",
//     "weekly_verification": "<idem>" }
// Une clé vaut null si la tâche correspondante n'a encore jamais réussi.

const STATUS_BOT_USER_AGENT =
  "Mozilla/5.0 (compatible; AlcinaeStatusBot/1.0; +https://status.alcinae.com/)";
const FETCH_TIMEOUT_MS = 20_000;
const GITHUB_API_BASE = "https://api.github.com";

export const BACKUPS_ISSUE_TITLE = "Sauvegardes : retard ou vérification manquante";
export const BACKUPS_ISSUE_LABEL = "incident";

const FRESHNESS_THRESHOLDS_MS = {
  daily: 26 * 60 * 60 * 1000,
  weekly_verification: (7 * 24 + 12) * 60 * 60 * 1000,
};

const OK_DECISION = Object.freeze({ status: "ok", reason: null, message: null });

function incidentDecision(reason, message) {
  return { status: "incident", reason, message };
}

function thresholdLabel(key) {
  return key === "daily" ? "26 heures" : "7 jours et 12 heures";
}

// --- Décision pure : aucune I/O, entièrement testable par node --test -----

/**
 * @param {{kind: "success", body: string} | {kind: "http-error", status: number} | {kind: "network-error", detail: string}} fetchResult
 * @param {Date} now
 */
export function decideBackupFreshness(fetchResult, now) {
  if (fetchResult.kind === "network-error") {
    return incidentDecision(
      "ERREUR_RESEAU",
      `Erreur réseau en lisant backups.json : ${fetchResult.detail}`,
    );
  }

  if (fetchResult.kind === "http-error") {
    if (fetchResult.status === 404) {
      return incidentDecision("FICHIER_ABSENT", "backups.json est introuvable (404)");
    }
    return incidentDecision(
      "FICHIER_ILLISIBLE",
      `backups.json a répondu avec le statut ${fetchResult.status}`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(fetchResult.body);
  } catch {
    return incidentDecision("JSON_INVALIDE", "Le contenu de backups.json n'est pas un JSON valide");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return incidentDecision("JSON_INVALIDE", "Le contenu de backups.json n'est pas un objet JSON");
  }

  for (const key of ["daily", "weekly_verification"]) {
    const perKeyDecision = evaluateTimestamp(key, payload[key], now);
    if (perKeyDecision) {
      return perKeyDecision;
    }
  }
  return OK_DECISION;
}

function evaluateTimestamp(key, value, now) {
  if (value === null || value === undefined) {
    return incidentDecision(
      `CLE_NULLE:${key}`,
      `La tâche "${key}" n'a encore jamais réussi (clé nulle)`,
    );
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return incidentDecision(
      `HORODATAGE_INVALIDE:${key}`,
      `La clé "${key}" ne contient pas un horodatage ISO 8601 valide : "${value}"`,
    );
  }
  if (timestamp.getTime() > now.getTime()) {
    return incidentDecision(
      `HORODATAGE_FUTUR:${key}`,
      `La clé "${key}" porte un horodatage dans le futur : "${value}"`,
    );
  }
  const ageMs = now.getTime() - timestamp.getTime();
  if (ageMs > FRESHNESS_THRESHOLDS_MS[key]) {
    return incidentDecision(
      `RETARD:${key}`,
      `"${key}" date de plus de ${thresholdLabel(key)} (dernier succès : "${value}")`,
    );
  }
  return null;
}

// --- Rendu du corps d'issue et extraction du motif : pur, testable --------

export function renderIssueBody(decision) {
  return [
    "Ouverte automatiquement par le contrôle horaire de fraîcheur des sauvegardes",
    "(infra/platform/status-page/.github/workflows/backup-freshness.yml).",
    "",
    `Motif : ${decision.message}`,
    "",
    "Cette issue se ferme automatiquement au retour à la normale. Elle ne remplace",
    "jamais docs/deployment/incident-register.md (dépôt privé), seule preuve",
    "contractuelle : reporter cet incident dans le registre le jour même.",
    "",
    `<!-- motif: ${decision.reason} -->`,
  ].join("\n");
}

export function extractMotifFromBody(body) {
  const match = /<!-- motif: (.+?) -->/.exec(body ?? "");
  return match ? match[1] : null;
}

/**
 * Décide l'action à mener sur l'issue unique de suivi, à partir de la
 * décision de fraîcheur et de l'issue ouverte existante (ou null).
 */
export function planIssueActions(decision, existingIssue) {
  if (decision.status === "incident") {
    if (!existingIssue) {
      return { action: "create" };
    }
    const previousMotif = extractMotifFromBody(existingIssue.body);
    if (previousMotif === decision.reason) {
      return { action: "none" };
    }
    return { action: "update", issueNumber: existingIssue.number };
  }
  if (existingIssue) {
    return { action: "close", issueNumber: existingIssue.number };
  }
  return { action: "none" };
}

// --- Effets de bord : lecture HTTP du fichier de statut --------------------

export async function fetchBackupsStatus(url, { timeoutMs = FETCH_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { "User-Agent": STATUS_BOT_USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { kind: "http-error", status: response.status };
    }
    const body = await response.text();
    return { kind: "success", body };
  } catch (error) {
    return { kind: "network-error", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

// --- Effets de bord : API REST GitHub, isolés pour être testés avec un double ---

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": STATUS_BOT_USER_AGENT,
  };
}

export async function findOpenBackupIssue({ repo, token, fetchImpl = fetch }) {
  const url =
    `${GITHUB_API_BASE}/repos/${repo}/issues?state=open&labels=` +
    `${encodeURIComponent(BACKUPS_ISSUE_LABEL)}&per_page=100`;
  const response = await fetchImpl(url, { headers: githubHeaders(token) });
  if (!response.ok) {
    throw new Error(`GitHub API : échec de la recherche d'issue (${response.status})`);
  }
  const issues = await response.json();
  return issues.find((issue) => issue.title === BACKUPS_ISSUE_TITLE) ?? null;
}

export async function createBackupIssue({ repo, token, decision, fetchImpl = fetch }) {
  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${repo}/issues`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify({
      title: BACKUPS_ISSUE_TITLE,
      labels: [BACKUPS_ISSUE_LABEL],
      body: renderIssueBody(decision),
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub API : échec de la création de l'issue (${response.status})`);
  }
  return response.json();
}

export async function commentOnIssue({ repo, token, issueNumber, body, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `${GITHUB_API_BASE}/repos/${repo}/issues/${issueNumber}/comments`,
    { method: "POST", headers: githubHeaders(token), body: JSON.stringify({ body }) },
  );
  if (!response.ok) {
    throw new Error(`GitHub API : échec de l'ajout d'un commentaire (${response.status})`);
  }
  return response.json();
}

export async function updateIssueBody({ repo, token, issueNumber, body, fetchImpl = fetch }) {
  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: githubHeaders(token),
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error(`GitHub API : échec de la mise à jour de l'issue (${response.status})`);
  }
  return response.json();
}

export async function closeIssue({ repo, token, issueNumber, fetchImpl = fetch }) {
  const response = await fetchImpl(`${GITHUB_API_BASE}/repos/${repo}/issues/${issueNumber}`, {
    method: "PATCH",
    headers: githubHeaders(token),
    body: JSON.stringify({ state: "closed" }),
  });
  if (!response.ok) {
    throw new Error(`GitHub API : échec de la fermeture de l'issue (${response.status})`);
  }
  return response.json();
}

// --- Orchestration ----------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

async function main() {
  const url =
    process.env.BACKUPS_STATUS_URL ?? "https://alcinae.com/.well-known/alcinae-status/backups.json";
  const token = requireEnv("GITHUB_TOKEN");
  const repo = requireEnv("GITHUB_REPOSITORY");

  const fetchResult = await fetchBackupsStatus(url);
  const decision = decideBackupFreshness(fetchResult, new Date());
  const existingIssue = await findOpenBackupIssue({ repo, token });
  const plan = planIssueActions(decision, existingIssue);

  switch (plan.action) {
    case "create": {
      const issue = await createBackupIssue({ repo, token, decision });
      console.log(`Issue créée : #${issue.number} (motif ${decision.reason})`);
      break;
    }
    case "update": {
      await commentOnIssue({
        repo,
        token,
        issueNumber: plan.issueNumber,
        body: `Motif toujours en incident, nouvelle cause : ${decision.message}`,
      });
      await updateIssueBody({
        repo,
        token,
        issueNumber: plan.issueNumber,
        body: renderIssueBody(decision),
      });
      console.log(`Issue #${plan.issueNumber} commentée (motif ${decision.reason})`);
      break;
    }
    case "close": {
      await commentOnIssue({
        repo,
        token,
        issueNumber: plan.issueNumber,
        body: "Sauvegardes de nouveau à jour, fermeture automatique.",
      });
      await closeIssue({ repo, token, issueNumber: plan.issueNumber });
      console.log(`Issue #${plan.issueNumber} fermée (retour à la normale)`);
      break;
    }
    case "none":
      console.log(
        decision.status === "ok"
          ? "Sauvegardes à jour, rien à faire."
          : `Incident déjà signalé (motif ${decision.reason}), aucun changement.`,
      );
      break;
  }
}

const isRunDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isRunDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
