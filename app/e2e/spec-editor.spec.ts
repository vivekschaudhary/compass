import { test, expect, type Page } from "@playwright/test";

// The spec editor, through a browser.
//
// Each of these covers a defect that actually happened and that the unit suite could not see:
//   · Save did nothing, because blur re-rendered the panel above it and moved the button
//   · every save was refused, because a redirect dropped `?role=` and the actor arrived as nobody
//   · the category list was a wall of 80 files
//
// They write to the real `spec_file` table, so every test cleans up after itself via the API —
// and the cleanup runs in `finally`, because a test that fails halfway must not leave an override
// behind that silently changes the next run.

const SPRINT0 = "templates/sprint-0.md";
const ENGAGEMENT = "northwind-retail-hwzj";

async function revert(page: Page, scope: "org" | "engagement", engagementId?: string) {
  await page.request.post("/api/spec", {
    data: { action: "revert", scope, engagementId, path: SPRINT0,
            role: scope === "org" ? "org-admin" : "delivery-manager" },
  });
}

/** The editor for a scope. Both Settings and /admin have their own Save buttons, so every locator
 *  must be anchored to the editor or it matches the wrong one. */
function editor(page: Page, scope: "org" | "engagement" = "org") {
  return page.getByTestId(`spec-editor-${scope}`);
}

async function tierOf(page: Page, engagementId?: string) {
  const q = engagementId ? `&engagementId=${engagementId}` : "";
  const r = await page.request.get(`/api/spec?path=${SPRINT0}${q}`);
  return (await r.json()).tier as string;
}

test.describe("file browser", () => {
  test("groups collapse, and only the everyday one starts open", async ({ page }) => {
    await page.goto("/admin?role=org-admin");

    // Templates is expanded by default — it holds the two files anyone came here to change.
    await expect(editor(page).getByTestId("spec-group-templates")).toHaveAttribute("aria-expanded", "true");
    await expect(editor(page).getByTestId("spec-file-templates/sprint-0.md")).toBeVisible();

    // Agents is not, so 17 agent files aren't in your face on arrival.
    const agents = editor(page).getByTestId("spec-group-agents");
    await expect(agents).toHaveAttribute("aria-expanded", "false");
    await expect(editor(page).getByTestId("spec-file-agents/pm.md")).toBeHidden();

    await agents.click();
    await expect(agents).toHaveAttribute("aria-expanded", "true");
    await expect(editor(page).getByTestId("spec-file-agents/pm.md")).toBeVisible();
  });

  test("the filter reveals matches inside collapsed groups", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await expect(editor(page).getByTestId("spec-file-workflows/build.md")).toBeHidden();   // workflows collapsed

    await editor(page).getByTestId("spec-filter").fill("build");
    // Filtering implies intent to see matches, so it must beat the collapsed state — otherwise you
    // search for a file and it stays hidden.
    await expect(editor(page).getByTestId("spec-file-workflows/build.md")).toBeVisible();

    await editor(page).getByTestId("spec-filter").fill("zzz-no-such-file");
    await expect(editor(page).getByText(/Nothing matches/)).toBeVisible();
  });
});

test.describe("saving", () => {
  test.afterEach(async ({ page }) => { await revert(page, "org"); });

  test("Save persists — the click is not lost to a re-render", async ({ page }) => {
    // The original bug: clicking Save blurred the textarea, the validator panel above the button
    // re-rendered, the button moved, and the click never landed.
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId("spec-file-templates/sprint-0.md").click();

    const box = editor(page).getByTestId("spec-content");
    await expect(box).not.toBeEmpty();
    await box.fill((await box.inputValue()).replace(
      "| 3 | Foundation architecture",
      "| 3 | E2E probe ticket | /ops | architect | done |\n| 4 | Foundation architecture"));

    await editor(page).getByTestId("spec-save").click();

    await expect(editor(page).getByText("Saved. This is what runs now.")).toBeVisible();
    await expect(editor(page).getByText("Your organisation's default").first()).toBeVisible();
    expect(await tierOf(page)).toBe("org");
  });

  test("Check shows what the parser made of a draft, without saving", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId("spec-file-templates/sprint-0.md").click();

    const box = editor(page).getByTestId("spec-content");
    await box.fill((await box.inputValue()).replace(
      "| 3 | Foundation architecture",
      "| 3 | E2E probe ticket | /ops | architect | done |\n| 4 | Foundation architecture"));

    // Stale marker: the panel still describes the SAVED version, and says so rather than implying
    // it has parsed what is on screen.
    await expect(editor(page).getByText(/unsaved edits/)).toBeVisible();

    await editor(page).getByTestId("spec-check").click();
    // Assert on the VALIDATOR PANEL, not the page: the textarea and the diff both contain this
    // text, and matching either would pass without the parser having seen anything.
    await expect(editor(page).getByTestId("spec-validation")).toContainText("E2E probe ticket");
    expect(await tierOf(page)).toBe("framework");        // Check must not write
  });
});

