import { NextResponse, type NextRequest } from "next/server";
import { TABLE_COOKIE, type TableContext } from "@/lib/site/types";
import { createClient } from "@/lib/supabase/server";

/**
 * spec §9: QR codes encode only a random token. It is resolved here, server-side, so slug or
 * domain changes never require reprinting. A table QR stores table context for this visit
 * (shown to the diner; ordering uses it in Phase 5). It proves context, not physical presence.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) return invalid();
  const supabase = await createClient();
  const { data } = await supabase.rpc("resolve_qr", { p_token: token });
  const qr = data as (TableContext & { slug: string; kind: "general" | "table" }) | null;
  if (!qr) return invalid();

  const target = new URL(`/${qr.slug}`, request.url);
  if (qr.branch_id) target.searchParams.set("branch", qr.branch_id);
  const response = NextResponse.redirect(target, 307);
  if (qr.kind === "table") {
    const context: TableContext = {
      restaurant_id: qr.restaurant_id, qr_code_id: qr.qr_code_id, branch_id: qr.branch_id,
      table_id: qr.table_id, table_label: qr.table_label,
    };
    response.cookies.set(TABLE_COOKIE, JSON.stringify(context), { path: "/", maxAge: 4 * 60 * 60, sameSite: "lax", httpOnly: true });
  } else {
    response.cookies.delete(TABLE_COOKIE);
  }
  return response;
}

function invalid() {
  return new NextResponse(
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR code not active</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:1rem">
<div><h1>This QR code is no longer active</h1><p>Please ask a member of staff for help.</p>
<p dir="rtl" lang="ar">رمز QR هذا لم يعد فعالاً. يرجى طلب المساعدة من أحد الموظفين.</p></div></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
