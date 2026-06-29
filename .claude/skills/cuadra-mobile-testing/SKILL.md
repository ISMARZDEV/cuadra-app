---
name: cuadra-mobile-testing
description: >
  Testing conventions for the Cuadra Expo app — vitest + jsdom + react-native-web (alias) +
  @testing-library/react (NOT react-native-testing-library): what to test (components, hooks,
  screens), how to mock the @cuadra/api-client and native deps, the harness stubs (reanimated,
  react-native-svg), and the RED-first discipline mirrored from the backend.
  Trigger: Writing or editing tests under apps/mobile, or adding a component/hook/screen that
  needs coverage.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- Adding/changing a component, hook, screen, or form in `apps/mobile`.
- Setting up / debugging the test harness (vitest + jsdom + `react-native-web` + `@testing-library/react`).

> **The harness is DOM-based, NOT react-native-testing-library.** `react-native` is aliased to
> `react-native-web` and rendered in jsdom (`vitest.config.ts`). So: `@testing-library/react`,
> `fireEvent.click`/`fireEvent.change` (NOT `.press`/`.changeText`), and queries by `getByText` /
> `getByLabelText` (RN `accessibilityLabel` → aria-label) / `getByPlaceholderText`. Don't reach for
> `@testing-library/react-native` — it isn't installed.

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

**5. Harness gotchas (a component that won't even COLLECT is almost always this).**
Native modules that can't pass vitest's transform must be **aliased to stubs** (`vitest.config.ts`)
or **mocked** (`src/test/setup.ts`). If you add a component that pulls a new native dep, stub it —
don't fight the error. Already handled:
- **react-native-reanimated** → alias to `src/test/reanimated-stub.tsx` (its source fails the SSR
  transform AND needs Metro-only globals `__DEV__`/`matchMedia`). Stub = `Animated.*` host
  components + inert hooks (`useSharedValue` → `{value}`) + identity `withX` + chainable layout
  builders (`ZoomIn`…).
- **react-native-svg** → alias to `src/test/svg-stub.tsx`. Unlike the lucide icon-stub (renders
  `null`), svg containers must **pass children through** (a View passthrough), or the subtree
  disappears. **Stubs must be ESM `.tsx`, NOT `.cjs`** — a `.cjs` that `require()`s an aliased
  module (react-native→react-native-web) throws "Unexpected token 'typeof'".
- **GlassSurface fallback deps** → `vi.mock` as View passthroughs in `setup.ts`: `expo-glass-effect`
  (GlassView, `isLiquidGlassAvailable: () => false`), `expo-blur`, `expo-linear-gradient`,
  `react-native-squircle-view`, `@react-native-masked-view/masked-view`. Also `nativewind` and the
  `@/components/ui/icon` wrapper are mocked.

**6. Streaming / SSE hooks — mock the TRANSPORT module, not the network.**
The chat hook (`use-chat`) streams over a transport module (`chat-stream.ts`, `expo/fetch`). Test
the hook by `vi.mock("./chat-stream")` and driving its `onEvent` callback synchronously
(`onEvent({type:"token",content})` → `done` → assert messages); mock `@cuadra/api-client` `resume`
for the HITL confirm path. The transport itself (expo/fetch) is the untestable boundary in jsdom.

> **CI does NOT run vitest.** The mobile CI job runs `typecheck` only — broken tests won't fail CI.
> Run `pnpm --filter @cuadra/mobile test` locally before committing.

## Code Examples

```tsx
// Component: DOM harness — fireEvent.change/click, queries by aria-label/placeholder.
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

test("typing reveals send; pressing it calls onSend", () => {
  const onSend = vi.fn();
  render(<ChatInputBar onSend={onSend} />);
  fireEvent.change(screen.getByPlaceholderText(/.+/), { target: { value: "gasté 500 en gas" } });
  fireEvent.click(screen.getByLabelText("Enviar")); // accessibilityLabel → aria-label
  expect(onSend).toHaveBeenCalledWith("gasté 500 en gas");
});

// Streaming hook: mock the transport + the SDK; drive events through the mock.
import { act, renderHook } from "@testing-library/react";
vi.mock("./chat-stream", () => ({ streamChat: vi.fn() }));
vi.mock("@cuadra/api-client", () => ({ resume: vi.fn() }));
```

## Commands

```bash
pnpm --filter @cuadra/mobile test        # vitest run (NOT gated by CI — run it yourself)
pnpm --filter @cuadra/mobile typecheck   # the actual mobile CI gate
```

## Resources

- **Stack/structure**: `cuadra-mobile` skill. **Forms under test**: `cuadra-mobile-forms`.
- **Backend discipline mirrored**: RED-first; `make eval` is the agent-prompt safety net analogue.
