import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import React from 'react';

import { useColorScheme } from '@/components/useColorScheme';


// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
      
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
      
      }}>
      <Tabs.Screen
        name="Profilescreen"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabBarIcon name= "user" color={color} />,
        
        }}
      />
      
      <Tabs.Screen
        name="Scanscreen"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color }) => <TabBarIcon name= "camera-retro" color={color} />,
        }}
      />
      <Tabs.Screen
        name="Historyscreen"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name= "history" color={color} />,
        }}
      />
     
    </Tabs>
  );
}
