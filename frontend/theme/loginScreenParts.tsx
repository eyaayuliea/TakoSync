// What the Staff and Owner login screens share, so the two always look alike
// around their own forms: the washed-out photo background and the Back button.
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
 * Back to the Welcome screen, placed under the Log In button of the dark login card.
 * `radius` follows the Log In button above it.
 */
export function LoginBackButton({ onPress, disabled = false, radius }: { onPress: () => void; disabled?: boolean; radius: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to the Welcome screen"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, { borderRadius: radius }, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.backButtonText}>Back</Text>
    </Pressable>
  );
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
