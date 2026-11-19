export const ownerColors = {
  primary: '#EC1358',
  navy: '#0F1025',
  orange: '#FCA639',
  white: '#FFFFFF',
  black: '#000000',
  secondaryText: '#626370',
  placeholder: '#B2B3C4',
  success: '#589144',
  warning: '#FDE672',
  error: '#F52F2E',
  discrepancy: '#B9244C',
  information: '#595EC0',
  neutral: '#B7B7BE',
  cream: '#F6EED0',
  canvas: '#F5F5F4',
  card: '#FDFDFC',
  divider: '#E3E3E6',
  lavenderTint: 'rgba(89,94,192,0.12)',
  scrim: 'rgba(15,16,37,0.55)',
} as const;

export const ownerTypography = {
  display: { fontFamily: 'Poppins_700Bold', fontSize: 48, lineHeight: 56, color: ownerColors.navy },
  h1: { fontFamily: 'Poppins_700Bold', fontSize: 32, lineHeight: 40, color: ownerColors.navy },
  h2: { fontFamily: 'Poppins_700Bold', fontSize: 24, lineHeight: 32, color: ownerColors.navy },
  h3: { fontFamily: 'Poppins_600SemiBold', fontSize: 20, lineHeight: 28, color: ownerColors.navy },
  titleLarge: { fontFamily: 'Poppins_600SemiBold', fontSize: 18, lineHeight: 24, color: ownerColors.navy },
  titleMedium: { fontFamily: 'Poppins_600SemiBold', fontSize: 16, lineHeight: 22, color: ownerColors.navy },
  pageTitle: { fontFamily: 'Poppins_700Bold', fontSize: 32, lineHeight: 40, color: ownerColors.navy },
  cardTitle: { fontFamily: 'Poppins_600SemiBold', fontSize: 16, lineHeight: 22, color: ownerColors.navy },
  label: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, lineHeight: 20, color: ownerColors.navy },
  value: { fontFamily: 'Poppins_400Regular', fontSize: 16, lineHeight: 24, color: ownerColors.black },
  caption: { fontFamily: 'Poppins_500Medium', fontSize: 12, color: ownerColors.secondaryText },
  button: { fontFamily: 'Poppins_600SemiBold', fontSize: 14, lineHeight: 20, color: ownerColors.navy },
  badge: { fontFamily: 'Poppins_500Medium', fontSize: 12, lineHeight: 16, color: ownerColors.navy },
  small: { fontFamily: 'Poppins_400Regular', fontSize: 11, lineHeight: 15, color: ownerColors.secondaryText },
} as const;

export const ownerSpacing = {
  page: 16,
  section: 24,
  card: 16,
  row: 12,
  compact: 8,
  control: 48,
  compactControl: 40,
  navBottom: 80,
} as const;

export const ownerRadii = {
  control: 8,
  card: 16,
  sheet: 24,
  pill: 24,
  circle: 999,
} as const;

export const ownerIcon = {
  strokeWidth: 1.8,
  metadata: 16,
  control: 20,
  navigation: 24,
} as const;

export const ownerTokens = { colors: ownerColors, typography: ownerTypography, spacing: ownerSpacing, radii: ownerRadii, icon: ownerIcon } as const;
