import { Mic, Plus, Send } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";

import { GlassButton } from "./glass-button";

// Bottom input — lime pill ("Ask me Something…") with an inner send button,
// plus attach (+) and voice (mic) liquid-glass buttons (Figma "Tool" row).
export function ChatInputBar() {
  const [value, setValue] = useState("");
  return (
    <View className="flex-row items-center gap-2 px-4 pb-2 pt-2">
      <View className="h-12 flex-1 flex-row items-center rounded-full bg-[#C2FB7E] pl-4 pr-1">
        <TextInput
          className="flex-1 text-base text-[#03484A]"
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor="#03484A99"
          value={value}
          onChangeText={setValue}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("chat.a11y.send")}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary"
        >
          <Icon as={Send} size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <GlassButton icon={Plus} label={t("chat.a11y.attach")} size={40} iconSize={22} />
      <GlassButton icon={Mic} label={t("chat.a11y.voice")} size={40} iconSize={20} />
    </View>
  );
}
