import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// Clerk mode → renders the AuthView login (children mocked to markers to avoid the native AuthView).
vi.mock("./clerk", () => ({ CLERK_ENABLED: true }));
vi.mock("./clerk-login-screen", () => ({ ClerkLoginScreen: () => "clerk-login" }));
vi.mock("./dev-login-screen", () => ({ DevLoginScreen: () => "dev-login" }));

import { LoginScreen } from "./login-screen";

describe("LoginScreen (dual-mode)", () => {
  test("renders the Clerk login when Clerk is enabled", () => {
    render(<LoginScreen />);
    expect(screen.getByText("clerk-login")).toBeTruthy();
    expect(screen.queryByText("dev-login")).toBeNull();
  });
});
