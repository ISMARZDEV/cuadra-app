import { Mic, Plus, SendHorizontal } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
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

  const inputBg = isDark ? "#0F1313" : "#FFFFFF";
  const inputBorder = isDark ? "#1E2625" : "#B1B1B1";
  const inputColor = isDark ? "#FFFFFF" : "#034842";
  const placeholderColor = isDark ? "#8A8A8A" : "#BEC2C0";
  // Cursor + selection color — lime accent in dark, brand green in light.
  const cursorColor = isDark ? "#DEFFB7" : "#034842";

  const handleSend = () => {
    if (!hasText) return;
    onSend?.(value.trim());
    setValue(""); // clear the field (and revert the button back to the mic)
    // Imperative clear too: on iOS a multiline TextInput can still hold an uncommitted
    // autocorrect/predictive-text candidate (native "marked text") when Send is tapped — the
    // controlled `value` prop alone doesn't always force it out, so the native view briefly
    // "resurrects" the old text right after we clear it. `.clear()` resets the native text
    // directly, past any marked-text state.
    inputRef.current?.clear();
  };

  // Row is bottom-aligned so the buttons stay pinned to the bottom of the pill as it grows.
  return (
    <View className="flex-row items-end gap-2 px-5 pb-4 pt-2">
      <GlassButton icon={Plus} label={t("chat.a11y.attach")} size={42} iconSize={22} />
      {/* Auto-growing pill: a multiline TextInput that wraps onto new lines and expands the pill
          downward up to maxHeight, then scrolls internally. Plain View (NOT Pressable): the
          TextInput receives the native tap directly so a SINGLE tap focuses it. A Pressable wrapper
          here intercepted the touch and focused programmatically, which raced with multiline focus
          and cost extra taps (the real first-tap fix was clipping the navbar glass hit-area). */}
      <View
        style={{
          flex: 1,
          minHeight: 42,
          borderRadius: 21,
          backgroundColor: inputBg,
          borderWidth: 1,
          borderColor: inputBorder,
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
      >
        <TextInput
          ref={inputRef}
          multiline
          // No fixed `lineHeight`: on iOS a multiline TextInput anchors the glyph to the top of an
          // oversized line box, so a single line looks high/off-centre. Natural line height + the
          // wrapper's justifyContent:center keeps the text vertically centred; textAlignVertical
          // does the same on Android.
          textAlignVertical="center"
          style={{
            fontSize: 16,
            color: inputColor,
            maxHeight: 120,
            padding: 0,
          }}
          placeholder={t("chat.inputPlaceholder")}
          placeholderTextColor={placeholderColor}
          selectionColor={cursorColor}
          cursorColor={cursorColor}
          value={value}
          onChangeText={setValue}
        />
      </View>
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
