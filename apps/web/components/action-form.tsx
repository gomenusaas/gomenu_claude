"use client";

import { Alert, cn } from "@gomenu/ui";
import { useActionState } from "react";
import type { FormState } from "./form-state";

/** A form bound to a server action that returns { error } / { ok } messages. */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={cn("grid gap-4", className)} noValidate>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok && state.ok !== "ok" ? <Alert tone="success">{state.ok}</Alert> : null}
      {children}
    </form>
  );
}
