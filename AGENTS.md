# Agentes — skills del proyecto Cuadra

Skills versionadas con el repo (patrones propios). **Componen con los oficiales de Expo**
(plugin `expo@claude-plugins-official` + MCP `https://mcp.expo.dev/mcp`): lo genérico RN/Expo
(setup NativeWind, native-ui, animaciones, data-fetching, ejemplos, deploy) vive en los oficiales;
las de abajo solo añaden lo **específico de Cuadra**. Cárgalas cuando apliquen.

| Skill | Descripción | Ruta |
|-------|-------------|------|
| `cuadra-agent-prompts` | Patrón de prompts de agentes: instrucciones en INGLÉS, respuesta en el idioma del usuario + best practices de prompt engineering. Cargar al escribir/editar cualquier system prompt, docstring de tool o prompt de clasificador en `contexts/aispace`. | [SKILL.md](.claude/skills/cuadra-agent-prompts/SKILL.md) |
| `cuadra-mobile` | Convenciones + stack del app Expo (RN): estructura feature-oriented, NativeWind + react-native-reusables + componentes propios, lucide, TanStack Query sobre `@cuadra/api-client`, auth con zustand + dev-login, i18n es/en/pt, component-driven/refactor. Cargar al tocar cualquier cosa en `apps/mobile`. | [SKILL.md](.claude/skills/cuadra-mobile/SKILL.md) |
| `cuadra-design-system` | Lenguaje visual de Cuadra: temas dark/light, paleta verde, componentes (Card, ScallopFab, MetricTile, Bubble…), y los patrones de pantalla (rueda Insights, Daily Diary, News masonry, Chat, Save marketplace). Iconos lucide. Cargar al estilizar/construir UI en `apps/mobile`. | [SKILL.md](.claude/skills/cuadra-design-system/SKILL.md) |
| `cuadra-glass-button` | Botón redondo de liquid-glass (los +/mic/menú del chat): GlassView iOS-26 con tint, degradado de profundidad y press con spring; colores invertidos por tema. Gotchas: degradado con react-native-svg (NO expo-linear-gradient) y sin overflow:hidden bajo un transform de scale. Cargar al construir/editar botones glass o controles GlassSurface en `apps/mobile`. | [SKILL.md](.claude/skills/cuadra-glass-button/SKILL.md) |
| `cuadra-mobile-forms` | Forms: react-hook-form + zod, inputs de dinero (minor-units, por moneda), errores localizados es/en/pt. Cargar al construir cualquier form/input en `apps/mobile`. | [SKILL.md](.claude/skills/cuadra-mobile-forms/SKILL.md) |
| `cuadra-mobile-testing` | Testing: vitest + @testing-library/react-native; qué testear (componentes/hooks/pantallas), mock del api-client, RED-first. Cargar al escribir tests en `apps/mobile`. | [SKILL.md](.claude/skills/cuadra-mobile-testing/SKILL.md) |
