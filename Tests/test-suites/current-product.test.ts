import { test, expect, APIRequestContext, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const API = "http://127.0.0.1:3100/api/v1";
const credentials = {
  customer: { email: "customer@demo.com", password: "Demo123!" },
  provider: { email: "provider@demo.com", password: "Demo123!" },
  admin: { email: "admin@demo.com", password: "Demo123!" },
};

async function apiSession(
  request: APIRequestContext,
  role: keyof typeof credentials,
) {
  const response = await request.post(`${API}/auth/login`, {
    data: credentials[role],
  });
  expect(
    response.ok(),
    `${role} login failed: ${await response.text()}`,
  ).toBeTruthy();
  const { data } = await response.json();
  return { token: data.accessToken as string, userId: data.user.id as string };
}

async function apiLogin(
  request: APIRequestContext,
  role: keyof typeof credentials,
) {
  return (await apiSession(request, role)).token;
}

async function uiLogin(page: Page, role: keyof typeof credentials) {
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: /email|e-mail/i })
    .fill(credentials[role].email);
  await page.getByLabel(/password|senha/i).fill(credentials[role].password);
  await page
    .locator("form")
    .getByRole("button", { name: /sign in|entrar/i })
    .click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("platform, security, and performance", () => {
  test("health, headers, public config, and response time", async ({
    request,
  }) => {
    const started = Date.now();
    const health = await request.get("http://127.0.0.1:3100/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({
      success: true,
      database: "ok",
    });
    expect(health.headers()["x-content-type-options"]).toBe("nosniff");
    expect(Date.now() - started).toBeLessThan(1500);

    const config = await request.get(`${API}/config`);
    expect(config.ok()).toBeTruthy();
    expect(await config.json()).toHaveProperty("data.maxProvidersPerQuote");
  });

  test("protected resources reject anonymous and cross-role access", async ({
    request,
  }) => {
    expect((await request.get(`${API}/bookings`)).status()).toBe(401);
    const customerToken = await apiLogin(request, "customer");
    const admin = await request.get(`${API}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    expect(admin.status()).toBe(403);
  });

  test("malformed and suspicious input is handled safely", async ({
    request,
  }) => {
    const malformed = await request.post(`${API}/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: '{"email":',
    });
    expect(malformed.status()).toBe(400);
    expect(await malformed.text()).not.toContain("/home/");
  });
});

