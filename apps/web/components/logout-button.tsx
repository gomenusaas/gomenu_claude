import { logout } from "@/app/actions/auth";

export function LogoutButton({ label }: { label: string }) {
  return (
    <form action={logout}>
      <button type="submit" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted">
        {label}
      </button>
    </form>
  );
}
