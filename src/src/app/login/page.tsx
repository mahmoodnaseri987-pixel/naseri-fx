import { LanguageProvider } from "@/components/site/language-provider";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { AuthForm } from "@/components/site/auth-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ورود اعضا | ناصری",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const nextPath = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/games";
  const mode =
    sp.mode === "register" ? "register" : sp.mode === "forgot" ? "forgot" : "login";

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-28">
          <AuthForm initialMode={mode} nextPath={nextPath} />
        </main>
        <SiteFooter />
      </div>
    </LanguageProvider>
  );
}
