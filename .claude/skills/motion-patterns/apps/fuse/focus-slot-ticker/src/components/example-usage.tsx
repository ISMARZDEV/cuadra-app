import { View } from 'react-native';
import { FocusSlotTicker, type FocusSlotItem } from './focus-slot-ticker';

/**
 * The smallest thing that works.
 *
 * ⭐ The words, the marks and the palette are OURS. The reference is a study of the MOTION; its
 * copy, its icons and its brand colours are never shipped.
 */
const ITEMS: readonly FocusSlotItem[] = [
  { key: 'compare', label: 'Compara' },
  { key: 'save', label: 'Ahorra' },
  { key: 'track', label: 'Sigue' },
  { key: 'plan', label: 'Planifica' },
  { key: 'decide', label: 'Decide' },
];

// One accent per item, indexed positionally so the worklets never see it.
const ACCENTS = ['#16A34A', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444'];

export function FocusSlotTickerExample() {
  return (
    <View style={{ paddingHorizontal: 32 }}>
      <FocusSlotTicker
        items={ITEMS}
        renderMark={(_item, index) => (
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              backgroundColor: ACCENTS[index % ACCENTS.length],
            }}
          />
        )}
        onIndexChange={(index) => {
          // Commit point, not per frame — safe place for analytics or haptics.
          void index;
        }}
      />
    </View>
  );
}
