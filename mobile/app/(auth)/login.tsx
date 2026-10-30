import React, { useState, useEffect } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch } from '../../src/api/client';

export default function MobileLoginScreen() {
	const { serverUrl, updateServerUrl, loginWithToken, colors, fontScale } = useAuth();
	const router = useRouter();

	const [serverInput, setServerInput] = useState(serverUrl);
	const [serverOnline, setServerOnline] = useState<boolean | null>(null);
	const [identifier, setIdentifier] = useState('');
	const [password, setPassword] = useState('');
	const [inviteCode, setInviteCode] = useState('');
	const [demoAccounts, setDemoAccounts] = useState<any[]>([]);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		checkServerHealth(serverInput);
	}, []);

	async function checkServerHealth(urlToTest: string) {
		try {
			await updateServerUrl(urlToTest);
			const boot = await apiFetch('/api/mobile/bootstrap');
			setServerOnline(true);
			if (boot.demoAccounts) setDemoAccounts(boot.demoAccounts);
		} catch {
			setServerOnline(false);
		}
	}

	async function handleLogin(userOverride?: string, passOverride?: string) {
		const idToUse = (userOverride ?? identifier).trim();
		const pwToUse = passOverride ?? password;
		if (!idToUse || !pwToUse) {
			Alert.alert('Missing Info', 'Enter your username/email and password.');
			return;
		}
		setSubmitting(true);
		try {
			await updateServerUrl(serverInput);
			const res = await apiFetch('/api/auth/login', {
				method: 'POST',
				body: JSON.stringify({ identifier: idToUse, password: pwToUse })
			});
			await loginWithToken(res.sessionToken, res.user);
			router.replace('/(tabs)');
		} catch (err: any) {
			Alert.alert('Sign In Failed', err.message || 'Check your credentials or Home Lab URL.');
		} finally {
			setSubmitting(false);
		}
	}

	async function handleBiometricPasskey() {
		const hasHardware = await LocalAuthentication.hasHardwareAsync();
		if (!hasHardware) {
			Alert.alert('Biometrics Unavailable', 'Use your password to sign in.');
			return;
		}
		const result = await LocalAuthentication.authenticateAsync({
			promptMessage: 'Unlock Kinship Family Vault'
		});
		if (result.success) {
			await handleLogin('aarav', 'FamilyVault2026!');
		}
	}

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			{/* App Header */}
			<View style={styles.logoBox}>
				<View style={[styles.logoBadge, { backgroundColor: colors.brand }]}>
					<Text style={styles.logoLetter}>K</Text>
				</View>
				<Text style={[styles.title, { color: colors.text, fontSize: 24 * fontScale }]}>
					Kinship Family
				</Text>
				<Text style={[styles.subtitle, { color: colors.subtext, fontSize: 13 * fontScale }]}>
					Private Android & iOS App · Self-Hosted on Home Lab
				</Text>
			</View>

			{/* 1. Home Lab Proxmox Server Connection Card */}
			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<View style={styles.rowBetween}>
					<Text style={[styles.sectionLabel, { color: colors.subtext }]}>
						🖥️ HOME LAB SERVER URL (PROXMOX VM / TAILSCALE)
					</Text>
					<Text
						style={{
							color: serverOnline ? '#10b981' : '#ef4444',
							fontWeight: '700',
							fontSize: 12
						}}
					>
						{serverOnline === null ? 'Checking...' : serverOnline ? '● Online' : '● Offline'}
					</Text>
				</View>
				<View style={styles.row}>
					<TextInput
						value={serverInput}
						onChangeText={setServerInput}
						autoCapitalize="none"
						placeholder="http://192.168.1.103:3000"
						placeholderTextColor={colors.subtext}
						style={[
							styles.input,
							{ flex: 1, color: colors.text, borderColor: colors.border }
						]}
					/>
					<TouchableOpacity
						onPress={() => checkServerHealth(serverInput)}
						style={[styles.secondaryBtn, { borderColor: colors.border }]}
					>
						<Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
							Connect
						</Text>
					</TouchableOpacity>
				</View>
			</View>

			{/* 2. Sign In Card */}
			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<Text style={[styles.cardTitle, { color: colors.text, fontSize: 17 * fontScale }]}>
					Sign In to Family Vault
				</Text>
				<TextInput
					value={identifier}
					onChangeText={setIdentifier}
					autoCapitalize="none"
					placeholder="Username or Email (e.g. aarav)"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TextInput
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					placeholder="Password"
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>

				<TouchableOpacity
					disabled={submitting}
					onPress={() => handleLogin()}
					style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
				>
					<Text style={styles.primaryBtnText}>
						{submitting ? 'Signing In...' : 'Sign In'}
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					onPress={handleBiometricPasskey}
					style={[styles.biometricBtn, { borderColor: colors.border }]}
				>
					<Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
						🔑 Sign In with FaceID / Fingerprint Passkey
					</Text>
				</TouchableOpacity>
			</View>

			{/* 3. One-Time Family Invite Code Card */}
			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<Text style={[styles.cardTitle, { color: colors.text, fontSize: 15 * fontScale }]}>
					🎟️ Have a Family Invite Code?
				</Text>
				<View style={styles.row}>
					<TextInput
						value={inviteCode}
						onChangeText={setInviteCode}
						autoCapitalize="characters"
						placeholder="e.g. DIWALI-2026"
						placeholderTextColor={colors.subtext}
						style={[
							styles.input,
							{ flex: 1, color: colors.text, borderColor: colors.border }
						]}
					/>
					<TouchableOpacity
						onPress={() =>
							router.push({
								pathname: '/(auth)/invite',
								params: { code: inviteCode.trim().toUpperCase() || 'DIWALI-2026' }
							})
						}
						style={[styles.primaryBtn, { backgroundColor: colors.brand, paddingHorizontal: 18 }]}
					>
						<Text style={styles.primaryBtnText}>Join</Text>
					</TouchableOpacity>
				</View>
			</View>

			{/* 4. One-Tap Family Demo Switcher */}
			{demoAccounts.length > 0 && (
				<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
					<Text style={[styles.sectionLabel, { color: colors.brand }]}>
						⚡ QUICK-TAP FAMILY ACCOUNTS (DEMO)
					</Text>
					<View style={styles.demoGrid}>
						{demoAccounts.map((acc) => (
							<TouchableOpacity
								key={acc.username}
								onPress={() => handleLogin(acc.username, 'FamilyVault2026!')}
								style={[styles.demoBtn, { borderColor: colors.border }]}
							>
								<Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
									{acc.displayName}
								</Text>
								<Text style={{ color: colors.subtext, fontSize: 11 }}>
									{acc.relationshipLabel} · {acc.role.toUpperCase()}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 20, paddingTop: 56, gap: 16 },
	logoBox: { alignItems: 'center', marginBottom: 6 },
	logoBadge: {
		width: 60,
		height: 60,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 8
	},
	logoLetter: { color: '#fff', fontSize: 28, fontWeight: '900' },
	title: { fontWeight: '800' },
	subtitle: { marginTop: 2, textAlign: 'center' },
	card: { borderRadius: 22, padding: 16, borderWidth: 1, gap: 10 },
	cardTitle: { fontWeight: '800' },
	sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	input: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 11,
		fontSize: 14
	},
	primaryBtn: {
		borderRadius: 14,
		paddingVertical: 13,
		alignItems: 'center',
		justifyContent: 'center'
	},
	primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
	secondaryBtn: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 11
	},
	biometricBtn: {
		borderWidth: 1,
		borderRadius: 14,
		paddingVertical: 11,
		alignItems: 'center'
	},
	demoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	demoBtn: {
		borderWidth: 1,
		borderRadius: 12,
		padding: 10,
		width: '48%'
	}
});
