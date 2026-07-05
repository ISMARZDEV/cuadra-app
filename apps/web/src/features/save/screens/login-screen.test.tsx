import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// Clerk mode → renders the Clerk (<SignIn/>) login. Children mocked to markers.
vi.mock("../hooks/clerk", () => ({ CLERK_ENABLED: true }));
vi.mock("./clerk-login-screen", () => ({ ClerkLoginScreen: () => <div>clerk-login</div> }));
vi.mock("./dev-login-screen", () => ({ DevLoginScreen: () => <div>dev-login</div> }));

import { LoginScreen } from "./login-screen";

describe("LoginScreen (dual-mode)", () => {
  test("renders the Clerk login when Clerk is enabled", () => {
    render(<LoginScreen />);
    expect(screen.getByText("clerk-login")).toBeTruthy();
    expect(screen.queryByText("dev-login")).toBeNull();
  });
});
