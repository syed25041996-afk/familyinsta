import React, { useState, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	FlatList,
	ScrollView,
	Image,
	TouchableOpacity,
	TextInput,
	Modal,
	RefreshControl,
	StyleSheet,
	Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch, resolveMediaUrl } from '../../src/api/client';
import { t, LOCALE_NAMES, type LocaleCode } from '../../src/i18n/strings';

const EMOJIS = ['❤️', '😂', '😮', '🙏', '🎉'];

export default function MobileHomeScreen() {
	const {
		user,
		colors,
		locale,
		fontScale,
		textScaleKey,
		cycleTextScale,
		toggleTheme,
		changeLocale,
		themeMode
	} = useAuth();
	const router = useRouter();

	const [feed, setFeed] = useState<any[]>([]);
	const [storiesTray, setStoriesTray] = useState<any[]>([]);
	const [memories, setMemories] = useState<any[]>([]);
	const [refreshing, setRefreshing] = useState(false);

	// Story Viewer Modal State
	const [activeStoryGroupIdx, setActiveStoryGroupIdx] = useState<number | null>(null);
	const [activeStoryItemIdx, setActiveStoryItemIdx] = useState(0);
	const [showViewers, setShowViewers] = useState(false);

	// Comments & Reply State
	const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
	const [replyTargets, setReplyTargets] = useState<
		Record<string, { id: string; username: string } | null>
	>({});
	const [slideIndices, setSlideIndices] = useState<Record<string, number>>({});

	const loadHomeData = useCallback(async () => {
		try {
			const res = await apiFetch('/api/mobile/bootstrap');
			if (res.authenticated) {
				setFeed(res.feed || []);
				setStoriesTray(res.storiesTray || []);
				setMemories(res.memories || []);
			}
		} catch {
			// ignore
		}
	}, []);

	useEffect(() => {
		loadHomeData();
	}, [loadHomeData]);

	async function onRefresh() {
		setRefreshing(true);
		await loadHomeData();
		setRefreshing(false);
	}

	async function openStoryGroup(idx: number) {
		setActiveStoryGroupIdx(idx);
		setActiveStoryItemIdx(0);
		setShowViewers(false);
		const firstStory = storiesTray[idx]?.stories?.[0];
		if (firstStory) {
			await apiFetch('/api/stories', {
				method: 'POST',
				body: JSON.stringify({ action: 'view', storyId: firstStory.id })
			}).catch(() => {});
		}
	}

	async function advanceStory() {
		if (activeStoryGroupIdx === null) return;
		const group = storiesTray[activeStoryGroupIdx];
		if (!group) return;

		if (activeStoryItemIdx + 1 < group.stories.length) {
			const nextIdx = activeStoryItemIdx + 1;
			setActiveStoryItemIdx(nextIdx);
			await apiFetch('/api/stories', {
				method: 'POST',
				body: JSON.stringify({ action: 'view', storyId: group.stories[nextIdx].id })
			}).catch(() => {});
		} else if (activeStoryGroupIdx + 1 < storiesTray.length) {
			await openStoryGroup(activeStoryGroupIdx + 1);
		} else {
			setActiveStoryGroupIdx(null);
			await loadHomeData();
		}
	}

	async function saveStoryToHighlights(storyId: string) {
		try {
			await apiFetch('/api/stories', {
				method: 'POST',
				body: JSON.stringify({
					action: 'save_highlight',
					storyId,
					title: 'Highlights'
				})
			});
			Alert.alert('Saved', 'Story added to your Profile Highlights!');
		} catch (err: any) {
			Alert.alert('Error', err.message);
		}
	}

	async function toggleReaction(postId: string, emoji: string) {
		await apiFetch('/api/posts', {
			method: 'POST',
			body: JSON.stringify({ action: 'react', postId, emoji })
		}).catch(() => {});
		await loadHomeData();
	}

	async function sendComment(postId: string) {
		const text = (commentInputs[postId] || '').trim();
		if (!text) return;
		const replyTo = replyTargets[postId];
		await apiFetch('/api/posts', {
			method: 'POST',
			body: JSON.stringify({
				action: 'comment',
				postId,
				body: text,
				parentCommentId: replyTo?.id || null
			})
		}).catch(() => {});
		setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
		setReplyTargets((prev) => ({ ...prev, [postId]: null }));
		await loadHomeData();
	}

	async function deletePost(postId: string) {
		await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' }).catch(() => {});
		await loadHomeData();
	}

	async function reportPost(postId: string) {
		await apiFetch('/api/posts', {
			method: 'POST',
			body: JSON.stringify({
				action: 'report',
				targetType: 'post',
				targetId: postId,
				reason: 'Reported from mobile app'
			})
		}).catch(() => {});
		Alert.alert('Reported', 'Sent to Family Admins for review.');
	}

	const locales: LocaleCode[] = ['en', 'hi', 'kn', 'ta'];
	function cycleLocale() {
		const next = locales[(locales.indexOf(locale) + 1) % locales.length];
		changeLocale(next);
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.bg }]}>
			{/* Top App Header with Accessibility & Language Quick Toggles */}
			<View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
				<View style={styles.row}>
					<View style={[styles.logoBadge, { backgroundColor: colors.brand }]}>
						<Text style={styles.logoText}>K</Text>
					</View>
					<View>
						<Text style={[styles.headerTitle, { color: colors.text, fontSize: 18 * fontScale }]}>
							{t(locale, 'appName')}
						</Text>
						<Text style={{ color: colors.subtext, fontSize: 11 }}>
							{t(locale, 'familyVault')}
						</Text>
					</View>
				</View>

				<View style={styles.row}>
					<TouchableOpacity
						onPress={cycleLocale}
						style={[styles.pillBtn, { borderColor: colors.border }]}
					>
						<Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
							🌐 {LOCALE_NAMES[locale]}
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={cycleTextScale}
						style={[styles.pillBtn, { borderColor: colors.border }]}
					>
						<Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>
							{textScaleKey === 'normal' ? 'A' : textScaleKey === 'large' ? 'A+' : 'A++'}
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={toggleTheme}
						style={[styles.pillBtn, { borderColor: colors.border }]}
					>
						<Text style={{ fontSize: 13 }}>{themeMode === 'dark' ? '☀️' : '🌙'}</Text>
					</TouchableOpacity>
				</View>
			</View>

			{user?.role === 'child' && (
				<View style={styles.childBanner}>
					<Text style={styles.childBannerText}>🌱 {t(locale, 'childModeBadge')}</Text>
				</View>
			)}

			<FlatList
				data={feed}
				keyExtractor={(item) => item.id}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
				}
				ListHeaderComponent={
					<View style={{ gap: 14, paddingBottom: 12 }}>
						{/* 1. 24-Hour Stories Tray */}
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={[
								styles.storiesBar,
								{ backgroundColor: colors.card, borderColor: colors.border }
							]}
						>
							<TouchableOpacity
								onPress={() => router.push('/(tabs)/create')}
								style={styles.storyItem}
							>
								<View style={[styles.storyRing, { borderColor: colors.brand, borderStyle: 'dashed' }]}>
									<Text style={{ fontSize: 22 }}>📸</Text>
								</View>
								<Text style={[styles.storyName, { color: colors.text }]}>
									{t(locale, 'addStory')}
								</Text>
							</TouchableOpacity>

							{storiesTray.map((group, idx) => (
								<TouchableOpacity
									key={group.author.id}
									onPress={() => openStoryGroup(idx)}
									style={styles.storyItem}
								>
									<View
										style={[
											styles.storyRing,
											{
												borderColor: group.hasUnseen ? colors.brand : colors.border
											}
										]}
									>
										<Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>
											{group.author.displayName.slice(0, 1)}
										</Text>
									</View>
									<Text
										numberOfLines={1}
										style={[styles.storyName, { color: colors.text }]}
									>
										{group.author.displayName.split(' ')[0]}
									</Text>
									<Text style={{ color: colors.subtext, fontSize: 10 }}>
										{group.author.relationshipLabel}
									</Text>
								</TouchableOpacity>
							))}
						</ScrollView>

						{/* 2. "On This Day" Memories Banner */}
						{memories.length > 0 && (
							<View
								style={[
									styles.memoriesBox,
									{ backgroundColor: colors.card, borderColor: colors.brand }
								]}
							>
								<View style={styles.rowBetween}>
									<Text
										style={{
											color: colors.brand,
											fontWeight: '800',
											fontSize: 14 * fontScale
										}}
									>
										✨ {t(locale, 'onThisDay')} ({memories[0].yearsAgo}y ago)
									</Text>
									<Text style={{ color: colors.subtext, fontSize: 11 }}>
										{t(locale, 'memoriesSubtitle')}
									</Text>
								</View>
								<ScrollView horizontal showsHorizontalScrollIndicator={false}>
									{memories.map((mem) => (
										<View key={mem.id} style={styles.memoryCard}>
											{mem.media?.[0] && (
												<Image
													source={{ uri: resolveMediaUrl(mem.media[0].thumbUrl) || '' }}
													accessibilityLabel={mem.media[0].altText}
													style={styles.memoryImg}
												/>
											)}
											<Text
												numberOfLines={1}
												style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}
											>
												{mem.author.displayName} ({mem.author.relationshipLabel})
											</Text>
											<Text
												numberOfLines={2}
												style={{ color: colors.subtext, fontSize: 11 }}
											>
												{mem.caption}
											</Text>
										</View>
									))}
								</ScrollView>
							</View>
						)}
					</View>
				}
				renderItem={({ item: post }) => {
					const slideIdx = slideIndices[post.id] || 0;
					const currentMedia = post.media?.[slideIdx] || post.media?.[0];
					const topComments = (post.comments || []).filter((c: any) => !c.parentCommentId);

					return (
						<View
							style={[
								styles.postCard,
								{ backgroundColor: colors.card, borderColor: colors.border }
							]}
						>
							{/* Author Header */}
							<View style={[styles.rowBetween, { padding: 14 }]}>
								<View style={styles.row}>
									<View style={[styles.avatarCircle, { backgroundColor: colors.brandSoft }]}>
										<Text style={{ color: colors.brand, fontWeight: '800' }}>
											{post.author.displayName.slice(0, 1)}
										</Text>
									</View>
									<View>
										<View style={styles.row}>
											<Text
												style={{
													color: colors.text,
													fontWeight: '800',
													fontSize: 14 * fontScale
												}}
											>
												{post.author.displayName}
											</Text>
											<View
												style={[
													styles.relBadge,
													{ backgroundColor: colors.brandSoft }
												]}
											>
												<Text style={{ color: colors.brand, fontSize: 10, fontWeight: '700' }}>
													{post.author.relationshipLabel}
												</Text>
											</View>
										</View>
										{post.locationName ? (
											<Text style={{ color: colors.subtext, fontSize: 11 }}>
												📍 {post.locationName}
											</Text>
										) : null}
									</View>
								</View>

								<View style={styles.row}>
									{(user?.id === post.author.id || user?.role === 'admin') && (
										<TouchableOpacity onPress={() => deletePost(post.id)}>
											<Text style={{ fontSize: 15 }}>🗑️</Text>
										</TouchableOpacity>
									)}
									<TouchableOpacity onPress={() => reportPost(post.id)}>
										<Text style={{ fontSize: 15 }}>🚩</Text>
									</TouchableOpacity>
								</View>
							</View>

							{/* Media Image / Carousel */}
							{currentMedia && (
								<View style={styles.mediaBox}>
									<Image
										source={{ uri: resolveMediaUrl(currentMedia.displayUrl) || '' }}
										accessibilityLabel={currentMedia.altText}
										style={styles.postImage}
										resizeMode="cover"
									/>
									{post.media.length > 1 && (
										<View style={styles.carouselRow}>
											<TouchableOpacity
												disabled={slideIdx === 0}
												onPress={() =>
													setSlideIndices((p) => ({ ...p, [post.id]: slideIdx - 1 }))
												}
												style={styles.carouselBtn}
											>
												<Text style={{ color: '#fff', fontWeight: '800' }}>‹ Prev</Text>
											</TouchableOpacity>
											<Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
												{slideIdx + 1} / {post.media.length}
											</Text>
											<TouchableOpacity
												disabled={slideIdx + 1 >= post.media.length}
												onPress={() =>
													setSlideIndices((p) => ({ ...p, [post.id]: slideIdx + 1 }))
												}
												style={styles.carouselBtn}
											>
												<Text style={{ color: '#fff', fontWeight: '800' }}>Next ›</Text>
											</TouchableOpacity>
										</View>
									)}
								</View>
							)}

							{/* Reactions & Caption */}
							<View style={{ padding: 14, gap: 10 }}>
								<View style={styles.row}>
									{EMOJIS.map((emoji) => {
										const count = post.reactionCounts?.[emoji] || 0;
										const isMine = post.myReaction === emoji;
										return (
											<TouchableOpacity
												key={emoji}
												onPress={() => toggleReaction(post.id, emoji)}
												style={[
													styles.reactionPill,
													{
														borderColor: isMine ? colors.brand : colors.border,
														backgroundColor: isMine ? colors.brandSoft : 'transparent'
													}
												]}
											>
												<Text style={{ fontSize: 14 }}>
													{emoji} {count > 0 ? count : ''}
												</Text>
											</TouchableOpacity>
										);
									})}
								</View>

								{post.caption ? (
									<Text style={{ color: colors.text, fontSize: 14 * fontScale }}>
										<Text style={{ fontWeight: '800' }}>{post.author.displayName} </Text>
										{post.caption}
									</Text>
								) : null}

								{/* Threaded Comments */}
								{topComments.map((c: any) => {
									const replies = (post.comments || []).filter(
										(r: any) => r.parentCommentId === c.id
									);
									return (
										<View key={c.id} style={{ gap: 4 }}>
											<View style={styles.rowBetween}>
												<Text style={{ color: colors.text, fontSize: 12.5 * fontScale, flex: 1 }}>
													<Text style={{ fontWeight: '800' }}>{c.author.displayName}: </Text>
													{c.body}
												</Text>
												<TouchableOpacity
													onPress={() =>
														setReplyTargets((p) => ({
															...p,
															[post.id]: { id: c.id, username: c.author.username }
														}))
													}
												>
													<Text style={{ color: colors.brand, fontSize: 11, fontWeight: '700' }}>
														{t(locale, 'reply')}
													</Text>
												</TouchableOpacity>
											</View>
											{replies.map((rep: any) => (
												<Text
													key={rep.id}
													style={{
														color: colors.subtext,
														fontSize: 12 * fontScale,
														paddingLeft: 14
													}}
												>
													↳ <Text style={{ fontWeight: '700' }}>{rep.author.displayName}: </Text>
													{rep.body}
												</Text>
											))}
										</View>
									);
								})}

								{replyTargets[post.id] && (
									<View style={styles.rowBetween}>
										<Text style={{ color: colors.brand, fontSize: 11 }}>
											Replying to @{replyTargets[post.id]?.username}
										</Text>
										<TouchableOpacity
											onPress={() => setReplyTargets((p) => ({ ...p, [post.id]: null }))}
										>
											<Text style={{ color: colors.subtext }}>✕</Text>
										</TouchableOpacity>
									</View>
								)}

								<View style={styles.row}>
									<TextInput
										value={commentInputs[post.id] || ''}
										onChangeText={(txt) =>
											setCommentInputs((p) => ({ ...p, [post.id]: txt }))
										}
										placeholder={t(locale, 'addComment')}
										placeholderTextColor={colors.subtext}
										style={[
											styles.commentInput,
											{ color: colors.text, borderColor: colors.border }
										]}
									/>
									<TouchableOpacity
										onPress={() => sendComment(post.id)}
										style={[styles.postBtn, { backgroundColor: colors.brand }]}
									>
										<Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
											Post
										</Text>
									</TouchableOpacity>
								</View>
							</View>
						</View>
					);
				}}
				contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
			/>

			{/* Full-Screen 24h Story Viewer Modal */}
			<Modal visible={activeStoryGroupIdx !== null} animationType="slide" transparent={false}>
				{activeStoryGroupIdx !== null && storiesTray[activeStoryGroupIdx] && (
					<View style={styles.storyModal}>
						{(() => {
							const group = storiesTray[activeStoryGroupIdx];
							const activeStory =
								group.stories[activeStoryItemIdx] || group.stories[0];
							return (
								<>
									<View style={styles.rowBetween}>
										<Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
											{group.author.displayName} ({group.author.relationshipLabel})
										</Text>
										<TouchableOpacity onPress={() => setActiveStoryGroupIdx(null)}>
											<Text style={{ color: '#fff', fontSize: 22 }}>✕</Text>
										</TouchableOpacity>
									</View>

									<Image
										source={{
											uri: resolveMediaUrl(activeStory.media.displayUrl) || ''
										}}
										style={styles.storyFullImg}
										resizeMode="contain"
									/>

									{activeStory.caption ? (
										<Text style={styles.storyCaption}>{activeStory.caption}</Text>
									) : null}

									<View style={styles.rowBetween}>
										<TouchableOpacity
											onPress={() => setShowViewers(!showViewers)}
											style={styles.storyCtrlBtn}
										>
											<Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
												👁️ {t(locale, 'viewers')} ({activeStory.viewers?.length || 0})
											</Text>
										</TouchableOpacity>

										{user?.id === group.author.id && (
											<TouchableOpacity
												onPress={() => saveStoryToHighlights(activeStory.id)}
												style={[styles.storyCtrlBtn, { backgroundColor: '#f59e0b' }]}
											>
												<Text style={{ color: '#000', fontWeight: '800', fontSize: 12 }}>
													⭐ {t(locale, 'saveToHighlights')}
												</Text>
											</TouchableOpacity>
										)}

										<TouchableOpacity
											onPress={advanceStory}
											style={[styles.storyCtrlBtn, { backgroundColor: colors.brand }]}
										>
											<Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
												Next →
											</Text>
										</TouchableOpacity>
									</View>

									{showViewers && (
										<View style={styles.viewerListBox}>
											{(activeStory.viewers || []).map((v: any) => (
												<Text key={v.id} style={{ color: '#fff', fontSize: 12 }}>
													• {v.displayName} ({v.relationshipLabel})
												</Text>
											))}
										</View>
									)}
								</>
							);
						})()}
					</View>
				)}
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	header: {
		paddingTop: 48,
		paddingBottom: 12,
		paddingHorizontal: 14,
		borderBottomWidth: 1,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center'
	},
	headerTitle: { fontWeight: '800' },
	logoBadge: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 8
	},
	logoText: { color: '#fff', fontWeight: '900', fontSize: 17 },
	row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	pillBtn: {
		borderWidth: 1,
		borderRadius: 10,
		paddingHorizontal: 8,
		paddingVertical: 5
	},
	childBanner: {
		backgroundColor: '#065f46',
		paddingVertical: 5,
		alignItems: 'center'
	},
	childBannerText: { color: '#ecfdf5', fontSize: 11, fontWeight: '700' },
	storiesBar: {
		padding: 12,
		borderRadius: 20,
		borderWidth: 1,
		gap: 14
	},
	storyItem: { alignItems: 'center', width: 68 },
	storyRing: {
		width: 58,
		height: 58,
		borderRadius: 29,
		borderWidth: 2.5,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 4
	},
	storyName: { fontSize: 11, fontWeight: '700' },
	memoriesBox: {
		padding: 12,
		borderRadius: 20,
		borderWidth: 1,
		gap: 10
	},
	memoryCard: { width: 170, marginRight: 10, gap: 4 },
	memoryImg: { width: 170, height: 110, borderRadius: 12 },
	postCard: {
		borderRadius: 22,
		borderWidth: 1,
		marginBottom: 16,
		overflow: 'hidden'
	},
	avatarCircle: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 6
	},
	relBadge: {
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 10
	},
	mediaBox: { position: 'relative' },
	postImage: { width: '100%', height: 340 },
	carouselRow: {
		position: 'absolute',
		bottom: 10,
		left: 12,
		right: 12,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center'
	},
	carouselBtn: {
		backgroundColor: 'rgba(0,0,0,0.65)',
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 10
	},
	reactionPill: {
		borderWidth: 1,
		borderRadius: 16,
		paddingHorizontal: 10,
		paddingVertical: 5
	},
	commentInput: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 8,
		fontSize: 13
	},
	postBtn: {
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 9
	},
	storyModal: {
		flex: 1,
		backgroundColor: '#000',
		padding: 20,
		paddingTop: 54,
		justifyContent: 'space-between'
	},
	storyFullImg: { width: '100%', height: '70%' },
	storyCaption: {
		color: '#fff',
		textAlign: 'center',
		fontSize: 15,
		backgroundColor: 'rgba(0,0,0,0.6)',
		padding: 10,
		borderRadius: 12
	},
	storyCtrlBtn: {
		backgroundColor: 'rgba(255,255,255,0.2)',
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 12
	},
	viewerListBox: {
		backgroundColor: '#1c1917',
		padding: 12,
		borderRadius: 12,
		gap: 4
	}
});
