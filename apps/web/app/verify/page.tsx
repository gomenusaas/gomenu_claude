import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyPhoneOtp } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { fmt, getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";

export const metadata = { title: "Verify" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ phone?: string; next?: string }> }) {
  const search = await searchParams;
  const phone = toE164(search.phone ?? "");
  const next = search.next?.startsWith("/") && !search.next.startsWith("//") ? search.next : null;
  if (!phone) redirect("/login");
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.verify.title}</CardTitle>
          <CardDescription>{fmt(t.verify.subtitle, { phone: `⁦${phone}⁩` })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ActionForm action={verifyPhoneOtp}>
            <input type="hidden" name="phone" value={phone} />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <Field id="code" label={t.verify.code}>
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required />
            </Field>
            <SubmitButton block>{t.verify.submit}</SubmitButton>
          </ActionForm>
          <Link href={next ? `/me/login?next=${encodeURIComponent(next)}` : "/login"} className="text-center text-sm text-accent underline">{t.verify.changeNumber}</Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
