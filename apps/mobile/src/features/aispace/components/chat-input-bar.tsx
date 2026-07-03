import * as Haptics from "expo-haptics";
import { Mic, Plus, SendHorizontal } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";

import { GlassButton } from "@/components/ui/glass-button";
import { t, useLang } from "@/i18n";
import { sounds } from "@/lib/sounds";
import { useColorScheme } from "nativewind";

import type { ChatInputBarProps } from "../interfaces";

// `inputRef` is optional — the screen passes one in so it can dismiss/restore the keyboard around
// the sessions drawer (hide on open, refocus on close). `onSend` receives the trimmed message when
// the user taps send (the screen streams it to the chat); without it the bar just clears.
export function ChatInputBar({ inputRef: externalRef, onSend }: ChatInputBarProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [value, setValue] = useState("");
  const localRef = useRef<TextInput>(null);
  const inputRef = externalRef ?? localRef;
  const hasText = value.trim().length > 0;
  // The exact text we just sent (lowercased) — set on Send, cleared on the next real edit. See
  // `handleChangeText` below for why this beats a synchronous clear() alone.
  const lastSentRef = useRef<string | null>(null);

  const inputBg = isDark ? "#0F1313" : "#FFFFFF";
  const inputBorder = isDark ? "#1E2625" : "#B1B1B1";
  const inputColor = isDark ? "#FFFFFF" : "#034842";
  const placeholderColor = isDark ? "#8A8A8A" : "#BEC2C0";
  // Cursor + selection color — lime accent in dark, brand green in light.
  const cursorColor = isDark ? "#DEFFB7" : "#034842";

  const handleSend = () => {
    if (!hasText) return;
    const trimmed = value.trim();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sounds.send();
    onSend?.(trimmed);
    lastSentRef.current = trimmed.toLowerCase();
    setValue(""); // clear the field (and revert the button back to the mic)
    inputRef.current?.clear();
  };

  // iOS can commit a pending autocorrect/predictive-text candidate on a NATIVE event that fires
  // AFTER handleSend already ran — a plain setValue("")/.clear() in handleSend loses that race, so
  // the corrected text (e.g. "amazon" → "Amazon") reappears in the field right after sending. If
  // the incoming text is (case-insensitively) the message we JUST sent, it's that late echo, not
  // new typing — swallow it. Any OTHER change clears the guard so real typing is never eaten.
  const handleChangeText = (text: string) => {
    if (lastSentRef.current !== null && text.trim().toLowerCase() === lastSentRef.current) {
      lastSentRef.current = null;
      setValue("");
      inputRef.current?.clear();
      return;
    }
    lastSentRef.current = null;
    setValue(text);
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
          onChangeText={handleChangeText}
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
