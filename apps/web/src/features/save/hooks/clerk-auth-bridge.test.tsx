import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// The bridge reads Clerk's useAuth and registers a token getter into use-auth.
const { useAuthMock, registerTokenGetterMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  registerTokenGetterMock: vi.fn(),
}));
vi.mock("@clerk/clerk-react", () => ({ useAuth: useAuthMock }));
vi.mock("./use-auth", () => ({ registerTokenGetter: registerTokenGetterMock }));

import { ClerkAuthBridge } from "./clerk-auth-bridge";

describe("ClerkAuthBridge (web)", () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    registerTokenGetterMock.mockReset();
  });

  test("registers a getter yielding Clerk's fresh token when signed in", async () => {
    const getToken = vi.fn().mockResolvedValue("clerk-jwt");
    useAuthMock.mockReturnValue({ isSignedIn: true, getToken });

    render(<ClerkAuthBridge />);

    await waitFor(() => expect(registerTokenGetterMock).toHaveBeenCalled());
    const getter = registerTokenGetterMock.mock.calls.at(-1)![0];
    expect(await getter()).toBe("clerk-jwt");
  });

  test("registers a null getter when signed out", async () => {
    useAuthMock.mockReturnValue({ isSignedIn: false, getToken: vi.fn() });

    render(<ClerkAuthBridge />);

    await waitFor(() => expect(registerTokenGetterMock).toHaveBeenCalled());
    const getter = registerTokenGetterMock.mock.calls.at(-1)![0];
    expect(await getter()).toBeNull();
  });
});
