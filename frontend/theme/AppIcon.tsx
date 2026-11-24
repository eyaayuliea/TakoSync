import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { APP_ICONS, type AppIconName } from './appIcons';
import { APP_ICON_IMAGES } from './appIconImages';
import { TEAM_ICON_FILES } from './teamIconFiles';

export type { AppIconName } from './appIcons';

const LAYOUT_KEYS = ['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'alignSelf', 'opacity'] as const;

/**
 * An icon from the app's icon set: the team's own image when there is one
 * (assets/icons), otherwise the Ionicons fallback. The `style` of the text
 * symbol it replaces can be passed unchanged: its fontSize and color size and
 * colour the icon. Decorative by default (hidden from screen readers); pass
 * `label` when the icon is the only content of a control.
 */
export default function AppIcon({
  name,
  size,
  color,
  style,
  label,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  label?: string;
}) {
  const accessibility = {
    accessible: Boolean(label),
    accessibilityLabel: label,
    accessibilityElementsHidden: !label,
    importantForAccessibility: label ? 'yes' as const : 'no-hide-descendants' as const,
  };
  const image = APP_ICON_IMAGES[name];
  if (image !== undefined) {
    const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
    const box = size ?? (typeof flat.fontSize === 'number' ? flat.fontSize : 20);
    const tint = TEAM_ICON_FILES[name]?.tint ? color ?? (typeof flat.color === 'string' ? flat.color : undefined) : undefined;
    const layout: ImageStyle = {};
    for (const key of LAYOUT_KEYS) {
      if (flat[key] !== undefined) (layout as Record<string, unknown>)[key] = flat[key];
    }
    return (
      <Image
        source={image}
        resizeMode="contain"
        tintColor={tint}
        style={[{ width: box, height: box }, layout]}
        {...accessibility}
      />
    );
  }
  return <Ionicons name={APP_ICONS[name]} size={size} color={color} style={style} {...accessibility} />;
}
