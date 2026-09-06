import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { SkImage } from '@shopify/react-native-skia';
import { LiquidFocus } from './components/liquid-focus';
import { useHoldAction } from './motion/use-hold-action';

/** Standalone API fixture, not an application screen or audio recorder. */
export function FocusExample({ snapshot }: { snapshot: SkImage | null }) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [listening, setListening] = useState(false);
  const gesture = useHoldAction({
    onStart: () => setListening(true),
    onFinish: () => setListening(false),
    onCancel: () => setListening(false),
  });
  return (
    <GestureHandlerRootView
      style={{ flex: 1 }}
      onLayout={({ nativeEvent: { layout } }) => setViewport({ width: layout.width, height: layout.height })}
    >
      {viewport.width > 0 && viewport.height > 0 ? <LiquidFocus
        width={viewport.width}
        height={viewport.height}
        listening={listening}
        dimmed={listening}
        snapshot={snapshot}
        backdrop={<View style={{ flex: 1, backgroundColor: '#f4f4ef' }}><Text>Capture a thought without leaving this context.</Text></View>}
        foreground={
          <View style={{ position: 'absolute', bottom: 32, alignSelf: 'center', gap: 16 }}>
            <GestureDetector gesture={gesture}>
              <View
                accessible
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Finish capture' : 'Start capture'}
                accessibilityState={{ selected: listening }}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={() => setListening((value) => !value)}
                style={{ padding: 18, borderRadius: 32, backgroundColor: '#dddddd' }}
              >
                <Text>{listening ? 'Listening' : 'Hold to capture'}</Text>
              </View>
            </GestureDetector>
            <Pressable onPress={() => setListening((value) => !value)} accessibilityRole="button" style={{ padding: 12 }}>
              <Text>{listening ? 'Finish' : 'Start without holding'}</Text>
            </Pressable>
          </View>
        }
      /> : null}
    </GestureHandlerRootView>
  );
}
