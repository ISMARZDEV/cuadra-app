import { Maximize2, Menu } from "lucide-react-native";
import { View } from "react-native";

import { t } from "@/i18n";
import { useDrawer } from "@/store/drawer-store";

import { GlassButton } from "./glass-button";

// Chat top bar — menu (left, opens the sessions drawer) + expand (right), both liquid-glass buttons.
export function ChatHeader() {
  const { setOpen } = useDrawer();
  return (
    <View className="flex-row items-center justify-between px-5 pb-4 pt-4">
      <GlassButton icon={Menu} label={t("chat.a11y.menu")} size={48} onPress={() => setOpen(true)} />
      <GlassButton icon={Maximize2} label={t("chat.a11y.expand")} size={48} iconSize={20} />
    </View>
  );
}
