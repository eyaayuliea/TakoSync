import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const PINK = '#F20D55';
const NAVY = '#101026';
type Screen = 'loading' | 'welcome' | 'next';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (screen !== 'loading') return;
    const timer = setTimeout(() => setScreen('welcome'), 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  const logoWidth = Math.min(width * 0.48, 230);
  const foodSize = Math.min(width * 0.57, 250);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {screen === 'loading' && (
        <View style={styles.loadingScreen}>
          <Image
            source={require('./assets/takosync-logo.png')}
            style={[styles.loadingLogo, { width: Math.min(width * 0.68, 280), height: Math.min(width * 0.48, 190) }]}
            resizeMode="contain"
            accessibilityLabel="TakoSync logo"
          />
        </View>
      )}

      {screen === 'welcome' && (
        <View style={styles.welcomeScreen}>
          <View style={styles.whiteHeader}>
            <Image
              source={require('./assets/takosync-logo.png')}
              style={[styles.headerLogo, { width: logoWidth, height: logoWidth * 0.64 }]}
              resizeMode="contain"
              accessibilityLabel="TakoSync logo"
            />
          </View>

          <View style={[styles.pinkPanel, { height: Math.max(height * 0.53, 350) }]}>
            <View style={[styles.panelContent, { paddingTop: foodSize * 0.37 }]}>
              <Text style={styles.heading}>Welcome!</Text>
              <Text style={styles.description}>
                Keep your Takoyaki store organized and ready for every rush. TakoSync helps you stay on top of your ingredients, so you can focus on serving delicious takoyaki.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Get Started"
                onPress={() => setScreen('next')}
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>Get Started</Text>
              </Pressable>
            </View>
          </View>

          <Image
            source={require('./assets/takoyaki-plate.png')}
            style={[styles.foodImage, { width: foodSize, height: foodSize, top: height * 0.255 }]}
            resizeMode="contain"
            accessibilityLabel="A plate of takoyaki"
          />
        </View>
      )}

      {screen === 'next' && (
        <View style={styles.nextScreen}>
          <Image source={require('./assets/takosync-logo.png')} style={styles.nextLogo} resizeMode="contain" accessibilityLabel="TakoSync logo" />
          <Text style={styles.nextHeading}>You’re ready to get started!</Text>
          <Text style={styles.nextDescription}>Your inventory tools will be added in the next development stage.</Text>
          <Pressable accessibilityRole="button" onPress={() => setScreen('welcome')} style={({ pressed }) => [styles.button, styles.returnButton, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Back to Welcome</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  loadingLogo: { position: 'absolute', top: '40%' },
  welcomeScreen: { flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  whiteHeader: { height: '48%', alignItems: 'center', paddingTop: '5%', backgroundColor: '#FFFFFF' },
  headerLogo: { marginTop: 0 },
  pinkPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: PINK, borderTopLeftRadius: 36, borderTopRightRadius: 36,
    paddingHorizontal: 25,
  },
  foodImage: { position: 'absolute', alignSelf: 'center', zIndex: 2 },
  panelContent: { alignItems: 'center', width: '100%' },
  heading: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', textAlign: 'center', marginBottom: 15 },
  description: { color: '#FFFFFF', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 340 },
  button: {
    marginTop: 30, minWidth: 150, minHeight: 44, paddingHorizontal: 24,
    borderRadius: 25, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center',
    elevation: 3, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  nextScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: '#FFFFFF' },
  nextLogo: { width: 210, height: 130, marginBottom: 20 },
  nextHeading: { color: NAVY, fontSize: 23, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  nextDescription: { color: '#555566', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  returnButton: { marginTop: 26 },
});
