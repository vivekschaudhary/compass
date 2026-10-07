// The generator's contract, TS side. Mirrors `compass/orchestrator/generate.py` field for field.
//
// Both sides validate the same shape against the same fixtures (`compass/orchestrator/tests/
// fixtures/`), so a field added to one and not the other fails a test rather than a live run.
// Nothing here is defaulted silently: a value that is present and wrong throws, and an absent
// required value throws too.

export const CONTRACT_VERSION = 1;

export const FRAMEWORKS = ["nextjs-ts"] as const;
export type Framework = (typeof FRAMEWORKS)[number];

export const STATUSES = ["shipped", "checks_failed", "generator_failed", "refused"] as const;
export type Status = (typeof STATUSES)[number];

export class ContractError extends Error {}

export type GenerateRequest = {
  version: typeof CONTRACT_VERSION;
  framework: Framework;
  repo: { key: string; local_path: string };
  subject_ref: string;
  options: string;
  caller: { kind: "ts" | "python"; handoff_call_id: string };
  checks?: string[];
};

export type GenerateResult = {
  version: typeof CONTRACT_VERSION;
  status: Status;
  branch: string | null;
  pr_url: string | null;
  files_changed: number;
  checks: { ran: string[]; failed: string | null; tail: string | null };
  refusal: string | null;
  log_ref: string;
  usage: null;
};

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || !v.trim()) throw new ContractError(`${where} must be a non-empty string`);
  return v;
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new ContractError(`${where} must be an object`);
  return v as Record<string, unknown>;
}

export function parseRequest(data: unknown): GenerateRequest {
  const d = obj(data, "request");
  if (d.version !== CONTRACT_VERSION) throw new ContractError(`request.version must be ${CONTRACT_VERSION}`);

  const framework = str(d.framework, "request.framework");
  if (!(FRAMEWORKS as readonly string[]).includes(framework)) {
    throw new ContractError(`request.framework '${framework}' is not a supported framework`);
  }

  const repo = obj(d.repo, "request.repo");
  const caller = obj(d.caller, "request.caller");
  const kind = str(caller.kind, "request.caller.kind");
  if (kind !== "ts" && kind !== "python") {
    throw new ContractError(`request.caller.kind '${kind}' must be one of ts, python`);
  }

  let options = "";
  if (d.options !== undefined && d.options !== null) {
    if (typeof d.options !== "string") throw new ContractError("request.options must be a string when present");
    options = d.options;
  }

  let checks: string[] | undefined;
  if (d.checks !== undefined) {
    if (!Array.isArray(d.checks) || !d.checks.every((c) => typeof c === "string" && c.trim())) {
      throw new ContractError("request.checks must be a list of non-empty strings, or absent");
    }
    if (d.checks.length === 0) throw new ContractError("request.checks is empty; omit it to use the stack's defaults");
    checks = d.checks as string[];
  }

  return {
    version: CONTRACT_VERSION,
    framework: framework as Framework,
    repo: { key: str(repo.key, "request.repo.key"), local_path: str(repo.local_path, "request.repo.local_path") },
    subject_ref: str(d.subject_ref, "request.subject_ref"),
    options,
    caller: { kind, handoff_call_id: str(caller.handoff_call_id, "request.caller.handoff_call_id") },
    ...(checks ? { checks } : {}),
  };
}

export function parseResult(data: unknown): GenerateResult {
  const d = obj(data, "result");
  if (d.version !== CONTRACT_VERSION) throw new ContractError(`result.version must be ${CONTRACT_VERSION}`);

  const status = str(d.status, "result.status");
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new ContractError(`result.status '${status}' is not one of ${STATUSES.join(", ")}`);
  }
  const pr_url = d.pr_url == null ? null : str(d.pr_url, "result.pr_url");
  const refusal = d.refusal == null ? null : str(d.refusal, "result.refusal");

  // The rule every caller relies on: a run that shipped with no PR shipped nothing.
  if (status === "shipped" && !pr_url) throw new ContractError("result.status 'shipped' requires a pr_url");
  if (status === "refused" && !refusal) throw new ContractError("result.status 'refused' requires a refusal reason");

  if (typeof d.files_changed !== "number" || !Number.isInteger(d.files_changed) || d.files_changed < 0) {
    throw new ContractError("result.files_changed must be a non-negative integer");
  }

  const checks = obj(d.checks, "result.checks");
  if (!Array.isArray(checks.ran) || !checks.ran.every((c) => typeof c === "string")) {
    throw new ContractError("result.checks.ran must be a list of strings");
  }

  if (d.usage !== null) throw new ContractError("result.usage must be null; the generator makes no model call");

  return {
    version: CONTRACT_VERSION,
    status: status as Status,
    branch: d.branch == null ? null : str(d.branch, "result.branch"),
    pr_url,
    files_changed: d.files_changed,
    checks: {
      ran: checks.ran as string[],
      failed: checks.failed == null ? null : str(checks.failed, "result.checks.failed"),
      tail: checks.tail == null ? null : str(checks.tail, "result.checks.tail"),
    },
    refusal,
    log_ref: str(d.log_ref, "result.log_ref"),
    usage: null,
  };
}
