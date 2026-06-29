import { Mic, Plus, SendHorizontal } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";

import { t } from "@/i18n";
import { useColorScheme } from "nativewind";

import type { ChatInputBarProps } from "../interfaces";

import { GlassButton } from "./glass-button";

// `inputRef` is optional — the screen passes one in so it can dismiss/restore the keyboard around
// the sessions drawer (hide on open, refocus on close). `onSend` receives the trimmed message when
// the user taps send (the screen streams it to the chat); without it the bar just clears.
export function ChatInputBar({ inputRef: externalRef, onSend }: ChatInputBarProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [value, setValue] = useState("");
  const localRef = useRef<TextInput>(null);
  const inputRef = externalRef ?? localRef;
  const hasText = value.trim().length > 0;

  const inputBg = isDark ? "#282928" : "#FFFFFF";
  const inputBorder = isDark ? "#464646" : "#DEFFB7";
  const inputColor = isDark ? "#FFFFFF" : "#034842";
  const placeholderColor = isDark ? "#8A8A8A" : "#BEC2C0";
  // Cursor + selection color — lime accent in dark, brand green in light.
  const cursorColor = isDark ? "#DEFFB7" : "#034842";

  const handleSend = () => {
    if (!hasText) return;
    onSend?.(value.trim());
    setValue(""); // clear the field (and revert the button back to the mic)
  };

  // Row is bottom-aligned so the buttons stay pinned to the bottom of the pill as it grows.
  return (
    <View className="flex-row items-end gap-2 px-5 pb-4 pt-2">
      <GlassButton icon={Plus} label={t("chat.a11y.attach")} size={42} iconSize={22} />
      {/* Auto-growing pill: a multiline TextInput that wraps onto new lines and expands the pill
          downward up to maxHeight, then scrolls internally. Pressable wrapper guarantees a single
          tap focuses the input even when the View intercepts the touch first. */}
      <Pressable
        style={{
          flex: 1,
          minHeight: 42,
          borderRadius: 21,
          backgroundColor: inputBg,
          borderWidth: 0.5,
          borderColor: inputBorder,
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
        onPress={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          multiline
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: inputColor,
            maxHeight: 110,
            padding: 0,
          }}
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor={placeholderColor}
          selectionColor={cursorColor}
          cursorColor={cursorColor}
          value={value}
          onChangeText={setValue}
        />
      </Pressable>
      {/* Mic ⇄ Send: empty field shows the mic; once there's text it animates (zoom) to the send
          button (WhatsApp-style). Fixed 42×42 box so the swap never shifts the layout. */}
      <View style={{ width: 42, height: 42 }}>
        {hasText ? (
          <Animated.View
            key="send"
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(150)}
            style={StyleSheet.absoluteFill}
          >
            <GlassButton
              icon={SendHorizontal}
              label={t("chat.a11y.send")}
              accent
              size={42}
              iconSize={22}
              onPress={handleSend}
            />
          </Animated.View>
        ) : (
          <Animated.View
            key="mic"
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(150)}
            style={StyleSheet.absoluteFill}
          >
            <GlassButton icon={Mic} label={t("chat.a11y.voice")} size={42} iconSize={22} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}
