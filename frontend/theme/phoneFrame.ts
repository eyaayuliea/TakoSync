// On a tablet or in a browser the mobile app is drawn inside a phone-sized frame
// in the middle of the window. Pop-ups are drawn over the whole window, so they
// use the same frame here to stay the size of the phone screen.

export type PhoneFrame = { isWideScreen: boolean; width: number; height: number };

/** The phone frame for a window: the whole window on a phone, a centred frame on anything wider. */
export function phoneFrameSize(windowWidth: number, windowHeight: number): PhoneFrame {
  const isWideScreen = windowWidth > 600 && windowHeight > 500;
  const width = isWideScreen ? Math.min(430, windowHeight * 0.5) : windowWidth;
  const height = isWideScreen ? Math.min(windowHeight, width * 2) : windowHeight;
  return { isWideScreen, width, height };
}

/**
 * Padding for a full-window pop-up backdrop so that its content (a bottom sheet,
 * a form) is laid out inside the phone frame: same width, same bottom edge.
 * Zero on a phone.
 */
export function phoneFrameInsets(windowWidth: number, windowHeight: number): { paddingHorizontal: number; paddingVertical: number } {
  const frame = phoneFrameSize(windowWidth, windowHeight);
  return {
    paddingHorizontal: Math.max(0, (windowWidth - frame.width) / 2),
    paddingVertical: Math.max(0, (windowHeight - frame.height) / 2),
  };
}
