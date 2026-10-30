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
import { useAuth } from '../../src/context/AuthContext';
import { apiFetch, resolveMediaUrl } from '../../src/api/client';
import { t } from '../../src/i18n/strings';

export default function MobileSearchScreen() {
	const { colors, locale, fontScale } = useAuth();
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<{
		people: any[];
		posts: any[];
		tags: string[];
		albums: any[];
	}>({ people: [], posts: [], tags: [], albums: [] });

	useEffect(() => {
		runSearch('');
	}, []);

	async function runSearch(q: string) {
		try {
			const res = await apiFetch(`/api/mobile/search?q=${encodeURIComponent(q)}`);
			if (res.results) setResults(res.results);
		} catch {
			// ignore
		}
	}

	return (
		<ScrollView
			style={[styles.container, { backgroundColor: colors.bg }]}
			contentContainerStyle={styles.content}
		>
			<Text style={[styles.title, { color: colors.text, fontSize: 22 * fontScale }]}>
				🔍 {t(locale, 'search')}
			</Text>

			<View style={styles.row}>
				<TextInput
					value={query}
					onChangeText={setQuery}
					onSubmitEditing={() => runSearch(query)}
					placeholder={t(locale, 'searchPlaceholder')}
					placeholderTextColor={colors.subtext}
					style={[styles.input, { color: colors.text, borderColor: colors.border }]}
				/>
				<TouchableOpacity
					onPress={() => runSearch(query)}
					style={[styles.btn, { backgroundColor: colors.brand }]}
				>
					<Text style={{ color: '#fff', fontWeight: '800' }}>{t(locale, 'search')}</Text>
				</TouchableOpacity>
			</View>

			{results.tags.length > 0 && (
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: colors.subtext }]}>#TAGS</Text>
					<View style={styles.tagWrap}>
						{results.tags.map((tag) => (
							<TouchableOpacity
								key={tag}
								onPress={() => {
									setQuery(`#${tag}`);
									runSearch(`#${tag}`);
								}}
								style={[styles.tagPill, { backgroundColor: colors.brandSoft }]}
							>
								<Text style={{ color: colors.brand, fontWeight: '700', fontSize: 12 }}>
									#{tag}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
			)}

			{results.people.length > 0 && (
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: colors.subtext }]}>
						FAMILY MEMBERS
					</Text>
					{results.people.map((p) => (
						<View
							key={p.id}
							style={[
								styles.personCard,
								{ backgroundColor: colors.card, borderColor: colors.border }
							]}
						>
							<View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
								<Text style={{ color: colors.brand, fontWeight: '800' }}>
									{p.displayName.slice(0, 1)}
								</Text>
							</View>
							<View style={{ flex: 1 }}>
								<Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>
									{p.displayName}
								</Text>
								<Text style={{ color: colors.subtext, fontSize: 12 }}>
									@{p.username} · {p.relationshipLabel}
								</Text>
							</View>
						</View>
					))}
				</View>
			)}

			{results.posts.length > 0 && (
				<View style={styles.section}>
					<Text style={[styles.sectionTitle, { color: colors.subtext }]}>
						MATCHING POSTS ({results.posts.length})
					</Text>
					<View style={styles.grid}>
						{results.posts.map((post) => (
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
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: 16, paddingTop: 54, gap: 16 },
	title: { fontWeight: '800' },
	row: { flexDirection: 'row', gap: 8 },
	input: {
		flex: 1,
		borderWidth: 1,
		borderRadius: 14,
		paddingHorizontal: 14,
		paddingVertical: 11,
		fontSize: 14
	},
	btn: {
		borderRadius: 14,
		paddingHorizontal: 16,
		justifyContent: 'center'
	},
	section: { gap: 8 },
	sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
	tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	tagPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
	personCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 12,
		borderRadius: 16,
		borderWidth: 1
	},
	avatar: {
		width: 42,
		height: 42,
		borderRadius: 21,
		alignItems: 'center',
		justifyContent: 'center'
	},
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	gridCell: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
	gridImg: { width: '100%', height: '100%' }
});
