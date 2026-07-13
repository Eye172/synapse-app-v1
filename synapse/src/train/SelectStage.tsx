import React from 'react';
import { ScrollView, View } from 'react-native';

import { EXERCISES } from '@/src/data/exercises';
import type { ExerciseSpec } from '@/src/engine/types';
import { color, space } from '@/src/theme/tokens';
import { AppText } from '@/src/ui/AppText';
import { Chip, RiskBadge } from '@/src/ui/Chip';
import { GlassCard } from '@/src/ui/GlassCard';
import { MiniMesh } from '@/src/ui/MiniMesh';
import { PressableScale } from '@/src/ui/PressableScale';

export function SelectStage({ onSelect }: { onSelect: (ex: ExerciseSpec) => void }) {
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 48, gap: space.sm }} showsVerticalScrollIndicator={false}>
      <AppText variant="nano" color={color.acid}>
        · TRAINING · SELECT LIFT ·
      </AppText>
      <AppText variant="h1">What are we watching today</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs }}>
        {EXERCISES.map((ex) => (
          <PressableScale
            key={ex.id}
            onPress={() => onSelect(ex)}
            accessibilityRole="button"
            accessibilityLabel={`Train ${ex.name}`}
            style={{ width: '47.5%' }}
          >
            <GlassCard
              style={{
                alignItems: 'center',
                gap: 8,
                paddingVertical: space.md,
                borderColor: ex.riskLevel === 3 ? 'rgba(255,59,92,0.28)' : undefined,
              }}
            >
              <MiniMesh exercise={ex} size={86} />
              <AppText variant="bodySemi" align="center" numberOfLines={1}>
                {ex.name}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                <RiskBadge level={ex.riskLevel} />
                {ex.hasRigRules ? <Chip label="RIG" tint={color.mesh} /> : null}
              </View>
            </GlassCard>
          </PressableScale>
        ))}
      </View>
    </ScrollView>
  );
}
