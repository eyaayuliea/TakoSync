import { useWindowDimensions } from 'react-native';
import { phoneFrameInsets } from './phoneFrame';

/** Style for a pop-up backdrop: keeps the sheet or form inside the phone frame. */
export function usePhoneFrameInsets(): { paddingHorizontal: number; paddingVertical: number } {
  const { width, height } = useWindowDimensions();
  return phoneFrameInsets(width, height);
}
