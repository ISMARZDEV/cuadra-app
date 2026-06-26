# Contribuir a Cuadra

## TDD — RED → GREEN → REFACTOR (obligatorio · ADR 23)

Todo código determinístico se construye **test-primero**:

1. **RED** — escribe un test que falle (define el comportamiento esperado). Córrelo y **velo fallar**.
2. **GREEN** — escribe el mínimo código para que pase.
3. **REFACTOR** — limpia con los tests en verde.

> El número del dinero, las tools, el ledger y el dominio **nunca** se escriben sin un test que los
> cubra primero. La lógica pura (servicios de dominio) es el caso ideal del loop RED-first.

## Tests — organización y ejecución

Los tests viven **por contexto** (espejo de `src/contexts/`):

```
apps/api/tests/
├── conftest.py                 # fixtures compartidos (db_session) + auto-marcado por path
├── test_health.py              # smoke (no es contexto)
├── identity/{unit,integration}/
└── <context>/{unit,integration}/
```

```bash
make test-unit                  # solo unit, sin DB — el loop RED-first (rápido)
make test-ctx CTX=identity      # un contexto (al trabajar un feature)
make test                       # suite completa — ANTES de pushear
```

- `unit` no toca DB; `integration` requiere `make db-up` (se **salta** si no hay DB).
- El marcado es **automático por path** (`*/unit/*`, `*/integration/*`); no decores a mano.

## CI / despliegue (regla de oro)

- **Local / feature branch:** corre el contexto que tocas (`make test-ctx`) para feedback rápido.
- **Gate de merge y deploy:** **SIEMPRE la suite completa** (todos los contextos). El CI filtra a nivel
  **app** (backend vs mobile) pero **nunca** por contexto — un cambio en `shared/` afecta a todos
  (riesgo de *under-building*). Ver `.github/workflows/ci.yml`.

## Límites de arquitectura (enforced)

`lint-imports` (en CI) bloquea: imports entre contextos y `domain` importando `infrastructure`
(ADR 31/33). El código en inglés, la prosa en español (ADR 32).
