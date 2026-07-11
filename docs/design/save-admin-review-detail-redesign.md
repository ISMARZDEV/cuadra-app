# Rediseño UX/UI — Detalle "Revisar match" (Cola de revisión · OFV)

> **Estado:** planificación del frontend. El **backend + contrato ya están hechos y verificados**
> (SKU/EAN/tienda + imagen/tamaño de candidato — ver `[[architecture/backend-full-stack-del-detalle-revisar-match]]`).
> Rama: `feat/save-admin-review-detail-redesign` (off developer).
> **Skills aplicadas:** `cuadra-web`, `cuadra-ui-verify`, `vercel-composition-patterns`,
> `vercel-react-best-practices`, `ui-ux-pro-max`.

## 1 · Contexto

`ReviewDetailScreen` (`/admin/review-queue/@id`) es la versión funcional **P0**, sin pase de diseño:
tablas crudas (`CompareDiff`), sin imágenes de candidatos, sin SKU/EAN ni tienda origen, y el tamaño
del candidato siempre "—". El objetivo es el rediseño completo **fiel al mock**, con datos reales
(el backend ya los expone). Doctrina **SACRED** intacta: solo READ + UI; no se toca `ResolveReview`,
la cascada ni el invariante de misma-transacción. Aprobar/rechazar/atajos reusan el flujo validado.

## 2 · Árbol de componentes (mock → código)

```
ReviewDetailScreen                 composición: useData, handlers, atajos (NO lógica inline)
├─ DetailHeader                    breadcrumb · título+subtítulo(MethodBadge) · ShortcutsBanner · InfoBanner
├─ <div grid lg:grid-cols-[360px_1fr]>
│  ├─ StoreProductPanel            "PRODUCTO DE LA TIENDA"
│  │   ├─ imagen · nombre · pills Marca/Tamaño · SKU/EAN · Tienda(logo)
│  │   ├─ ConfidenceDonut(pct) + "Score fusionado de la cascada"
│  │   ├─ bloque método (MethodBadge)
│  │   └─ "N candidatos encontrados · Ordenados por similitud (score)"
│  └─ CandidatesSection            "CANDIDATOS RECOMENDADOS" — overflow-x scoped
│      └─ CandidateCard[]          rank · BestCandidateBadge(idx0) · imagen · score%
│          ├─ FieldDiffRow[]       Nombre/Marca/Tamaño → StatusBadge Coincide/Diferente + "A ≠ B"
│          └─ ApproveButton        "Aprobar candidato"
├─ RejectPanel                     "¿Ningún candidato es correcto?" · motivo* · Nota(0/500) · "Rechazar match"
└─ AuditFooter                     "Todas las decisiones se guardan… auditable"
```

**Archivos nuevos** (`apps/web/src/features/admin/resources/save-matching/components/detail/`):
`DetailHeader.tsx` · `ShortcutsBanner.tsx` · `StoreProductPanel.tsx` · `ConfidenceDonut.tsx` ·
`CandidatesSection.tsx` · `CandidateCard.tsx` · `FieldDiffRow.tsx` · `RejectPanel.tsx`.
Props en `detail/interfaces.ts` (regla `cuadra-web`: shapes en archivo dedicado). Reescribir
`ReviewDetailScreen.tsx` como composición.

## 3 · Reuso confirmado (APIs reales, verificadas en repo)

| Pieza | Firma / uso |
|-------|-------------|
| `providerLogoByName(name)` (`features/save/lib/provider-logos.ts`) | → URL o `undefined`; **"Sirena" mapeada** |
| `MethodBadge` (`features/admin/components/MethodBadge.tsx`) | `{ method, locale?, className? }` |
| `parseSize(sizeText)` (`.../lib/parse-size.ts`) | → `{ amount, unit }` para las pills |
| `diffField(a,b)` (`.../lib/field-diff.ts`) | → `"match" \| "differ"` (casefold+trim) |
| `useKeyboardReview` (`.../hooks/`) | a=aprobar top · r=enfocar motivo · n=siguiente |
| `resolveReviewMatch` + `ADMIN_DECIDED_BY` (`.../api.ts`, `.../lib/decided-by.ts`) | aprobar/rechazar |
| `REASON_CODES` (`ReasonCodeSelect.tsx:3`) | los 4 motivos ya coinciden con el mock |
| DTO nuevos | `store_product_sku/ean`, `provider_name`, candidate `image_url/size_text` (ya en el contrato) |

