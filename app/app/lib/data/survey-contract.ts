// The survey's contract, TS side. Mirrors `compass/orchestrator/survey_contract.py` field for field.
//
// Both sides validate the same shape against the same fixtures (`compass/orchestrator/tests/
// fixtures/survey_*.json`), so a field added to one and not the other fails a test rather than a
// live run. Nothing here is defaulted silently: a value that is present and wrong throws, and an
// absent required value throws too.

export const SURVEY_CONTRACT_VERSION = 1;

export const SURVEY_STATUSES = ["surveyed", "survey_failed", "refused"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export class SurveyContractError extends Error {}

export type SurveyRequest = {
  version: typeof SURVEY_CONTRACT_VERSION;
  repos: { key: string; local_path: string }[];
  subject_ref: string;
  focus: string;
  context: string;
  caller: { kind: "ts" | "python"; handoff_call_id: string };
};

export type SurveyResult = {
  version: typeof SURVEY_CONTRACT_VERSION;
  status: SurveyStatus;
  sections: { heading: string; body: string }[];
  files_cited: string[];
  refusal: string | null;
  log_ref: string;
  usage: { input_tokens: number; output_tokens: number } | null;
};

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || !v.trim()) throw new SurveyContractError(`${where} must be a non-empty string`);
  return v;
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new SurveyContractError(`${where} must be an object`);
  return v as Record<string, unknown>;
}

export function parseSurveyRequest(data: unknown): SurveyRequest {
  const d = obj(data, "request");
  if (d.version !== SURVEY_CONTRACT_VERSION) throw new SurveyContractError(`request.version must be ${SURVEY_CONTRACT_VERSION}`);

  if (!Array.isArray(d.repos) || d.repos.length === 0) throw new SurveyContractError("request.repos must be a non-empty list");
  const repos = d.repos.map((r, i) => {
    const o = obj(r, `request.repos[${i}]`);
    return { key: str(o.key, `request.repos[${i}].key`), local_path: str(o.local_path, `request.repos[${i}].local_path`) };
  });
  if (new Set(repos.map((r) => r.key)).size !== repos.length) throw new SurveyContractError("request.repos names the same key twice");

  const caller = obj(d.caller, "request.caller");
  const kind = str(caller.kind, "request.caller.kind");
  if (kind !== "ts" && kind !== "python") throw new SurveyContractError("request.caller.kind must be one of ts, python");

  let context = "";
  if (d.context !== undefined && d.context !== null) {
    if (typeof d.context !== "string") throw new SurveyContractError("request.context must be a string when present");
    context = d.context;
  }

  return {
    version: SURVEY_CONTRACT_VERSION,
    repos,
    subject_ref: str(d.subject_ref, "request.subject_ref"),
    focus: str(d.focus, "request.focus"),
    context,
    caller: { kind, handoff_call_id: str(caller.handoff_call_id, "request.caller.handoff_call_id") },
  };
}

export function parseSurveyResult(data: unknown): SurveyResult {
  const d = obj(data, "result");
  if (d.version !== SURVEY_CONTRACT_VERSION) throw new SurveyContractError(`result.version must be ${SURVEY_CONTRACT_VERSION}`);

  const status = str(d.status, "result.status");
  if (!(SURVEY_STATUSES as readonly string[]).includes(status)) {
    throw new SurveyContractError(`result.status '${status}' is not one of ${SURVEY_STATUSES.join(", ")}`);
  }

  if (!Array.isArray(d.sections)) throw new SurveyContractError("result.sections must be a list");
  const sections = d.sections.map((s, i) => {
    const o = obj(s, `result.sections[${i}]`);
    return { heading: str(o.heading, `result.sections[${i}].heading`), body: str(o.body, `result.sections[${i}].body`) };
  });
  if (!Array.isArray(d.files_cited) || !d.files_cited.every((f) => typeof f === "string" && f.trim())) {
    throw new SurveyContractError("result.files_cited must be a list of non-empty strings");
  }
  const refusal = d.refusal == null ? null : str(d.refusal, "result.refusal");

  // The rules every caller relies on: a survey with no findings, or findings citing no file, surveyed nothing.
  if (status === "surveyed" && sections.length === 0) throw new SurveyContractError("result.status 'surveyed' requires at least one section");
  if (status === "surveyed" && d.files_cited.length === 0) throw new SurveyContractError("result.status 'surveyed' requires at least one cited file");
  if (status !== "surveyed" && !refusal) throw new SurveyContractError(`result.status '${status}' requires a reason`);

  let usage: SurveyResult["usage"] = null;
  if (d.usage != null) {
    const u = obj(d.usage, "result.usage");
    if (!Number.isInteger(u.input_tokens) || !Number.isInteger(u.output_tokens)) {
      throw new SurveyContractError("result.usage tokens must be integers");
    }
    usage = { input_tokens: u.input_tokens as number, output_tokens: u.output_tokens as number };
  }

  return {
    version: SURVEY_CONTRACT_VERSION,
    status: status as SurveyStatus,
    sections,
    files_cited: d.files_cited as string[],
    refusal,
    log_ref: str(d.log_ref, "result.log_ref"),
    usage,
  };
}
