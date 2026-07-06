// Placeholder de auditoría (`decided_by`) hasta resolver la identidad REAL de Clerk (userId) — TODO
// no bloqueante para B1 (anotado desde batch 2d). No confundir con autenticación: el backend YA
// exige `require_capability` en TODA ruta `/admin/save/*` (Fase 1); este valor solo viaja como el
// campo de auditoría "quién decidió" en `product_match`. Compartido por la pantalla de detalle
// (aprobar/rechazar individual) y la lista (bulk-actions, batch 2e) — un único lugar para el TODO.
export const ADMIN_DECIDED_BY = "admin";
