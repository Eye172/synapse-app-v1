import React from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with the app-wide 0.97 press-scale + fade feedback. */
export function PressableScale({ children, style, disabled, ...rest }: PressableProps & { children?: React.ReactNode }) {
  const pressed = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(pressed.value ? 0.97 : 1, { duration: 110 }) }],
    opacity: withTiming(pressed.value ? 0.88 : 1, { duration: 110 }),
  }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = 1;
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = 0;
        rest.onPressOut?.(e);
      }}
      style={[aStyle, style as never]}
    >
      {children}
    </AnimatedPressable>
  );
}
