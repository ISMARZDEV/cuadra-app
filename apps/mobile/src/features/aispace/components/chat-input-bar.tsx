import { Mic, Plus } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { t } from "@/i18n";
import { useColorScheme } from "nativewind";

import { GlassButton } from "./glass-button";

export function ChatInputBar() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [value, setValue] = useState("");
  const inputRef = useRef<TextInput>(null);

  const inputBg = isDark ? "#282928" : "#FFFFFF";
  const inputBorder = isDark ? "#464646" : "#DEFFB7";
  const inputColor = isDark ? "#FFFFFF" : "#034842";
  const placeholderColor = isDark ? "#8A8A8A" : "#BEC2C0";
  // Cursor + selection color — lime accent in dark, brand green in light.
  const cursorColor = isDark ? "#DEFFB7" : "#034842";

  return (
    <View className="flex-row items-center gap-2 px-5 pb-4 pt-2">
      <GlassButton icon={Plus} label={t("chat.a11y.attach")} size={42} iconSize={22} />
      {/* Pressable wrapper ensures a single tap on the pill always focuses the TextInput,
          even when the View intercepts the touch before the TextInput receives it. */}
      <Pressable
        style={{
          flex: 1,
          height: 42,
          borderRadius: 21,
          backgroundColor: inputBg,
          borderWidth: 0.5,
          borderColor: inputBorder,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
        }}
        onPress={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          style={{ flex: 1, fontSize: 14, color: inputColor }}
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor={placeholderColor}
          selectionColor={cursorColor}
          cursorColor={cursorColor}
          value={value}
          onChangeText={setValue}
        />
      </Pressable>
      <GlassButton icon={Mic} label={t("chat.a11y.voice")} size={42} iconSize={22} />
    </View>
  );
}