test.describe("the structural gate", () => {
  test.afterEach(async ({ page }) => { await revert(page, "org"); });

  test("a damaged step heading is caught, though the gate count is unchanged", async ({ page }) => {
    // The corruption a count-based check waves through: demoting one heading merges two steps,
    // turns a dispatch into a human gate, and drops an agent — hitl_count identical.
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId("spec-filter").fill("create-product-brief");
    await editor(page).getByTestId("spec-file-workflows/create-product-brief.md").click();

    const box = editor(page).getByTestId("spec-content");
    await expect(box).not.toBeEmpty();
    await box.fill((await box.inputValue()).replace("### Step 2.", "#### Step 2."));

    await editor(page).getByTestId("spec-save").click();

    const confirm = editor(page).getByTestId("spec-confirm");
    await expect(confirm).toContainText("This removes something the current version has.");
    // The three regressions a gate-count check would have missed, named in the prompt itself.
    await expect(confirm).toContainText("no longer dispatched by this workflow");
    await expect(confirm).toContainText("is now a human gate");
    await expect(confirm).toContainText("no longer exists");

    // Backing out must leave nothing behind.
    await editor(page).getByTestId("spec-keep-editing").click();
    expect(await tierOf(page)).toBe("framework");
  });

  test("an unusable file is refused outright, not merely warned about", async ({ page }) => {
    await page.goto("/admin?role=org-admin");
    await editor(page).getByTestId("spec-filter").fill("build.md");
    await editor(page).getByTestId("spec-file-workflows/build.md").click();

    await editor(page).getByTestId("spec-content").fill("## Dispatch graph\n\nprose, no steps at all\n");
    await editor(page).getByTestId("spec-save").click();

    await expect(editor(page).getByText("This file would not work if saved.")).toBeVisible();
    expect(await tierOf(page)).toBe("framework");
  });
});

test.describe("permissions and tiers", () => {
  test.afterEach(async ({ page }) => {
    await revert(page, "engagement", ENGAGEMENT);
    await revert(page, "org");
  });

  test("a role without the capability is refused, by name", async ({ page }) => {
    await page.goto("/admin?role=pm");
    await editor(page).getByTestId("spec-file-templates/sprint-0.md").click();

    const box = editor(page).getByTestId("spec-content");
    await box.fill((await box.inputValue()) + "\n<!-- pm edit -->\n");
    await editor(page).getByTestId("spec-save").click();

    await expect(editor(page).getByText(/requires one of org-admin/)).toBeVisible();
    expect(await tierOf(page)).toBe("framework");
  });

  test("the acting role survives the settings redirect", async ({ page }) => {
    // The exact defect: /settings?role=x redirected to /settings?e=<id>, dropping the role, so
    // every save was refused for want of a capability the user had.
    await page.goto("/settings?role=delivery-manager");
    await expect(page).toHaveURL(/role=delivery-manager/);
    await expect(page).toHaveURL(/[?&]e=/);
  });

  test("an engagement override isolates from other engagements", async ({ page }) => {
    await page.goto(`/settings?e=${ENGAGEMENT}&role=delivery-manager`);
    const ed = editor(page, "engagement");
    await ed.getByTestId("spec-file-templates/sprint-0.md").click();

    const box = ed.getByTestId("spec-content");
    await expect(box).not.toBeEmpty();
    await box.fill((await box.inputValue()).replace("| 1 | Connect systems of record", "| 1 | E2E client-only step"));
    await ed.getByTestId("spec-save").click();

    await expect(ed.getByText("Saved. This is what runs now.")).toBeVisible();
    expect(await tierOf(page, ENGAGEMENT)).toBe("engagement");
    // The point of the tiering: nobody else moved.
    expect(await tierOf(page, "northwind-retail-qki1")).toBe("framework");
    expect(await tierOf(page)).toBe("framework");
  });
});
