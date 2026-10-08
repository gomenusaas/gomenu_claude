"use client";

import { Alert, Button, Field, Input } from "@gomenu/ui";
import { useActionState } from "react";
import { startEnrollment, verifyTotp, type EnrollState } from "@/app/actions/platform-auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

export function EnrollAuthenticator() {
  const [state, start, pending] = useActionState<EnrollState>(async () => startEnrollment(), undefined);
  if (!state?.factorId) {
    return (
      <form action={start} className="grid gap-3">
        {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <Button type="submit" disabled={pending}>Set up authenticator app</Button>
      </form>
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm">Scan this QR code with your authenticator app, or enter the key manually.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={state.qr} alt="Authenticator QR code" className="size-48 rounded-md border bg-white p-2" />
      <code className="break-all rounded-md bg-muted p-2 text-sm" data-testid="totp-secret">{state.secret}</code>
      <ActionForm action={verifyTotp}>
        <input type="hidden" name="factor_id" value={state.factorId} />
        <Field id="code" label="6-digit code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></Field>
        <SubmitButton block>Verify and continue</SubmitButton>
      </ActionForm>
    </div>
  );
}
