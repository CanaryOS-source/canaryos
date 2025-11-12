import { Stack } from 'expo-router';

export default function FamilyLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen 
        name="join/[code]" 
        options={{ 
          title: 'Join Family',
          headerBackTitle: 'Back'
        }} 
      />
    </Stack>
  );
}
