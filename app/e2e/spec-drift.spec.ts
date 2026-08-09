import { test, expect, type Page } from "@playwright/test";

// Drift and promotion, through a browser.
//
// These are multi-tier, multi-actor sequences — set an org default, override it for a client, then
// move the org default underneath — and every assertion is about what the SECOND actor sees. That
// is not reachable from a unit test, and it is the behaviour the whole three-tier design depends
// on: an override that silently keeps running an old version is the failure mode.

const SPRINT0 = "templates/sprint-0.md";
const ENGAGEMENT = "northwind-retail-hwzj";

function editor(page: Page, scope: "org" | "engagement" = "org") {
  return page.getByTestId(`spec-editor-${scope}`);
}

async function api(page: Page, body: Record<string, unknown>) {
  const r = await page.request.post("/api/spec", { data: { path: SPRINT0, ...body } });
  return { status: r.status(), json: await r.json() };
}

async function read(page: Page, engagementId?: string) {
  const q = engagementId ? `&engagementId=${engagementId}` : "";
  return (await (await page.request.get(`/api/spec?path=${SPRINT0}${q}`)).json());
}

/** Org default with a marker line, so a later change to it is identifiable in a diff. */
async function setOrgDefault(page: Page, marker: string) {
  const shipped = (await read(page)).shipped as string;
  const content = shipped.replace("| 3 | Foundation architecture",
    `| 3 | ${marker} | /ops | architect | done |\n| 4 | Foundation architecture`);
  const r = await api(page, { action: "save", scope: "org", content, role: "org-admin", confirmStructuralChange: true });
  expect(r.status).toBe(200);
  return content;
}

test.afterEach(async ({ page }) => {
  await api(page, { action: "revert", scope: "engagement", engagementId: ENGAGEMENT, role: "delivery-manager" });
  await api(page, { action: "revert", scope: "org", role: "org-admin" });
});

test.describe("drift", () => {
  test("an engagement override notices when the org default moves under it", async ({ page }) => {
    await setOrgDefault(page, "ORG STEP v1");

    // The DM forks the org default for this client.
    const mine = ((await read(page, ENGAGEMENT)).content as string).replace("| 1 | Connect systems of record", "| 1 | CLIENT kickoff");
    expect((await api(page, { action: "save", scope: "engagement", engagementId: ENGAGEMENT, content: mine, role: "delivery-manager" })).status).toBe(200);
    expect((await read(page, ENGAGEMENT)).drift.drifted).toBe(false);

    // The org admin then changes the default underneath them.
    await setOrgDefault(page, "ORG STEP v2");

    await page.goto(`/settings?e=${ENGAGEMENT}&role=delivery-manager&tab=process`);
    const ed = editor(page, "engagement");
    await ed.getByTestId(`spec-file-${SPRINT0}`).click();

    const banner = ed.getByTestId("spec-drift");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("organisation default changed");

    // The useful view: what changed in the DEFAULT, not the reader's own edits.
    await banner.getByRole("group").click();
    await expect(banner).toContainText("ORG STEP v2");
  });

  test("Keep mine clears the banner without changing what runs", async ({ page }) => {
    await setOrgDefault(page, "ORG STEP v1");
    const mine = ((await read(page, ENGAGEMENT)).content as string).replace("| 1 | Connect systems of record", "| 1 | CLIENT kickoff");
    await api(page, { action: "save", scope: "engagement", engagementId: ENGAGEMENT, content: mine, role: "delivery-manager" });
    await setOrgDefault(page, "ORG STEP v2");

    await page.goto(`/settings?e=${ENGAGEMENT}&role=delivery-manager&tab=process`);
    const ed = editor(page, "engagement");
    await ed.getByTestId(`spec-file-${SPRINT0}`).click();
    await ed.getByTestId("spec-drift-keep").click();

    await expect(ed.getByTestId("spec-drift")).toBeHidden();
    const after = await read(page, ENGAGEMENT);
    expect(after.drift.drifted).toBe(false);
    expect(after.tier).toBe("engagement");
    expect(after.content).toContain("CLIENT kickoff");     // still theirs, still running
  });

  test("Take the new default drops the override", async ({ page }) => {
    await setOrgDefault(page, "ORG STEP v1");
    const mine = ((await read(page, ENGAGEMENT)).content as string).replace("| 1 | Connect systems of record", "| 1 | CLIENT kickoff");
    await api(page, { action: "save", scope: "engagement", engagementId: ENGAGEMENT, content: mine, role: "delivery-manager" });
    await setOrgDefault(page, "ORG STEP v2");

    await page.goto(`/settings?e=${ENGAGEMENT}&role=delivery-manager&tab=process`);
    const ed = editor(page, "engagement");
    await ed.getByTestId(`spec-file-${SPRINT0}`).click();
    await ed.getByTestId("spec-drift-take").click();

    const after = await read(page, ENGAGEMENT);
    expect(after.tier).toBe("org");
    expect(after.content).toContain("ORG STEP v2");
  });
});

test.describe("promote", () => {
  test("an org admin lifts an engagement edit to the firm default", async ({ page }) => {
    const mine = ((await read(page, ENGAGEMENT)).content as string).replace("| 1 | Connect systems of record", "| 1 | PROMOTED step");
    await api(page, { action: "save", scope: "engagement", engagementId: ENGAGEMENT, content: mine, role: "org-admin" });

    await page.goto(`/settings?e=${ENGAGEMENT}&role=org-admin&tab=process`);
    const ed = editor(page, "engagement");
    await ed.getByTestId(`spec-file-${SPRINT0}`).click();
    await ed.getByTestId("spec-promote").click();
    await expect(ed.getByText("organisation default")).toBeVisible();

    // It becomes the org default, and the engagement INHERITS it rather than keeping a twin that
    // would then drift away from the default it created.
    const eng = await read(page, ENGAGEMENT);
    expect(eng.tier).toBe("org");
    expect(eng.content).toContain("PROMOTED step");
    expect((await read(page)).tier).toBe("org");
  });

  test("a delivery manager cannot change the firm's default", async ({ page }) => {
    const mine = ((await read(page, ENGAGEMENT)).content as string).replace("| 1 | Connect systems of record", "| 1 | DM edit");
    await api(page, { action: "save", scope: "engagement", engagementId: ENGAGEMENT, content: mine, role: "delivery-manager" });

    const r = await api(page, { action: "promote", scope: "engagement", engagementId: ENGAGEMENT, role: "delivery-manager" });
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/org-admin/);
    expect((await read(page)).tier).toBe("framework");     // the firm's default did not move
  });

  test("promoting through a structural regression asks first", async ({ page }) => {
    await setOrgDefault(page, "ORG STEP v1");
    // An engagement copy with a row removed — promoting that would take it from everyone.
    const fewer = ((await read(page, ENGAGEMENT)).content as string).split("\n").filter((l) => !l.includes("ORG STEP v1")).join("\n");
    await api(page, { action: "save", scope: "engagement", engagementId: ENGAGEMENT, content: fewer, role: "org-admin", confirmStructuralChange: true });

    const r = await api(page, { action: "promote", scope: "engagement", engagementId: ENGAGEMENT, role: "org-admin" });
    expect(r.status).toBe(409);
    expect(r.json.needsConfirmation).toBe(true);
    expect(JSON.stringify(r.json.changes)).toMatch(/rows-removed/);
  });
});
