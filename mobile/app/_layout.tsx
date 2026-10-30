import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

function RootNavigator() {
	const { user, loading, themeMode } = useAuth();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		if (loading) return;
		const inAuthGroup = segments[0] === '(auth)';
		if (!user && !inAuthGroup) {
			router.replace('/(auth)/login');
		} else if (user && inAuthGroup) {
			router.replace('/(tabs)');
		}
	}, [user, loading, segments]);

	return (
		<>
			<StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Screen name="(auth)/login" />
				<Stack.Screen name="(auth)/invite" />
				<Stack.Screen name="(tabs)" />
			</Stack>
		</>
	);
}

export default function RootLayout() {
	return (
		<AuthProvider>
			<RootNavigator />
		</AuthProvider>
	);
}