test.describe("customer experience", () => {
  test.beforeEach(async ({ page }) => uiLogin(page, "customer"));

  test("navigates discovery, bookings, messages, payments, reviews, and profile", async ({
    page,
  }) => {
    for (const path of [
      "/providers",
      "/bookings",
      "/messages",
      "/payments",
      "/reviews",
      "/profile",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText(/route not found/i)).toHaveCount(0);
    }
  });

  test("supports English and Portuguese and responsive navigation", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("nav").last()).toBeVisible();
    await page
      .getByRole("button", { name: /language|idioma/i })
      .click()
      .catch(() => {});
    await expect(page.locator("body")).not.toContainText(
      /translation missing/i,
    );

    // Horizontal overflow across the primary customer-facing pages, not just one.
    // A single page proved nothing about the rest: /payments has no nav entry and
    // is one of the least-visited screens in the product.
    for (const path of ["/", "/providers", "/bookings", "/messages", "/profile", "/payments"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      const horizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(horizontalOverflow, `${path} overflows horizontally at 390px`).toBeLessThanOrEqual(2);
    }
  });

  test("has keyboard-reachable landmarks and labelled controls", async ({
    page,
  }) => {
    await page.goto("/providers");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
    const images = page.locator("img");
    for (let index = 0; index < (await images.count()); index += 1) {
      await expect(images.nth(index)).toHaveAttribute("alt");
    }

    // The name of this test promised keyboard reachability and nothing in it went
    // near a keyboard. Tab from the top and require that focus actually lands on
    // something operable — a page whose controls are all `<div onClick>` passes
    // every landmark and alt-text check ever written and cannot be used without a
    // mouse.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        tabIndex: (el as HTMLElement).tabIndex,
      };
    });
    expect(focused, "Tab from the top of the page focused nothing").not.toBeNull();
    expect(
      ["a", "button", "input", "select", "textarea"].includes(focused!.tag) ||
        focused!.role === "button" ||
        focused!.role === "link",
    ).toBe(true);
  });

  test("conversations can be opened from the keyboard alone", async ({
    page,
  }) => {
    await page.goto("/messages");
    await expect(page.locator("main")).toBeVisible();

    // Conversation rows were `<Box onClick>`: no tab stop, no Enter handler, no
    // announced role. A pointer was the only way to read your own messages.
    const row = page.locator("[data-conv-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    const tag = await row.evaluate((el) => el.tagName.toLowerCase());
    expect(tag).toBe("button");

    await row.focus();
    await expect(row).toBeFocused();

    const conversationId = await row.getAttribute("data-conv-id");
    await page.keyboard.press("Enter");

    // Enter selected it, and the selection is announced rather than only tinted.
    await expect(
      page.locator(`[data-conv-id="${conversationId}"]`),
    ).toHaveAttribute("aria-current", "true");
  });

  test("primary pages pass automated accessibility checks", async ({
    page,
  }) => {
    // Landmarks and alt text were the whole of the previous coverage. axe adds the
    // classes that are mechanical to detect — contrast, names on controls, ARIA
    // misuse, duplicate ids — across the pages a customer actually lives in.
    for (const path of ["/providers", "/bookings", "/messages", "/profile"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const serious = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );

      expect(
        serious.map(
          (v) =>
            `${path} — ${v.id}: ${v.help} → ${v.nodes
              .map((n) => n.target.join(" "))
              .join(", ")}`,
        ),
      ).toEqual([]);
    }
  });

  test("saves and removes a provider from the Saved tab", async ({ page }) => {
    await page.goto("/providers");
    await page
      .getByRole("tab", { name: /browse|buscar|navegar|explorar/i })
      .click();
    const save = page
      .getByRole("button", {
        name: /save provider|salvar prestador|guardar proveedor/i,
      })
      .first();
    await expect(save).toBeVisible({ timeout: 15_000 });
    await save.click();
    await page.getByRole("tab", { name: /saved|salvos|guardados/i }).click();
    const remove = page
      .getByRole("button", {
        name: /remove from saved|remover dos salvos|quitar de guardados/i,
      })
      .first();
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(
      page.getByText(
        /no saved providers|nenhum prestador salvo|no hay proveedores guardados/i,
      ),
    ).toBeVisible();
  });

  test("prefills a repeat request from a completed booking", async ({ page }) => {
    await page.goto("/bookings");
    const rebook = page
      .getByRole("button", {
        name: /book again|reservar novamente|reservar de nuevo/i,
      })
      .first();
    await expect(rebook).toBeVisible({ timeout: 15_000 });
    await rebook.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByLabel(
        /proposed budget|orçamento proposto|presupuesto propuesto/i,
      ),
    ).toHaveValue(/\d+/);
    await expect(
      page.getByText(
        /what should be different|o que deve ser diferente|qué debería ser diferente/i,
      ),
    ).toBeVisible();
  });

  test("keeps cancelled bookings out of the Completed section", async ({
    page,
  }) => {
    await page.goto("/bookings");
    await page
      .getByText(/^(Completed|Concluídos|Completados)( \(\d+\))?$/i)
      .first()
      .click();
    await expect(
      page.getByText(/^(Cancelled|Cancelada|Cancelado)$/i),
    ).toHaveCount(0);

    await page
      .getByText(/^(Cancelled|Cancelados)( \(\d+\))?$/i)
      .first()
      .click();
    await expect(
      page.getByText(/^(Cancelled|Cancelada|Cancelado)$/i).first(),
    ).toBeVisible();
  });
});

