import { redirect } from "next/navigation";
import { getMyContext, pathFor } from "@/lib/auth/context";

// Post-login router: the destination comes from the database (get_my_context), never from
// client-side labels.
export default async function AppRouter() {
  redirect(pathFor(await getMyContext()));
}
