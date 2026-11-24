// The TakoSync logo files are 2000 × 2000 with wide transparent margins: the
// artwork itself covers about 83% of the width and 56% of the height. Sizing
// the image by its canvas made the logo look small, so screens size it by the
// artwork instead and crop the margins away.

/** Share of the square canvas the artwork covers. */
export const BRAND_LOGO_ART = { width: 0.8325, height: 0.556 } as const;

/**
 * For artwork shown `artWidth` wide: the box to clip to, and the size the
 * square image must be drawn at so the artwork fills that box.
 */
export function brandLogoLayout(artWidth: number): { boxWidth: number; boxHeight: number; imageSize: number } {
  const width = Math.max(0, Math.round(artWidth));
  const imageSize = Math.round(width / BRAND_LOGO_ART.width);
  return { boxWidth: width, boxHeight: Math.round(imageSize * BRAND_LOGO_ART.height), imageSize };
}

/** The opening screens show the logo at most of the screen width, capped for tablets and web. */
export function openingLogoWidth(frameWidth: number): number {
  return Math.round(Math.min(frameWidth * 0.72, 340));
}
