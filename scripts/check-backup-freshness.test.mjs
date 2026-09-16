import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  decideBackupFreshness,
  planIssueActions,
  renderIssueBody,
  extractMotifFromBody,
  findOpenBackupIssue,
  createBackupIssue,
  commentOnIssue,
  updateIssueBody,
  closeIssue,
  BACKUPS_ISSUE_TITLE,
  BACKUPS_ISSUE_LABEL,
} from "./check-backup-freshness.mjs";

const NOW = new Date("2026-09-16T12:00:00Z");

function isoMinusHours(hours) {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function successResult(payload) {
  return { kind: "success", body: JSON.stringify(payload) };
}

describe("decideBackupFreshness : contenu frais", () => {
  test("les deux horodatages frais renvoient ok", () => {
    const fetchResult = successResult({
      daily: isoMinusHours(1),
      weekly_verification: isoMinusHours(24),
    });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "ok");
    assert.equal(decision.reason, null);
  });
});

describe("decideBackupFreshness : bornes daily (26 heures)", () => {
  test("25h59 est encore frais", () => {
    const fetchResult = successResult({
      daily: isoMinusHours(25 + 59 / 60),
      weekly_verification: isoMinusHours(1),
    });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "ok");
  });

  test("26h01 est en retard", () => {
    const fetchResult = successResult({
      daily: isoMinusHours(26 + 1 / 60),
      weekly_verification: isoMinusHours(1),
    });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "RETARD:daily");
  });

  test("exactement 26h n'est pas encore un retard (limite incluse)", () => {
    const fetchResult = successResult({
      daily: isoMinusHours(26),
      weekly_verification: isoMinusHours(1),
    });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "ok");
  });
});

describe("decideBackupFreshness : bornes weekly_verification (7 jours et 12 heures)", () => {
  const WEEKLY_THRESHOLD_HOURS = 7 * 24 + 12;

  test("juste sous la limite reste frais", () => {
    const fetchResult = successResult({
      daily: isoMinusHours(1),
      weekly_verification: isoMinusHours(WEEKLY_THRESHOLD_HOURS - 1 / 60),
    });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "ok");
  });

  test("juste au-dessus de la limite est un retard", () => {
    const fetchResult = successResult({
      daily: isoMinusHours(1),
      weekly_verification: isoMinusHours(WEEKLY_THRESHOLD_HOURS + 1 / 60),
    });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "RETARD:weekly_verification");
  });
});

describe("decideBackupFreshness : anomalies de contenu", () => {
  test("clé daily nulle est un incident distinct", () => {
    const fetchResult = successResult({ daily: null, weekly_verification: isoMinusHours(1) });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "CLE_NULLE:daily");
  });

  test("clé weekly_verification nulle est un incident distinct", () => {
    const fetchResult = successResult({ daily: isoMinusHours(1), weekly_verification: null });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "CLE_NULLE:weekly_verification");
  });

  test("JSON invalide est un incident distinct", () => {
    const fetchResult = { kind: "success", body: "{ceci n'est pas du json" };
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "JSON_INVALIDE");
  });

  test("un JSON qui n'est pas un objet (tableau) est un incident distinct", () => {
    const fetchResult = { kind: "success", body: "[1, 2, 3]" };
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "JSON_INVALIDE");
  });

  test("un horodatage dans le futur est un incident distinct", () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const fetchResult = successResult({ daily: future, weekly_verification: isoMinusHours(1) });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "HORODATAGE_FUTUR:daily");
  });

  test("un horodatage illisible (pas une date) est un incident distinct", () => {
    const fetchResult = successResult({ daily: "pas-une-date", weekly_verification: isoMinusHours(1) });
    const decision = decideBackupFreshness(fetchResult, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "HORODATAGE_INVALIDE:daily");
  });
});

describe("decideBackupFreshness : erreurs de transport", () => {
  test("fichier absent (404) est un incident distinct", () => {
    const decision = decideBackupFreshness({ kind: "http-error", status: 404 }, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "FICHIER_ABSENT");
  });

  test("statut HTTP en erreur autre que 404 est un incident distinct", () => {
    const decision = decideBackupFreshness({ kind: "http-error", status: 500 }, NOW);
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "FICHIER_ILLISIBLE");
  });

  test("erreur réseau (fetch qui échoue) est un incident distinct", () => {
    const decision = decideBackupFreshness(
      { kind: "network-error", detail: "getaddrinfo ENOTFOUND alcinae.com" },
      NOW,
    );
    assert.equal(decision.status, "incident");
    assert.equal(decision.reason, "ERREUR_RESEAU");
  });
});

describe("renderIssueBody / extractMotifFromBody", () => {
  test("le motif écrit dans le corps se relit à l'identique", () => {
    const decision = { status: "incident", reason: "RETARD:daily", message: "en retard" };
    const body = renderIssueBody(decision);
    assert.equal(extractMotifFromBody(body), "RETARD:daily");
  });

  test("un corps sans marqueur ne renvoie aucun motif", () => {
    assert.equal(extractMotifFromBody("corps quelconque"), null);
    assert.equal(extractMotifFromBody(""), null);
    assert.equal(extractMotifFromBody(undefined), null);
  });
});

