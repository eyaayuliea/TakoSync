import React, { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
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
import StaffWorkspace from './StaffWorkspace';

const PINK = '#F20D55';
const NAVY = '#101026';
const DASHBOARD_COLORS = {
  pink: '#EC1358',
  navy: '#0F1025',
  orange: '#FCA639',
  white: '#FFFFFF',
  black: '#000000',
  secondaryText: '#B2B3C4',
  success: '#589144',
  warning: '#FDE672',
  error: '#F52F2E',
  discrepancy: '#B9244C',
  information: '#595EC0',
  neutral: '#B7B7BE',
  butterCream: '#FFF4D6',
} as const;
const DEMO_ACCOUNTS = [
  { username: 'lorraine', password: 'jade123', role: 'Owner' },
  { username: 'staff', password: 'tako-staff-2026', role: 'Staff' },
] as const;
type PreviewInventoryItem = {
  name: string;
  category: string;
  quantity: string;
  lowStock: boolean;
  expiration: string | null;
};
const DEMO_INVENTORY: PreviewInventoryItem[] = [
  { name: 'Octopus', category: 'Seafood', quantity: '1.2 kg', lowStock: true, expiration: null },
  { name: 'Takoyaki batter', category: 'Dry goods', quantity: '2 bags', lowStock: true, expiration: null },
  { name: 'Spring onion', category: 'Produce', quantity: '450 g', lowStock: true, expiration: null },
  { name: 'Tako sauce', category: 'Condiments', quantity: '4 bottles', lowStock: false, expiration: 'Oct 30' },
  { name: 'Bonito flakes', category: 'Dry goods', quantity: '6 packs', lowStock: false, expiration: 'Oct 31' },
  { name: 'Takoyaki flour', category: 'Dry goods', quantity: '12 bags', lowStock: false, expiration: null },
  { name: 'Tenkasu', category: 'Dry goods', quantity: '8 packs', lowStock: false, expiration: null },
  { name: 'Eggs', category: 'Produce', quantity: '5 trays', lowStock: false, expiration: null },
];
const DEMO_ACTIVITY = [
  { action: 'Stock-In', item: 'Takoyaki flour', detail: 'Added 4 bags · Today, 9:42 AM' },
  { action: 'Daily Check', item: 'Branch inventory', detail: 'Completed · Today, 8:15 AM' },
  { action: 'Stock-Out', item: 'Octopus', detail: 'Used 0.8 kg · Yesterday, 6:20 PM' },
];
type Screen = 'loading' | 'welcome' | 'login' | 'dashboard' | 'staffWorkspace';
type Role = (typeof DEMO_ACCOUNTS)[number]['role'];
type AuthenticatedUser = { username: string; role: Role };
type DashboardTab = 'Dashboard' | 'History' | 'Alerts';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('Dashboard');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const { width, height } = useWindowDimensions();
  const isWideScreen = width > 600 && height > 500;
  const frameWidth = isWideScreen ? Math.min(430, height * 0.5) : width;
  const frameHeight = isWideScreen ? Math.min(height, frameWidth * 2) : height;
  const visibleScreen =
    (screen === 'dashboard' || screen === 'staffWorkspace') && authenticatedUser === null
      ? 'login'
      : screen;

  useEffect(() => {
    if (screen !== 'loading' || !fontsLoaded) return;
    const timer = setTimeout(() => setScreen('welcome'), 1500);
    return () => clearTimeout(timer);
  }, [screen, fontsLoaded]);

  const logoWidth = Math.min(frameWidth * 0.48, 230);
  const foodSize = Math.min(frameWidth * 0.57, 250, frameHeight * 0.3);
  const lowStockItems = DEMO_INVENTORY.filter((item) => item.lowStock);
  const expiringItems = DEMO_INVENTORY.filter((item) => item.expiration !== null);
  const trackedItemCount = DEMO_INVENTORY.length;
  const stockAlertCount = lowStockItems.length + expiringItems.length;
  const searchTerm = dashboardSearch.trim().toLowerCase();
  const filterItems = (items: PreviewInventoryItem[]) =>
    items.filter((item) =>
      `${item.name} ${item.category}`.toLowerCase().includes(searchTerm),
    );
  const visibleLowStockItems = filterItems(lowStockItems);
  const visibleExpiringItems = filterItems(expiringItems);
  const handleDemoAction = (action: string) => {
    setDashboardMessage(`${action} is a visual preview. Transactions are not connected.`);
  };

  const handleLogin = () => {
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername || !password) {
      setLoginError('Enter your username and password to continue.');
      return;
    }

    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.username === normalizedUsername && candidate.password === password,
    );
    if (!account) {
      setAuthenticatedUser(null);
      setLoginError('Incorrect username or password. Please try again.');
      return;
    }

    setAuthenticatedUser({ username: account.username, role: account.role });
    setLoginError('');
    setScreen(account.role === 'Staff' ? 'staffWorkspace' : 'dashboard');
  };

  const handleLogout = () => {
    setAuthenticatedUser(null);
    setUsername('');
    setPassword('');
    setLoginError('');
    setScreen('welcome');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.canvas}>
        <View style={[styles.frameShadow, { width: frameWidth, height: frameHeight }, isWideScreen && styles.desktopShadow]}>
          <View style={[styles.appFrame, isWideScreen && styles.desktopFrame]}>
            {visibleScreen === 'loading' && (
              <View style={styles.loadingScreen}>
                <Image
                  source={require('./assets/takosync-logo.png')}
                  style={[styles.loadingLogo, { width: Math.min(frameWidth * 0.68, 280), height: Math.min(frameWidth * 0.48, 190) }]}
                  resizeMode="contain"
                  accessibilityLabel="TakoSync logo"
                />
              </View>
            )}

            {visibleScreen === 'welcome' && (
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

            {visibleScreen === 'login' && (
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

            {visibleScreen === 'dashboard' && authenticatedUser !== null && (
              <View style={styles.dashboardScreen}>
                <ScrollView
                  style={styles.dashboardScroll}
                  contentContainerStyle={styles.dashboardContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.dashboardHeader}>
                    <View style={styles.dashboardIdentity}>
                      <View style={styles.profileAvatar}>
                        <View style={styles.profileHead} />
                        <View style={styles.profileBody} />
                      </View>
                      <View style={styles.greetingGroup}>
                        <Text style={styles.dashboardGreeting}>Hello, Manila Branch!</Text>
                        <Text style={styles.dashboardSubheading}>{authenticatedUser.role} dashboard</Text>
                      </View>
                    </View>
                    <View style={styles.headerActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Notifications"
                        onPress={() => setDashboardMessage('You’re all caught up. This is a demo preview.')}
                        style={({ pressed }) => [styles.notificationButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.notificationIcon}>🔔</Text>
                        <View style={styles.notificationDot} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Log out"
                        onPress={handleLogout}
                        style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.logoutButtonText}>Log out</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.searchBar}>
                    <View style={styles.searchIcon}>
                      <View style={styles.searchIconHandle} />
                    </View>
                    <TextInput
                      value={dashboardSearch}
                      onChangeText={setDashboardSearch}
                      placeholder="Search inventory"
                      placeholderTextColor={DASHBOARD_COLORS.secondaryText}
                      style={styles.searchInput}
                      accessibilityLabel="Search demo inventory"
                      returnKeyType="search"
                    />
                    {dashboardSearch !== '' && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        onPress={() => setDashboardSearch('')}
                        style={styles.clearSearchButton}
                      >
                        <Text style={styles.clearSearchText}>×</Text>
                      </Pressable>
                    )}
                  </View>

                  {dashboardMessage !== '' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss message"
                      onPress={() => setDashboardMessage('')}
                      style={styles.dashboardMessage}
                    >
                      <Text style={styles.dashboardMessageText}>{dashboardMessage}</Text>
                      <Text style={styles.dismissMessage}>×</Text>
                    </Pressable>
                  )}

                  {dashboardTab === 'Dashboard' && (
                    <>
                      <View style={styles.summaryCard}>
                        <View style={styles.summaryCopy}>
                          <Text style={styles.summaryEyebrow}>INVENTORY SUMMARY</Text>
                          <View style={styles.summaryCountRow}>
                            <Text style={styles.summaryCount}>{trackedItemCount}</Text>
                            <Text style={styles.summaryCountLabel}>items tracked</Text>
                          </View>
                          <View style={styles.alertCountRow}>
                            <View style={styles.alertCountDot} />
                            <Text style={styles.alertCountText}>{stockAlertCount} stock alerts need attention</Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Check stock alerts"
                            onPress={() => setDashboardTab('Alerts')}
                            style={({ pressed }) => [styles.checkNowButton, pressed && styles.buttonPressed]}
                          >
                            <Text style={styles.checkNowText}>Check now</Text>
                            <Text style={styles.checkNowArrow}>›</Text>
                          </Pressable>
                        </View>
                        <View style={styles.summaryFoodCircle}>
                          <Image
                            source={require('./assets/takoyaki-plate.png')}
                            style={styles.summaryFoodImage}
                            resizeMode="cover"
                            accessibilityLabel="Takoyaki"
                          />
                        </View>
                        <Text style={styles.summaryDemoLabel}>DEMO</Text>
                      </View>

                      <View style={styles.sectionHeadingRow}>
                        <Text style={styles.sectionHeading}>Quick Actions</Text>
                        <Text style={styles.sectionCaption}>At a glance</Text>
                      </View>
                      <View style={styles.quickActions}>
                        {[
                          { label: 'Stock-In', icon: '＋', color: DASHBOARD_COLORS.information },
                          { label: 'Stock-Out', icon: '↗', color: DASHBOARD_COLORS.pink },
                          { label: 'Waste', icon: '⌫', color: DASHBOARD_COLORS.discrepancy },
                          { label: 'Daily Check', icon: '✓', color: DASHBOARD_COLORS.success },
                        ].map((action) => (
                          <Pressable
                            key={action.label}
                            accessibilityRole="button"
                            accessibilityLabel={`${action.label} demo action`}
                            onPress={() => handleDemoAction(action.label)}
                            style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
                          >
                            <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}14` }]}>
                              <Text style={[styles.quickActionGlyph, { color: action.color }]}>{action.icon}</Text>
                            </View>
                            <Text style={styles.quickActionLabel}>{action.label}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}

                  {dashboardTab === 'History' && (
                    <View style={styles.historyView}>
                      <Text style={styles.sectionHeading}>Recent Activity</Text>
                      <Text style={styles.historyCaption}>Sample activity · demo preview only</Text>
                      {DEMO_ACTIVITY.map((activity) => (
                        <View key={`${activity.action}-${activity.item}`} style={styles.activityCard}>
                          <View style={styles.activityIcon}>
                            <Text style={styles.activityIconText}>↗</Text>
                          </View>
                          <View style={styles.activityCopy}>
                            <Text style={styles.activityTitle}>{activity.action} · {activity.item}</Text>
                            <Text style={styles.activityDetail}>{activity.detail}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                  {(dashboardTab === 'Dashboard' || dashboardTab === 'Alerts') && (
                    <>
                      <View style={styles.sectionHeadingRow}>
                        <Text style={styles.sectionHeading}>Low-Stock Items</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="View all low-stock alerts"
                          onPress={() => setDashboardTab('Alerts')}
                        >
                          <Text style={styles.viewAllText}>{lowStockItems.length} items ›</Text>
                        </Pressable>
                      </View>
                      {visibleLowStockItems.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemCarousel}>
                          {visibleLowStockItems.map((item) => (
                            <View key={item.name} style={styles.itemCard}>
                              <Image
                                source={require('./assets/takoyaki-plate.png')}
                                style={styles.itemImage}
                                resizeMode="cover"
                                accessibilityLabel={`${item.name} demo image`}
                              />
                              <View style={styles.itemDetails}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.itemCategory}>{item.category}</Text>
                                <Text style={styles.itemQuantity}>{item.quantity}</Text>
                                <View style={styles.warningBadge}>
                                  <Text style={styles.warningBadgeText}>Low stock</Text>
                                </View>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.emptySearchText}>No low-stock demo items match your search.</Text>
                      )}

                      <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
                        <Text style={styles.sectionHeading}>Nearing Expiration</Text>
                        <Text style={styles.expirationCount}>{expiringItems.length} items</Text>
                      </View>
                      {visibleExpiringItems.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.itemCarousel}>
                          {visibleExpiringItems.map((item) => (
                            <View key={item.name} style={styles.itemCard}>
                              <Image
                                source={require('./assets/takoyaki-plate.png')}
                                style={styles.itemImage}
                                resizeMode="cover"
                                accessibilityLabel={`${item.name} demo image`}
                              />
                              <View style={styles.itemDetails}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.itemCategory}>{item.category}</Text>
                                <Text style={styles.itemQuantity}>{item.quantity}</Text>
                                <View style={styles.expirationMeta}>
                                  <Text style={styles.expirationDate}>Exp. {item.expiration}</Text>
                                  <View style={styles.expirationBadge}>
                                    <Text style={styles.expirationBadgeText}>Soon</Text>
                                  </View>
                                </View>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.emptySearchText}>No expiration demo items match your search.</Text>
                      )}
                    </>
                  )}

                  {dashboardTab === 'Alerts' && (
                    <View style={styles.alertsNote}>
                      <Text style={styles.alertsNoteTitle}>Demo alerts</Text>
                      <Text style={styles.alertsNoteText}>
                        These sample alerts are for visual preview only and are not connected to a live inventory.
                      </Text>
                    </View>
                  )}
                  {dashboardTab === 'Dashboard' && (
                    <Text style={styles.demoNotice}>DEMO PREVIEW · Sample inventory only, not connected to a live store.</Text>
                  )}
                </ScrollView>

                <View style={styles.bottomNavigation}>
                  {([
                    { label: 'Dashboard', icon: '⌂' },
                    { label: 'History', icon: '↻' },
                    { label: 'Alerts', icon: '!' },
                  ] as const).map((tab) => {
                    const active = dashboardTab === tab.label;
                    return (
                      <Pressable
                        key={tab.label}
                        accessibilityRole="button"
                        accessibilityLabel={`${tab.label}${active ? ', selected' : ''}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          setDashboardTab(tab.label);
                          setDashboardMessage('');
                        }}
                        style={({ pressed }) => [styles.navigationItem, pressed && styles.navigationItemPressed]}
                      >
                        <View style={[styles.navigationIconCircle, active && styles.navigationIconActive]}>
                          <Text style={[styles.navigationIcon, active && styles.navigationIconSelected]}>{tab.icon}</Text>
                        </View>
                        <Text style={[styles.navigationLabel, active && styles.navigationLabelActive]}>{tab.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
            {visibleScreen === 'staffWorkspace' && authenticatedUser?.role === 'Staff' && (
              <StaffWorkspace onLogout={handleLogout} />
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
  dashboardScreen: { flex: 1, backgroundColor: DASHBOARD_COLORS.white },
  dashboardScroll: { flex: 1 },
  dashboardContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 },
  dashboardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  dashboardIdentity: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 8 },
  profileAvatar: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FCE3EB', marginRight: 11,
  },
  profileHead: { width: 10, height: 10, borderRadius: 5, backgroundColor: DASHBOARD_COLORS.pink, marginBottom: 2 },
  profileBody: { width: 20, height: 11, borderTopLeftRadius: 11, borderTopRightRadius: 11, backgroundColor: DASHBOARD_COLORS.pink },
  greetingGroup: { flexShrink: 1 },
  dashboardGreeting: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 15, lineHeight: 21 },
  dashboardSubheading: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notificationButton: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F5F5F7',
  },
  notificationIcon: { fontSize: 18, lineHeight: 24 },
  notificationDot: {
    position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4,
    backgroundColor: DASHBOARD_COLORS.pink, borderWidth: 1, borderColor: DASHBOARD_COLORS.white,
  },
  logoutButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: '#FCE3EB' },
  logoutButtonText: { color: DASHBOARD_COLORS.pink, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  searchBar: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13,
    borderRadius: 14, backgroundColor: '#F3F3F5', marginBottom: 16,
  },
  searchIcon: { width: 16, height: 16, borderWidth: 2, borderColor: DASHBOARD_COLORS.secondaryText, borderRadius: 8, marginRight: 11, marginLeft: 1 },
  searchIconHandle: { position: 'absolute', width: 7, height: 2, borderRadius: 1, backgroundColor: DASHBOARD_COLORS.secondaryText, right: -5, bottom: -2, transform: [{ rotate: '45deg' }] },
  searchInput: { flex: 1, height: 44, color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_400Regular', fontSize: 12, paddingVertical: 0 },
  clearSearchButton: { width: 26, height: 32, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: DASHBOARD_COLORS.neutral, fontFamily: 'Poppins_500Medium', fontSize: 22 },
  dashboardMessage: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: '#EFEEFA', marginBottom: 14,
  },
  dashboardMessageText: { flex: 1, color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_500Medium', fontSize: 11, lineHeight: 16 },
  dismissMessage: { color: DASHBOARD_COLORS.information, fontSize: 18, marginLeft: 8 },
  summaryCard: {
    minHeight: 174, overflow: 'hidden', position: 'relative', justifyContent: 'center',
    paddingHorizontal: 17, paddingVertical: 15, borderRadius: 23, backgroundColor: DASHBOARD_COLORS.navy,
    marginBottom: 21, elevation: 5, shadowColor: DASHBOARD_COLORS.navy, shadowOpacity: 0.16,
    shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  summaryCopy: { width: '75%', zIndex: 2 },
  summaryEyebrow: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 10, letterSpacing: 1.1 },
  summaryCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 5 },
  summaryCount: { color: DASHBOARD_COLORS.orange, fontFamily: 'Poppins_700Bold', fontSize: 38, lineHeight: 46 },
  summaryCountLabel: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_500Medium', fontSize: 11 },
  alertCountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  alertCountDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: DASHBOARD_COLORS.warning, marginRight: 7 },
  alertCountText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  checkNowButton: {
    alignSelf: 'flex-start', minHeight: 33, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13, marginTop: 12, borderRadius: 18, backgroundColor: DASHBOARD_COLORS.pink,
  },
  checkNowText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  checkNowArrow: { color: DASHBOARD_COLORS.white, fontSize: 18, lineHeight: 20, marginLeft: 5 },
  summaryFoodCircle: {
    position: 'absolute', right: -8, top: 25, width: 132, height: 132, borderRadius: 66,
    backgroundColor: DASHBOARD_COLORS.butterCream, overflow: 'hidden', borderWidth: 4, borderColor: '#35364A',
  },
  summaryFoodImage: { width: '100%', height: '100%', borderRadius: 66 },
  summaryDemoLabel: {
    position: 'absolute', right: 15, bottom: 12, color: DASHBOARD_COLORS.secondaryText,
    fontFamily: 'Poppins_600SemiBold', fontSize: 8, letterSpacing: 1,
  },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionHeading: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 16 },
  sectionCaption: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  quickActions: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  quickAction: {
    flex: 1, minWidth: 0, minHeight: 82, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, paddingVertical: 9, borderRadius: 17, backgroundColor: DASHBOARD_COLORS.white,
    borderWidth: 1, borderColor: '#F0F0F2', elevation: 2, shadowColor: '#0F1025',
    shadowOpacity: 0.05, shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
  },
  quickActionPressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  quickActionIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  quickActionGlyph: { fontFamily: 'Poppins_600SemiBold', fontSize: 20, lineHeight: 24 },
  quickActionLabel: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_500Medium', fontSize: 9, textAlign: 'center' },
  viewAllText: { color: DASHBOARD_COLORS.pink, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
  itemCarousel: { gap: 10, paddingBottom: 3 },
  itemCard: {
    width: 208, minHeight: 118, flexDirection: 'row', alignItems: 'center', padding: 10,
    borderRadius: 17, backgroundColor: DASHBOARD_COLORS.white, borderWidth: 1, borderColor: '#F0F0F2',
    elevation: 2, shadowColor: DASHBOARD_COLORS.navy, shadowOpacity: 0.05, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  itemImage: { width: 66, height: 78, borderRadius: 13, backgroundColor: DASHBOARD_COLORS.butterCream },
  itemDetails: { flex: 1, minWidth: 0, justifyContent: 'center', marginLeft: 10 },
  itemName: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  itemCategory: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 1 },
  itemQuantity: { color: DASHBOARD_COLORS.orange, fontFamily: 'Poppins_600SemiBold', fontSize: 11, marginTop: 4 },
  warningBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, backgroundColor: DASHBOARD_COLORS.warning, marginTop: 5 },
  warningBadgeText: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_500Medium', fontSize: 8 },
  expirationHeading: { marginTop: 20 },
  expirationCount: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  expirationMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3, marginTop: 5 },
  expirationDate: { flexShrink: 1, color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_500Medium', fontSize: 8 },
  expirationBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, backgroundColor: DASHBOARD_COLORS.error },
  expirationBadgeText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 8 },
  emptySearchText: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 11, marginBottom: 8 },
  demoNotice: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 21 },
  historyView: { paddingTop: 8 },
  historyCaption: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10, marginTop: 3, marginBottom: 13 },
  activityCard: {
    minHeight: 68, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16,
    backgroundColor: DASHBOARD_COLORS.white, marginBottom: 9, borderWidth: 1, borderColor: '#F0F0F2',
  },
  activityIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEEFA', marginRight: 11 },
  activityIconText: { color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_600SemiBold', fontSize: 17 },
  activityCopy: { flex: 1 },
  activityTitle: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_600SemiBold', fontSize: 11 },
  activityDetail: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 9, marginTop: 3 },
  alertsNote: { padding: 14, borderRadius: 15, backgroundColor: '#EFEEFA', marginTop: 17 },
  alertsNoteTitle: { color: DASHBOARD_COLORS.information, fontFamily: 'Poppins_600SemiBold', fontSize: 12 },
  alertsNoteText: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4 },
  bottomNavigation: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', minHeight: 66,
    marginHorizontal: 15, marginBottom: 10, paddingHorizontal: 8, borderRadius: 24,
    backgroundColor: DASHBOARD_COLORS.navy, elevation: 8, shadowColor: DASHBOARD_COLORS.navy,
    shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 5 },
  },
  navigationItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  navigationItemPressed: { opacity: 0.75 },
  navigationIconCircle: { width: 31, height: 29, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navigationIconActive: { backgroundColor: DASHBOARD_COLORS.pink },
  navigationIcon: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_600SemiBold', fontSize: 19, lineHeight: 23 },
  navigationIconSelected: { color: DASHBOARD_COLORS.white },
  navigationLabel: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_500Medium', fontSize: 9, marginTop: 1 },
  navigationLabelActive: { color: DASHBOARD_COLORS.white },
});
