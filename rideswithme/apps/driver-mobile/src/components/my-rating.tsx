import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { RatingSummary } from '@rideswithme/shared-types';
import { Body, Card } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/session';

/** The driver's average rating and recent comments (no passenger names). */
export function MyRating() {
  const { t } = useI18n();
  const [r, setR] = useState<RatingSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.ratings.mineAsDriver().then(setR, () => undefined);
    }, []),
  );
  if (!r) return null;
  return (
    <Card>
      <Body bold>
        {r.average === null
          ? t('ratings.notYet')
          : t('ratings.mine', { average: r.average, count: r.count })}
      </Body>
      {r.recent
        .filter((x) => x.comment)
        .slice(0, 3)
        .map((x) => (
          <Body key={x.rideId} muted>
            {'★'.repeat(x.stars)} {x.comment}
          </Body>
        ))}
    </Card>
  );
}
