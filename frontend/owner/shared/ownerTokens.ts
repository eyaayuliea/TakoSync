import { typography } from '../../theme/typography';

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
  display: { ...typography.display, color: ownerColors.navy },
  h1: { ...typography.h1, color: ownerColors.navy },
  h2: { ...typography.h2, color: ownerColors.navy },
  h3: { ...typography.h3, color: ownerColors.navy },
  titleLarge: { ...typography.titleLarge, color: ownerColors.navy },
  titleMedium: { ...typography.titleMedium, color: ownerColors.navy },
  pageTitle: { ...typography.h1, color: ownerColors.navy },
  cardTitle: { ...typography.titleMedium, color: ownerColors.navy },
  label: { ...typography.labelButton, color: ownerColors.navy },
  value: { ...typography.bodyLarge, color: ownerColors.black },
  caption: { fontFamily: 'Poppins_500Medium', fontSize: 12, color: ownerColors.secondaryText },
  button: { ...typography.labelButton, color: ownerColors.navy },
  badge: { ...typography.caption, color: ownerColors.navy },
  small: { ...typography.small, color: ownerColors.secondaryText },
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
