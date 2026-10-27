import React, { useEffect, useState } from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

const PINK = '#F20D55';
const NAVY = '#101026';
type Screen = 'loading' | 'welcome' | 'login';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const { width, height } = useWindowDimensions();
  const isWideScreen = width > 600 && height > 500;
  const frameWidth = isWideScreen ? Math.min(430, height * 0.5) : width;
  const frameHeight = isWideScreen ? Math.min(height, frameWidth * 2) : height;

  useEffect(() => {
    if (screen !== 'loading') return;
    const timer = setTimeout(() => setScreen('welcome'), 1500);
    return () => clearTimeout(timer);
  }, [screen]);

  const logoWidth = Math.min(frameWidth * 0.48, 230);
  const foodSize = Math.min(frameWidth * 0.57, 250, frameHeight * 0.3);

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) {
      setLoginError('Enter your username and password to continue.');
      return;
    }

    setLoginError('Login is not available yet. Authentication has not been connected.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.canvas}>
        <View style={[styles.frameShadow, { width: frameWidth, height: frameHeight }, isWideScreen && styles.desktopShadow]}>
          <View style={[styles.appFrame, isWideScreen && styles.desktopFrame]}>
            {screen === 'loading' && (
              <View style={styles.loadingScreen}>
                <Image
                  source={require('./assets/takosync-logo.png')}
                  style={[styles.loadingLogo, { width: Math.min(frameWidth * 0.68, 280), height: Math.min(frameWidth * 0.48, 190) }]}
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

                <View style={[styles.pinkPanel, { height: frameHeight * 0.53 }]}>
                  <View style={[styles.panelContent, { paddingTop: foodSize * 0.37 }]}>
                    <Text style={styles.heading}>Welcome!</Text>
                    <Text style={styles.description}>
                      Keep your ingredients in sync and your takoyaki shop ready for every rush.
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Get Started"
                      onPress={() => {
                        setLoginError('');
                        setScreen('login');
                      }}
                      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.buttonText}>Get Started</Text>
                    </Pressable>
                  </View>
                </View>

                <Image
                  source={require('./assets/takoyaki-plate.png')}
                  style={[styles.foodImage, { width: foodSize, height: foodSize, top: frameHeight * 0.255 }]}
                  resizeMode="contain"
                  accessibilityLabel="A plate of takoyaki"
                />
              </View>
            )}

            {screen === 'login' && (
              <View style={styles.loginScreen}>
                <ImageBackground
                  source={require('./assets/takoyaki-plate.png')}
                  resizeMode="cover"
                  style={styles.loginBackground}
                  imageStyle={styles.loginBackgroundImage}
                >
                  <View style={styles.loginOverlay}>
                    <View style={[styles.loginHeader, { height: Math.max(frameHeight * 0.22, 125) }]}>
                      <Image
                        source={require('./assets/takosync-logo.png')}
                        style={[styles.headerLogo, { width: logoWidth, height: logoWidth * 0.64 }]}
                        resizeMode="contain"
                        accessibilityLabel="TakoSync logo"
                      />
                    </View>
                    <ScrollView
                      style={styles.loginScroll}
                      contentContainerStyle={styles.loginScrollContent}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={styles.loginCard}>
                        <Text style={styles.loginHeading}>Log In</Text>
                        {loginError !== '' && (
                          <View style={styles.errorBanner} accessibilityRole="alert">
                            <View style={styles.errorIcon}>
                              <Text style={styles.errorIconText}>!</Text>
                            </View>
                            <Text style={styles.errorText}>{loginError}</Text>
                          </View>
                        )}
                        <Text style={styles.loginLabel}>Username *</Text>
                        <TextInput
                          value={username}
                          onChangeText={(value) => {
                            setUsername(value);
                            setLoginError('');
                          }}
                          style={styles.loginInput}
                          placeholder="Enter your username"
                          placeholderTextColor="#777783"
                          autoCapitalize="none"
                          autoCorrect={false}
                          accessibilityLabel="Username, required"
                          returnKeyType="next"
                        />
                        <Text style={[styles.loginLabel, styles.passwordLabel]}>Password *</Text>
                        <TextInput
                          value={password}
                          onChangeText={(value) => {
                            setPassword(value);
                            setLoginError('');
                          }}
                          style={styles.loginInput}
                          placeholder="Enter your password"
                          placeholderTextColor="#777783"
                          secureTextEntry
                          accessibilityLabel="Password, required"
                          returnKeyType="done"
                          onSubmitEditing={handleLogin}
                        />
                        <Text style={styles.loginHelper}>
                          Accounts are created by the owner. If your account is inactive, contact the owner.
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Log In"
                          onPress={handleLogin}
                          style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed]}
                        >
                          <Text style={styles.loginButtonText}>Log In</Text>
                        </Pressable>
                      </View>
                    </ScrollView>
                  </View>
                </ImageBackground>
              </View>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F1F4' },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frameShadow: { backgroundColor: '#FFFFFF' },
  desktopShadow: {
    borderRadius: 28,
    elevation: 12,
    shadowColor: '#11111D',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  appFrame: { flex: 1, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  desktopFrame: { borderRadius: 28 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  loadingLogo: { alignSelf: 'center', marginTop: '14%' },
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
  loginScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  loginBackground: { flex: 1 },
  loginBackgroundImage: { width: '100%', height: '100%', opacity: 0.38 },
  loginOverlay: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  loginHeader: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, backgroundColor: '#FFFFFF' },
  loginScroll: { flex: 1 },
  loginScrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  loginCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    backgroundColor: NAVY,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 24,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  loginHeading: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 22 },
  loginLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginBottom: 7 },
  passwordLabel: { marginTop: 16 },
  loginInput: {
    width: '100%',
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    color: NAVY,
    fontSize: 15,
  },
  loginHelper: { color: '#C8C8D0', fontSize: 11, lineHeight: 16, marginTop: 16 },
  loginButton: {
    minHeight: 50,
    marginTop: 22,
    borderRadius: 28,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8DDE5', borderRadius: 10, padding: 11, marginBottom: 18 },
  errorIcon: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PINK, marginRight: 9 },
  errorIconText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', lineHeight: 18 },
  errorText: { flex: 1, color: '#711433', fontSize: 12, lineHeight: 17 },
});