## 4 · Refinamiento clave sobre planes previos 🔧

`confidenceColor`/`confidencePillClass` devuelven clases **`bg+text`**, **no** un color de stroke SVG.
→ Agregar a `lib/confidence-color.ts` un **`confidenceStrokeClass(confidence)`** (`stroke-emerald-600 /
stroke-amber-500 / stroke-rose-400`) reusando los MISMOS umbrales (0.85/0.55 — fuente única, ya
sincronizada con el backend `banding.py`). El `ConfidenceDonut` es un anillo circular completo **nuevo**
(el `RadialGauge` es semicircular → no sirve; sí reusar su técnica `pathLength={100}` +
`strokeDasharray`).

## 5 · Decisiones de diseño (aplicando las skills)

### Accesibilidad (`ui-ux-pro-max` §1 — CRITICAL)
- **Nunca color solo:** los badges de diff llevan color **+ texto** ("Coincide"/"Diferente") y el
  subtexto "A ≠ B". El donut lleva el `%` como label + `role="img"` `aria-label="Confianza del match 85%"`.
- **aria-labels:** breadcrumb (link con texto ✓), ícono de info del banner (`aria-hidden` decorativo),
  imágenes con `alt` (producto/candidato). Botones con texto → sin aria extra.
- **Focus rings** visibles en link breadcrumb, botones aprobar/rechazar, select, textarea (no quitar).
- **Contraste 4.5:1** en ambos temas: reusar tokens; verificar los badges rose/amber/emerald por
  `getComputedStyle` (no a ojo — lección `cuadra-ui-verify`).
- **Keyboard nav** ya provista por `useKeyboardReview` (a/r/n) + tab-order natural.

### Íconos y estilo (`ui-ux-pro-max` §4 · `cuadra-web` §5)
- **NADA de emoji como ícono** (el mock muestra ⭐/✓/✕) → **Lucide**: `Star` (mejor candidato),
  `Check` (aprobar), `X` (rechazar), `ArrowLeft` (volver), `Info` (banner), `AlertCircle`/`XCircle`
  (panel de rechazo). Un solo set, stroke consistente.
- **Números tabulares** (`number-tabular`): `tabular-nums` en score %, confianza %, contador 0/500 →
  evita saltos de layout.

### Formularios y feedback (`ui-ux-pro-max` §8)
- **Motivo requerido:** asterisco `*` + error **debajo del campo** (no arriba), `role="alert"` /
  `aria-live`. El `RejectPanel` mantiene el guard existente (bloquea submit sin motivo — defensa en
  profundidad sobre el 422 del backend, NO un bypass).
- **Contador 0/500** como helper text del textarea (`maxLength={500}`).
- **Loading/disabled:** botones aprobar/rechazar `disabled={busy}` (ya existe) + opacidad reducida +
  feedback; sin doble-submit (atajos ya se desactivan con `disabled`).

### Layout y performance (`ui-ux-pro-max` §3/§5 · `vercel-react-best-practices`)
- **Reservar espacio de imagen** (`aspect-ratio`/width+height) + `loading="lazy"` en producto y
  candidatos → CLS < 0.1. `alt` descriptivo.
- **Scroll horizontal SCOPED** en `CandidatesSection` (`overflow-x-auto` en su contenedor) — el body de
  la página NUNCA hace scroll horizontal.
- **`rendering-svg-precision`:** coords del donut redondeadas a 2 decimales.
- **Reduced-motion:** cualquier `hover:scale` de card respeta `motion-reduce:`.

### Arquitectura de componentes (`vercel-composition-patterns` · `vercel-react-best-practices`)
- **Sin boolean-prop soup:** `BestCandidateBadge` es su propio componente (variante explícita), no un
  `isBest` que ramifique medio card. `CandidateCard` recibe datos + `rank`; el realce del top se
  compone, no se condiciona con flags.
- **`rerender-no-inline-components`:** ningún subcomponente se define dentro de otro (todos a module
  scope / archivo propio).
