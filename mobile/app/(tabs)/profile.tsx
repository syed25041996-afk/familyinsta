import React, { useState, useEffect } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	Image,
	StyleSheet,
	Alert
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch, resolveMediaUrl } from '../../src/api/client';
import { t } from '../../src/i18n/strings';

export default function MobileProfileAndAdminScreen() {
	const { user, logout, refreshUser, colors, locale, fontScale } = useAuth();
	const [profileData, setProfileData] = useState<any>(null);
	const [adminData, setAdminData] = useState<any>(null);
	const [editing, setEditing] = useState(false);
	const [displayName, setDisplayName] = useState(user?.displayName || '');
	const [relationshipLabel, setRelationshipLabel] = useState(user?.relationshipLabel || '');
	const [bio, setBio] = useState(user?.bio || '');

	// Admin Invite Form
	const [inviteRelation, setInviteRelation] = useState('Cousin');
	const [inviteRole, setInviteRole] = useState<'member' | 'child'>('member');

	useEffect(() => {
		if (user) {
			loadProfile();
			if (user.role === 'admin') loadAdmin();
		}
	}, [user]);

	async function loadProfile() {
		if (!user) return;
		try {
			const res = await apiFetch(`/api/mobile/profile/${encodeURIComponent(user.username)}`);
			setProfileData(res);
		} catch {
			// ignore
		}
	}

	async function loadAdmin() {
		try {
			const res = await apiFetch('/api/mobile/admin');
			setAdminData(res);
		} catch {
			// ignore
		}
	}

	async function saveProfile() {
		await apiFetch('/api/users/preferences', {
			method: 'PATCH',
			body: JSON.stringify({ displayName, relationshipLabel, bio })
		});
		setEditing(false);
		await refreshUser();
		await loadProfile();
	}

	async function createInvite() {
		await apiFetch('/api/admin', {
			method: 'POST',
			body: JSON.stringify({
				action: 'create_invite',
				assignedRole: inviteRole,
				defaultRelationshipLabel: inviteRelation,
				note: 'Created from mobile admin app'
			})
		});
		await loadAdmin();
	}

	async function triggerBackupNow() {
		try {
			const res = await apiFetch('/api/admin', {
				method: 'POST',
				body: JSON.stringify({ action: 'trigger_backup' })
			});
			Alert.alert('Backup Complete', `Saved ${res.backup?.archiveName} on Proxmox VM!`);
			await loadAdmin();
		} catch (err: any) {
			Alert.alert('Backup Error', err.message);
		}
	}

	if (!user) return null;

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			{/* Profile Card */}
			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<View style={styles.rowBetween}>
					<View style={styles.row}>
						<View style={[styles.avatar, { backgroundColor: colors.brand }]}>
							<Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>
								{user.displayName.slice(0, 1)}
							</Text>
						</View>
						<View>
							<Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 * fontScale }}>
								{user.displayName}
							</Text>
							<Text style={{ color: colors.brand, fontWeight: '700', fontSize: 12 }}>
								🌳 {user.relationshipLabel} · @{user.username}
							</Text>
						</View>
					</View>

					<TouchableOpacity onPress={logout} style={styles.logoutBtn}>
						<Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 12 }}>
							{t(locale, 'logout')}
						</Text>
					</TouchableOpacity>
				</View>

				{user.bio ? (
					<Text style={{ color: colors.subtext, fontSize: 13 * fontScale }}>{user.bio}</Text>
				) : null}

				<TouchableOpacity
					onPress={() => setEditing(!editing)}
					style={[styles.outlineBtn, { borderColor: colors.border }]}
				>
					<Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
						✏️ Edit Profile & Relationship Badge
					</Text>
				</TouchableOpacity>

				{editing && (
					<View style={{ gap: 8, marginTop: 6 }}>
						<TextInput
							value={displayName}
							onChangeText={setDisplayName}
							placeholder="Display Name"
							placeholderTextColor={colors.subtext}
							style={[styles.input, { color: colors.text, borderColor: colors.border }]}
						/>
						<TextInput
							value={relationshipLabel}
							onChangeText={setRelationshipLabel}
							placeholder="Relationship Label (e.g. Nani, Mom, Cousin)"
							placeholderTextColor={colors.subtext}
							style={[styles.input, { color: colors.text, borderColor: colors.border }]}
						/>
						<TextInput
							value={bio}
							onChangeText={setBio}
							placeholder="Bio"
							placeholderTextColor={colors.subtext}
							style={[styles.input, { color: colors.text, borderColor: colors.border }]}
						/>
						<TouchableOpacity
							onPress={saveProfile}
							style={[styles.btn, { backgroundColor: colors.brand }]}
						>
							<Text style={{ color: '#fff', fontWeight: '800' }}>Save Profile</Text>
						</TouchableOpacity>
					</View>
				)}
			</View>

			{/* Saved Story Highlights */}
			{profileData?.highlights?.length > 0 && (
				<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
					<Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
						⭐ Saved Story Highlights
					</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{profileData.highlights.map((hl: any) => (
							<View key={hl.id} style={{ alignItems: 'center', marginRight: 14 }}>
								{hl.coverUrl && (
									<Image
										source={{ uri: resolveMediaUrl(hl.coverUrl) || '' }}
										style={{ width: 58, height: 58, borderRadius: 29 }}
									/>
								)}
								<Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
									{hl.title}
								</Text>
							</View>
						))}
					</ScrollView>
				</View>
			)}

			{/* 3-Column Post Grid */}
			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
					📸 My Shared Posts ({profileData?.posts?.length || 0})
				</Text>
				<View style={styles.grid}>
					{(profileData?.posts || []).map((post: any) => (
						<View key={post.id} style={styles.gridCell}>
							{post.media?.[0] && (
								<Image
									source={{ uri: resolveMediaUrl(post.media[0].thumbUrl) || '' }}
									style={styles.gridImg}
								/>
							)}
						</View>
					))}
				</View>
			</View>

			{/* Embedded Mobile Admin Panel (Visible to Admins) */}
			{user.role === 'admin' && adminData && (
				<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.brand }]}>
					<Text style={{ color: colors.brand, fontWeight: '900', fontSize: 17 }}>
						🛡️ Home Lab Admin Panel (Proxmox VM)
					</Text>

					{/* Storage & Backup */}
					<View style={styles.rowBetween}>
						<Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
							💾 Disk: {adminData.storage.usedMb} MB / {adminData.storage.quotaGb} GB (
							{adminData.storage.mediaCount} files)
						</Text>
						<TouchableOpacity
							onPress={triggerBackupNow}
							style={[styles.btn, { backgroundColor: colors.brand }]}
						>
							<Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>
								📦 Backup Now
							</Text>
						</TouchableOpacity>
					</View>

					{/* Invite Generator */}
					<Text style={{ color: colors.text, fontWeight: '800', fontSize: 13, marginTop: 6 }}>
						Create One-Time Family Invite Code
					</Text>
					<View style={styles.row}>
						<TextInput
							value={inviteRelation}
							onChangeText={setInviteRelation}
							placeholder="Relationship (e.g. Chacha)"
							placeholderTextColor={colors.subtext}
							style={[
								styles.input,
								{ flex: 1, color: colors.text, borderColor: colors.border }
							]}
						/>
						<TouchableOpacity
							onPress={() =>
								setInviteRole(inviteRole === 'member' ? 'child' : 'member')
							}
							style={[styles.outlineBtn, { borderColor: colors.border }]}
						>
							<Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
								Role: {inviteRole.toUpperCase()}
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={createInvite}
							style={[styles.btn, { backgroundColor: colors.brand }]}
						>
							<Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>+ Invite</Text>
						</TouchableOpacity>
					</View>

					{/* Active Invites List */}
					{(adminData.invites || []).slice(0, 5).map((inv: any) => (
						<Text key={inv.id} style={{ color: colors.subtext, fontSize: 12 }}>
							🎟️ <Text style={{ color: colors.text, fontWeight: '800' }}>{inv.code}</Text> —{' '}
							{inv.defaultRelationshipLabel} ({inv.assignedRole})
						</Text>
					))}
				</View>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, paddingTop: 54, gap: 14, paddingBottom: 40 },
	card: { borderRadius: 22, padding: 16, borderWidth: 1, gap: 10 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	avatar: {
		width: 52,
		height: 52,
		borderRadius: 26,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 8
	},
	logoutBtn: { padding: 8 },
	outlineBtn: {
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 9,
		alignItems: 'center'
	},
	btn: {
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 10,
		alignItems: 'center'
	},
	input: {
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 9,
		fontSize: 13
	},
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	gridCell: { width: '31%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden' },
	gridImg: { width: '100%', height: '100%' }
});
