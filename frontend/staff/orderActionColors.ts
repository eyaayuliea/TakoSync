// Colours of the three actions at the end of the Order (payment) page, by role:
//   primary     – Confirm Transaction: the one filled, brand-coloured button;
//   secondary   – Return to cart: outlined, neutral;
//   destructive – Cancel order: red text, no fill, set apart from the other two.
// One filled button per screen, and red only for the action that discards work.

export type OrderActionColors = {
  pageBackground: string;
  primary: { background: string; text: string };
  primaryDisabled: { background: string; text: string };
  secondary: { background: string; border: string; text: string };
  destructive: { text: string };
  /** The confirm button of a dialog that discards the order. */
  destructiveFill: { background: string; text: string };
};

const BRAND = '#EC1358';
const RED_ON_LIGHT = '#C92F3C';
const RED_ON_DARK = '#FF6B6B';

export function orderActionColors(isDark: boolean): OrderActionColors {
  return isDark
    ? {
      pageBackground: '#13121A',
      primary: { background: BRAND, text: '#FFFFFF' },
      primaryDisabled: { background: '#2D2C40', text: '#9A9BB0' },
      secondary: { background: 'transparent', border: '#D6D5E0', text: '#F5F4FA' },
      destructive: { text: RED_ON_DARK },
      destructiveFill: { background: RED_ON_LIGHT, text: '#FFFFFF' },
    }
    : {
      pageBackground: '#F5F5F5',
      primary: { background: BRAND, text: '#FFFFFF' },
      primaryDisabled: { background: '#E4E4EA', text: '#6B6B78' },
      secondary: { background: '#FFFFFF', border: '#0F1025', text: '#0F1025' },
      destructive: { text: RED_ON_LIGHT },
      destructiveFill: { background: RED_ON_LIGHT, text: '#FFFFFF' },
    };
}

/**
 * The outlined look of a secondary button, for style sheets elsewhere in the
 * staff app, so every "Cancel", "Back" and "Close" matches the Order page.
 */
export function secondaryOutline(isDark: boolean): { backgroundColor: string; borderWidth: number; borderColor: string } {
  const { secondary } = orderActionColors(isDark);
  return { backgroundColor: secondary.background, borderWidth: 1.5, borderColor: secondary.border };
}

/** Text colour of a destructive text action (discard, leave without saving, clear). */
export function destructiveTextColor(isDark: boolean): string {
  return orderActionColors(isDark).destructive.text;
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (index: number) => {
    const c = parseInt(value.slice(index, index + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio of two #RRGGBB colours (1 to 21). */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
