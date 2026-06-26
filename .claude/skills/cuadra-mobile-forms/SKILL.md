---
name: cuadra-mobile-forms
description: >
  Form conventions for the Cuadra Expo app — react-hook-form + zod validation, money inputs
  (minor-units, currency-aware), localized error messages (es/en/pt), and the add-transaction /
  wallet / budget / login flows. Pairs with the @cuadra/api-client mutations.
  Trigger: Building or editing any form/input in apps/mobile (login, add transaction, add
  wallet, set budget, create space/goal).
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- Any screen with inputs: login, **Add Transaction** (income/expense/transfer), Add Wallet,
  Set Budget, Create Space/Goal.
- Wiring a form to a `@cuadra/api-client` mutation.

> Generic Expo UI/inputs styling lives in the official **`building-native-ui`** skill; this skill
> is the Cuadra-specific form logic on top.

## Critical Patterns

**1. react-hook-form + zod, schema-first.**
- One `zod` schema per form = single source of truth for types + validation. `zodResolver` into `useForm`.
- Schema lives next to the form in `features/<f>/components/`. Infer the TS type from the schema (`z.infer`).
- A reusable `ControlledInput` (wraps RHF `Controller` + our `Input` from `components/ui`) so fields stay one-liners.

**2. Money inputs — minor-units & currency-aware (§12·B).**
- The user types MAJOR units ("45.50"); convert to **minor units** only at the API boundary, never store float. Mirror the backend exponent rule (USD/DOP/COP=2, JPY=0…).
- Validate: positive, max decimals = currency exponent, required. A dedicated `MoneyInput` (formats, restricts decimals, shows the currency).

**3. Localized errors (es/en/pt).**
- zod messages come from i18n keys (`src/i18n`), never hardcoded. Build the schema with a `t()`-aware message map so errors render in the user's language. Same 3 languages as the rest of the app.

**4. Submit = a mutation; handle pending/error.**
- `onSubmit` calls a TanStack Query **mutation** (from `features/<f>/api.ts`) wrapping the SDK. Disable submit while pending; map API `ProblemDetail` errors to the form (field or banner). Invalidate the relevant queries on success.

## Code Examples

```tsx
// features/insights/components/add-transaction-schema.ts
import { z } from "zod";
export const txSchema = (t: (k: string) => string) => z.object({
  amount: z.number({ message: t("errors.amountRequired") }).positive(t("errors.amountPositive")),
  category: z.string().min(1, t("errors.categoryRequired")),
  kind: z.enum(["expense", "income", "transfer"]),
});
export type TxForm = z.infer<ReturnType<typeof txSchema>>;
```

## Commands

```bash
pnpm --filter @cuadra/mobile add react-hook-form zod @hookform/resolvers
pnpm --filter @cuadra/mobile typecheck
```

## Resources

- **Stack/structure**: `cuadra-mobile` skill · **inputs styling**: official `building-native-ui`.
- **Mutations/SDK**: `features/<f>/api.ts` over `@cuadra/api-client`.
- **Money rule**: backend `shared/money` exponent (mirror it client-side).
