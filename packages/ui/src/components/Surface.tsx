import React from 'react';
import { View, ViewStyle, StyleSheet, ViewProps } from 'react-native';
import { colors } from '../tokens';

export type SurfaceLevel = 'background' | 'surface' | 'elevated' | 'highlight';

export interface SurfaceProps extends ViewProps {
  level?: SurfaceLevel;
  style?: ViewStyle;
}

export const Surface: React.FC<SurfaceProps> = ({
  level = 'surface',
  style,
  children,
  ...props
}) => {
  const getBackgroundColor = () => {
    switch (level) {
      case 'background':
        return colors.surfaces.background;
      case 'elevated':
        return colors.surfaces.surfaceElevated;
      case 'highlight':
        return colors.surfaces.surfaceHighlight;
      case 'surface':
      default:
        return colors.surfaces.surface;
    }
  };

  return (
    <View style={[{ backgroundColor: getBackgroundColor() }, style]} {...props}>
      {children}
    </View>
  );
};
