import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { t } from '../../src/i18n/strings';

export default function MobileTabsLayout() {
	const { colors, locale } = useAuth();

	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarStyle: {
					backgroundColor: colors.card,
					borderTopColor: colors.border,
					height: 64,
					paddingBottom: 8,
					paddingTop: 6
				},
				tabBarActiveTintColor: colors.brand,
				tabBarInactiveTintColor: colors.subtext
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: t(locale, 'home'),
					tabBarIcon: () => <Text style={{ fontSize: 18 }}>🏠</Text>
				}}
			/>
			<Tabs.Screen
				name="search"
				options={{
					title: t(locale, 'search'),
					tabBarIcon: () => <Text style={{ fontSize: 18 }}>🔍</Text>
				}}
			/>
			<Tabs.Screen
				name="create"
				options={{
					title: t(locale, 'create'),
					tabBarIcon: () => <Text style={{ fontSize: 20 }}>➕</Text>
				}}
			/>
			<Tabs.Screen
				name="albums"
				options={{
					title: t(locale, 'albums'),
					tabBarIcon: () => <Text style={{ fontSize: 18 }}>🖼️</Text>
				}}
			/>
			<Tabs.Screen
				name="messages"
				options={{
					title: t(locale, 'messages'),
					tabBarIcon: () => <Text style={{ fontSize: 18 }}>💬</Text>
				}}
			/>
			<Tabs.Screen
				name="activity"
				options={{
					title: t(locale, 'activity'),
					tabBarIcon: () => <Text style={{ fontSize: 18 }}>❤️</Text>
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					title: t(locale, 'profile'),
					tabBarIcon: () => <Text style={{ fontSize: 18 }}>👤</Text>
				}}
			/>
		</Tabs>
	);
}
