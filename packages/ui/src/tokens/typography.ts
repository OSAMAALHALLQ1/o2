export const typography = {
  // Font Families (Arabic Primary, Fallback Sans)
  fontFamily: {
    heading: 'Cairo, system-ui, -apple-system, sans-serif',
    body: 'Cairo, system-ui, -apple-system, sans-serif',
    accent: 'Tajawal, Cairo, sans-serif',
    mono: 'monospace',
  },

  // Font Sizes
  fontSize: {
    '2xs': 10,
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },

  // Line Heights
  lineHeight: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  // Font Weights
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
    black: '900',
  },
} as const;

export type TypographyTokens = typeof typography;