- **Composición sobre props:** `RejectPanel` **compone** el select/nota/botón; reusa los `REASON_CODES`
  y mantiene `id="reason-code-select"` (lo enfoca el atajo `r` vía `getElementById`).
- **`ReviewDetailScreen` = solo composición + wiring** (regla `cuadra-web`: screens lean, lógica en
  hooks/lib). Conserva `useData`, `handleApprove`/`handleReject`, `useKeyboardReview`, navegación
  post-resolve.

### i18n
- Strings **ES hardcodeadas** (consistente con la pantalla actual; i18n del admin = P0 aparte,
  gotcha #8 de `cuadra-save-admin`). Ambos temas por token.

## 6 · Removals (grep antes de borrar)
`CompareDiff.tsx` + `CompareDiff.test.tsx` → reemplazados por `FieldDiffRow`/`CandidateCard`. Hoy solo
los usa `ReviewDetailScreen` → quedan huérfanos → se retiran (con `git rm`, historia preservada).

## 7 · Tests (Strict TDD · RED primero — `cuadra-web`/`cuadra-mobile-testing` = vitest + RTL)
- `ConfidenceDonut`: pct → `strokeDasharray` correcto + `confidenceStrokeClass` por banda + `role/aria-label`.
- `FieldDiffRow`: match→"Coincide", differ→"Diferente" (+ subtexto A≠B); reusa `diffField`.
- `CandidateCard`: renderiza score/imagen/rank, `BestCandidateBadge` solo en idx0, "Aprobar" propaga el
  `canonical_product_id`.
- `StoreProductPanel`: SKU/EAN/tienda(logo)/N candidatos/imagen.
- `RejectPanel`: contador 0/500 actualiza; motivo vacío bloquea submit + muestra error; propaga
  `reasonCode`+`reasonNote`.
- `ReviewDetailScreen`: aprobar top, rechazar, atajos a/r/n (extiende cobertura — hoy no hay test del screen).
- Mantener `field-diff.test`/`useKeyboardReview.test`; **retirar** `CompareDiff.test`.

## 8 · Verificación end-to-end (`cuadra-ui-verify` v1.1)
- **Suite web COMPLETA** `pnpm --filter @cuadra/web test` (incluye `architecture.test.ts` — el CI corre
  TODO; **no** tests sueltos, fue la causa del fallo del PR #27) + `pnpm --filter @cuadra/web typecheck`.
- **Visual:** screenshot **claro + oscuro** vía Playwright (`deviceScaleFactor:3`), comparar vs mock,
  listar diferencias; **colores del donut/badges por `getComputedStyle`**, no a ojo.
  - Verificación sin gate: la ruta `/es/do/ui-preview` renderiza componentes admin sin Clerk. **Nota de
    deuda:** `ui-preview/+Page.tsx` dice "BORRAR antes de commitear" y ya está en developer → **no le
    sumo producto**; uso una variante local temporal solo para el screenshot y NO la commiteo.

## 9 · Fuera de alcance / notas
- Sin migración, sin tocar cascada/matching/`ResolveReview`.
- Candidato: `name/brand/score` del snapshot `review_candidate`; `image_url/size_text` del canónico live
  vía join — inconsistencia deliberada, documentada.
- Sin EAN en cards de candidato (el canónico no tiene EAN — fiel al mock).
- Logo de tienda: resuelto en el front (`providerLogoByName`), no por backend.
- **Commits separados** (`cuadra-web` §7): `feat(api):` backend (ya hecho) · `feat(admin):` rediseño
  front · `refactor(admin):` remoción de `CompareDiff` si se aísla. Al terminar: push + PR → developer +
  CI verde + merge squash (con OK del usuario).

## 10 · Orden de implementación sugerido (RED→GREEN por pieza)
1. `confidenceStrokeClass` + `ConfidenceDonut` (base visual, aislada).
2. `FieldDiffRow` → `CandidateCard` → `CandidatesSection`.
3. `StoreProductPanel`.
4. `DetailHeader` + `ShortcutsBanner`.
5. `RejectPanel` (contador + guard).
6. `ReviewDetailScreen` composición + remover `CompareDiff`.
7. Verificación visual (claro/oscuro + computed-style) → ajustes.
