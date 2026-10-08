"use client";

import { Alert, cn } from "@gomenu/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { startTransition, useActionState } from "react";
import type { FormState } from "./form-state";

/**
 * A form bound to a server action that returns { error } / { ok } messages.
 * Submits via onSubmit so React does not reset the fields: on a validation error the
 * person keeps what they typed. Without JavaScript the plain `action` still works.
 */
export function ActionForm({
  action,
  className,
  quiet,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  className?: string;
  /** Don't show success messages (small inline buttons whose effect is visible anyway). */
  quiet?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const pathname = usePathname();
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        // Include the clicked button's name/value (e.g. status=disabled vs status=removed).
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const formData = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(formData));
      }}
      className={cn("grid gap-4", className)}
      noValidate
    >
      {state?.error ? (
        <Alert tone="danger">
          {state.reauth ? (
            <Link href={`/reauth?next=${encodeURIComponent(pathname)}`} className="font-medium underline" data-testid="reauth-link">
              {state.error}
            </Link>
          ) : (
            state.error
          )}
        </Alert>
      ) : null}
      {state?.ok && state.ok !== "ok" && !quiet ? <Alert tone="success">{state.ok}</Alert> : null}
      {children}
    </form>
  );
}
