import { SignInFlow } from './sign-in-flow';

/** Only a page on this site (never another site: "//x" or "/\x" would leave it). */
function safeNext(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Where to go after signing in (e.g. /verify, opened from the phone app).
  return <SignInFlow next={safeNext((await searchParams).next)} />;
}
