import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { APP_ICONS, type AppIconName } from './appIcons';

export type { AppIconName } from './appIcons';

/**
 * An icon from the app's icon set. The `style` of the text symbol it replaces
 * can be passed unchanged: its fontSize and color size and colour the icon.
 * Decorative by default (hidden from screen readers); pass `label` when the
 * icon is the only content of a control.
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
  return (
    <Ionicons
      name={APP_ICONS[name]}
      size={size}
      color={color}
      style={style}
      accessible={Boolean(label)}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}
