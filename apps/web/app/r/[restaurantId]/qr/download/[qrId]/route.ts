import { NextResponse } from "next/server";
import { qrPng, qrSvg } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

/** Download a QR code. RLS decides: only people with qr.manage (for that branch) see the token. */
export async function GET(request: Request, { params }: { params: Promise<{ restaurantId: string; qrId: string }> }) {
  const { restaurantId, qrId } = await params;
  const supabase = await createClient();
  const { data: qr } = await supabase.from("qr_codes").select("token, label, kind, restaurant_tables(label)")
    .eq("id", qrId).eq("restaurant_id", restaurantId).is("revoked_at", null).maybeSingle();
  if (!qr) return new NextResponse("Not found", { status: 404 });
  const name = ((qr.restaurant_tables as { label: string } | null)?.label ?? qr.label ?? "qr").replace(/[^\w-]+/g, "-");
  const svg = new URL(request.url).searchParams.get("format") === "svg";
  const body = svg ? await qrSvg(qr.token) : new Uint8Array(await qrPng(qr.token));
  return new NextResponse(body, {
    headers: {
      "content-type": svg ? "image/svg+xml" : "image/png",
      "content-disposition": `attachment; filename="gomenu-${name}.${svg ? "svg" : "png"}"`,
      "cache-control": "private, no-store",
    },
  });
}
