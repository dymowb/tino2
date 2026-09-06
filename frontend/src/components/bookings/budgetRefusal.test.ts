import { describe, expect, it } from "vitest";
import { budgetRefusal } from "./ReadinessDrawer";

/**
 * A readiness run is refused for cost with a 429 whose body carries text the
 * server has already localized. The drawer has to recognise that shape to show
 * it — every miss falls back to the generic red "something went wrong", which
 * tells a user who is out of budget to retry the one thing that cannot succeed.
 * The shape is an axios error, so it is easy to get subtly wrong and impossible
 * to notice by reading.
 */
describe("budgetRefusal", () => {
  const axiosError = (status: number, data?: unknown) => ({
    isAxiosError: true,
    response: { status, data },
  });

  it("returns the server's localized text for a 429", () => {
    expect(
      budgetRefusal(axiosError(429, { success: false, message: "Limite atingido" })),
    ).toBe("Limite atingido");
  });

  it("ignores failures that are not a refusal for cost", () => {
    expect(budgetRefusal(axiosError(500, { message: "boom" }))).toBeNull();
    expect(budgetRefusal(axiosError(409, { message: "already running" }))).toBeNull();
    expect(budgetRefusal(axiosError(404, { message: "not found" }))).toBeNull();
  });

  it("does not mistake a network failure for a refusal", () => {
    // No response at all: the request never reached the server, so there is no
    // server message and the generic error is the honest thing to show.
    expect(budgetRefusal({ isAxiosError: true, message: "Network Error" })).toBeNull();
    expect(budgetRefusal(new Error("timeout of 150000ms exceeded"))).toBeNull();
    expect(budgetRefusal(null)).toBeNull();
    expect(budgetRefusal(undefined)).toBeNull();
  });

  it("falls back to the generic error when a 429 carries no text", () => {
    // Returning "" here would render an empty warning banner with no explanation.
    expect(budgetRefusal(axiosError(429, { success: false }))).toBeNull();
    expect(budgetRefusal(axiosError(429))).toBeNull();
  });
});
