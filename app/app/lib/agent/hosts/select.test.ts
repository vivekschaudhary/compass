import { describe, it, expect, vi } from "vitest";

// `select.ts` pulls in the API host, which is server-only and constructs an SDK client. Stub the
// module boundary away; the subject here is the DECISION, not the transport.
vi.mock("server-only", () => ({}));
vi.mock("./api", () => ({ apiHost: { name: "api", dispatch: async () => ({}) } }));

const { selectHost, requestedHost } = await import("./select");
const { HostUnavailable } = await import("./types");

/** A machine where the named binaries exist. */
const has = (...bins: string[]) => (b: string) => bins.includes(b);
const hasNothing = () => false;

describe("requestedHost", () => {
  it("defaults to the metered API when nothing is set", () => {
    expect(requestedHost({})).toBe("api");
  });

  // An env var set to "" is how a shell exports an unset value, and reading that as a host name
  // would make `COMPASS_CLAUDE_HOST=` a hard failure instead of a no-op.
  it("treats empty and whitespace as unset", () => {
    expect(requestedHost({ COMPASS_CLAUDE_HOST: "" })).toBe("api");
    expect(requestedHost({ COMPASS_CLAUDE_HOST: "   " })).toBe("api");
  });

  it("normalises case and padding", () => {
    expect(requestedHost({ COMPASS_CLAUDE_HOST: " CLI " })).toBe("cli");
  });

  // The toggle is meant to be a one-character edit in .env.local, so both ends take the spellings
  // people actually type. `=1` ↔ `=0` is the intended flip.
  it("accepts boolean spellings at both ends", () => {
    for (const on of ["1", "true", "on", "yes", "cli", "TRUE", " On "]) {
      expect(requestedHost({ COMPASS_CLAUDE_HOST: on }), on).toBe("cli");
    }
    for (const off of ["0", "false", "off", "no", "api", "FALSE"]) {
      expect(requestedHost({ COMPASS_CLAUDE_HOST: off }), off).toBe("api");
    }
  });

  // Aliasing only the two ends keeps this a HOST selector. A third host must still be nameable,
  // and a typo must still reach selectHost's refusal rather than being read as on or off.
  it("passes anything else through to be refused by name", () => {
    expect(requestedHost({ COMPASS_CLAUDE_HOST: "gemini" })).toBe("gemini");
    expect(requestedHost({ COMPASS_CLAUDE_HOST: "cl1" })).toBe("cl1");
  });
});

describe("selectHost", () => {
  it("returns the API host by default", () => {
    expect(selectHost("api", hasNothing).name).toBe("api");
  });

  it("returns the CLI host when the binary is there", () => {
    expect(selectHost("cli", has("claude")).name).toBe("cli");
  });

  // THE RULE. Asking for the CLI and getting the metered API is the failure this module exists to
  // prevent: the operator set the var to stop paying per token, a fallback bills them anyway, and
  // nothing in the run says so. It must throw, and it must never return apiHost here.
  it("refuses rather than falling back when the CLI binary is missing", () => {
    expect(() => selectHost("cli", hasNothing)).toThrow(HostUnavailable);
    try {
      selectHost("cli", hasNothing);
    } catch (e) {
      expect((e as Error).message).toContain("not on PATH");
      // The operator needs to know how to get back to a working state, not just that it broke.
      expect((e as Error).message).toContain("set it to 0");
    }
  });

  // The message used to say only "unset COMPASS_CLAUDE_HOST", which sent a real user to edit
  // .env.local while the value was actually exported from ~/.zshrc — and a real env var outranks
  // the file, so the edit could never win. A halt that misdirects the reader is half a halt.
  it("names the shell as a possible source, not just the file", () => {
    try {
      selectHost("cl1", hasNothing);
    } catch (e) {
      expect((e as Error).message).toMatch(/shell/);
      expect((e as Error).message).toMatch(/overrides the file/);
    }
  });

  it("accepts v1's host name for the same thing", () => {
    // `claude-code` is what v1's router called it, and v1 uses the SAME env var — someone carrying
    // a config across should get the CLI, not "unknown host".
    expect(selectHost("claude-code", has("claude")).name).toBe("cli");
  });

  // A typo must not silently run somewhere. Without this, COMPASS_CLAUDE_HOST=cl1 bills the API.
  it("refuses an unrecognised host instead of guessing", () => {
    expect(() => selectHost("cl1", has("claude"))).toThrow(HostUnavailable);
    expect(() => selectHost("gemini", has("claude"))).toThrow(/Unknown host/);
  });

  it("names the host it could not give you", () => {
    try {
      selectHost("cl1", hasNothing);
    } catch (e) {
      expect((e as InstanceType<typeof HostUnavailable>).host).toBe("cl1");
    }
  });
});
