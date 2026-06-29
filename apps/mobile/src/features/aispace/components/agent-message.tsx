import { View } from "react-native";

import { StreamingText } from "./streaming-text";

// Live agent message — full-width, left-aligned reply whose words fade in softly as the SSE tokens
// stream (Cleo-style "writing" feel). Mirrors AgentBubble's spacing/typography, sans rich segments.
export function AgentMessage({ text }: { text: string }) {
  return (
    <View className="w-full px-3 py-2">
      <StreamingText text={text} textClassName="text-lg leading-6 text-text" />
    </View>
  );
}
