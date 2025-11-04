import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const palette = {
  background: '#180636ff', // พื้นหลังแท็บ
  pillActive: 'rgba(139, 92, 246, 0.22)',
  scanInactive: 'rgba(139, 92, 246, 0.18)',
  scanActive: '#5014beff',
  scanBorderInactive: 'rgba(255, 255, 255, 0.38)',
  scanBorderActive: '#FFFFFF',
  shadow: '#6D28D9',
};

/* ─────────────── Animation Hook ─────────────── */
function useScaleAnimation(target: number) {
  const animatedValue = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: target,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [target]);
  return animatedValue;
}

/* ─────────────── Icon ซ้าย/ขวา ─────────────── */
function RegularTabIcon({
  name,
  color,
  focused,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  focused: boolean;
}) {
  const scale = useScaleAnimation(focused ? 1 : 0.92);
  return (
    <Animated.View
      style={[
        styles.iconPill,
        focused && styles.iconPillActive,
        { transform: [{ scale }] },
      ]}
    >
      <FontAwesome name={name} size={26} color={color} />
    </Animated.View>
  );
}

/* ─────────────── Icon กลาง (Scan) ─────────────── */
function ScanTabIcon({ focused }: { focused: boolean }) {
  const scale = useScaleAnimation(focused ? 1.08 : 1);
  return (
    <Animated.View
      style={[
        styles.floatingScanButton,
        { transform: [{ scale }] },
      ]}
    >
      <Ionicons name="scan" size={30} color="#fff" />
    </Animated.View>
  );
}

/* ─────────────── Main Layout ─────────────── */
export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, width: '100%', height: '100%' }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarActiveTintColor: '#F4F3FF',
          tabBarInactiveTintColor: '#A5A1C4',
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            ...styles.tabBar,
            bottom: insets.bottom > 0
              ? insets.bottom / 2  // ✅ Fix center of safe area
              : 20,                     // ✅ Fallback for Android/older phones
          },
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen
          name="Profilescreen"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <RegularTabIcon name="user" color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="Scanscreen"
          options={{
            tabBarIcon: ({ focused }) => <ScanTabIcon focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="Historyscreen"
          options={{
            tabBarIcon: ({ color, focused }) => (
              <RegularTabIcon name="history" color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

/* ─────────────── Styles ─────────────── */
const styles = StyleSheet.create({
  tabBar: {

    position: 'absolute',
    margin: 40,
    bottom: 1,
    height: 60,
    borderRadius: 28,
    justifyContent : 'space-evenly',
    backgroundColor: palette.background,
    shadowColor: palette.shadow,
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
    margin: 15
  },
  iconPill: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconPillActive: {
    backgroundColor: palette.pillActive,
  },
  floatingScanButton: {
    position: 'absolute',
    top: -20,
    width: 60,
    height: 60,
    borderRadius: 27,
    backgroundColor: palette.scanActive,
    borderWidth: 2,
    borderColor: '#c0bebeff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
});





