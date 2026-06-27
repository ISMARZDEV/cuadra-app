import { Maximize2, Menu } from "lucide-react-native";
import { View } from "react-native";

import { t } from "@/i18n";

import { GlassButton } from "./glass-button";

// Chat top bar — menu (left) + expand (right), both liquid-glass buttons.
export function ChatHeader() {
  return (
    <View className="flex-row items-center justify-between px-5 pb-4 pt-2">
      <GlassButton icon={Menu} label={t("chat.a11y.menu")} />
      <GlassButton icon={Maximize2} label={t("chat.a11y.expand")} iconSize={20} />
    </View>
  );
}
