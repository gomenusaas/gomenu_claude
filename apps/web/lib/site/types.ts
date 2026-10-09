/** Shape of public_site() / preview_site(): everything a visitor may see. */
export type I18n = Record<string, string>;

export interface SiteBranch {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  is_open: boolean;
  hours: { day: number; opens: string; closes: string }[];
}

export interface SiteMedia {
  kind: "image" | "video";
  path: string;
  poster_path: string | null;
  width?: number | null;
  height?: number | null;
}

export interface SiteItem {
  id: string;
  category_id: string;
  name: I18n;
  description: I18n;
  price_minor: number;
  calories: number | null;
  allergens: string[];
  dietary_tags: string[];
  spice_level: number;
  is_available: boolean;
  media: SiteMedia[];
  variants: { id: string; name: I18n; price_minor: number; is_default: boolean }[];
  option_groups: {
    id: string;
    name: I18n;
    min_select: number;
    max_select: number | null;
    options: { id: string; name: I18n; price_delta_minor: number; is_available: boolean }[];
  }[];
}

export interface SitePromotion {
  id: string;
  kind: "card" | "banner" | "carousel";
  title: I18n;
  body: I18n;
  image_path: string | null;
  item_id: string | null;
  ends_at: string | null;
  branch_ids: string[];
}

export interface SiteFrame {
  id: string;
  kind: "image" | "video";
  path: string;
  poster_path: string | null;
  caption: I18n;
  item_id: string | null;
  promotion_id: string | null;
  expires_at: string;
  branch_ids: string[];
}

export interface SiteData {
  status: "ok";
  preview?: boolean;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    tagline: I18n;
    description: I18n;
    logo_path: string | null;
    cover_path: string | null;
    currency: string;
    default_locale: string;
    timezone: string;
    contact_phone: string | null;
    contact_email: string | null;
    whatsapp: string | null;
    social_links: Record<string, string>;
  };
  website: {
    template: string;
    menu_style: "list" | "grid" | "compact";
    show_gallery: boolean;
    show_branches: boolean;
    show_hours: boolean;
    ordering_enabled: boolean;
    seo_title: I18n;
    seo_description: I18n;
    is_published: boolean;
  };
  features: { sharing: boolean };
  canonical_host: string | null;
  languages: { code: string; name: string; native_name: string; dir: "ltr" | "rtl" }[];
  branches: SiteBranch[];
  categories: { id: string; name: I18n; description: I18n }[];
  items: SiteItem[];
  branch_overrides: { branch_id: string; item_id: string | null; category_id: string | null; is_hidden: boolean; is_available: boolean }[];
  gallery: { id: string; kind: "image" | "video"; path: string; poster_path: string | null; caption: I18n }[];
  promotions: SitePromotion[];
  frames: SiteFrame[];
}

export type SiteResult = SiteData | { status: "unavailable"; restaurant: { name: string; slug: string } } | null;

/** QR/table context carried from /q/{token} (shown to the diner; ordering uses it in Phase 5). */
export interface TableContext {
  restaurant_id: string;
  qr_code_id: string;
  branch_id: string | null;
  table_id: string | null;
  table_label: string | null;
}

/** Cookie holding the TableContext of the last table QR scan (httpOnly, 4 hours). */
export const TABLE_COOKIE = "gm_table";
