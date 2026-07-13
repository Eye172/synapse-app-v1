import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { color, fontSize, track } from '@/src/theme/tokens';
import { font } from '@/src/theme/typography';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyMed'
  | 'bodySemi'
  | 'label'
  | 'micro'
  | 'nano'
  | 'monoValue'
  | 'monoBody';

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: {
    fontFamily: font.display,
    fontSize: fontSize.display,
    letterSpacing: track.display,
    color: color.textHi,
    textTransform: 'uppercase',
    lineHeight: fontSize.display * 1.04,
  },
  h1: {
    fontFamily: font.display,
    fontSize: fontSize.h1,
    letterSpacing: -0.3,
    color: color.textHi,
    textTransform: 'uppercase',
    lineHeight: fontSize.h1 * 1.1,
  },
  h2: {
    fontFamily: font.displayMed,
    fontSize: fontSize.h2,
    color: color.textHi,
    lineHeight: fontSize.h2 * 1.15,
  },
  h3: {
    fontFamily: font.bodySemi,
    fontSize: fontSize.h3,
    color: color.textHi,
    lineHeight: fontSize.h3 * 1.25,
  },
  body: {
    fontFamily: font.body,
    fontSize: fontSize.body,
    color: color.textMid,
    lineHeight: fontSize.body * 1.45,
  },
  bodyMed: {
    fontFamily: font.bodyMed,
    fontSize: fontSize.body,
    color: color.textHi,
    lineHeight: fontSize.body * 1.45,
  },
  bodySemi: {
    fontFamily: font.bodySemi,
    fontSize: fontSize.body,
    color: color.textHi,
    lineHeight: fontSize.body * 1.4,
  },
  label: {
    fontFamily: font.bodyMed,
    fontSize: fontSize.label,
    color: color.textMid,
    lineHeight: fontSize.label * 1.35,
  },
  micro: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    letterSpacing: track.micro,
    textTransform: 'uppercase',
    color: color.textMid,
    lineHeight: fontSize.micro * 1.4,
  },
  nano: {
    fontFamily: font.mono,
    fontSize: fontSize.nano,
    letterSpacing: track.micro,
    textTransform: 'uppercase',
    color: color.textLo,
    lineHeight: fontSize.nano * 1.4,
  },
  monoValue: {
    fontFamily: font.monoMed,
    fontSize: 20,
    color: color.textHi,
    fontVariant: ['tabular-nums'],
    lineHeight: 22,
  },
  monoBody: {
    fontFamily: font.mono,
    fontSize: 12.5,
    color: color.textMid,
    lineHeight: 18,
  },
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'body', color: c, align, style, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[VARIANTS[variant], c ? { color: c } : null, align ? { textAlign: align } : null, style]}
    />
  );
}
