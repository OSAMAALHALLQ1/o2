import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { colors, radius, spacing, typography } from '../tokens';
import { CurrencyType } from '@o2/types';
import { useDirection, getFlexDirection } from '../rtl';

export interface CurrencyBadgeProps {
  type: CurrencyType;
  amount: number | string;
  onPress?: () => void;
  style?: ViewStyle;
}

export const CurrencyBadge: React.FC<CurrencyBadgeProps> = ({
  type,
  amount,
  onPress,
  style,
}) => {
  const { direction } = useDirection();

  const getCurrencyMeta = () => {
    switch (type) {
      case 'O2_GEM':
        return {
          symbol: '💎',
          color: colors.currency.gem,
          label: 'جواهر',
        };
      case 'EVENT_TOKEN':
        return {
          symbol: '🎟️',
          color: colors.currency.eventToken,
          label: 'فعالية',
        };
      case 'O2_COIN':
      default:
        return {
          symbol: '🪙',
          color: colors.currency.coin,
          label: 'عملات',
        };
    }
  };

  const meta = getCurrencyMeta();
  const formattedAmount =
    typeof amount === 'number' ? amount.toLocaleString('ar-EG') : amount;

  const content = (
    <View
      style={[
        styles.badge,
        { flexDirection: getFlexDirection('row', direction) },
        style,
      ]}
    >
      <Text style={styles.symbol}>{meta.symbol}</Text>
      <Text style={[styles.amount, { color: meta.color }]}>
        {formattedAmount}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

export interface CurrencyBarProps {
  coins: number;
  gems: number;
  eventTokens?: number;
  onCoinsPress?: () => void;
  onGemsPress?: () => void;
  onEventTokensPress?: () => void;
  style?: ViewStyle;
}

export const CurrencyBar: React.FC<CurrencyBarProps> = ({
  coins,
  gems,
  eventTokens,
  onCoinsPress,
  onGemsPress,
  onEventTokensPress,
  style,
}) => {
  const { direction } = useDirection();

  return (
    <View
      style={[
        styles.bar,
        { flexDirection: getFlexDirection('row', direction) },
        style,
      ]}
    >
      <CurrencyBadge
        type="O2_COIN"
        amount={coins}
        onPress={onCoinsPress}
      />
      <CurrencyBadge
        type="O2_GEM"
        amount={gems}
        onPress={onGemsPress}
      />
      {eventTokens !== undefined && (
        <CurrencyBadge
          type="EVENT_TOKEN"
          amount={eventTokens}
          onPress={onEventTokensPress}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.surfaces.surfaceElevated,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xxs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  symbol: {
    fontSize: typography.fontSize.sm,
  },
  amount: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.xs + 1,
    fontWeight: typography.fontWeight.bold,
  },
  bar: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
