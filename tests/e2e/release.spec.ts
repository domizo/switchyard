import { expect, test, type Page } from "@playwright/test";

async function create(page: Page, scenario = "fallback") {
  await page.getByRole("button", { name: "New review", exact: true }).click();
  await page.getByLabel("Fixture scenario").selectOption(scenario);
  await page.getByRole("button", { name: "Run review", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Switchyard · Local release desk");
});
test("fallback, evidence preview, real bundle download and input invalidation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await create(page);
  await expect(
    page.getByRole("heading", { name: "Human decision" }),
  ).toBeVisible();
  await expect(
    page.getByText("Provider exceeded the local deadline.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "harbor-motion.json", exact: true })
    .first()
    .click();
  await expect(
    page.getByText('"durationSeconds": 6', { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await page.getByRole("button", { name: "Approve & build bundle" }).click();
  await expect(
    page.getByRole("heading", { name: "Local bundle verified" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download bundle" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("harbor-v1-bundle.json");
  expect(await download.failure()).toBeNull();
  await page.getByRole("button", { name: "Load input version 2" }).click();
  await expect(
    page.getByText("Input version 2", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Human decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download bundle" }),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("outage renders a real failure, and explicit retry recovers", async ({
  page,
}) => {
  await create(page, "retry");
  await expect(
    page.getByRole("heading", { name: "Review stopped" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & build bundle" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Retry review" }).click();
  await expect(
    page.getByRole("heading", { name: "Human decision" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review stopped" }),
  ).not.toBeVisible();
});
test("timeout, invalid output and refusal are distinct, and refusal has no bypass", async ({
  page,
}) => {
  for (const [scenario, code] of [
    ["timeout", "timeout"],
    ["invalid", "invalid_output"],
    ["refusal", "refusal"],
  ]) {
    await create(page, scenario);
    await expect(
      page.getByRole("heading", { name: "Review stopped" }),
    ).toBeVisible();
    await expect(page.locator(".error-box code")).toHaveText(code!);
    if (scenario === "refusal")
      await expect(
        page.getByRole("button", { name: "Retry review" }),
      ).not.toBeVisible();
  }
});
test("native dialog supports keyboard cancellation and contained focus", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New review", exact: true }).click();
  await expect(page.getByLabel("Fixture scenario")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Run review", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("mobile controls work without document overflow and survive reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page, "healthy");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Human decision" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Reject release", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Release rejected" }),
  ).toBeVisible();
});
