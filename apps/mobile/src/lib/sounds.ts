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
  tick: createAudioPlayer(require("../assets/sounds/tick-a-current.wav"), KEEP_WARM),
  reveal: createAudioPlayer(require("../assets/sounds/external-sounds/ai-intro-01.wav"), KEEP_WARM),
  close: createAudioPlayer(require("../assets/sounds/external-sounds/close-01.wav"), KEEP_WARM),
  startup: createAudioPlayer(require("../assets/sounds/external-sounds/startup-01.wav"), KEEP_WARM),
  check: createAudioPlayer(require("../assets/sounds/external-sounds/check-01.wav"), KEEP_WARM),
  bad: createAudioPlayer(require("../assets/sounds/external-sounds/bad-01.wav"), KEEP_WARM),
  share: createAudioPlayer(require("../assets/sounds/external-sounds/shared-01.wav"), KEEP_WARM),
};

function play(p: Player) {
  p.seekTo(0)
    .then(() => p.play())
    .catch(() => {});
}

// Gesture/UI → sound. share() is exposed for the future share action (no trigger yet).
export const sounds = {
  tick: () => play(players.tick), // selector scrub step
  reveal: () => play(players.reveal), // orb appears (swipe up)
  close: () => play(players.close), // orb hides (swipe down / auto-hide)
  startup: () => play(players.startup), // app launch
  check: () => play(players.check), // login success
  bad: () => play(players.bad), // login error
  share: () => play(players.share), // share (future)
};
