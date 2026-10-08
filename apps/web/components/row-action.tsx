import type { ButtonProps } from "@gomenu/ui";
import { ActionForm } from "./action-form";
import type { FormState } from "./form-state";
import { SubmitButton } from "./submit-button";

/** A one-button form with hidden fields, e.g. "Move up", "Archive", "Mark sold out". */
export function RowAction({
  action,
  fields,
  label,
  variant = "ghost",
  testId,
  ariaLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: React.ReactNode;
  variant?: ButtonProps["variant"];
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <ActionForm action={action} className="inline-grid gap-1" quiet>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton size="sm" variant={variant} data-testid={testId} aria-label={ariaLabel}>{label}</SubmitButton>
    </ActionForm>
  );
}
