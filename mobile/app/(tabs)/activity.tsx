import React, { useState, useEffect } from 'react';
import {
	View,
	Text,
	ScrollView,
	Switch,
	TouchableOpacity,
	StyleSheet,
	Alert
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch } from '../../src/api/client';
import { t } from '../../src/i18n/strings';

export default function MobileActivityScreen() {
	const { colors, locale, fontScale } = useAuth();
	const [items, setItems] = useState<any[]>([]);
	const [prefs, setPrefs] = useState({
		likes: true,
		comments: true,
		mentions: true,
		stories: true,
		messages: true,
		webPushEnabled: true
	});

	useEffect(() => {
		loadActivity();
	}, []);

	async function loadActivity() {
		try {
			const res = await apiFetch('/api/notifications');
			setItems(res.notifications || []);
			if (res.preferences) setPrefs(res.preferences);
			await apiFetch('/api/notifications', {
				method: 'POST',
				body: JSON.stringify({ action: 'mark_read' })
			});
		} catch {
			// ignore
		}
	}

	async function togglePref(key: keyof typeof prefs) {
		const next = { ...prefs, [key]: !prefs[key] };
		setPrefs(next);
		await apiFetch('/api/notifications', {
			method: 'POST',
			body: JSON.stringify({
				action: 'update_preferences',
				...next
			})
		}).catch(() => {});
	}

	async function enableMobilePush() {
		const { status } = await Notifications.requestPermissionsAsync();
		if (status !== 'granted') {
			Alert.alert('Permission Needed', 'Enable notifications in your phone Settings.');
			return;
		}
		Alert.alert('Push Enabled', 'Native mobile push notifications are active!');
	}

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			<View style={styles.rowBetween}>
				<Text style={[styles.title, { color: colors.text, fontSize: 22 * fontScale }]}>
					❤️ {t(locale, 'activity')}
				</Text>
				<TouchableOpacity
					onPress={enableMobilePush}
					style={[styles.btn, { backgroundColor: colors.brand }]}
				>
					<Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
						🔔 Enable Push
					</Text>
				</TouchableOpacity>
			</View>

			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				{items.length === 0 ? (
					<Text style={{ color: colors.subtext, textAlign: 'center', padding: 16 }}>
						No recent family notifications yet.
					</Text>
				) : (
					items.map((n) => (
						<View key={n.id} style={styles.notifRow}>
							<Text style={{ color: colors.text, fontSize: 13.5 * fontScale }}>
								• {n.messageText}
							</Text>
							<Text style={{ color: colors.subtext, fontSize: 11 }}>
								{new Date(n.createdAt).toLocaleString()}
							</Text>
						</View>
					))
				)}
			</View>

			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
					Per-User Notification Settings
				</Text>
				{(
					[
						['likes', 'Likes & Emoji Reactions'],
						['comments', 'Threaded Comments & Replies'],
						['mentions', '@Mentions'],
						['stories', 'New 24-Hour Family Stories'],
						['messages', 'Direct & Group Chat Messages'],
						['webPushEnabled', 'Mobile Push Notifications']
					] as const
				).map(([key, label]) => (
					<View key={key} style={styles.rowBetween}>
						<Text style={{ color: colors.text, fontSize: 13 }}>{label}</Text>
						<Switch value={prefs[key]} onValueChange={() => togglePref(key)} />
					</View>
				))}
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, paddingTop: 54, gap: 14 },
	title: { fontWeight: '800' },
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	btn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
	card: { borderRadius: 22, padding: 16, borderWidth: 1, gap: 12 },
	notifRow: { paddingVertical: 6, gap: 2 }
});
