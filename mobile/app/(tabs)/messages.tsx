import React, { useState, useEffect } from 'react';
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ScrollView,
	Image,
	StyleSheet
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import {
	apiFetch,
	uploadMobileMedia,
	resolveMediaUrl,
	createMobileWebSocket
} from '../../src/api/client';
import { t } from '../../src/i18n/strings';

export default function MobileMessagesScreen() {
	const { user, colors, locale, fontScale } = useAuth();
	const [conversations, setConversations] = useState<any[]>([]);
	const [activeConvId, setActiveConvId] = useState<string | null>(null);
	const [messages, setMessages] = useState<any[]>([]);
	const [text, setText] = useState('');

	useEffect(() => {
		loadChat();
		const ws = createMobileWebSocket((ev) => {
			if (ev.type === 'chat:message' || ev.type === 'chat:read') {
				loadChat(activeConvId || undefined);
			}
		});
		return () => ws?.close();
	}, [activeConvId]);

	async function loadChat(convId?: string) {
		try {
			const res = await apiFetch(
				`/api/conversations${convId ? `?conversationId=${encodeURIComponent(convId)}` : ''}`
			);
			setConversations(res.conversations || []);
			setActiveConvId(res.activeConversationId || null);
			setMessages(res.messages || []);

			if (res.activeConversationId && res.messages?.length > 0) {
				const lastId = res.messages[res.messages.length - 1].id;
				await apiFetch('/api/conversations', {
					method: 'POST',
					body: JSON.stringify({
						action: 'read',
						conversationId: res.activeConversationId,
						lastMessageId: lastId
					})
				}).catch(() => {});
			}
		} catch {
			// ignore
		}
	}

	async function sendMessage(mediaId?: string) {
		if (!activeConvId || (!text.trim() && !mediaId)) return;
		await apiFetch('/api/conversations', {
			method: 'POST',
			body: JSON.stringify({
				action: 'send',
				conversationId: activeConvId,
				body: text,
				mediaId: mediaId || null
			})
		});
		setText('');
		await loadChat(activeConvId);
	}

	async function sendPhotoInChat() {
		const picked = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ['images', 'videos']
		});
		if (picked.canceled || !picked.assets?.[0]) return;
		const asset = picked.assets[0];
		const uploaded = await uploadMobileMedia({
			uri: asset.uri,
			filename: asset.fileName || 'chat_photo.jpg',
			mimeType: asset.mimeType || 'image/jpeg'
		});
		await sendMessage(uploaded.id);
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.bg }]}>
			<View style={styles.topSection}>
				<Text style={[styles.title, { color: colors.text, fontSize: 22 * fontScale }]}>
					💬 {t(locale, 'messages')}
				</Text>

				<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
					{conversations.map((conv) => (
						<TouchableOpacity
							key={conv.id}
							onPress={() => loadChat(conv.id)}
							style={[
								styles.convPill,
								{
									backgroundColor:
										activeConvId === conv.id ? colors.brand : colors.card,
									borderColor: colors.border
								}
							]}
						>
							<Text
								style={{
									color: activeConvId === conv.id ? '#fff' : colors.text,
									fontWeight: '700',
									fontSize: 12
								}}
							>
								{conv.type === 'group' ? '👨‍👩‍👧‍👦 ' : '💬 '}
								{conv.title}
							</Text>
						</TouchableOpacity>
					))}
				</ScrollView>
			</View>

			<ScrollView
				style={styles.messagesList}
				contentContainerStyle={{ padding: 16, gap: 10 }}
			>
				{messages.map((msg) => {
					const isMine = msg.sender.id === user?.id;
					return (
						<View
							key={msg.id}
							style={{ alignItems: isMine ? 'flex-end' : 'flex-start' }}
						>
							<Text style={{ color: colors.subtext, fontSize: 11, marginBottom: 2 }}>
								{msg.sender.displayName} ({msg.sender.relationshipLabel})
							</Text>
							<View
								style={[
									styles.bubble,
									{
										backgroundColor: isMine ? colors.brand : colors.card,
										borderColor: colors.border
									}
								]}
							>
								{msg.media && (
									<Image
										source={{ uri: resolveMediaUrl(msg.media.displayUrl) || '' }}
										style={styles.chatImg}
									/>
								)}
								{msg.body ? (
									<Text
										style={{
											color: isMine ? '#fff' : colors.text,
											fontSize: 14 * fontScale
										}}
									>
										{msg.body}
									</Text>
								) : null}
							</View>
							{msg.seenBy?.length > 0 && (
								<Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>
									✓✓ Seen by {msg.seenBy.join(', ')}
								</Text>
							)}
						</View>
					);
				})}
			</ScrollView>

			<View style={[styles.composer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
				<TouchableOpacity onPress={sendPhotoInChat} style={styles.camBtn}>
					<Text style={{ fontSize: 18 }}>📷</Text>
				</TouchableOpacity>
				<TextInput
					value={text}
					onChangeText={setText}
					placeholder="Write a message..."
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TouchableOpacity
					onPress={() => sendMessage()}
					style={[styles.sendBtn, { backgroundColor: colors.brand }]}
				>
					<Text style={{ color: '#fff', fontWeight: '800' }}>Send</Text>
				</TouchableOpacity>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	topSection: { paddingHorizontal: 16, paddingTop: 54, paddingBottom: 8 },
	title: { fontWeight: '800' },
	convPill: {
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 16,
		borderWidth: 1,
		marginRight: 8
	},
	messagesList: { flex: 1 },
	bubble: {
		maxWidth: '80%',
		padding: 12,
		borderRadius: 18,
		borderWidth: 1,
		gap: 6
	},
	chatImg: { width: 190, height: 140, borderRadius: 12 },
	composer: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 12,
		borderTopWidth: 1,
		gap: 8
	},
	camBtn: { padding: 8 },
	input: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 10,
		fontSize: 14
	},
	sendBtn: {
		borderRadius: 14,
		paddingHorizontal: 16,
		paddingVertical: 11
	}
});
