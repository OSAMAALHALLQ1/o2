export * from './colors';
export * from './spacing';
export * from './radius';
export * from './typography';
export * from './elevation';
export * from './animation';

import { colors } from './colors';
import { spacing } from './spacing';
import { radius } from './radius';
import { typography } from './typography';
import { elevation } from './elevation';
import { animation } from './animation';

export const tokens = {
  colors,
  spacing,
  radius,
  typography,
  elevation,
  animation,
} as const;

export type ThemeTokens = typeof tokens;
