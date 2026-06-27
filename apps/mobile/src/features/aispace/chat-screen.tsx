import { useEffect } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useOrbStore } from "@/store/orb-store";

import { AgentBubble } from "./components/agent-bubble";
import { ChatHeader } from "./components/chat-header";
import { ChatInputBar } from "./components/chat-input-bar";
import { ReceiptAttachment } from "./components/receipt-attachment";
import { UserBubble } from "./components/user-bubble";
import { CHAT_THREAD } from "./mock";

// AISpace chat screen — static composition of the Figma "Aispace Chat" frame.
// Screen = composition only; each block is its own component (cuadra-mobile skill §2b).
export function ChatScreen() {
  const insets = useSafeAreaInsets();

  // Lift the input pill up while the Siri orb is showing (so the orb doesn't overlap it).
  const orbActive = useOrbStore((s) => s.active);
  const lift = useSharedValue(orbActive ? 1 : 0);
  useEffect(() => {
    lift.value = withTiming(orbActive ? 1 : 0, { duration: 240 });
  }, [orbActive, lift]);
  const inputStyle = useAnimatedStyle(() => ({
    paddingBottom: insets.bottom + 72 + lift.value * 64,
  }));

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <ChatHeader />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {CHAT_THREAD.map((item) => {
          switch (item.kind) {
            case "agent":
              return <AgentBubble key={item.id} title={item.title} segments={item.segments} />;
            case "user":
              return <UserBubble key={item.id} text={item.text} />;
            case "receipt":
              return <ReceiptAttachment key={item.id} />;
          }
        })}
      </ScrollView>
      {/* Reserve space for the tab bar; grows while the orb is active so the input lifts clear. */}
      <Animated.View style={inputStyle}>
        <ChatInputBar />
      </Animated.View>
    </SafeAreaView>
  );
}
