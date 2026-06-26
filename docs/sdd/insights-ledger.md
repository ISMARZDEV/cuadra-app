# 📒 Insights — Modelo del Ledger (doble entrada)

> **Contexto:** `insights` · **Deriva de** [`arquitectura-mvp.md`](../arquitectura-mvp.md) §12·B + ADR 14.
> **Estado:** diseño aprobado (asientos validados con el usuario antes de codificar).
> **Fecha:** 2026-06-26.
>
> **Principio rector (§12·B, gap #1 de fintech):** el dinero NUNCA es `float`; vive en *minor
> units* (enteros). El **saldo es DERIVADO** de un ledger de doble entrada, nunca una columna
> mutable. Esto sobrevive a transfers, tarjeta de crédito, remesas y crédito sin re-modelar.
>
> **Por qué doble entrada y no "una columna de saldo":** el net worth (activos − pasivos),
> la tarjeta de crédito (gastás plata que no tenés) y las transferencias (mover ≠ gastar)
> son **imposibles de modelar bien** sin cuentas tipadas y asientos balanceados. Cleo lo
> probó con números: un LLM reportó US$28K cuando eran ~US$3K (§12). Aquí los números no los
> toca el modelo — son enteros validados en construcción.

---

## 1. Taxonomía de cuentas

Cada `Account` tiene un **tipo contable** con un "lado normal":

| Tipo | Sube con | Saldo normal | Ejemplos en Cuadra |
|------|----------|--------------|--------------------|
| **asset** (activo) | Débito + | positivo | Efectivo, Banco/Débito, Wallet-USD, Ahorros |
| **liability** (pasivo) | Crédito − | negativo | Tarjeta de crédito |
| **income** (ingreso) | Crédito − | negativo | Salario, Freelance *(= categorías de ingreso)* |
| **expense** (gasto) | Débito + | positivo | Combustible, Suscripciones *(= categorías de gasto)* |
| **equity** (patrimonio) | Crédito − | negativo | **Opening Balance** (saldo de apertura) |

> 🔑 **Las categorías SON cuentas.** Una categoría de gasto ("Combustible") es una cuenta
> `expense`; una de ingreso ("Salario") es una cuenta `income`. El `Posting` apunta a una
> `Account`; la "categoría" de la transacción es la cuenta income/expense del otro lado del asiento.

---

## 2. Convención de signos e invariante

Codificación entera de la contabilidad estándar:

- **DÉBITO = positivo (+)** · **CRÉDITO = negativo (−)**
- **INVARIANTE DE HIERRO:** en cada `JournalEntry`, **`Σ postings = 0` POR MONEDA**.
- `balance(account) = Σ amount_minor de sus postings` (en su moneda).

**Regla de display** (los tipos de saldo natural negativo se voltean para mostrar):

| Tipo | Cómo se muestra |
|------|-----------------|
| asset, expense | tal cual (saldo positivo = normal) |
| liability, income, equity | `−balance` (su saldo natural es negativo → se voltea a positivo) |

Ejemplo: `income:Salary` con saldo `−2 000 000` se muestra **Total Income +$20,000**;
`liability:CreditCard` con `−35 000` se muestra **deuda $350**.

> Todo en *minor units*: `$50,000.00 = 5 000 000` centavos. Abajo se anota el monto humano
> para legibilidad; el sistema solo guarda enteros.

---

## 3. Asientos concretos (los casos del MVP)

### ① Saldo inicial — agregar una wallet "Banco" con DOP $50,000 ya existentes
```
JournalEntry: "Opening balance — Banco"
  DR  asset:Banco              + $50,000     ( 5 000 000)
  CR  equity:OpeningBalance    − $50,000     (−5 000 000)
  Σ = 0 ✓
```
🔑 **El saldo inicial entra por EQUITY, no por income.** Por eso el frontend muestra
`Total balance DOP $50,000` PERO `Total Income $20,350` — números distintos. Si el saldo
inicial fuera "ingreso", la tarjeta Total Income **mentiría**. Esta es la trampa que el modelo evita.

### ② Salario +$20,000 entra al Banco
```
JournalEntry: "Salario"
  DR  asset:Banco              + $20,000
  CR  income:Salary            − $20,000
  Σ = 0 ✓
```

### ③ Shell −$500 (gasto con débito)
```
JournalEntry: "Shell · Combustible"
  DR  expense:Combustible      + $500
  CR  asset:Banco              − $500
  Σ = 0 ✓
```

### ④ Transferencia $1,000 de Efectivo → Banco
```
JournalEntry: "Transfer Efectivo → Banco"
  DR  asset:Banco              + $1,000
  CR  asset:Efectivo           − $1,000
  Σ = 0 ✓
```
🔑 Toca **dos activos, ningún income/expense** → no infla gastos ni ingresos ni cambia el
net worth. Los trackers ingenuos cuentan la transferencia como "gasto" y arruinan los números.

### ⑤ Spotify $350 con TARJETA DE CRÉDITO
```
JournalEntry: "Spotify · Suscripciones (crédito)"
  DR  expense:Subscriptions    + $350
  CR  liability:CreditCard     − $350
  Σ = 0 ✓
```
🔑 **No se movió ningún activo** — gastaste plata que aún no tenés. El gasto cuenta YA; la
deuda sube $350; el net worth baja $350. Sin cuenta de pasivo esto es imposible de modelar.

### ⑥ Pago de la tarjeta: pagás $350 desde el Banco
```
JournalEntry: "Pago tarjeta de crédito"
  DR  liability:CreditCard     + $350        (reduce la deuda → 0)
  CR  asset:Banco              − $350
  Σ = 0 ✓
```
🔑 **NO es un gasto** — el gasto ya ocurrió en ⑤. Pagar la tarjeta solo convierte deuda en
efectivo que sale; net worth sin cambio. Los trackers ingenuos lo cuentan DOBLE.

---

## 4. Cómo salen las pantallas de estos asientos

Tras ①–⑥ (más Efectivo $5,000 de apertura):

| Cuenta | Saldo (Σ postings) |
|--------|--------------------|
| asset:Banco | 50,000 +20,000 −500 −350 +1,000 = **$70,150** |
| asset:Efectivo | 5,000 −1,000 = **$4,000** |
| liability:CreditCard | **$0** (pagada) |
| income:Salary | −20,000 → display **+$20,000** |
| expense:Combustible + Subscriptions | **$850** |

**Tarjetas del frontend (todas derivadas, cero columnas mutables):**

| Métrica | Fórmula | Valor |
|---------|---------|-------|
| Total Income | `−Σ balance(income)` del período | **$20,000** |
| Total Bills/Expenses | `Σ balance(expense)` del período | **$850** |
| Balance (neto del período) | `Total Income − Total Expenses` | **$19,150** |
| Total balance (wallets) | `Σ balance(asset)` por moneda | **DOP $74,150** |
| **Net worth** | `Σ balance(asset) + Σ balance(liability con signo)` | **$74,150** |

> Cambiás un asiento → todos los números se recalculan solos y SIEMPRE cuadran.

---

## 5. La única excepción al invariante: FX (DOP ⇄ USD)

`Σ = 0` es **por moneda**. Un gasto en USD cuadra solo entre cuentas USD. Pero **convertir**
DOP→USD (comprás US$100 pagando RD$5,900 a tasa 59) toca dos monedas y no suma 0 en ninguna
moneda sola:
```
  DR  asset:Wallet-USD    + US$100      (USD)
  CR  asset:Banco-DOP     − RD$5,900    (DOP)   ← no suma 0 en ninguna moneda individual
```
**Resolución:** asiento de conversión vía una **cuenta de cambio (FX clearing)** + la **tasa
fechada** (`fx_rate`, §12·B). **MVP:** arranca con **FX display-only** (USD mostrado a la tasa
del día, sin asiento de conversión); el asiento real entra cuando se habilite "cambiar plata"
como acción. Es la **única excepción documentada** al invariante.

---

## 6. Mapeo al esquema (§10) y entidades nuevas del scope ampliado

```
account(id, user_id, type[asset|liability|income|expense|equity], currency[ISO4217], name, ...)
journal_entry(id, user_id, date, description, source[manual|voice|ocr], idempotency_key UNIQUE)
posting(id, journal_entry_id, account_id, currency[ISO4217], amount_minor BIGINT)
fx_rate(id, from_currency, to_currency, rate, date)
-- balance(account) = Σ posting.amount_minor WHERE account_id (derivado; cachear opcional)
```

**Entidades que agregan los 4 gaps aprobados al MVP** (ver `sdd/insights-scope`):

| Feature | Modelo |
|---------|--------|
| Recurrentes + suscripciones | `recurring_rule(id, user_id, amount_minor, currency, category_account_id, source_account_id, cadence, next_run, active)` → genera `journal_entry`. Suscripciones = recurrentes de gasto filtradas. |
| Alertas + límite por comercio | `budget` gana `merchant_id` opcional + `alert_thresholds[]` (70/85/100). |
| Bill reminders | Query de próximas ocurrencias de `recurring_rule` no liquidadas (no es entidad nueva). |
| Net worth tracker | Tipos `asset`/`liability` (ya en la taxonomía) + opcional `net_worth_snapshot(user_id, date, assets_minor, liabilities_minor, currency)` para el histórico. |

---

## 7. Invariantes a testear (RED-first)

1. `JournalEntry` con `Σ postings ≠ 0` (en cualquier moneda) → **rechazado** en construcción.
2. `JournalEntry` con < 2 postings → rechazado.
3. `balance(account)` = suma exacta de sus postings (por moneda).
4. Transfer entre dos `asset` NO afecta income/expense ni net worth.
5. Compra con `liability` cuenta como expense y sube la deuda; el pago de la deuda NO es expense.
6. Saldo inicial vía `equity` NO infla Total Income.
7. Postings de monedas distintas en un mismo `JournalEntry` solo se permiten en un asiento
   marcado FX (con `fx_rate`); de lo contrario el invariante por-moneda los rechaza.

> **Por qué RED-first aquí es innegociable (ADR 23):** ningún cálculo de dinero se escribe
> sin un test que lo cubra primero. El ledger es la fuente de verdad de TODOS los saldos.
