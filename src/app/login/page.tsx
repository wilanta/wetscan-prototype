import { Login } from "@/components/auth/login";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <Login initialError={(await searchParams).error} />;
}
