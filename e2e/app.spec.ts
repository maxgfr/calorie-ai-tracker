import { expect, type Page, test } from "@playwright/test";

const ENDPOINT = "https://llm.test/v1";

const MEAL = {
  title: "Oatmeal breakfast",
  mealType: "breakfast",
  items: [
    { name: "Oatmeal", quantity: "60 g", kcal: 230, protein: 8, carbs: 40, fat: 4 },
    { name: "Banana", quantity: "1 medium", kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  ],
  confidence: "high",
  notes: "Made with water.",
};

/** No network: the catalog falls back to models.json, the model answers from here. */
async function offline(page: Page, errors: string[]) {
  // The catalog APIs are cut on purpose: their failed loads are expected.
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/models\.dev|openrouter\.ai/, (r) => r.abort());
  await page.route(`${ENDPOINT}/**`, async (route) => {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (route.request().url().endsWith("/models")) {
      return route.fulfill({ headers: cors, json: { data: [{ id: "mock-model" }] } });
    }
    return route.fulfill({
      headers: cors,
      json: {
        id: "cmpl-1",
        object: "chat.completion",
        created: 1,
        model: "mock-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(MEAL) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      },
    });
  });
}

async function connectModel(page: Page) {
  await page.goto("./#/settings");
  await page.getByRole("tab", { name: "Local / custom" }).click();
  await page.getByLabel("Endpoint (OpenAI-compatible)").fill(ENDPOINT);
  await page.getByLabel("Model", { exact: true }).fill("mock-model");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
}

test("loads under the CSP with no error and navigates", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  for (const name of ["Week", "Goals", "Coach", "Today"]) {
    await page
      .getByRole("navigation", { name: "Main" })
      .first()
      .getByRole("link", { name })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("logs a meal with the AI and shows it today and in the week", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  await connectModel(page);

  await page.goto("./#/log");
  await page.getByPlaceholder(/What did you eat/).fill("oatmeal with a banana");
  await page.getByRole("button", { name: "Estimate" }).click();
  await expect(page.getByLabel("Food").first()).toHaveValue("Oatmeal");
  await page.getByRole("button", { name: "Save meal" }).click();

  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Oatmeal breakfast")).toBeVisible();
  await expect(page.getByText("335", { exact: true }).first()).toBeVisible();

  await page.goto("./#/week");
  await expect(page.getByText("1/7")).toBeVisible();

  await page.reload();
  await page.goto("./");
  await expect(page.getByText("Oatmeal breakfast")).toBeVisible();
  expect(errors).toEqual([]);
});

test("goals persist after a reload", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  await page.goto("./#/goals");
  await page.getByRole("button", { name: "Lose weight" }).click();
  await page.getByRole("button", { name: "Use the baseline" }).click();
  await page.getByLabel("Calories").fill("1850");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Calories")).toHaveValue("1850");
  await page.goto("./");
  await expect(page.getByText("of 1850 kcal")).toBeVisible();
  expect(errors).toEqual([]);
});
