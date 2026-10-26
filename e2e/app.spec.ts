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
  heard: "",
};

/** No network: the catalog falls back to models.json, the model answers from here. */
async function offline(page: Page, errors: string[]) {
  // The catalog APIs are cut on purpose: their failed loads are expected.
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/models\.dev|openrouter\.ai\/api\/v1\/models/, (r) => r.abort());
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
    if (route.request().url().endsWith("/audio/transcriptions")) {
      return route.fulfill({ headers: cors, json: { text: "oatmeal with a banana" } });
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

async function record(page: Page) {
  await page.goto("./#/log");
  await page.getByRole("tab", { name: "Voice" }).click();
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stop and estimate" }).click();
}

test("voice goes straight to a model that hears audio", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  let body = "";
  await page.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    body = route.request().postData() ?? "";
    await route.fulfill({
      headers: { "access-control-allow-origin": "*" },
      json: {
        id: "cmpl-2",
        object: "chat.completion",
        created: 1,
        model: "google/gemini-3-flash-preview",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ ...MEAL, heard: "oatmeal with a banana" }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      },
    });
  });
  await page.goto("./#/settings");
  await page.getByLabel("Provider").selectOption("openrouter");
  await page.getByPlaceholder("Search models…").fill("gemini-3-flash-preview");
  await page
    .getByRole("option", { name: /gemini-3-flash-preview|Gemini 3 Flash Preview/i })
    .first()
    .click();
  await page.getByLabel(/API key/).fill("sk-or-test-123456");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("The recording goes straight to your model.")).toBeVisible();

  await record(page);
  await expect(page.getByLabel("Food").first()).toHaveValue("Oatmeal");
  expect(body).toContain("input_audio");
  expect(body).toContain('"format":"wav"');
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page.getByText("Oatmeal breakfast")).toBeVisible();
  expect(errors).toEqual([]);
});

