import { test, expect, type Page } from "@playwright/test";

// Structured overrides, through a browser.
//
// The first test here exists because of a specific near-miss: the JSX swapping the textarea for the
// row grid silently did not apply, so the form was defined and never rendered — and typecheck plus
// 154 unit tests all passed, because nothing asserted the form appears on screen. That is exactly
// the blind spot a unit suite has about a component.

const SPRINT0 = "templates/sprint-0.md";
const DOCTREE = "templates/doc-tree.md";
const ENGAGEMENT = "northwind-retail-hwzj";

function editor(page: Page, scope: "org" | "engagement" = "org") {
  return page.getByTestId(`spec-editor-${scope}`);
}

async function api(page: Page, body: Record<string, unknown>) {
  const r = await page.request.post("/api/spec", { data: body });
  return { status: r.status(), json: await r.json() };
}

async function read(page: Page, path: string, engagementId?: string) {
  const q = engagementId ? `&engagementId=${engagementId}` : "";
  return await (await page.request.get(`/api/spec?path=${path}${q}`)).json();
}

test.afterEach(async ({ page }) => {
  for (const p of [SPRINT0, DOCTREE]) {
    await api(page, { action: "revert", scope: "engagement", engagementId: ENGAGEMENT, path: p, role: "org-admin" });
    await api(page, { action: "revert", scope: "org", path: p, role: "org-admin" });
  }
});

test.describe("the row editor", () => {
  test("a data spec shows the row grid, not a text box", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId(`spec-file-${SPRINT0}`).click();

    await expect(editor(page).getByTestId("spec-rows")).toBeVisible();
    await expect(editor(page).getByTestId("spec-content")).toBeHidden();   // no markdown box
    await expect(editor(page).getByTestId("spec-cell-0-ticket")).toHaveValue("Connect systems of record");
  });

  test("a prose spec still shows the text box", async ({ page }) => {
    // The two mechanisms must not bleed into each other.
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId("spec-filter").fill("build.md");
    await editor(page).getByTestId("spec-file-workflows/build.md").click();

    await expect(editor(page).getByTestId("spec-content")).toBeVisible();
    await expect(editor(page).getByTestId("spec-rows")).toBeHidden();
  });

  test("editing a cell updates the rendered file live", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId(`spec-file-${SPRINT0}`).click();
    await editor(page).getByTestId("spec-cell-0-ticket").fill("Wire up the tools");

    // Rendered client-side from the same pure module the server uses, so what you see is what
    // gets written — not the last saved version.
    await editor(page).getByTestId("spec-rendered-toggle").click();
    await expect(editor(page).getByTestId("spec-rendered")).toContainText("| 1 | Wire up the tools |");
  });

  test("adding a row saves, and leaves the framework's prose alone", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId(`spec-file-${SPRINT0}`).click();

    await editor(page).getByTestId("spec-row-add").click();
    await editor(page).getByTestId("spec-cell-3-ticket").fill("Security sign-off");
    await editor(page).getByTestId("spec-cell-3-workflow").fill("/ops");
    await editor(page).getByTestId("spec-cell-3-owner").fill("architect");
    await editor(page).getByTestId("spec-cell-3-done (gate)").fill("signed-off");
    await editor(page).getByTestId("spec-save").click();
    await expect(editor(page).getByText("Saved. This is what runs now.")).toBeVisible();

    const after = await read(page, SPRINT0);
    expect(after.tier).toBe("org");
    expect(after.content).toContain("| 4 | Security sign-off |");
    // The whole point: the Notes are still the framework's, not a frozen copy.
    expect(after.content).toContain("**Lean by design.**");
    expect(after.validation.rows).toHaveLength(4);
  });

  test("removing a row asks first — it is a ticket that would stop being created", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId(`spec-file-${SPRINT0}`).click();
    await editor(page).getByTestId("spec-row-remove-2").click();
    await editor(page).getByTestId("spec-save").click();

    // Singular when one row goes — match either rather than pinning the grammar.
    await expect(editor(page).getByTestId("spec-confirm")).toContainText(/1 row removed/);
    expect((await read(page, SPRINT0)).tier).toBe("framework");     // nothing written yet
  });
});

test.describe("scope rules", () => {
  test("doc-tree is refused at engagement scope", async ({ page }) => {
    // Per-engagement refinement already lives in doc_tree_spec; a second mechanism would be two
    // ways to do one thing, so this fails loudly rather than saving somewhere never read.
    const r = await api(page, {
      action: "save", scope: "engagement", engagementId: ENGAGEMENT, path: DOCTREE,
      role: "org-admin", doc: { sections: { Nodes: { rows: [] } } },
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/organisation-level/);
  });

  test("an engagement override of sprint-0 isolates from other engagements", async ({ page }) => {
    await page.goto(`/settings?e=${ENGAGEMENT}&role=delivery-manager&tab=process`);
    const ed = editor(page, "engagement");
    await ed.getByTestId(`spec-file-${SPRINT0}`).click();
    await ed.getByTestId("spec-cell-0-ticket").fill("CLIENT onboarding");
    await ed.getByTestId("spec-save").click();
    await expect(ed.getByText("Saved. This is what runs now.")).toBeVisible();

    expect((await read(page, SPRINT0, ENGAGEMENT)).content).toContain("CLIENT onboarding");
    expect((await read(page, SPRINT0, "northwind-retail-qki1")).tier).toBe("framework");
    expect((await read(page, SPRINT0)).tier).toBe("framework");
  });
});
