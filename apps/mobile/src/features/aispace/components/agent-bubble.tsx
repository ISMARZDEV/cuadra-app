import { Text, View } from "react-native";

// A run of agent text; `bold` segments render emphasized inline (e.g. "receipts securely").
export type AgentSegment = { text: string; bold?: boolean };

// Agent message — rich text (Figma "Text" rows). `title` is the larger bold lead line
// ("Hey, Sure. 😉👋"); notes pass a single segment.
type AgentBubbleProps = { title?: string; segments: AgentSegment[] };

export function AgentBubble({ title, segments }: AgentBubbleProps) {
  return (
    <View className="w-full px-3 py-2">
      {title ? <Text className="mb-1 text-2xl font-bold text-text">{title}</Text> : null}
      <Text className="text-lg leading-6 text-text">
        {segments.map((segment, index) => (
          <Text key={index} className={segment.bold ? "font-bold" : undefined}>
            {segment.text}
          </Text>
        ))}
      </Text>
    </View>
  );
}
