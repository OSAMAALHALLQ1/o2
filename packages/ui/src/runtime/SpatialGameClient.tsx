import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { SpatialGameClientProps, IGameRuntimeAdapter } from '@o2/types';
import { colors, radius, spacing, typography } from '../tokens';
import { Button } from '../components/Button';

export interface SpatialGameClientComponentProps extends SpatialGameClientProps {
  gameSlug: string;
  runtimeAdapter?: IGameRuntimeAdapter;
  style?: ViewStyle;
}

/**
 * Mock / Fallback Default Spatial Runtime Adapter
 * Decouples React Native from Godot / Canvas / Embedded 3D Runtime.
 */
export class DefaultSpatialGameRuntimeAdapter implements IGameRuntimeAdapter {
  private container: any = null;
  private currentProps: SpatialGameClientProps | null = null;

  mountSpatialGame(containerRef: any, props: SpatialGameClientProps): void {
    this.container = containerRef;
    this.currentProps = props;
    props.onGameEvent('spatial:runtime_ready', {
      timestamp: Date.now(),
      engine: 'O2_SPATIAL_RUNTIME_PLACEHOLDER_V1',
    });
  }

  unmountSpatialGame(): void {
    if (this.currentProps) {
      this.currentProps.onGameEvent('spatial:runtime_unmounted', {
        timestamp: Date.now(),
      });
    }
    this.container = null;
    this.currentProps = null;
  }

  sendSpatialAction(action: string, payload: any): void {
    if (this.currentProps) {
      this.currentProps.onGameEvent(`action:${action}`, payload);
    }
  }
}

export const SpatialGameClient: React.FC<SpatialGameClientComponentProps> = ({
  gameSlug,
  roomId,
  sessionToken,
  playerRole,
  onGameEvent,
  onLeave,
  runtimeAdapter,
  style,
}) => {
  const containerRef = useRef<View>(null);
  const adapter = useRef<IGameRuntimeAdapter>(
    runtimeAdapter || new DefaultSpatialGameRuntimeAdapter(),
  );

  useEffect(() => {
    const activeAdapter = adapter.current;
    activeAdapter.mountSpatialGame(containerRef.current, {
      roomId,
      sessionToken,
      playerRole,
      onGameEvent,
      onLeave,
    });

    return () => {
      activeAdapter.unmountSpatialGame();
    };
  }, [roomId, sessionToken, playerRole, onGameEvent, onLeave]);

  return (
    <View ref={containerRef} style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>🕹️ بيئة تشغيل اللعبة المكانية (Spatial Runtime)</Text>
        <Text style={styles.badge}>{gameSlug.toUpperCase()}</Text>
      </View>

      <View style={styles.runtimeViewport}>
        <Text style={styles.placeholderText}>
          واجهة العزل الرسومي جاهزة للربط مع محرك اللعبة المكاني (Godot / WebGL).
        </Text>
        <Text style={styles.subtext}>
          الغرفة: {roomId} | الدور: {playerRole}
        </Text>
      </View>

      <View style={styles.controls}>
        <Button
          label="إجراء مكاني تجريبي"
          variant="secondary"
          size="sm"
          onPress={() =>
            adapter.current.sendSpatialAction('interact', {
              coord: [0, 0, 0],
              timestamp: Date.now(),
            })
          }
        />
        <Button
          label="مغادرة الغرفة"
          variant="danger"
          size="sm"
          onPress={onLeave}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaces.background,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: typography.fontFamily.heading,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
  },
  badge: {
    backgroundColor: colors.brand.primary,
    color: colors.text.primary,
    fontSize: typography.fontSize['2xs'],
    fontWeight: typography.fontWeight.bold,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  runtimeViewport: {
    flex: 1,
    minHeight: 200,
    backgroundColor: colors.surfaces.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaces.borderHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  placeholderText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.fontSize.xs,
    color: colors.brand.accent,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
