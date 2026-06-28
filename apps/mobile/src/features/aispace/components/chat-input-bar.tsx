import { Mic, Plus, Send } from "lucide-react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";

import { t } from "@/i18n";
import { useColorScheme } from "nativewind";

import { GlassButton } from "./glass-button";

// Bottom "Tool" row — Figma order: [+] [input pill] [mic] [send].
// Input bg: dark #01211e / light #ddffb5. Buttons 35px (Figma size-[34.679px]).
export function ChatInputBar() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [value, setValue] = useState("");

  const inputBg = isDark ? "#01211e" : "#ddffb5";
  const inputColor = isDark ? "#eaffd1" : "#034842";
  const placeholderColor = isDark ? "#eaffd166" : "#03484A99";

  return (
    <View className="flex-row items-center gap-2 px-5 pb-4 pt-2">
      <GlassButton icon={Plus} label={t("chat.a11y.attach")} size={35} iconSize={20} />
      <View
        style={{
          flex: 1,
          height: 34,
          borderRadius: 21,
          backgroundColor: inputBg,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
      >
        <TextInput
          style={{ flex: 1, fontSize: 12, color: inputColor }}
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor={placeholderColor}
          value={value}
          onChangeText={setValue}
        />
      </View>
      <GlassButton icon={Mic} label={t("chat.a11y.voice")} size={35} iconSize={19} />
      <GlassButton icon={Send} label={t("chat.a11y.send")} size={35} iconSize={18} variant="solid" />
    </View>
  );
}
