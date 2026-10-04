import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

// Centralized UI sounds. Imperative, module-level players persist for the app's lifetime → always
// preloaded and "warm". To swap a sound, change its require() below.
//
// keepAudioSessionActive: iOS keeps the audio session active after a sound finishes, so the next
// play has no cold-start delay. interruptionMode 'mixWithOthers': UI sounds never pause the user's
// music. seekTo(0) is awaited before play() so a finished sound reliably restarts (no "sometimes
// no sound").

type Player = ReturnType<typeof createAudioPlayer>;

const KEEP_WARM = { keepAudioSessionActive: true };

void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" });

const players: Record<string, Player> = {
  tick: createAudioPlayer(
    require("../assets/sounds/tick-a-current.wav"),
    KEEP_WARM,
  ),
  nav: createAudioPlayer(
    require("../assets/sounds/tick-d-soft.wav"),
    KEEP_WARM,
  ),
  dock: createAudioPlayer(
    require("../assets/sounds/tick-c-tock.wav"),
    KEEP_WARM,
  ),
  send: createAudioPlayer(
    require("../assets/sounds/tick-b-crisp.wav"),
    KEEP_WARM,
  ),
  reveal: createAudioPlayer(
    require("../assets/sounds/external-sounds/ai-intro-01.wav"),
    KEEP_WARM,
  ),
  close: createAudioPlayer(
    require("../assets/sounds/external-sounds/close-01.wav"),
    KEEP_WARM,
  ),
  startup: createAudioPlayer(
    require("../assets/sounds/external-sounds/startup-01.wav"),
    KEEP_WARM,
  ),
  check: createAudioPlayer(
    require("../assets/sounds/external-sounds/check-01.wav"),
    KEEP_WARM,
  ),
  bad: createAudioPlayer(
    require("../assets/sounds/external-sounds/bad-01.wav"),
    KEEP_WARM,
  ),
  share: createAudioPlayer(
    require("../assets/sounds/external-sounds/shared-01.wav"),
    KEEP_WARM,
  ),
  voiceSend: createAudioPlayer(
    require("../assets/sounds/external-sounds/send-messages-01-loud.wav"),
    KEEP_WARM,
  ),
  aiResponse: createAudioPlayer(
    require("../assets/sounds/external-sounds/ai-response-messages-01-loud.wav"),
    KEEP_WARM,
  ),
};

/**
 * POR QUÉ ESTOS DOS CLIPS SON `-loud.wav` Y NO LOS `.mp3` ORIGINALES.
 *
 * ⭐⭐⭐ **Sonaban bajísimo y no era cosa del código: el player ya iba a volumen 1.0.** Medido con
 * `sox <f> -n stat`, los dos originales traían `Volume adjustment: 5.18` — o sea que admitían
 * multiplicarse por 5,18 antes de saturar. Estaban grabados ~14 dB por debajo del máximo, así que
 * no había NADA que subir por software: el techo del reproductor ya estaba puesto.
 *
 * La normalización a −1 dBFS (`sox in.mp3 --norm=-1 out.wav`) los sube 4,6× en pico Y en RMS:
 *
 * | clip        | pico antes | pico después | RMS antes | RMS después |
 * |-------------|-----------|--------------|-----------|-------------|
 * | send        | 0.192942  | 0.891235     | 0.009169  | 0.042352    |
 * | ai-response | 0.177927  | 0.821594     | 0.012283  | 0.056719    |
 *
 * ⚠️ **A `.wav` y no a `.mp3` a propósito**: recomprimir un mp3 a mp3 es una segunda pérdida sobre
 * material que ya la tiene. Los originales siguen ahí al lado, intactos.
 *
 * ⚠️ Si algún día se sustituyen estos clips, hay que volver a mirar su `Volume adjustment`. Un
 * archivo nuevo sin normalizar volverá a sonar «muy bajo» y el código se verá igual de correcto.
 */

function play(p: Player, volume?: number) {
  if (volume !== undefined) p.volume = volume;
  p.seekTo(0)
    .then(() => p.play())
    .catch(() => {});
}

// Gesture/UI → sound. share() is exposed for the future share action (no trigger yet).
export const sounds = {
  tick: () => play(players.tick), // selector scrub step
  nav: () => play(players.nav, 0.04), // nav item change
  dock: () => play(players.dock, 0.25), // chat dock opens (quiet)
  send: () => play(players.send), // message sent / a dock option chosen
  reveal: () => play(players.reveal), // orb appears (swipe up)
  close: () => play(players.close), // orb hides (swipe down / auto-hide)
  startup: () => play(players.startup), // app launch
  check: () => play(players.check), // login success
  bad: () => play(players.bad), // login error
  share: () => play(players.share), // share (future)

  /**
   * EL DICTADO SE VA — UNA sola vez, al entrar el telón.
   *
   * ⭐⭐ **Una vez, no en bucle.** Se probó repitiéndolo mientras durase el pensado y el usuario lo
   * cortó: un sonido que se repite durante una espera deja de anunciar algo y pasa a ser ambiente,
   * igual que le ocurrió al háptico. Lo que hay que marcar es el suceso — el mensaje se va —, y un
   * suceso ocurre una vez.
   *
   * ⚠️ **Arranca con el TELÓN y no al soltar**, por dos razones que apuntan al mismo sitio: al
   * levantar el dedo todavía no se sabe si hay algo que enviar (lo decide `settled`), y reproducir
   * audio con el reconocedor abierto reconfigura la `AVAudioSession` y puede desactivar la sesión de
   * voz EN SILENCIO — fue la causa del «a veces escucha y a veces no».
   */
  voiceSend: () => play(players.voiceSend),
  /** El ciclo se canceló antes de enviar: no hay envío al que acompañar. */
  voiceSendStop: () => players.voiceSend.pause(),
  aiResponse: () => play(players.aiResponse), // la IA empieza a responder (una sola vez)
};
