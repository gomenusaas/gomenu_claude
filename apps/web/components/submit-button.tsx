"use client";

import { Button, type ButtonProps } from "@gomenu/ui";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {children}
    </Button>
  );
}
