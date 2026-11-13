import { Onboarding } from "@/components/auth/onboarding";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <Onboarding initialError={(await searchParams).error} />;
}
