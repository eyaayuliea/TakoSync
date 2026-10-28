import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import appConfig from '../app.json';
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
import StaffWorkspace from './staff/StaffWorkspace';
import { createThemedStyles, ThemeProvider, useTheme } from './theme/ThemeProvider';
import { isSupabaseConfigured } from './services/supabase';
import {
  getCurrentUser,
  loadOwnerInventory,
  signIn,
  signOut,
  type AppUser,
} from '../backend/services/takosync';

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
type PreviewInventoryItem = {
  name: string;
  category: string;
  quantity: string;
  lowStock: boolean;
  expiration: string | null;
  branch?: string;
};
type Screen = 'loading' | 'welcome' | 'login' | 'dashboard' | 'staffWorkspace';
type AuthenticatedUser = AppUser;
type DashboardTab = 'Dashboard' | 'History' | 'Alerts';

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { colors, isDark, setMode } = useTheme();
  const styles = useAppStyles();
  const [screen, setScreen] = useState<Screen>('loading');
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const authLock = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutLock = useRef(false);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('Dashboard');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [ownerData, setOwnerData] = useState<Awaited<ReturnType<typeof loadOwnerInventory>> | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);
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
  const itemCarouselCardWidth = Math.max(0, frameWidth - 36);
  const visibleScreen =
    (screen === 'dashboard' || screen === 'staffWorkspace') && authenticatedUser === null
      ? 'login'
      : screen;

  useEffect(() => {
    if (screen !== 'loading' || !fontsLoaded) return;
    const timer = setTimeout(() => setScreen('welcome'), 1500);
    return () => clearTimeout(timer);
  }, [screen, fontsLoaded]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active || !user) return;
        setAuthenticatedUser(user);
        setScreen(user.role === 'Staff' ? 'staffWorkspace' : 'dashboard');
      })
      .catch((error: unknown) => {
        if (active) {
          setLoginError(error instanceof Error ? error.message : 'Unable to restore the saved session.');
          setScreen('login');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authenticatedUser?.role !== 'Owner') {
      setOwnerData(null);
      return;
    }
    let active = true;
    setOwnerLoading(true);
    loadOwnerInventory()
      .then((data) => {
        if (active) {
          setOwnerData(data);
          setDashboardMessage('');
        }
      })
      .catch((error: unknown) => {
        if (active) setDashboardMessage(error instanceof Error ? error.message : 'Unable to load branch inventory.');
      })
      .finally(() => {
        if (active) setOwnerLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authenticatedUser]);

  const logoWidth = Math.min(frameWidth * 0.48, 230);
  const foodSize = Math.min(frameWidth * 0.57, 250, frameHeight * 0.3);
  const branchNames = new Map((ownerData?.branches ?? []).map((branch) => [
    branch.id,
    `${branch.city ? `${branch.city} · ` : ''}Branch ${Number(branch.code.replace(/\D/g, '')) || branch.code}`,
  ]));
  const ownerIngredients = new Map((ownerData?.ingredients ?? []).map((ingredient) => [ingredient.id, ingredient]));
  const ownerCategories = new Map((ownerData?.categories ?? []).map((category) => [category.id, category.name]));
  const ownerBatches = new Map<string, NonNullable<typeof ownerData>['batches'][number][]>();
  for (const batch of ownerData?.batches ?? []) {
    const key = `${batch.branch_id}:${batch.ingredient_id}`;
    ownerBatches.set(key, [...(ownerBatches.get(key) ?? []), batch]);
  }
  const branchInventory: PreviewInventoryItem[] = (ownerData?.inventory ?? []).flatMap((record) => {
    const ingredient = ownerIngredients.get(record.ingredient_id);
    if (!ingredient) return [];
    const expiration = ownerBatches.get(`${record.branch_id}:${record.ingredient_id}`)?.[0]?.expiration_date ?? null;
    const expirationTime = expiration ? new Date(`${expiration}T00:00:00`).getTime() : null;
    const isNearExpiry = expirationTime !== null &&
      expirationTime <= new Date().setHours(0, 0, 0, 0) + 7 * 86_400_000;
    return [{
      name: ingredient.name,
      category: ownerCategories.get(ingredient.category_id) ?? 'Other',
      quantity: `${Number(record.quantity)} ${ingredient.unit}`,
      lowStock: Number(record.quantity) <= Number(record.minimum_stock),
      expiration: isNearExpiry ? new Date(`${expiration}T00:00:00`).toLocaleDateString('en-GB') : null,
      branch: branchNames.get(record.branch_id) ?? 'Branch',
    }];
  });
  const lowStockItems = branchInventory.filter((item) => item.lowStock);
  const expiringItems = branchInventory.filter((item) => item.expiration !== null);
  const pendingDailyChecks = (ownerData?.dailyChecks ?? []).filter((check) => check.status === 'pending_owner_review');
  const trackedItemCount = branchInventory.length;
  const stockAlertCount = lowStockItems.length + expiringItems.length;
  const searchTerm = dashboardSearch.trim().toLowerCase();
  const filterItems = (items: PreviewInventoryItem[]) =>
    items.filter((item) =>
      `${item.name} ${item.category}`.toLowerCase().includes(searchTerm),
    );
  const visibleLowStockItems = filterItems(lowStockItems);
  const visibleExpiringItems = filterItems(expiringItems);
  const handleLogin = async () => {
    if (authLock.current) return;
    if (!username.trim() || !password) {
      setLoginError('Enter your email and password to continue.');
      return;
    }
    authLock.current = true;
    setAuthenticating(true);
    setLoginError('');
    try {
      const user = await signIn(username, password);
      setAuthenticatedUser(user);
      setScreen(user.role === 'Staff' ? 'staffWorkspace' : 'dashboard');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      authLock.current = false;
      setAuthenticating(false);
    }
  };

  const clearSignedInState = () => {
    setAuthenticatedUser(null);
    setOwnerData(null);
    setUsername('');
    setPassword('');
    setDashboardTab('Dashboard');
  };

  const handleLogout = async () => {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    try {
      await signOut();
      clearSignedInState();
      setLoginError('');
      setScreen('welcome');
    } catch (error) {
      setDashboardMessage(error instanceof Error ? error.message : 'Unable to end the session. Please try again.');
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  };

  const handleStaffLogout = async () => {
    await signOut();
    clearSignedInState();
    setLoginError('');
    setScreen('welcome');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={styles.canvas}>
        <View style={[styles.frameShadow, { width: frameWidth, height: frameHeight }, isWideScreen && styles.desktopShadow]}>
          <View style={[styles.appFrame, isWideScreen && styles.desktopFrame]}>
            {visibleScreen === 'loading' && (
              <View style={styles.loadingScreen}>
                <Image
                  source={require('../assets/takosync-logo.png')}
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
                    source={require('../assets/takosync-logo.png')}
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
                  source={require('../assets/takoyaki-plate.png')}
                  style={[styles.foodImage, { width: foodSize, height: foodSize, top: frameHeight * 0.255 }]}
                  resizeMode="contain"
                  accessibilityLabel="A plate of takoyaki"
                />
              </View>
            )}

            {visibleScreen === 'login' && (
              <View style={styles.loginScreen}>
                <ImageBackground
                  source={require('../assets/takoyaki-plate.png')}
                  resizeMode="cover"
                  style={styles.loginBackground}
                  imageStyle={styles.loginBackgroundImage}
                >
                  <View style={styles.loginOverlay}>
                    <View style={[styles.loginHeader, { height: Math.max(frameHeight * 0.22, 125) }]}>
                      <Image
                        source={require('../assets/takosync-logo.png')}
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
                        <Text style={styles.loginLabel}>Email *</Text>
                        <TextInput
                          value={username}
                          onChangeText={(value) => {
                            setUsername(value);
                            setLoginError('');
                          }}
                          style={styles.loginInput}
                          placeholder="Enter your email"
                          placeholderTextColor={isDark ? colors.secondaryText : '#777783'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          accessibilityLabel="Email, required"
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
                          placeholderTextColor={isDark ? colors.secondaryText : '#777783'}
                          secureTextEntry
                          accessibilityLabel="Password, required"
                          returnKeyType="done"
                          onSubmitEditing={handleLogin}
                        />
                        <Text style={styles.loginHelper}>
                          Sign in with the email and password assigned to your account. Contact the owner if you need access.
                        </Text>
                        {!isSupabaseConfigured && (
                          <Text style={styles.errorText}>
                            Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart Expo.
                          </Text>
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Log In"
                          onPress={handleLogin}
                          disabled={authenticating || !isSupabaseConfigured}
                          style={({ pressed }) => [styles.loginButton, pressed && styles.buttonPressed, (authenticating || !isSupabaseConfigured) && { opacity: 0.6 }]}
                        >
                          <Text style={styles.loginButtonText}>{authenticating ? 'Signing in…' : 'Log In'}</Text>
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
                        <Text style={styles.dashboardGreeting}>Hello, {authenticatedUser.branch}!</Text>
                        <Text style={styles.dashboardSubheading}>{authenticatedUser.role} dashboard</Text>
                      </View>
                    </View>
                    <View style={styles.headerActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Notifications"
                        onPress={() => setDashboardMessage('Owner notifications are not configured in this screen.')}
                        style={({ pressed }) => [styles.notificationButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.notificationIcon}>🔔</Text>
                        <View style={styles.notificationDot} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}
                        accessibilityState={{ selected: isDark }}
                        onPress={() => setMode(isDark ? 'light' : 'dark')}
                        style={({ pressed }) => [styles.themeToggleButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.themeToggleText}>{isDark ? '☼' : '☾'}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Log out"
                        disabled={loggingOut}
                        onPress={handleLogout}
                        style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
                      >
                        <Text style={styles.logoutButtonText}>{loggingOut ? 'Logging out…' : 'Log out'}</Text>
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
                      placeholderTextColor={isDark ? colors.secondaryText : DASHBOARD_COLORS.secondaryText}
                      style={styles.searchInput}
                      accessibilityLabel="Search branch inventory"
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
                            source={require('../assets/takoyaki-plate.png')}
                            style={styles.summaryFoodImage}
                            resizeMode="cover"
                            accessibilityLabel="Takoyaki"
                          />
                        </View>
                        <Text style={styles.summaryDemoLabel}>{ownerLoading ? 'LOADING' : 'LIVE DATA'}</Text>
                      </View>

                      {pendingDailyChecks.length > 0 && (
                        <View style={styles.alertsNote}>
                          <Text style={styles.alertsNoteTitle}>
                            {pendingDailyChecks.length} daily {pendingDailyChecks.length === 1 ? 'check' : 'checks'} awaiting review
                          </Text>
                          {pendingDailyChecks.map((check) => (
                            <Text key={check.id} style={styles.alertsNoteText}>
                              {branchNames.get(check.branch_id) ?? 'Branch'} · {check.reference} · {check.check_date}
                            </Text>
                          ))}
                          <Text style={styles.alertsNoteText}>
                            Daily check approval is not available in this Owner screen yet.
                          </Text>
                        </View>
                      )}

                      <View style={styles.sectionHeadingRow}>
                        <Text style={styles.sectionHeading}>Quick Actions</Text>
                        <Text style={styles.sectionCaption}>At a glance</Text>
                      </View>
                      <View style={styles.quickActions}>
                        {[
                          { label: 'Stock-In', icon: '＋', color: DASHBOARD_COLORS.information },
                          { label: 'Stock-Out', icon: '↗', color: isDark ? colors.accent : DASHBOARD_COLORS.pink },
                          { label: 'Waste', icon: '⌫', color: isDark ? colors.error : DASHBOARD_COLORS.discrepancy },
                          { label: 'Daily Check', icon: '✓', color: DASHBOARD_COLORS.success },
                        ].map((action) => (
                          <Pressable
                            key={action.label}
                            accessibilityRole="button"
                            accessibilityLabel={`${action.label} action`}
                            onPress={() => setDashboardMessage(`${action.label} is not available from this read-only dashboard.`)}
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
                      <Text style={styles.historyCaption}>Latest inventory activity across accessible branches</Text>
                      {(ownerData?.transactions ?? []).map((activity) => {
                      const ingredient = ownerIngredients.get(activity.ingredient_id);
                      return (
                      <View key={activity.id} style={styles.activityCard}>
                        <View style={styles.activityIcon}>
                          <Text style={styles.activityIconText}>↗</Text>
                        </View>
                        <View style={styles.activityCopy}>
                          <Text style={styles.activityTitle}>{activity.type.replace('_', ' ')} · {ingredient?.name ?? activity.ingredient_id}</Text>
                          <Text style={styles.activityDetail}>
                            {branchNames.get(activity.branch_id) ?? 'Branch'} · {Number(activity.quantity)} {activity.unit} · {new Date(activity.transaction_date).toLocaleString()}
                          </Text>
                        </View>
                      </View>
                      )})}
                      {(ownerData?.transactions.length ?? 0) === 0 && (
                      <Text style={styles.emptySearchText}>{ownerLoading ? 'Loading activity…' : 'No inventory transactions recorded yet.'}</Text>
                      )}
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
                        <ScrollView
                          horizontal
                          nestedScrollEnabled
                          directionalLockEnabled
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.itemCarousel}
                        >
                          {visibleLowStockItems.map((item) => (
                            <View key={`${item.branch ?? ''}-${item.name}`} style={[styles.itemCard, { width: itemCarouselCardWidth }]}>
                              <View style={styles.itemImageContainer}>
                                <Image
                                  source={require('../assets/takoyaki-plate.png')}
                                  style={styles.itemImage}
                                  resizeMode="cover"
                                  accessibilityLabel={`${item.name} image`}
                                />
                              </View>
                              <View style={styles.itemDetails}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.itemCategory} numberOfLines={1}>{item.category}</Text>
                              </View>
                              <View style={styles.itemStatusColumn}>
                                <Text style={styles.itemQuantity}>{item.quantity}</Text>
                                <View style={styles.warningBadge}>
                                  <Text style={styles.warningBadgeIcon}>⚠</Text>
                                  <Text style={styles.warningBadgeText} numberOfLines={1}>Low Stock</Text>
                                </View>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.emptySearchText}>
                          {ownerLoading ? 'Loading branch inventory…' : 'No low-stock items match your search.'}
                        </Text>
                      )}

                      <View style={[styles.sectionHeadingRow, styles.expirationHeading]}>
                        <Text style={styles.sectionHeading}>Nearing Expiration</Text>
                        <Text style={styles.expirationCount}>{expiringItems.length} items</Text>
                      </View>
                      {visibleExpiringItems.length > 0 ? (
                        <ScrollView
                          horizontal
                          nestedScrollEnabled
                          directionalLockEnabled
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.itemCarousel}
                        >
                          {visibleExpiringItems.map((item) => (
                            <View key={`${item.branch ?? ''}-${item.name}`} style={[styles.itemCard, { width: itemCarouselCardWidth }]}>
                              <View style={styles.itemImageContainer}>
                                <Image
                                  source={require('../assets/takoyaki-plate.png')}
                                  style={styles.itemImage}
                                  resizeMode="cover"
                                  accessibilityLabel={`${item.name} image`}
                                />
                              </View>
                              <View style={styles.itemDetails}>
                                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.itemCategory} numberOfLines={3}>
                                  {item.category} · Exp. {item.expiration}
                                </Text>
                              </View>
                              <View style={styles.itemStatusColumn}>
                                <Text style={styles.itemQuantity}>{item.quantity}</Text>
                                <View style={styles.expirationBadge}>
                                  <Text style={styles.expirationBadgeIcon}>▦</Text>
                                  <Text style={styles.expirationBadgeText} numberOfLines={1}>Near Expiry</Text>
                                </View>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.emptySearchText}>No near-expiry items match your search.</Text>
                      )}
                    </>
                  )}

                  {dashboardTab === 'Alerts' && (
                    <View style={styles.alertsNote}>
                      <Text style={styles.alertsNoteTitle}>Branch inventory alerts</Text>
                      <Text style={styles.alertsNoteText}>
                        Alerts are based on saved branch quantities and active batches. Contact the owner for inventory changes.
                      </Text>
                    </View>
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
              <StaffWorkspace
                onLogout={handleStaffLogout}
                user={authenticatedUser}
                appVersion={appConfig.expo.version}
              />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function useAppStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
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
  themeToggleButton: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, backgroundColor: '#F5F5F7',
  },
  themeToggleText: { color: NAVY, fontSize: 17, lineHeight: 21 },
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
  itemCarousel: { gap: 12, paddingBottom: 5 },
  itemCard: {
    height: 108, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, flexShrink: 0,
    borderRadius: 24, backgroundColor: '#EEEEEE', borderWidth: 1, borderColor: '#E8E8EA',
    elevation: 2, shadowColor: DASHBOARD_COLORS.navy, shadowOpacity: 0.07, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  itemImageContainer: {
    width: 86, height: 86, flexShrink: 0, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: DASHBOARD_COLORS.white, overflow: 'hidden',
  },
  itemImage: { width: '100%', height: '100%', borderRadius: 20 },
  itemDetails: { flex: 1, flexShrink: 1, minWidth: 0, justifyContent: 'center', marginLeft: 12, marginRight: 6 },
  itemName: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 18, lineHeight: 24 },
  itemCategory: { color: '#555560', fontFamily: 'Poppins_400Regular', fontSize: 14, lineHeight: 19, marginTop: 2 },
  itemStatusColumn: { width: 100, flexShrink: 0, alignItems: 'flex-end', justifyContent: 'center' },
  itemQuantity: { color: DASHBOARD_COLORS.black, fontFamily: 'Poppins_600SemiBold', fontSize: 18, lineHeight: 24, marginBottom: 3 },
  warningBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, backgroundColor: DASHBOARD_COLORS.warning,
  },
  warningBadgeIcon: { color: DASHBOARD_COLORS.navy, fontSize: 11, lineHeight: 13, marginRight: 3 },
  warningBadgeText: { color: DASHBOARD_COLORS.navy, fontFamily: 'Poppins_500Medium', fontSize: 10 },
  expirationHeading: { marginTop: 20 },
  expirationCount: { color: DASHBOARD_COLORS.secondaryText, fontFamily: 'Poppins_400Regular', fontSize: 10 },
  expirationBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end',
    paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: DASHBOARD_COLORS.error,
  },
  expirationBadgeIcon: { color: DASHBOARD_COLORS.white, fontSize: 11, lineHeight: 13, marginRight: 3 },
  expirationBadgeText: { color: DASHBOARD_COLORS.white, fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
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
  }, theme)), [theme]);
}
