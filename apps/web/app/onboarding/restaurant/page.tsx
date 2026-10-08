import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { redirect } from "next/navigation";
import { createRestaurant } from "@/app/actions/onboarding";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { pathFor, requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";

export const metadata = { title: "Set up your restaurant" };

export default async function RestaurantOnboarding() {
  const ctx = await requireUser();
  if (ctx.next !== "create_restaurant") redirect(pathFor(ctx));
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.onboarding.title}</CardTitle>
          <CardDescription>{t.onboarding.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createRestaurant}>
            <Field id="name" label={t.onboarding.restaurantName}>
              <Input name="name" required maxLength={120} />
            </Field>
            <Field id="slug" label={t.onboarding.slug} hint={fmt(t.onboarding.slugHint, { slug: "your-name" })}>
              <Input name="slug" required pattern="[a-z0-9-]{3,50}" dir="ltr" autoCapitalize="none" />
            </Field>
            <Field id="branch" label={t.onboarding.branchName} hint={t.onboarding.branchHint}>
              <Input name="branch" maxLength={120} />
            </Field>
            <Field id="email" label={t.onboarding.emailOptional} hint={t.onboarding.emailHint}>
              <Input name="email" type="email" autoComplete="email" dir="ltr" />
            </Field>
            <Field id="password" label={t.onboarding.passwordOptional}>
              <Input name="password" type="password" autoComplete="new-password" minLength={8} />
            </Field>
            <SubmitButton block>{t.onboarding.submit}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
