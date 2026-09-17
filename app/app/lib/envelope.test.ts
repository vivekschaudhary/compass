import { describe, expect, it } from "vitest";
import { readEnvelope, describeFailure } from "./envelope";
import { ok, refuse, fail, respond } from "./http";

// The contract every API route answers in. Status AND body are asserted together throughout, because
// "a refusal returned 200" is exactly the defect a body-only assertion cannot see.

const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("route helpers", () => {
  it("ok spreads the payload beside ok: true, with 200", async () => {
    const r = ok({ lines: [1] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, lines: [1] });
  });

  it("refuse normalises strings to refusals and defaults to 422", async () => {
    const r = refuse(["bad key", { message: "no org", fix: "Import the seed first." }]);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      ok: false,
      refusals: [{ message: "bad key" }, { message: "no org", fix: "Import the seed first." }],
    });
  });

  it("refuse keeps a given 4xx", async () => {
    expect(refuse("name is required", 400).status).toBe(400);
  });

  // An empty refusal list renders as nothing — the silent failure this contract replaced.
  it("refuse with no reasons becomes a failure, not an empty refusal", async () => {
    const r = refuse([]);
    expect(r.status).toBe(500);
    expect((await r.json()).ok).toBe(false);
  });

  it("refuse and fail reject a status outside their class", () => {
    expect(() => refuse("x", 200)).toThrow(/4xx/);
    expect(() => refuse("x", 500)).toThrow(/4xx/);
    expect(() => fail("x", 422)).toThrow(/5xx/);
  });

  it("fail is 500 by default and keeps a given 5xx", async () => {
    const r = fail("boom");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "boom" });
    expect(fail("unconfigured", 503).status).toBe(503);
  });

  it("respond sends each answer with its status", async () => {
    expect(respond({ ok: true, id: "e1" }).status).toBe(200);
    expect(await respond({ ok: true, id: "e1" }).json()).toEqual({ ok: true, id: "e1" });
    expect(respond({ ok: false, refusals: [{ message: "no" }] }).status).toBe(422);
    expect(respond({ ok: false, error: "broke" }).status).toBe(500);
  });
});

describe("readEnvelope", () => {
  it("passes a success through", async () => {
    expect(await readEnvelope(json({ ok: true, n: 2 }))).toEqual({ ok: true, n: 2 });
  });

  it("passes a refusal through", async () => {
    const e = await readEnvelope(json({ ok: false, refusals: [{ message: "no" }] }, 422));
    expect(e).toEqual({ ok: false, refusals: [{ message: "no" }] });
  });

  it("passes a failure through", async () => {
    expect(await readEnvelope(json({ ok: false, error: "broke" }, 500))).toEqual({ ok: false, error: "broke" });
  });

  // A platform error page — a maxDuration timeout — is HTML.
  it("reads a body that is not JSON as a failure", async () => {
    const e = await readEnvelope(json("<html>504</html>", 504));
    expect(e.ok).toBe(false);
    expect("error" in e && e.error).toMatch(/504/);
  });

  // The exact response that produced the blank form: no `ok`, no `error`, a `problems` list.
  it("reads the old onboard refusal as a failure, never a success", async () => {
    const e = await readEnvelope(json({ engagementId: "", published: 0, problems: ["No Confluence space"] }));
    expect(e.ok).toBe(false);
  });

  it("reads ok: false with no reason as a failure, not an empty refusal", async () => {
    for (const body of [{ ok: false }, { ok: false, refusals: [] }, { ok: false, error: "" }]) {
      const e = await readEnvelope(json(body, 422));
      expect(e.ok).toBe(false);
      expect("error" in e && e.error, JSON.stringify(body)).toMatch(/did not say why/);
    }
  });
});

describe("describeFailure", () => {
  it("names the first refusal with its fix and counts the rest", () => {
    expect(describeFailure({ ok: false, refusals: [{ message: "No org.", fix: "Import it." }, { message: "b" }] }))
      .toBe("No org. Import it. (+1 more)");
  });

  it("returns a failure's message", () => {
    expect(describeFailure({ ok: false, error: "broke" })).toBe("broke");
  });
});