test("voice goes through the provider's transcription otherwise", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  const calls: string[] = [];
  await page.route("https://api.mistral.ai/v1/**", async (route) => {
    const url = route.request().url();
    calls.push(url.replace("https://api.mistral.ai/v1/", ""));
    const cors = { "access-control-allow-origin": "*" };
    if (url.endsWith("/audio/transcriptions")) {
      return route.fulfill({
        headers: cors,
        json: { model: "voxtral-mini-latest", text: "oatmeal with a banana", language: "en" },
      });
    }
    return route.fulfill({
      headers: cors,
      json: {
        id: "cmpl-3",
        object: "chat.completion",
        created: 1,
        model: "mistral-large-latest",
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
  await page.goto("./#/settings");
  await page.getByLabel("Provider").selectOption("mistral");
  await page.getByLabel(/API key/).fill("mistral-test-123456");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Your provider transcribes the recording/)).toBeVisible();
  await record(page);
  await expect(page.getByLabel("Food").first()).toHaveValue("Oatmeal");
  await expect(page.getByPlaceholder(/What did you eat/)).toHaveCount(0);
  expect(calls).toEqual(["audio/transcriptions", "chat/completions"]);
  expect(errors).toEqual([]);
});

/** The coach streams: an OpenAI-compatible stream with one answer. */
async function streamingCoach(page: Page, answer: string) {
  await page.route(`${ENDPOINT}/chat/completions`, (route) => {
    const chunk = (delta: object, finish: string | null) =>
      `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "mock-model", choices: [{ index: 0, delta, finish_reason: finish }] })}`;
    const body = [
      chunk({ role: "assistant", content: answer }, null),
      chunk({}, "stop"),
      "data: [DONE]",
      "",
    ].join("\n\n");
    return route.fulfill({
      headers: { "access-control-allow-origin": "*", "content-type": "text/event-stream" },
      body,
    });
  });
}

test("the coach works with a model connected, and Back goes through the tabs", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  await streamingCoach(page, "You did great this week.");
  await connectModel(page);
  const nav = page.getByRole("navigation", { name: "Main" }).first();

  await nav.getByRole("link", { name: "Today" }).click();
  await nav.getByRole("link", { name: "Coach" }).click();
  await page.getByRole("button", { name: "How did I do this week?" }).click();
  await expect(page.getByText("You did great this week.")).toBeVisible();

  await nav.getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await page.goBack();
  await expect(page.getByText("You did great this week.")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Back after saving a meal does not reopen the form", async ({ page }) => {
  const errors: string[] = [];
  await offline(page, errors);
  await connectModel(page);
  await page.goto("./#/week");
  await page.goto("./#/log");
  await page.getByPlaceholder(/What did you eat/).fill("oatmeal with a banana");
  await page.getByRole("button", { name: "Estimate" }).click();
  await page.getByRole("button", { name: "Save meal" }).click();
  await expect(page.getByText("Oatmeal breakfast")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  expect(errors).toEqual([]);
});

/** One repository file on a mocked GitHub, shared by every page of the test. */
function mockGitHub() {
  const repo = { content: null as string | null, sha: 0 };
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  };
  return async (page: Page) => {
    await page.route("https://api.github.com/repos/me/calorie-data/contents/**", (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (req.headers().authorization !== "Bearer github_pat_test") {
        return route.fulfill({ status: 401, headers: cors, json: { message: "Bad credentials" } });
      }
      if (req.method() === "PUT") {
        const body = req.postDataJSON() as { content: string; sha?: string };
        if ((body.sha ?? null) !== (repo.content ? `sha-${repo.sha}` : null)) {
          return route.fulfill({ status: 409, headers: cors, json: { message: "conflict" } });
        }
        repo.content = body.content;
        repo.sha++;
        return route.fulfill({ headers: cors, json: { content: { sha: `sha-${repo.sha}` } } });
      }
      if (!repo.content) {
        return route.fulfill({ status: 404, headers: cors, json: { message: "Not Found" } });
      }
      return route.fulfill({
        headers: cors,
        json: { sha: `sha-${repo.sha}`, encoding: "base64", content: repo.content },
      });
    });
  };
}

async function connectGitHub(page: Page, token = "github_pat_test") {
  await page.goto("./#/settings");
  await page.getByLabel("Repository").fill("me/calorie-data");
  await page.getByLabel("GitHub token").fill(token);
  await page.getByRole("button", { name: "Connect and sync" }).click();
}

test("syncs meals and goals between two devices through GitHub", async ({ browser }) => {
  const errors: string[] = [];
  const github = mockGitHub();
  const laptop = await (await browser.newContext()).newPage();
  const phone = await (await browser.newContext()).newPage();
  for (const page of [laptop, phone]) {
    await offline(page, errors);
    await github(page);
  }

  await connectModel(laptop);
  await laptop.goto("./#/log");
  await laptop.getByPlaceholder(/What did you eat/).fill("oatmeal with a banana");
  await laptop.getByRole("button", { name: "Estimate" }).click();
  await laptop.getByRole("button", { name: "Save meal" }).click();
  await expect(laptop.getByText("Oatmeal breakfast")).toBeVisible();

  await connectGitHub(phone, "wrong");
  await expect(phone.getByText("GitHub refused the token.")).toBeVisible();
  await expect(phone.getByRole("button", { name: "Connect and sync" })).toBeVisible();

  await connectGitHub(laptop);
  await expect(laptop.getByText(/Last synced/)).toBeVisible();

  await connectGitHub(phone);
  await expect(phone.getByText(/Last synced/)).toBeVisible();
  await phone.goto("./");
  await expect(phone.getByText("Oatmeal breakfast")).toBeVisible();

  // A change on the phone reaches the laptop on its next sync.
  await phone.goto("./#/goals");
  await phone.getByLabel("Calories").fill("1850");
  await phone.getByRole("button", { name: "Save", exact: true }).click();
  await expect(phone.getByText("Saved.")).toBeVisible();
  await phone.goto("./#/settings");
  await phone.getByRole("button", { name: "Sync now" }).click();
  await expect(phone.getByText(/Last synced/)).toBeVisible();

  await laptop.getByRole("button", { name: "Sync now" }).click();
  await expect(laptop.getByText(/Last synced/)).toBeVisible();
  await laptop.goto("./");
  await expect(laptop.getByText("of 1850 kcal")).toBeVisible();
  expect(errors).toEqual([]);
});
