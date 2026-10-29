import React, { useRef, useState } from 'react';
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

type FieldErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOCK_ERROR = 'Incorrect email or password. Check your details and try again.';
const FONT = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export default function OwnerLoginScreen({
  onBack,
  onPreviewDashboard,
}: {
  onBack: () => void;
  onPreviewDashboard?: () => void;
}) {
  const { height, width } = useWindowDimensions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showMockError, setShowMockError] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const passwordInput = useRef<TextInput>(null);
  const isShortScreen = height < 700;
  const logoWidth = Math.min(width * 0.48, 205);

  const clearFeedback = () => {
    setFieldErrors({});
    setShowMockError(false);
  };

  const submitForPreview = async () => {
    if (submissionLock.current) return;

    const trimmedEmail = email.trim();
    const nextErrors: FieldErrors = {};
    if (!trimmedEmail) {
      nextErrors.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!password) nextErrors.password = 'Password is required.';

    setEmail(trimmedEmail);
    setFieldErrors(nextErrors);
    setShowMockError(false);
    if (Object.keys(nextErrors).length > 0) return;

    submissionLock.current = true;
    setSubmitting(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 650));
      setShowMockError(true);
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/takoyaki-plate.png')}
      resizeMode="cover"
      blurRadius={10}
      style={styles.background}
      imageStyle={styles.backgroundImage}
    >
      <View style={styles.warmTint}>
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, isShortScreen && styles.shortScrollContent]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.content, { maxWidth: Math.min(width - 32, 430) }]}>
              <View style={styles.brandRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to welcome"
                  onPress={onBack}
                  hitSlop={8}
                  style={styles.backButton}
                >
                  <Text style={styles.backText}>‹ Back</Text>
                </Pressable>
                <View style={[styles.logoFrame, { width: logoWidth, height: logoWidth * 0.64 }]}>
                  <Image
                    source={require('../../assets/takosync-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                    accessibilityLabel="TakoSync logo"
                  />
                </View>
                <View style={styles.backButtonSpacer} />
              </View>

              <View style={[styles.card, isShortScreen && styles.compactCard]}>
                <Text style={styles.heading}>Log In</Text>
                <Text style={styles.subtitle}>Owner access · Gelo’s Takoyaki</Text>

                {showMockError && (
                  <View style={styles.errorBanner} accessibilityRole="alert">
                    <View style={styles.errorIcon}>
                      <Text style={styles.errorIconText}>!</Text>
                    </View>
                    <Text style={styles.errorMessage}>{MOCK_ERROR}</Text>
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email *</Text>
                  <TextInput
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      clearFeedback();
                    }}
                    style={[styles.input, fieldErrors.email && styles.inputInvalid]}
                    placeholder="Enter your email"
                    placeholderTextColor="#858591"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    accessibilityLabel="Email, required"
                    editable={!submitting}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInput.current?.focus()}
                  />
                  {fieldErrors.email && <Text style={styles.fieldError}>{fieldErrors.email}</Text>}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password *</Text>
                  <View style={[styles.passwordWrap, fieldErrors.password && styles.inputInvalid]}>
                    <TextInput
                      ref={passwordInput}
                      value={password}
                      onChangeText={(value) => {
                        setPassword(value);
                        clearFeedback();
                      }}
                      style={styles.passwordInput}
                      placeholder="Enter your password"
                      placeholderTextColor="#858591"
                      secureTextEntry={!passwordVisible}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      accessibilityLabel="Password, required"
                      editable={!submitting}
                      returnKeyType="done"
                      onSubmitEditing={submitForPreview}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                      accessibilityState={{ selected: passwordVisible }}
                      onPress={() => setPasswordVisible((visible) => !visible)}
                      disabled={submitting}
                      hitSlop={10}
                      style={styles.visibilityButton}
                    >
                      <View style={styles.eye}>
                        <View style={styles.eyePupil} />
                      </View>
                    </Pressable>
                  </View>
                  {fieldErrors.password && <Text style={styles.fieldError}>{fieldErrors.password}</Text>}
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Log In"
                  accessibilityState={{ disabled: submitting, busy: submitting }}
                  onPress={submitForPreview}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && !submitting && styles.loginButtonPressed,
                    submitting && styles.loginButtonDisabled,
                  ]}
                >
                  <Text style={styles.loginButtonText}>{submitting ? 'Checking…' : 'Log In'}</Text>
                </Pressable>

                {__DEV__ && onPreviewDashboard && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Preview Owner Dashboard using mock data"
                    onPress={onPreviewDashboard}
                    style={({ pressed }) => [styles.previewButton, pressed && styles.loginButtonPressed]}
                  >
                    <Text style={styles.previewButtonText}>Preview Owner Dashboard · Mock data</Text>
                  </Pressable>
                )}

                <Text style={styles.helper}>
                  Monitor all three branches with your owner account. Keep your credentials private.
                </Text>
                <Text style={styles.footer}>Secure access to your inventory</Text>
                <Text style={styles.previewNote}>Frontend preview only · authentication is not connected</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#E8B77E' },
  backgroundImage: { opacity: 0.72 },
  warmTint: { flex: 1, backgroundColor: 'rgba(255, 239, 218, 0.38)' },
  keyboardRoot: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  shortScrollContent: { justifyContent: 'flex-start', paddingVertical: 14 },
  content: { width: '100%', alignItems: 'center', alignSelf: 'center' },
  brandRow: {
    width: '100%',
    minHeight: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backButton: { width: 52, paddingVertical: 8, alignItems: 'flex-start' },
  backText: { color: '#101027', fontFamily: FONT.semibold, fontSize: 12 },
  backButtonSpacer: { width: 52 },
  logoFrame: { backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  card: {
    width: '100%',
    borderRadius: 28,
    backgroundColor: '#101027',
    paddingHorizontal: 26,
    paddingTop: 25,
    paddingBottom: 19,
    shadowColor: '#101027',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 10,
  },
  compactCard: { paddingHorizontal: 22, paddingTop: 21, paddingBottom: 16, borderRadius: 24 },
  heading: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 27, textAlign: 'center' },
  subtitle: {
    color: '#FF9418',
    fontFamily: FONT.semibold,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 19,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8DDE5',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 15,
  },
  errorIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F20D55',
    marginRight: 9,
  },
  errorIconText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 14, lineHeight: 18 },
  errorMessage: { flex: 1, color: '#711433', fontFamily: FONT.regular, fontSize: 10, lineHeight: 16 },
  fieldGroup: { marginBottom: 13 },
  label: { color: '#FFFFFF', fontFamily: FONT.medium, fontSize: 11, marginBottom: 6 },
  input: {
    height: 46,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    color: '#101027',
    fontFamily: FONT.regular,
    fontSize: 13,
  },
  inputInvalid: { borderWidth: 1.5, borderColor: '#F20D55' },
  fieldError: { color: '#FF91AC', fontFamily: FONT.regular, fontSize: 10, marginTop: 4, lineHeight: 15 },
  passwordWrap: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 13,
    color: '#101027',
    fontFamily: FONT.regular,
    fontSize: 13,
  },
  visibilityButton: { height: '100%', width: 44, alignItems: 'center', justifyContent: 'center' },
  eye: {
    width: 18,
    height: 12,
    borderWidth: 1.5,
    borderColor: '#858591',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePupil: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#858591' },
  loginButton: {
    height: 48,
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#F20D55',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  loginButtonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  loginButtonDisabled: { opacity: 0.65 },
  loginButtonText: { color: '#FFFFFF', fontFamily: FONT.bold, fontSize: 13 },
  previewButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 9,
    borderWidth: 1,
    borderColor: '#FF9418',
    borderRadius: 20,
  },
  previewButtonText: { color: '#FFB24A', fontFamily: FONT.medium, fontSize: 9 },
  helper: {
    color: '#D5D5DF',
    fontFamily: FONT.regular,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 14,
  },
  footer: { color: '#FFFFFF', fontFamily: FONT.medium, fontSize: 9, textAlign: 'center', marginTop: 14 },
  previewNote: { color: '#858591', fontFamily: FONT.regular, fontSize: 8, textAlign: 'center', marginTop: 7 },
});
