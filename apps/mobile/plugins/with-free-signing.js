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
 * DEBE ir ÚLTIMO en `plugins` (app.json) para correr DESPUÉS de `expo-notifications` y
 * `@clerk/expo` (que son quienes agregan esas entitlements).
 *
 * Uso: `EXPO_FREE_SIGNING=1 npx expo run:ios --device <udid>`
 */
module.exports = function withFreeSigning(config) {
  if (process.env.EXPO_FREE_SIGNING !== "1") return config;
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    delete cfg.modResults["com.apple.developer.applesignin"];
    return cfg;
  });
};
