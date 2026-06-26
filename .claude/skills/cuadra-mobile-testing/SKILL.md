---
name: cuadra-mobile-testing
description: >
  Testing conventions for the Cuadra Expo app — vitest + @testing-library/react-native:
  what to test (components, hooks, screens), how to mock the @cuadra/api-client and the auth
  store, and the RED-first discipline mirrored from the backend.
  Trigger: Writing or editing tests under apps/mobile, or adding a component/hook/screen that
  needs coverage.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- Adding/changing a component, hook, screen, or form in `apps/mobile`.
- Setting up the test harness (vitest + RNTL).

## Critical Patterns

**1. Test behavior, not implementation (RED-first, like the backend).**
- Render → query by **accessible role/text** (`getByText`, `getByRole`, `getByLabelText`) → assert what the user sees/does. Avoid asserting internal state or snapshots of whole screens.
- Write the failing test first when the behavior is the point (e.g., "tapping Send calls the mutation", "HITL shows the confirm prompt").

**2. What to test (by layer).**

| Layer | Test |
|---|---|
| `components/ui/*` | renders variants/props; press handlers fire; dark/light class applied |
| `features/*/components` | feature component behavior (a form validates, a row formats money) |
| hooks / `api.ts` | Query/mutation hooks with a **mocked SDK** (`vi.mock("@cuadra/api-client")`) — assert it calls the right SDK fn with the right args |
| screens | composition + the happy path (renders sections, wires the hook) — keep light |

**3. Mock the boundaries, not the logic.**
- Mock `@cuadra/api-client` functions (`chat`, `getMetrics`, `devLogin`) with `vi.fn()` returning canned `{ data }`. Mock the zustand auth store to inject a token. Never hit the network.
- Wrap rendered trees in a `QueryClientProvider` test helper (fresh `QueryClient` per test, retries off).

**4. Money & i18n assertions.**
- Assert formatted money strings exactly ("USD 45.50", "JPY 500") to catch exponent bugs. Assert copy by i18n key/value for the active language.

## Code Examples

```tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { vi } from "vitest";
vi.mock("@cuadra/api-client", () => ({ chat: vi.fn(() => Promise.resolve({ data: { reply: "ok" } })) }));

test("send calls the chat mutation", async () => {
  render(<ChatScreen />, { wrapper: TestQueryProvider });
  fireEvent.changeText(screen.getByPlaceholderText(/ask/i), "gasté 500 en gas");
  fireEvent.press(screen.getByLabelText("send"));
  // assert the mocked chat was called with the message
});
```

## Commands

```bash
pnpm --filter @cuadra/mobile add -D @testing-library/react-native @testing-library/jest-native
pnpm --filter @cuadra/mobile test            # vitest run
```

## Resources

- **Stack/structure**: `cuadra-mobile` skill. **Forms under test**: `cuadra-mobile-forms`.
- **Backend discipline mirrored**: RED-first; `make eval` is the agent-prompt safety net analogue.
