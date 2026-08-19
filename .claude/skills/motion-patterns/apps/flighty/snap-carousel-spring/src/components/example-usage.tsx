import { View, useWindowDimensions } from 'react-native';
import { PageDots } from './page-dots';
import { SnapCarousel, useCarouselOffset } from './snap-carousel';

/** The parent owns the offset; the carousel writes it and the dots read it. */
export function PricingPager({ pages }: { pages: React.ReactNode[] }) {
  const { width } = useWindowDimensions();
  const { scrollX, scrollHandler } = useCarouselOffset();

  return (
    <View>
      <SnapCarousel pageWidth={width} scrollHandler={scrollHandler}>
        {pages.map((page, i) => (
          <View key={i} style={{ width }}>
            {page}
          </View>
        ))}
      </SnapCarousel>
      <PageDots scrollX={scrollX} pageWidth={width} count={pages.length} />
    </View>
  );
}
