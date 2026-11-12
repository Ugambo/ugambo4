import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../tokens';
import { nearestSnap } from './sheet-math';

/**
 * Draggable bottom sheet over a full-screen map. Two resting heights; drag the
 * handle (or tap it) to switch. Built on React Native's Animated and
 * PanResponder only, so no extra native modules are needed.
 */
export function BottomSheet({
  collapsedHeight,
  expandedHeight,
  expanded,
  onExpandedChange,
  handleLabel,
  children,
}: {
  collapsedHeight: number;
  expandedHeight: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Accessibility label for the drag handle, e.g. "Show more". */
  handleLabel: string;
  children: ReactNode;
}) {
  const travel = Math.max(0, expandedHeight - collapsedHeight);
  const translateY = useRef(new Animated.Value(expanded ? 0 : travel)).current;
  const [current, setCurrent] = useState(expanded ? 0 : travel);
  const start = useRef(current);

  useEffect(() => {
    const target = expanded ? 0 : travel;
    setCurrent(target);
    Animated.spring(translateY, { toValue: target, useNativeDriver: true, bounciness: 4 }).start();
  }, [expanded, travel, translateY]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          start.current = current;
        },
        onPanResponderMove: (_e, g) => {
          translateY.setValue(Math.min(travel, Math.max(0, start.current + g.dy)));
        },
        onPanResponderRelease: (_e, g) => {
          const isExpanded = nearestSnap(start.current + g.dy, g.vy, travel) === 0;
          onExpandedChange(isExpanded);
          const target = isExpanded ? 0 : travel;
          setCurrent(target);
          Animated.spring(translateY, {
            toValue: target,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        },
      }),
    [current, travel, translateY, onExpandedChange],
  );

  return (
    <Animated.View style={[styles.sheet, { height: expandedHeight, transform: [{ translateY }] }]}>
      <View {...responder.panHandlers}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={handleLabel}
          accessibilityState={{ expanded }}
          onPress={() => onExpandedChange(!expanded)}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </Pressable>
      </View>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handleArea: { alignItems: 'center', paddingVertical: spacing[3], minHeight: 32 },
  handle: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.grey[300] },
  content: { flex: 1, paddingHorizontal: spacing[4], paddingBottom: spacing[4], gap: spacing[3] },
});
