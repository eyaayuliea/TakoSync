import type { TextStyle, ViewStyle } from 'react-native';

export const staffColors = {
  primary: '#EC1358',
  navy: '#0F1025',
  action: '#FCA639',
  background: '#F5F5F4',
  surface: '#FDFDFC',
  white: '#FFFFFF',
  text: '#000000',
  secondaryText: '#5D5E6B',
  success: '#589144',
  warning: '#FDE672',
  error: '#F52F2E',
  information: '#595EC0',
  discrepancy: '#B9244C',
  neutral: '#B7B7BE',
  divider: '#E3E3E6',
  batterCream: '#F6EED0',
  darkBackground: '#13121A',
  darkSurface: '#29283B',
  darkSurfaceSecondary: '#2D2C40',
  darkText: '#F5F4FA',
  darkSecondaryText: '#B2B3C4',
  darkDivider: '#3A394D',
  // Compatibility aliases for the legacy Staff workspace. Keeping these
  // aliases token-backed lets the large workflow file migrate incrementally
  // without changing its business logic or rendered meaning.
  pink: '#EC1358',
  orange: '#FCA639',
  ink: '#0F1025',
  muted: '#626370',
  pale: '#F5F5F4',
  line: '#E3E3E6',
  green: '#589144',
  paleGreen: '#E7F1E3',
  red: '#F52F2E',
  paleRed: '#FDE3E3',
  yellow: '#FDE672',
} as const;

export type StaffStatus =
  | 'inStock'
  | 'lowStock'
  | 'outOfStock'
  | 'nearExpiry'
  | 'expired'
  | 'discrepancy';

export const staffStatusTones: Record<StaffStatus, { background: string; foreground: string }> = {
  inStock: { background: '#E7F1E3', foreground: '#0F1025' },
  lowStock: { background: '#FDE672', foreground: '#0F1025' },
  outOfStock: { background: '#F52F2E', foreground: '#000000' },
  nearExpiry: { background: '#FCA639', foreground: '#0F1025' },
  expired: { background: '#F52F2E', foreground: '#000000' },
  discrepancy: { background: '#B9244C', foreground: '#FFFFFF' },
};

export const staffSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  control: 48,
  compactControl: 40,
} as const;

export const staffRadius = {
  control: 8,
  card: 8,
  dialog: 8,
  pill: 999,
} as const;

export const staffElevation: ViewStyle = {};

export const staffFonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
} as const;

export const staffTypography = {
  display: { fontSize: 48, lineHeight: 56, fontFamily: 'Poppins_700Bold' },
  h1: { fontSize: 32, lineHeight: 40, fontFamily: 'Poppins_700Bold' },
  h2: { fontSize: 24, lineHeight: 32, fontFamily: 'Poppins_700Bold' },
  h3: { fontSize: 20, lineHeight: 28, fontFamily: 'Poppins_600SemiBold' },
  title: { fontSize: 18, lineHeight: 26, fontFamily: 'Poppins_600SemiBold' },
  body: { fontSize: 16, lineHeight: 24, fontFamily: 'Poppins_400Regular' },
  detail: { fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_400Regular' },
  label: { fontSize: 14, lineHeight: 20, fontFamily: 'Poppins_600SemiBold' },
} satisfies Record<string, TextStyle>;

export type StaffTypographyToken = keyof typeof staffTypography;

