import "server-only";
import QRCode from "qrcode";
import { publicEnv } from "@/lib/env";

/** Every printed QR code points at GoMenu's stable /q/{token} route (spec §9). */
export const qrUrl = (token: string) => `${publicEnv.NEXT_PUBLIC_APP_URL}/q/${token}`;

export function qrSvg(token: string): Promise<string> {
  return QRCode.toString(qrUrl(token), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

export function qrPng(token: string): Promise<Buffer> {
  return QRCode.toBuffer(qrUrl(token), { type: "png", margin: 2, width: 1024, errorCorrectionLevel: "M" });
}
