import React, { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch } from '../../src/api/client';

export default function MobileInviteSignupScreen() {
	const params = useLocalSearchParams<{ code?: string }>();
	const router = useRouter();
	const { loginWithToken, colors, fontScale } = useAuth();

	const [inviteCode, setInviteCode] = useState(params.code || 'DIWALI-2026');
	const [displayName, setDisplayName] = useState('');
	const [username, setUsername] = useState('');
	const [email, setEmail] = useState('');
	const [relationshipLabel, setRelationshipLabel] = useState('Family');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);

	async function handleSignup() {
		if (!inviteCode || !displayName || !username || !email || password.length < 8) {
			Alert.alert(
				'Required Fields',
				'Please fill all fields and choose a password (min 8 characters).'
			);
			return;
		}
		setLoading(true);
		try {
			const res = await apiFetch('/api/auth/signup', {
				method: 'POST',
				body: JSON.stringify({
					inviteCode,
					displayName,
					username,
					email,
					relationshipLabel,
					password
				})
			});
			await loginWithToken(res.sessionToken, res.user);
			router.replace('/(tabs)');
		} catch (err: any) {
			Alert.alert('Signup Error', err.message || 'Could not claim invite code.');
		} finally {
			setLoading(false);
		}
	}

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			<TouchableOpacity onPress={() => router.back()}>
				<Text style={{ color: colors.brand, fontWeight: '700' }}>← Back to Login</Text>
			</TouchableOpacity>

			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<Text style={[styles.title, { color: colors.text, fontSize: 21 * fontScale }]}>
					🎟️ Join Family Vault
				</Text>
				<Text style={{ color: colors.subtext, fontSize: 13 }}>
					Claim your one-time family invite code to create your private mobile account.
				</Text>

				<TextInput
					value={inviteCode}
					onChangeText={setInviteCode}
					autoCapitalize="characters"
					placeholder="Invite Code (e.g. DIWALI-2026)"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TextInput
					value={displayName}
					onChangeText={setDisplayName}
					placeholder="Your Full / Family Name (e.g. Meera Mausi)"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TextInput
					value={username}
					onChangeText={setUsername}
					autoCapitalize="none"
					placeholder="Username (e.g. meera)"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TextInput
					value={relationshipLabel}
					onChangeText={setRelationshipLabel}
					placeholder="Family Relationship (e.g. Nani, Chacha, Cousin)"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TextInput
					value={email}
					onChangeText={setEmail}
					autoCapitalize="none"
					keyboardType="email-address"
					placeholder="Email Address"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TextInput
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					placeholder="Create Password (min 8 chars)"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>

				<TouchableOpacity
					disabled={loading}
					onPress={handleSignup}
					style={[styles.btn, { backgroundColor: colors.brand }]}
				>
					<Text style={styles.btnText}>
						{loading ? 'Creating Account...' : 'Create Family Account'}
					</Text>
				</TouchableOpacity>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 20, paddingTop: 56, gap: 16 },
	card: { borderRadius: 22, padding: 18, borderWidth: 1, gap: 12 },
	title: { fontWeight: '800' },
	input: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 11,
		fontSize: 14
	},
	btn: {
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: 'center'
	},
	btnText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
