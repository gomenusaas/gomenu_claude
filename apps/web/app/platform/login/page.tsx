import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { platformLogin } from "@/app/actions/platform-auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Platform sign in", robots: { index: false } };

// Platform staff: email + strong password, then an authenticator app (decision P2-Q7).
export default function PlatformLogin() {
  return (
    <main className="mx-auto max-w-md px-4 py-16" dir="ltr">
      <Card>
        <CardHeader>
          <CardTitle>GoMenu platform</CardTitle>
          <CardDescription>Staff only. Every sign-in requires your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={platformLogin}>
            <Field id="email" label="Email"><Input name="email" type="email" autoComplete="username" required /></Field>
            <Field id="password" label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
            <SubmitButton block>Continue</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </main>
  );
}
