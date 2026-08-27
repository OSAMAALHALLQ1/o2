import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography, elevation } from '../tokens';
import { useDirection, getTextAlign, getFlexDirection } from '../rtl';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  hideToast: () => {},
});

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { direction } = useDirection();

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).slice(2, 9);
      const newToast: ToastMessage = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      const duration = toast.durationMs || 3500;
      setTimeout(() => {
        hideToast(id);
      }, duration);
    },
    [hideToast],
  );

  const getToastBg = (type: ToastType) => {
    switch (type) {
      case 'success':
        return colors.semantic.successBackground;
      case 'warning':
        return colors.semantic.warningBackground;
      case 'error':
        return colors.semantic.errorBackground;
      case 'info':
      default:
        return colors.semantic.infoBackground;
    }
  };

  const getToastBorder = (type: ToastType) => {
    switch (type) {
      case 'success':
        return colors.semantic.success;
      case 'warning':
        return colors.semantic.warning;
      case 'error':
        return colors.semantic.error;
      case 'info':
      default:
        return colors.semantic.info;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <View pointerEvents="none" style={styles.toastContainer}>
        {toasts.map((toast) => (
          <View
            key={toast.id}
            style={[
              styles.toast,
              {
                backgroundColor: getToastBg(toast.type),
                borderColor: getToastBorder(toast.type),
                flexDirection: getFlexDirection('row', direction),
              },
            ]}
          >
            <View style={styles.content}>
              <Text
                style={[
                  styles.title,
                  { textAlign: getTextAlign('start', direction) },
                ]}
              >
                {toast.title}
              </Text>
              {toast.message && (
                <Text
                  style={[
                    styles.message,
                    { textAlign: getTextAlign('start', direction) },
                  ]}
                >
                  {toast.message}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    zIndex: 9999,
  },
  toast: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    ...elevation.md,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  message: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  },
});
