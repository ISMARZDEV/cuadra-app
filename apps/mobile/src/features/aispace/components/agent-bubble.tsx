import { Text, View } from "react-native";

// A run of agent text; `bold` segments render emphasized inline (e.g. "receipts securely").
export type AgentSegment = { text: string; bold?: boolean };

// Agent message — left green accent bar + rich text (Figma "Text" rows with Vector 1 quote line).
// `title` is the larger bold lead line ("Hey, Sure. 😉👋"); notes pass a single segment.
type AgentBubbleProps = { title?: string; segments: AgentSegment[] };

export function AgentBubble({ title, segments }: AgentBubbleProps) {
  return (
    <View className="w-full flex-row gap-3 px-3 py-2">
      <View className="w-[3px] self-stretch rounded-full bg-accent" />
      <View className="flex-1">
        {title ? <Text className="mb-1 text-xl font-bold text-text">{title}</Text> : null}
        <Text className="text-base leading-5 text-text">
          {segments.map((segment, index) => (
            <Text key={index} className={segment.bold ? "font-bold" : undefined}>
              {segment.text}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );
}
