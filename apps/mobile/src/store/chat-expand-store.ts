import * as Haptics from "expo-haptics";
import { create } from "zustand";

// Whether the AISpace chat is expanded: the tab bar hides and the card grows down to reclaim that
// space (side margins/rounding stay as-is — see chat-screen.tsx). Toggled from the header's
// expand/minimize button (chat-header.tsx); read by the chat screen (card layout) and the tab bar
// (hide), same simple-boolean-store shape as orb-store — each consumer drives its own local
// animated value.
type ChatExpandState = {
  expanded: boolean;
  toggle: () => void;
  setExpanded: (value: boolean) => void;
};

export const useChatExpandStore = create<ChatExpandState>((set) => ({
  expanded: false,
  // Light impact on EVERY toggle — maximizing AND minimizing — same cue as the drawer (drawer-store.ts).
  toggle: () =>
    set((s) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { expanded: !s.expanded };
    }),
  // No haptic here — this is the programmatic reset (chat-screen unmount cleanup), not a user tap.
  setExpanded: (value) => set({ expanded: value }),
}));
