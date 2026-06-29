import { Text, View } from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";

// User message — right-aligned liquid glass bubble.
export function UserBubble({ text }: { text: string }) {
  return (
    <View className="w-full flex-row justify-end px-3 py-2">
      <GlassSurface style={{ maxWidth: "80%", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 }} intensity={50}>
        <Text className="text-lg leading-6 text-text">{text}</Text>
      </GlassSurface>
    </View>
  );
}
