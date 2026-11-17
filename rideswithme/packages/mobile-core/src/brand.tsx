import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '@rideswithme/ui-components';

/**
 * The address of the logo a super admin set on the dashboard's Settings page,
 * or null (the built-in "R" mark) when none is set or the API cannot be
 * reached. Asked when the screen opens, so a new logo shows the next time the
 * app is opened.
 */
export function useBrandLogo(apiUrl: string | undefined): string | null {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!apiUrl) return;
    let live = true;
    fetch(`${apiUrl}/v1/branding`)
      .then((r) => (r.ok ? (r.json() as Promise<{ logoPath?: string | null }>) : null))
      .then((b) => {
        if (live && b?.logoPath) setLogo(`${apiUrl}${b.logoPath}`);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [apiUrl]);
  return logo;
}

/** The logo, or the orange "R" mark. Decorative: the app's name is written beside it. */
export function BrandLogo({ apiUrl, size = 48 }: { apiUrl?: string; size?: number }) {
  const logo = useBrandLogo(apiUrl);
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 4 };
  if (logo && !failed)
    return (
      <Image
        source={{ uri: logo }}
        style={[styles.logo, box]}
        resizeMode="contain"
        accessible={false}
        onError={() => setFailed(true)}
      />
    );
  return (
    <View style={[styles.mark, box]} accessible={false}>
      <Text style={[styles.markText, { fontSize: size / 2 }]}>R</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { backgroundColor: '#fff' },
  mark: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  markText: { fontWeight: '900', color: colors.onAccent, fontSize: typography.size.xl },
});
