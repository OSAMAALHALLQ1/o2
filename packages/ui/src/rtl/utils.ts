import { TextStyle, ViewStyle } from 'react-native';
import { Direction } from './DirectionProvider';

export function getTextAlign(
  align: 'start' | 'end' | 'left' | 'right' | 'center',
  direction: Direction = 'rtl',
): TextStyle['textAlign'] {
  if (align === 'center') return 'center';
  if (align === 'start') return direction === 'rtl' ? 'right' : 'left';
  if (align === 'end') return direction === 'rtl' ? 'left' : 'right';
  return align;
}

export function getFlexDirection(
  dir: 'row' | 'row-reverse',
  direction: Direction = 'rtl',
): ViewStyle['flexDirection'] {
  if (direction === 'rtl') {
    return dir === 'row' ? 'row-reverse' : 'row';
  }
  return dir;
}

export function flipIfRTL(value: number, direction: Direction = 'rtl'): number {
  return direction === 'rtl' ? -value : value;
}
