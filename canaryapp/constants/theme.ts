/**
 * Canary OS Theme Colors
 * Color scheme based on Canary Yellow branding with clean, minimalistic design
 */

import { Platform } from 'react-native';

// Canary OS Color Palette
export const CanaryColors = {
  primary: '#FFD300',      // Canary Yellow
  secondary: '#1C1C1C',    // Charcoal Black
  tertiary: '#242424',     // Gunmetal Gray
  offWhite: '#F5F5F5',     // Off-White
  alertRed: '#E63946',     // Alert Red (for scam alerts)
  trustBlue: '#0077B6',    // Trust Blue (for safe content)
  white: '#FFFFFF',
  black: '#000000',
};

export const Colors = {
  light: {
    text: CanaryColors.secondary,
    background: CanaryColors.offWhite,
    tint: CanaryColors.primary,
    icon: CanaryColors.tertiary,
    tabIconDefault: CanaryColors.tertiary,
    tabIconSelected: CanaryColors.primary,
    card: CanaryColors.white,
    border: '#E0E0E0',
    danger: CanaryColors.alertRed,
    success: CanaryColors.trustBlue,
  },
  dark: {
    text: CanaryColors.offWhite,
    background: CanaryColors.secondary,
    tint: CanaryColors.primary,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: CanaryColors.primary,
    card: CanaryColors.tertiary,
    border: '#404040',
    danger: CanaryColors.alertRed,
    success: CanaryColors.trustBlue,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
