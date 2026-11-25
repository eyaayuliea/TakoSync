import React from 'react';
import { Image, View } from 'react-native';
import { brandLogoLayout } from './brandLogo';

/** The logo artwork at `width`, with the transparent margins of the file cropped away. */
export default function BrandLogo({ source, width }: { source: number; width: number }) {
  const layout = brandLogoLayout(width);
  return (
    <View style={{ width: layout.boxWidth, height: layout.boxHeight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <Image
        source={source}
        style={{ width: layout.imageSize, height: layout.imageSize }}
        resizeMode="contain"
        accessibilityLabel="TakoSync logo"
      />
    </View>
  );
}
