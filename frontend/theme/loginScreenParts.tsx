// What the Staff and Owner login screens share, so the two always look alike
// with the Welcome screen: the washed-out photo background and the outlined button.
import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

/** The takoyaki photo under a white wash: light, soft, and the same on both login screens. */
export function LoginBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <ImageBackground
        source={require('../../assets/takoyaki-plate.png')}
        resizeMode="cover"
        style={styles.background}
        imageStyle={styles.backgroundImage}
      >
        <View style={styles.wash}>{children}</View>
      </ImageBackground>
    </View>
  );
}

/**
 * The outlined button of the dark card, under its filled one: Owner Login on the
 * Welcome screen, Back on the login screens. `radius` follows the filled button above it.
 */
export function LoginOutlineButton({
  label,
  accessibilityLabel = label,
  onPress,
  disabled = false,
  radius,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  radius: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, { borderRadius: radius }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.backButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Back to the Welcome screen, placed under the Log In button. */
export function LoginBackButton({ onPress, disabled = false, radius }: { onPress: () => void; disabled?: boolean; radius: number }) {
  return <LoginOutlineButton label="Back" accessibilityLabel="Back to the Welcome screen" onPress={onPress} disabled={disabled} radius={radius} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  background: { flex: 1 },
  backgroundImage: { width: '100%', height: '100%', opacity: 0.38 },
  wash: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  backButton: {
    minHeight: 48,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  backButtonText: { color: '#FFFFFF', fontFamily: 'Poppins_500Medium', fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
});
