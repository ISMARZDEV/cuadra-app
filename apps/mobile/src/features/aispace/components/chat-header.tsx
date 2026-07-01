import { Maximize2, Menu, Minimize2 } from "lucide-react-native";
import { View } from "react-native";

import { t, useLang } from "@/i18n";
import { useChatExpandStore } from "@/store/chat-expand-store";
import { useDrawer } from "@/store/drawer-store";

import { GlassButton } from "./glass-button";

// Chat top bar — menu (left, opens the sessions drawer) + expand/collapse (right, ChatGPT-style
// full-screen toggle — chat-screen.tsx animates the card, cuadra-tab-bar.tsx hides the navbar),
// both liquid-glass buttons.
export function ChatHeader() {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { setOpen } = useDrawer();
  const expanded = useChatExpandStore((s) => s.expanded);
  const toggleExpanded = useChatExpandStore((s) => s.toggle);
  return (
    <View className="flex-row items-center justify-between px-5 pb-4 pt-4">
      <GlassButton icon={Menu} label={t("chat.a11y.menu")} size={48} onPress={() => setOpen(true)} />
      <GlassButton
        icon={expanded ? Minimize2 : Maximize2}
        label={t(expanded ? "chat.a11y.collapse" : "chat.a11y.expand")}
        size={48}
        iconSize={20}
        onPress={toggleExpanded}
      />
    </View>
  );
}
