import React from 'react';
import { View, StyleSheet } from 'react-native';

export type ScreenSlotProps = { children: React.ReactNode };

export default function ScreenSlot({ children }: ScreenSlotProps) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({ root: { flex: 1, minWidth: 0, minHeight: 0 } });
