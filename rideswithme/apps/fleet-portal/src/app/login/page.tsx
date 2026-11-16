import { LoginFlow } from './login-flow';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  return <LoginFlow resumeMfa={step === 'mfa'} />;
}
