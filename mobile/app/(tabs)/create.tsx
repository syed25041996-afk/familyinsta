import React, { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	Image,
	Switch,
	StyleSheet,
	Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch, uploadMobileMedia, resolveMediaUrl } from '../../src/api/client';
import { t } from '../../src/i18n/strings';

export default function MobileCreateScreen() {
	const { user, colors, locale, fontScale } = useAuth();
	const router = useRouter();

	const [mode, setMode] = useState<'post' | 'story'>('post');
	const [uploadedMedia, setUploadedMedia] = useState<any[]>([]);
	const [caption, setCaption] = useState('');
	const [locationName, setLocationName] = useState('');
	const [altText, setAltText] = useState('');
	const [keepExif, setKeepExif] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploading, setUploading] = useState(false);
	const [publishing, setPublishing] = useState(false);

	async function pickFromGalleryOrCamera(useCamera: boolean) {
		const result = useCamera
			? await ImagePicker.launchCameraAsync({
					mediaTypes: ['images', 'videos'],
					quality: 0.92
				})
			: await ImagePicker.launchImageLibraryAsync({
					mediaTypes: ['images', 'videos'],
					allowsMultipleSelection: mode === 'post',
					quality: 0.92
				});

		if (result.canceled || !result.assets?.length) return;

		setUploading(true);
		setUploadProgress(0);
		try {
			for (const asset of result.assets) {
				const media = await uploadMobileMedia({
					uri: asset.uri,
					filename: asset.fileName || `family_${Date.now()}.jpg`,
					mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
					altText: altText || 'Family photo',
					keepExif: user?.role === 'child' ? false : keepExif,
					onProgress: setUploadProgress
				});
				setUploadedMedia((prev) => [...prev, media]);
			}
		} catch (err: any) {
			Alert.alert('Upload Failed', err.message);
		} finally {
			setUploading(false);
		}
	}

	async function handlePublish() {
		if (uploadedMedia.length === 0) {
			Alert.alert('No Media', 'Pick a photo or video from your camera or gallery first.');
			return;
		}
		setPublishing(true);
		try {
			if (mode === 'story') {
				await apiFetch('/api/stories', {
					method: 'POST',
					body: JSON.stringify({
						action: 'create',
						mediaId: uploadedMedia[0].id,
						caption
					})
				});
			} else {
				await apiFetch('/api/posts', {
					method: 'POST',
					body: JSON.stringify({
						action: 'create',
						mediaIds: uploadedMedia.map((m) => m.id),
						caption,
						locationName,
						keepExif: user?.role === 'child' ? false : keepExif
					})
				});
			}
			setUploadedMedia([]);
			setCaption('');
			setLocationName('');
			router.replace('/(tabs)');
		} catch (err: any) {
			Alert.alert('Error', err.message);
		} finally {
			setPublishing(false);
		}
	}

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			<Text style={[styles.title, { color: colors.text, fontSize: 22 * fontScale }]}>
				➕ {t(locale, 'create')}
			</Text>

			{/* Mode Toggle: Feed Post vs 24h Story */}
			<View style={[styles.modeRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<TouchableOpacity
					onPress={() => setMode('post')}
					style={[
						styles.modeBtn,
						mode === 'post' && { backgroundColor: colors.brand }
					]}
				>
					<Text style={{ color: mode === 'post' ? '#fff' : colors.text, fontWeight: '800' }}>
						🖼️ Feed Post
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => setMode('story')}
					style={[
						styles.modeBtn,
						mode === 'story' && { backgroundColor: colors.brand }
					]}
				>
					<Text style={{ color: mode === 'story' ? '#fff' : colors.text, fontWeight: '800' }}>
						⏱️ 24h Story
					</Text>
				</TouchableOpacity>
			</View>

			{/* Camera & Gallery Picker Buttons */}
			<View style={styles.row}>
				<TouchableOpacity
					onPress={() => pickFromGalleryOrCamera(false)}
					style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
				>
					<Text style={{ fontSize: 24 }}>🖼️</Text>
					<Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
						Pick from Gallery
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					onPress={() => pickFromGalleryOrCamera(true)}
					style={[styles.pickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
				>
					<Text style={{ fontSize: 24 }}>📷</Text>
					<Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
						Take Photo / Video
					</Text>
				</TouchableOpacity>
			</View>

			{uploading && (
				<View style={styles.progressBox}>
					<Text style={{ color: colors.brand, fontWeight: '700' }}>
						Uploading & generating WebP/AVIF on Home Lab... {uploadProgress}%
					</Text>
				</View>
			)}

			{uploadedMedia.length > 0 && (
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{uploadedMedia.map((m) => (
						<Image
							key={m.id}
							source={{ uri: resolveMediaUrl(m.thumbUrl) || '' }}
							style={styles.previewImg}
						/>
					))}
				</ScrollView>
			)}

			{/* Form Inputs */}
			<View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
				<TextInput
					value={caption}
					onChangeText={setCaption}
					multiline
					placeholder={t(locale, 'writeCaption')}
					placeholderTextColor={colors.subtext}
					style={[
						styles.input,
						{ height: 84, color: colors.text, borderColor: colors.border }
					]}
				/>

				{mode === 'post' && (
					<TextInput
						value={locationName}
						onChangeText={setLocationName}
						placeholder={t(locale, 'locationOptional')}
						placeholderTextColor={colors.subtext}
						style={[styles.input, { color: colors.text, borderColor: colors.border }]}
					/>
				)}

				<TextInput
					value={altText}
					onChangeText={setAltText}
					placeholder={t(locale, 'altTextPrompt')}
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>

				{user?.role !== 'child' && (
					<View style={styles.rowBetween}>
						<Text style={{ color: colors.text, fontSize: 13 }}>
							{t(locale, 'keepExifLabel')}
						</Text>
						<Switch value={keepExif} onValueChange={setKeepExif} />
					</View>
				)}

				<TouchableOpacity
					disabled={publishing || uploading}
					onPress={handlePublish}
					style={[styles.publishBtn, { backgroundColor: colors.brand }]}
				>
					<Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
						{publishing
							? 'Sharing...'
							: mode === 'story'
								? t(locale, 'publishStory')
								: t(locale, 'publishPost')}
					</Text>
				</TouchableOpacity>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, paddingTop: 54, gap: 14 },
	title: { fontWeight: '800' },
	modeRow: {
		flexDirection: 'row',
		borderRadius: 16,
		borderWidth: 1,
		padding: 4
	},
	modeBtn: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 12,
		alignItems: 'center'
	},
	row: { flexDirection: 'row', gap: 10 },
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	pickBtn: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 18,
		padding: 18,
		alignItems: 'center',
		gap: 6
	},
	progressBox: { padding: 10, alignItems: 'center' },
	previewImg: { width: 96, height: 96, borderRadius: 14, marginRight: 8 },
	card: { borderRadius: 22, padding: 16, borderWidth: 1, gap: 12 },
	input: {
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 11,
		fontSize: 14
	},
	publishBtn: {
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: 'center'
	}
});
