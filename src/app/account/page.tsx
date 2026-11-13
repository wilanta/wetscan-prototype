import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button, Card } from "@/components/ui";
import { getSession, profileFor, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const session = await getSession(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  const profile = await profileFor(session);
  if (!profile) redirect("/login");
  return (
    <div className="onboarding">
      <header className="landing-nav">
        <Link href="/" aria-label="WetScan home">
          <Logo />
        </Link>
        <Link href={profile.completedAt ? "/app" : "/onboarding"}>
          Continue to workspace
        </Link>
      </header>
      <main id="main" className="onboarding-layout">
        <aside>
          <h1>Your account.</h1>
          <p>Signed in with GitHub as {profile.login}.</p>
        </aside>
        <Card className="onboarding-card">
          <h2>{profile.workspace || "Your workspace"}</h2>
          <p>
            {profile.email ||
              "Finish onboarding to save your account preferences."}
          </p>
          <p>{profile.repositories.length} selected repositories</p>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
