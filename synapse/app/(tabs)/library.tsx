import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EXERCISES } from '@/src/data/exercises';
import type { ExerciseSpec } from '@/src/engine/types';
import { color, radius, space } from '@/src/theme/tokens';
import { font } from '@/src/theme/typography';
import { AppText } from '@/src/ui/AppText';
import { Chip, RiskBadge } from '@/src/ui/Chip';
import { EmptyState } from '@/src/ui/EmptyState';
import { GlassCard } from '@/src/ui/GlassCard';
import { GridBackdrop } from '@/src/ui/GridBackdrop';
import { MiniMesh } from '@/src/ui/MiniMesh';
import { PressableScale } from '@/src/ui/PressableScale';
import { ScreenHeader } from '@/src/ui/ScreenHeader';

type Filter = 'all' | 'compound' | 'accessory' | 'risk3' | 'rig';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ALL' },
  { id: 'compound', label: 'COMPOUND' },
  { id: 'accessory', label: 'ACCESSORY' },
  { id: 'risk3', label: 'RISK 3' },
  { id: 'rig', label: 'RIG RULES' },
];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISES.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !e.bodyRegion.includes(q)) return false;
      switch (filter) {
        case 'compound': return e.category === 'compound';
        case 'accessory': return e.category === 'accessory';
        case 'risk3': return e.riskLevel === 3;
        case 'rig': return e.hasRigRules;
        default: return true;
      }
    });
  }, [query, filter]);

  /**
   * A catalogue row, not a card. The risk-3 lifts earn a red edge; everything
   * else is separated by a hairline, so the eye reads a list of lifts rather
   * than a wall of identical panels.
   */
  const renderItem = ({ item }: { item: ExerciseSpec }) => (
    <PressableScale
      onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, risk level ${item.riskLevel}`}
      style={{ paddingHorizontal: space.gutter }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingVertical: space.sm,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.05)',
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            backgroundColor: 'rgba(33,240,220,0.03)',
            borderLeftWidth: 2,
            borderLeftColor: item.riskLevel === 3 ? color.error : color.mesh,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MiniMesh exercise={item} size={64} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="h3">{item.name}</AppText>
          <AppText variant="nano" color={color.textLo}>
            {item.lesson.watchList.slice(0, 3).join('   ').toUpperCase()}
          </AppText>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 2 }}>
            <AppText variant="nano" color={item.riskLevel === 3 ? color.error : color.textMid}>
              {`RISK ${item.riskLevel}`}
            </AppText>
            <AppText variant="nano" color={color.textLo}>
              {item.category.toUpperCase()}
            </AppText>
            {item.hasRigRules ? (
              <AppText variant="nano" color={color.mesh}>
                RIG
              </AppText>
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );

  return (
    <View style={{ flex: 1 }}>
      <GridBackdrop />
      <FlatList
        data={data}
        keyExtractor={(e) => e.id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: space.md }}>
            <ScreenHeader eyebrow="LIBRARY" title="Exercises" />
            <View style={{ paddingHorizontal: space.gutter }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="SEARCH LIFTS…"
                placeholderTextColor={color.textLo}
                accessibilityLabel="Search exercises"
                style={{
                  fontFamily: font.mono,
                  fontSize: 12,
                  letterSpacing: 1,
                  color: color.textHi,
                  backgroundColor: 'rgba(16,20,28,0.6)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  borderRadius: radius.hud,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: space.gutter, flexWrap: 'wrap' }}>
              {FILTERS.map((f) => (
                <PressableScale key={f.id} onPress={() => setFilter(f.id)} accessibilityRole="button" accessibilityLabel={`Filter: ${f.label}`}>
                  <Chip
                    label={f.label}
                    tint={filter === f.id ? color.acid : color.textLo}
                    filled={filter === f.id}
                  />
                </PressableScale>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            code="NO MATCH IN LIBRARY"
            title="Nothing found"
            body="Try a different name or clear the filter."
            actionTitle="Clear search"
            onAction={() => {
              setQuery('');
              setFilter('all');
            }}
          />
        }
      />
    </View>
  );
}