test.describe("provider experience", () => {
  test.beforeEach(async ({ page }) => uiLogin(page, "provider"));

  test("renders dashboard, opportunities, lifecycle hub, messaging, and reviews", async ({
    page,
  }) => {
    for (const path of [
      "/dashboard",
      "/opportunities",
      "/bookings",
      "/messages",
      "/reviews",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
    }
  });
});

test.describe("admin experience", () => {
  test("admin can reach every management area", async ({ page }) => {
    await uiLogin(page, "admin");
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/providers",
      "/admin/reviews",
      "/admin/disputes",
      "/admin/quote-requests",
      "/admin/settings",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/")));
    }
  });
});

test.describe("API domain contracts", () => {
  /**
   * These assert the response a caller can actually rely on, not merely that
   * something came back. The previous version accepted any status below 500 that
   * was not 401, which is weak enough to have hidden two of its own cases: it
   * asked for `/quotes/requests/my` and `/quotes/available`, neither of which is
   * a route. Both were being swallowed by the `:requestId` and `:quoteId`
   * patterns and answered 400 "Valid request ID required" — a passing test for an
   * endpoint that does not exist. Exact status codes are what make that visible.
   */
  test("role-scoped booking, quote, messaging, payment, and review APIs answer with their documented shape", async ({
    request,
  }) => {
    const customer = await apiSession(request, "customer");
    const provider = await apiSession(request, "provider");

    // `collection` locates the list inside each envelope — the three shapes in use
    // are a bare `data` array, `data.<name>` with sibling paging fields, and
    // `data.payments` — so a route silently changing shape fails here.
    const cases = [
      {
        session: customer,
        path: "/bookings",
        collection: (data: any) => data,
        ownedBy: "customerId",
      },
      {
        session: customer,
        path: "/quotes/requests",
        collection: (data: any) => data.quoteRequests,
        ownedBy: "customerId",
      },
      { session: customer, path: "/quotes", collection: (d: any) => d.quotes },
      {
        session: customer,
        path: "/messages/conversations",
        collection: (data: any) => data,
      },
      {
        session: customer,
        path: "/payments",
        collection: (data: any) => data.payments,
      },
      {
        session: customer,
        path: "/reviews/customer/my",
        collection: (data: any) => data,
        ownedBy: "customerId",
      },
      {
        session: provider,
        path: "/quotes/requests",
        collection: (data: any) => data.quoteRequests,
      },
      { session: provider, path: "/quotes", collection: (d: any) => d.quotes },
      {
        session: provider,
        path: "/reviews/provider/my",
        collection: (data: any) => data,
      },
    ] as const;

    for (const { session, path, collection, ...rest } of cases) {
      const response = await request.get(`${API}${path}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const body = await response.text();

      expect(response.status(), `${path}: ${body}`).toBe(200);

      const payload = JSON.parse(body);
      expect(payload.success, `${path}: ${body}`).toBe(true);

      const items = collection(payload.data);
      expect(Array.isArray(items), `${path} returned ${typeof items}`).toBe(
        true,
      );

      // Where the caller owns the records by user id, every row has to be theirs —
      // a 200 carrying someone else's data is the failure worth catching, and it
      // is invisible to a status-code check. (Provider-owned collections are keyed
      // on the Provider entity id rather than the user id, so they are checked for
      // shape only.)
      const ownedBy = (rest as { ownedBy?: string }).ownedBy;
      if (ownedBy) {
        const foreign = items.filter(
          (item: Record<string, unknown>) => item[ownedBy] !== session.userId,
        );
        expect(foreign, `${path} returned rows owned by someone else`).toEqual(
          [],
        );
      }
    }
  });

  test("a collection route rejects a malformed id instead of guessing", async ({
    request,
  }) => {
    const customer = await apiSession(request, "customer");

    // `/quotes/requests/my` reads like a route but is not one; it lands on
    // `/quotes/requests/:requestId`. Pinning the 400 keeps the previous test's
    // fictitious endpoints from quietly coming back as passing cases.
    const response = await request.get(`${API}/quotes/requests/my`, {
      headers: { Authorization: `Bearer ${customer.token}` },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).errors).toHaveProperty("requestId");
  });
});
