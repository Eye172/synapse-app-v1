import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/src/ui/EmptyState';
import { GridBackdrop } from '@/src/ui/GridBackdrop';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <GridBackdrop />
      <EmptyState
        code="ROUTE NOT FOUND"
        title="Dead sector"
        body="This screen doesn’t exist."
        actionTitle="Back to base"
        onAction={() => router.replace('/')}
        tone="error"
      />
    </View>
  );
}
