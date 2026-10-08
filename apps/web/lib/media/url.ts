/** Public URL of an object in the restaurant-public bucket. */
export function publicMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/restaurant-public/${path}`;
}
