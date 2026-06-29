import { Search, SquarePen } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { useDrawer } from "@/store/drawer-store";

import { CHAT_SESSIONS } from "../mock";

// Transparent panel — inherits the screen's default background; only foreground tokens here.
const PALETTE = {
  dark: { text: "#FFFFFF", muted: "#8A8A8A", surface: "#1C1C1C" },
  light: { text: "#111827", muted: "#6B7280", surface: "#E4E4E4" },
} as const;

// AISpace sessions sidebar (revealed by swiping the chat aside). Static UI for now — the list
// comes from the chat-history API in real use. Selecting a session closes the drawer. Fills its
// parent; the chat screen owns the positioning + reveal animation.
export function ChatSessionsSidebar() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const c = PALETTE[colorScheme === "dark" ? "dark" : "light"];
  const { setOpen } = useDrawer();
  const [activeId, setActiveId] = useState(CHAT_SESSIONS[0]?.id);

  const select = (id: string) => {
    setActiveId(id);
    setOpen(false);
  };

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 10,
        paddingHorizontal: 16,
      }}
    >
      {/* Header — title + search */}
      <View className="flex-row items-center justify-between px-2 pb-1">
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "700" }}>AISpace</Text>
        <Pressable accessibilityRole="button" hitSlop={10} style={{ padding: 6 }}>
          <Icon as={Search} size={22} color={c.text} />
        </Pressable>
      </View>

      <Text style={{ color: c.muted, fontSize: 13, fontWeight: "600", paddingHorizontal: 8, marginTop: 14, marginBottom: 4 }}>
        Recientes
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {CHAT_SESSIONS.map((session) => {
          const active = session.id === activeId;
          return (
            <Pressable
              key={session.id}
              accessibilityRole="button"
              onPress={() => select(session.id)}
              style={{
                paddingVertical: 13,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: active ? c.surface : "transparent",
              }}
            >
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 16 }}>
                {session.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Footer — new chat + avatar */}
      <View className="flex-row items-center justify-between px-2 pt-3">
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(false)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#16A34A",
            paddingVertical: 12,
            paddingHorizontal: 18,
            borderRadius: 24,
          }}
        >
          <Icon as={SquarePen} size={18} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>Nuevo chat</Text>
        </Pressable>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: c.text, fontSize: 14, fontWeight: "700" }}>IM</Text>
        </View>
      </View>
    </View>
  );
}
