import * as Haptics from "expo-haptics";
import { SquarePen, Trash } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";

import type { BrandKey } from "./merchant-brand";
import { TxRow } from "./tx-row";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Palette (Figma) — category-actions overlay.
const PEACH = "#FBD3A8";
const RING = "#FF2500"; // category badge ring
const PARENT_TEXT = "#B83C29"; // parent category name
const CHILD_TEXT = "#414444"; // child category name
const EDIT_BG = "#034842";
const EDIT_ICON = "#C2FB7E";
const DELETE_BG = "#4F001A";
const DELETE_ICON = "#FF6D7E";

interface TxRowItemProps {
  emoji: string;
  categoryRingColor: string;
  categoryParent: string;
  categoryChild?: string; // OPTIONAL — a transaction's category may be just the parent (no sub-category).
  brandKey?: BrandKey;
  brandLogoUrl?: string;
  brandEmoji?: string;
  merchantName: string;
  dateLabel: string;
  amountMinor: number;
  currency: string;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

// A Recent-Transactions row. LONG-PRESS hides the normal pill and reveals the category-actions
// overlay (Figma Frame 40114): the category badge, the PARENT category name + OPTIONAL child
// category name, and Edit / Delete buttons. Chosen over a swipe because the row lives inside the
// horizontal paging carousel — a same-axis swipe conflicts with the carousel's own gesture; a
// long-press has no such conflict. Tapping anywhere on the overlay (outside the buttons) closes it.
export function TxRowItem(props: TxRowItemProps) {
  const { emoji, categoryRingColor, categoryParent, categoryChild, onPress, onEdit, onDelete, ...rowProps } =
    props;
  const [revealed, setRevealed] = useState(false);

  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.97, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={rowProps.merchantName}
      onPress={() => {
        if (revealed) {
          setRevealed(false); // tap outside the buttons closes the overlay
          return;
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // TODO(insights-mvp): open this transaction's detail modal/screen.
        onPress?.();
      }}
      onLongPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setRevealed(true);
      }}
      delayLongPress={280}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={animStyle}
    >
      {revealed ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            height: 58,
            backgroundColor: PEACH,
            borderRadius: 16,
            borderCurve: "continuous",
            paddingLeft: 8,
            paddingRight: 8,
          }}
        >
          {/* Category badge — emoji in a white circle with a colored ring. */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "white",
              borderWidth: 2.5,
              borderColor: RING,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20 }}>{emoji}</Text>
          </View>

          {/* Parent category (+ optional child). */}
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10, marginRight: 8 }}>
            <Text style={{ color: PARENT_TEXT, fontSize: 17, fontWeight: "800" }} numberOfLines={1}>
              {categoryParent}
            </Text>
            {categoryChild ? (
              <Text style={{ color: CHILD_TEXT, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                {categoryChild}
              </Text>
            ) : null}
          </View>

          {/* Edit + Delete. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("insights.accounts.edit")}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRevealed(false);
                onEdit?.();
              }}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: EDIT_BG, alignItems: "center", justifyContent: "center" }}
            >
              <Icon as={SquarePen} size={20} color={EDIT_ICON} strokeWidth={2.5} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("insights.accounts.delete")}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setRevealed(false);
                onDelete?.();
              }}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: DELETE_BG, alignItems: "center", justifyContent: "center" }}
            >
              <Icon as={Trash} size={20} color={DELETE_ICON} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
      ) : (
        <TxRow {...rowProps} />
      )}
    </AnimatedPressable>
  );
}
