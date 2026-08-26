export const colors = {
  // Brand Identity Colors
  brand: {
    primary: '#D32F2F', // O2 Signature Red
    primaryHover: '#C62828',
    primaryLight: '#EF5350',
    primaryDark: '#B71C1C',
    accent: '#FFD54F', // Warm Gold Prestige
    accentLight: '#FFE082',
  },

  // Dark Navy & Surface System
  surfaces: {
    background: '#0A0E17', // Deepest background
    surface: '#121824', // Card & container surface
    surfaceElevated: '#1A2234', // Modals & raised elements
    surfaceHighlight: '#242E42', // Active/hovered elements
    border: '#243048', // Subtle borders
    borderHighlight: '#3B4D72',
  },

  // Text Hierarchy
  text: {
    primary: '#F8F9FA', // Crisp off-white
    secondary: '#A0AEC0', // Muted secondary text
    tertiary: '#718096', // Disabled/placeholder
    inverse: '#0A0E17', // On bright badges/buttons
    brand: '#FF5252', // Red highlighted text
    gold: '#FFD54F', // Gold highlighted text
  },

  // Semantics & Feedback
  semantic: {
    success: '#4CAF50',
    successBackground: '#1B382B',
    warning: '#FF9800',
    warningBackground: '#3E2713',
    error: '#F44336',
    errorBackground: '#3E1818',
    info: '#2196F3',
    infoBackground: '#122B42',
  },

  // Item Rarities
  rarity: {
    common: '#9E9E9E',
    uncommon: '#4CAF50',
    rare: '#2196F3',
    epic: '#9C27B0',
    legendary: '#FF9800',
    mythic: '#E040FB',
  },

  // Currency Accents
  currency: {
    coin: '#FFC107',
    gem: '#00E5FF',
    eventToken: '#FF4081',
  },

  // Utility
  overlay: 'rgba(0, 0, 0, 0.75)',
  transparent: 'transparent',
} as const;

export type ColorTokens = typeof colors;
