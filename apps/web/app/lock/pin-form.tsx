"use client";

import { Field, Input } from "@gomenu/ui";
import { unlockWithPin } from "@/app/actions/security";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

export function PinForm({ userId, labels }: { userId: string; labels: { pin: string; unlock: string } }) {
  return (
    <ActionForm action={unlockWithPin.bind(null, userId)}>
      <Field id={`pin-${userId}`} label={labels.pin}>
        <Input name="pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6} dir="ltr" required autoFocus />
      </Field>
      <SubmitButton block>{labels.unlock}</SubmitButton>
    </ActionForm>
  );
}
