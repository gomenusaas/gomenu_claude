import "server-only";
import { revalidatePath, updateTag } from "next/cache";

/** Cache tag of a restaurant's public website data (see lib/site/data.ts). */
export const siteTag = (restaurantId: string) => `site:${restaurantId}`;

/** After a change in the dashboard: refresh the admin pages and the public website at once. */
export function refreshRestaurant(restaurantId: string) {
  revalidatePath(`/r/${restaurantId}`, "layout");
  updateTag(siteTag(restaurantId));
}
