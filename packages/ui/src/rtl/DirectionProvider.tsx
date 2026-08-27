import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { I18nManager } from 'react-native';

export type Direction = 'rtl' | 'ltr';

interface DirectionContextValue {
  direction: Direction;
  isRTL: boolean;
  setDirection: (dir: Direction) => void;
  toggleDirection: () => void;
}

const DirectionContext = createContext<DirectionContextValue>({
  direction: 'rtl',
  isRTL: true,
  setDirection: () => {},
  toggleDirection: () => {},
});

export interface DirectionProviderProps {
  children: ReactNode;
  initialDirection?: Direction;
}

export const DirectionProvider: React.FC<DirectionProviderProps> = ({
  children,
  initialDirection = 'rtl',
}) => {
  const [direction, setDirectionState] = useState<Direction>(initialDirection);

  const setDirection = (newDir: Direction) => {
    setDirectionState(newDir);
    try {
      const shouldBeRTL = newDir === 'rtl';
      if (I18nManager.isRTL !== shouldBeRTL) {
        I18nManager.allowRTL(shouldBeRTL);
        I18nManager.forceRTL(shouldBeRTL);
      }
    } catch {
      // Ignored in non-native environments
    }
  };

  const toggleDirection = () => {
    setDirection(direction === 'rtl' ? 'ltr' : 'rtl');
  };

  const value = useMemo(
    () => ({
      direction,
      isRTL: direction === 'rtl',
      setDirection,
      toggleDirection,
    }),
    [direction],
  );

  return <DirectionContext.Provider value={value}>{children}</DirectionContext.Provider>;
};

export const useDirection = (): DirectionContextValue => {
  return useContext(DirectionContext);
};