describe("planIssueActions : une seule issue ouverte à la fois", () => {
  test("incident sans issue existante : création", () => {
    const decision = { status: "incident", reason: "RETARD:daily", message: "x" };
    const plan = planIssueActions(decision, null);
    assert.deepEqual(plan, { action: "create" });
  });

  test("incident avec la même issue et le même motif : aucune action", () => {
    const decision = { status: "incident", reason: "RETARD:daily", message: "x" };
    const existingIssue = { number: 42, body: renderIssueBody(decision) };
    const plan = planIssueActions(decision, existingIssue);
    assert.deepEqual(plan, { action: "none" });
  });

  test("incident avec une issue existante mais un motif différent : mise à jour", () => {
    const previousDecision = { status: "incident", reason: "FICHIER_ABSENT", message: "x" };
    const newDecision = { status: "incident", reason: "RETARD:daily", message: "y" };
    const existingIssue = { number: 42, body: renderIssueBody(previousDecision) };
    const plan = planIssueActions(newDecision, existingIssue);
    assert.deepEqual(plan, { action: "update", issueNumber: 42 });
  });

  test("retour à la normale avec une issue ouverte : fermeture", () => {
    const decision = { status: "ok", reason: null, message: null };
    const existingIssue = { number: 42, body: "peu importe" };
    const plan = planIssueActions(decision, existingIssue);
    assert.deepEqual(plan, { action: "close", issueNumber: 42 });
  });

  test("retour à la normale sans issue ouverte : aucune action", () => {
    const decision = { status: "ok", reason: null, message: null };
    const plan = planIssueActions(decision, null);
    assert.deepEqual(plan, { action: "none" });
  });
});

// --- Appels à l'API GitHub : isolés, testés avec un double de fetch --------

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("appels à l'API GitHub REST (fetch remplacé par un double)", () => {
  test("findOpenBackupIssue ne retient que l'issue au bon titre et au bon label", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, [
        { number: 1, title: "Autre issue", body: "" },
        { number: 2, title: BACKUPS_ISSUE_TITLE, body: "<!-- motif: RETARD:daily -->" },
      ]);
    };
    const issue = await findOpenBackupIssue({ repo: "alcinae/status", token: "t", fetchImpl });
    assert.equal(issue.number, 2);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /state=open/);
    assert.match(calls[0].url, new RegExp(encodeURIComponent(BACKUPS_ISSUE_LABEL)));
  });

  test("findOpenBackupIssue renvoie null si aucune issue ne correspond", async () => {
    const fetchImpl = async () => jsonResponse(200, []);
    const issue = await findOpenBackupIssue({ repo: "alcinae/status", token: "t", fetchImpl });
    assert.equal(issue, null);
  });

  test("findOpenBackupIssue propage une erreur claire sur un statut HTTP en échec", async () => {
    const fetchImpl = async () => jsonResponse(500, {});
    await assert.rejects(
      () => findOpenBackupIssue({ repo: "alcinae/status", token: "t", fetchImpl }),
      /500/,
    );
  });

  test("createBackupIssue envoie le bon titre, le bon label et le motif dans le corps", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(201, { number: 7 });
    };
    const decision = { status: "incident", reason: "RETARD:daily", message: "en retard" };
    const issue = await createBackupIssue({ repo: "alcinae/status", token: "t", decision, fetchImpl });
    assert.equal(issue.number, 7);
    const sentBody = JSON.parse(calls[0].options.body);
    assert.equal(sentBody.title, BACKUPS_ISSUE_TITLE);
    assert.deepEqual(sentBody.labels, [BACKUPS_ISSUE_LABEL]);
    assert.match(sentBody.body, /en retard/);
  });

  test("commentOnIssue poste sur le bon numéro d'issue", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(201, {});
    };
    await commentOnIssue({ repo: "alcinae/status", token: "t", issueNumber: 9, body: "salut", fetchImpl });
    assert.match(calls[0].url, /issues\/9\/comments$/);
    assert.deepEqual(JSON.parse(calls[0].options.body), { body: "salut" });
  });

  test("updateIssueBody envoie une requête PATCH avec le nouveau corps", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {});
    };
    await updateIssueBody({ repo: "alcinae/status", token: "t", issueNumber: 9, body: "nouveau corps", fetchImpl });
    assert.equal(calls[0].options.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].options.body), { body: "nouveau corps" });
  });

  test("closeIssue envoie une requête PATCH state=closed", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, {});
    };
    await closeIssue({ repo: "alcinae/status", token: "t", issueNumber: 9, fetchImpl });
    assert.equal(calls[0].options.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].options.body), { state: "closed" });
  });
});
