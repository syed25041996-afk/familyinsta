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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../src/context/AuthContext';
import {
	apiFetch,
	uploadMobileMedia,
	resolveMediaUrl,
	getServerUrl,
	getSessionToken
} from '../../src/api/client';
import { t } from '../../src/i18n/strings';

export default function MobileAlbumsScreen() {
	const { colors, locale, fontScale } = useAuth();
	const [albums, setAlbums] = useState<any[]>([]);
	const [showNew, setShowNew] = useState(false);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [downloadingId, setDownloadingId] = useState<string | null>(null);

	useEffect(() => {
		loadAlbums();
	}, []);

	async function loadAlbums() {
		try {
			const res = await apiFetch('/api/albums');
			setAlbums(res.albums || []);
		} catch {
			// ignore
		}
	}

	async function createAlbum() {
		if (!title.trim()) return;
		await apiFetch('/api/albums', {
			method: 'POST',
			body: JSON.stringify({
				action: 'create',
				title,
				description
			})
		});
		setTitle('');
		setDescription('');
		setShowNew(false);
		await loadAlbums();
	}

	async function addPhotosToAlbum(albumId: string) {
		const picked = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ['images', 'videos'],
			allowsMultipleSelection: true
		});
		if (picked.canceled || !picked.assets?.length) return;

		const mediaIds: string[] = [];
		for (const asset of picked.assets) {
			const m = await uploadMobileMedia({
				uri: asset.uri,
				filename: asset.fileName || 'album_photo.jpg',
				mimeType: asset.mimeType || 'image/jpeg'
			});
			mediaIds.push(m.id);
		}
		if (mediaIds.length > 0) {
			await apiFetch('/api/albums', {
				method: 'POST',
				body: JSON.stringify({
					action: 'add_media',
					albumId,
					mediaIds
				})
			});
			await loadAlbums();
		}
	}

	async function downloadAlbumZip(albumId: string, albumTitle: string) {
		setDownloadingId(albumId);
		try {
			const safeName = albumTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'family_album';
			const targetUri = `${FileSystem.documentDirectory}${safeName}_originals.zip`;
			const token = getSessionToken();

			const downloadRes = await FileSystem.downloadAsync(
				`${getServerUrl()}/api/albums/${albumId}/download`,
				targetUri,
				{
					headers: token ? { Authorization: `Bearer ${token}` } : {}
				}
			);

			if (await Sharing.isAvailableAsync()) {
				await Sharing.shareAsync(downloadRes.uri);
			} else {
				Alert.alert('Downloaded', `Saved ZIP to ${downloadRes.uri}`);
			}
		} catch (err: any) {
			Alert.alert('Download Failed', err.message);
		} finally {
			setDownloadingId(null);
		}
	}

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			<View style={styles.rowBetween}>
				<Text style={[styles.title, { color: colors.text, fontSize: 22 * fontScale }]}>
					🖼️ {t(locale, 'albums')}
				</Text>
				<TouchableOpacity
					onPress={() => setShowNew(!showNew)}
					style={[styles.btn, { backgroundColor: colors.brand }]}
				>
					<Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
						+ {t(locale, 'newAlbum')}
					</Text>
				</TouchableOpacity>
			</View>

			{showNew && (
				<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
					<TextInput
						value={title}
						onChangeText={setTitle}
						placeholder="Album Title (e.g. Diwali 2026, Grandma's 80th)"
						placeholderTextColor={colors.subtext}
						style={[styles.input, { color: colors.text, borderColor: colors.border }]}
					/>
					<TextInput
						value={description}
						onChangeText={setDescription}
						placeholder="Description"
						placeholderTextColor={colors.subtext}
						style={[styles.input, { color: colors.text, borderColor: colors.border }]}
					/>
					<TouchableOpacity
						onPress={createAlbum}
						style={[styles.btn, { backgroundColor: colors.brand, alignItems: 'center' }]}
					>
						<Text style={{ color: '#fff', fontWeight: '800' }}>Create Shared Album</Text>
					</TouchableOpacity>
				</View>
			)}

			{albums.map((alb) => (
				<View
					key={alb.id}
					style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
				>
					<View style={styles.rowBetween}>
						<View style={{ flex: 1 }}>
							<Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 * fontScale }}>
								{alb.title}
							</Text>
							<Text style={{ color: colors.subtext, fontSize: 12 }}>
								{alb.itemCount} items · By {alb.owner.displayName} ({alb.owner.relationshipLabel})
							</Text>
						</View>
					</View>

					<View style={styles.row}>
						<TouchableOpacity
							onPress={() => addPhotosToAlbum(alb.id)}
							style={[styles.outlineBtn, { borderColor: colors.border }]}
						>
							<Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
								＋ Add Photos
							</Text>
						</TouchableOpacity>

						<TouchableOpacity
							disabled={downloadingId === alb.id}
							onPress={() => downloadAlbumZip(alb.id, alb.title)}
							style={[styles.btn, { backgroundColor: colors.brand }]}
						>
							<Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
								📦 {downloadingId === alb.id ? 'Saving...' : t(locale, 'downloadZip')}
							</Text>
						</TouchableOpacity>
					</View>

					<View style={styles.grid}>
						{(alb.items || []).map((item: any) => (
							<Image
								key={item.id}
								source={{ uri: resolveMediaUrl(item.media.thumbUrl) || '' }}
								style={styles.gridImg}
							/>
						))}
					</View>
				</View>
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, paddingTop: 54, gap: 14 },
	title: { fontWeight: '800' },
	row: { flexDirection: 'row', gap: 8 },
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	card: { borderRadius: 22, padding: 16, borderWidth: 1, gap: 12 },
	input: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 10,
		fontSize: 14
	},
	btn: {
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 10
	},
	outlineBtn: {
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 10
	},
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	gridImg: { width: 96, height: 96, borderRadius: 12 }
});
