const { withEntitlementsPlist } = require("@expo/config-plugins");

/**
 * Config plugin gateado por env para builds de dev con Apple ID GRATUITO.
 *
 * Cuando `EXPO_FREE_SIGNING=1`, remueve las entitlements que requieren cuenta Apple Developer
 * de PAGO, para que `expo run:ios` pueda firmar con un Apple ID gratuito (que no puede
 * provisionar esas capabilities):
 *   - `aps-environment`                     ← Push Notifications (la agrega `expo-notifications`)
 *   - `com.apple.developer.applesignin`     ← Sign In with Apple (la agrega `@clerk/expo`)
 *
 * Sin el env NO toca nada → los builds de producción (cuenta Apple de PAGO) conservan Push +
 * Apple Sign In. Push y Apple Sign In igual NO funcionan en un Apple ID gratuito, así que esto
 * no cambia funcionalidad de dev — solo desbloquea la FIRMA para poder compilar/instalar en un
 * dispositivo físico.
 *
 * ⚠️ DEBE ir **PRIMERO** en `plugins` (app.json) — sí, primero, aunque la intuición diga lo
 * contrario. En el sistema de mods de Expo los plugins se COMPONEN: el último registrado envuelve
 * a los anteriores, así que su acción corre ANTES y las de los anteriores DESPUÉS. Registrado al
 * final, este plugin borraba las entitlements y acto seguido `@clerk/expo` y `expo-notifications`
 * las volvían a poner — silenciosamente, y el build de dispositivo seguía muriendo con error 65.
 *
 * Medido con `expo config --type introspect`:
 *   plugin ÚLTIMO  → entitlements: { aps-environment, applesignin }   ← no sirve
 *   plugin PRIMERO → entitlements: {}                                  ← correcto
 *
 * Sin el env no toca nada, así que su posición no afecta a los builds de producción.
 *
 * ⚠️ La variable hay que pasarla TAMBIÉN al `prebuild`, no sólo al `run:ios`. Este plugin escribe
 * el `.entitlements`, y ese archivo se genera EN EL PREBUILD: si `ios/` ya existe, `run:ios` no
 * vuelve a correr los mods y la variable llega tarde — el build muere con error 65 aunque el
 * comando la lleve. Medido el 2026-08-09: un `expo prebuild --clean` pelado dejó
 * `{ aps-environment, applesignin }` en el plist y el `run:ios` con la env NO lo corrigió; con la
 * env en AMBOS comandos el plist queda `<dict/>` y la firma pasa.
 *
 * Uso (las DOS líneas, en este orden):
 *   EXPO_FREE_SIGNING=1 npx expo prebuild --clean
 *   EXPO_FREE_SIGNING=1 npx expo run:ios --device <udid>
 */
module.exports = function withFreeSigning(config) {
  if (process.env.EXPO_FREE_SIGNING !== "1") return config;
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    delete cfg.modResults["com.apple.developer.applesignin"];
    return cfg;
  });
};
