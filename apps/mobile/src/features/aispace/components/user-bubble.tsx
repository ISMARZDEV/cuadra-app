import { Text, View } from "react-native";

// User message — right-aligned green bubble (Figma #00201E on dark, light green on light).
export function UserBubble({ text }: { text: string }) {
  return (
    <View className="w-full flex-row justify-end px-3 py-2">
      <View className="max-w-[80%] rounded-3xl bg-primary/15 px-4 py-3 dark:bg-[#00201E]">
        <Text className="text-base leading-5 text-text">{text}</Text>
      </View>
    </View>
  );
}
