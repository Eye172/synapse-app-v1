import React from 'react';
import { View } from 'react-native';

import { color, space } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { CornerBrackets, bracketTint } from './CornerBrackets';
import { PrimaryButton } from './PrimaryButton';

/**
 * Designed empty/loading/error state — brackets, a mono status line, one action.
 * No blank screens, ever (§2.2).
 */
export function EmptyState({
  code,
  title,
  body,
  actionTitle,
  onAction,
  tone = 'dim',
}: {
  /** mono status line, e.g. "NO SESSIONS LOGGED" */
  code: string;
  title: string;
  body?: string;
  actionTitle?: string;
  onAction?: () => void;
  tone?: 'dim' | 'acid' | 'error';
}) {
  const tint = tone === 'acid' ? bracketTint.acid : tone === 'error' ? 'rgba(255,59,92,0.5)' : bracketTint.dim;
  const codeColor = tone === 'error' ? color.error : tone === 'acid' ? color.acid : color.textLo;
  return (
    <View style={{ padding: space.lg, alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
      <View style={{ padding: space.lg, alignItems: 'center', alignSelf: 'stretch' }}>
        <CornerBrackets size={16} tint={tint} />
        <AppText variant="nano" color={codeColor} style={{ marginBottom: 8 }}>
          {`· ${code} ·`}
        </AppText>
        <AppText variant="h3" align="center">
          {title}
        </AppText>
        {body ? (
          <AppText variant="body" align="center" style={{ marginTop: 6, maxWidth: 300 }}>
            {body}
          </AppText>
        ) : null}
        {actionTitle && onAction ? (
          <PrimaryButton title={actionTitle} onPress={onAction} compact style={{ marginTop: space.md, alignSelf: 'center' }} />
        ) : null}
      </View>
    </View>
  );
}
