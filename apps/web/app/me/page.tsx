import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { deleteMyDinerData, removeFavorite, saveDinerProfile } from "@/app/actions/diner";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { fmt, getDictionary } from "@/lib/i18n";
import { publicMediaUrl } from "@/lib/media/url";
import { money } from "@/lib/site/money";
import { siteStrings } from "@/lib/site/strings";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My account", robots: { index: false } };

type Favorite = {
  id: string; restaurant_id: string; restaurant_name: string; slug: string; logo_path: string | null;
  item_id: string | null; item_name: Record<string, string> | null; default_locale: string;
};

type MyOrder = {
  public_key: string; number: number; status: string; payment_status: string; total_minor: number; currency: string;
  created_at: string; restaurant_name: string; slug: string;
};

/** The diner's universal account (spec §12): profile, preferences, favorites, privacy controls. */
export default async function DinerAccount() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/me/login?next=/me");
  const { locale, t } = await getDictionary();
  const [{ data: profile }, { data: favs }, { data: orderRows }] = await Promise.all([
    supabase.from("profiles").select("full_name, phone_e164, locale, analytics_opt_out, marketing_opt_in").eq("id", auth.user.id).single(),
    supabase.rpc("my_favorites"),
    supabase.rpc("my_orders", { p_limit: 20 }),
  ]);
  const orders = (orderRows ?? []) as unknown as MyOrder[];
  const site = siteStrings(locale);
  const favorites = (favs ?? []) as unknown as Favorite[];
  const label = (f: Favorite) => (f.item_name ? f.item_name[locale] || f.item_name[f.default_locale] || Object.values(f.item_name)[0] : null);

  return (
    <AuthShell>
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t.diner.title}</h1>
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.diner.orders}</CardTitle></CardHeader>
          <CardContent>
            {orders.length ? (
              <ul className="grid gap-2">
                {orders.map((o) => (
                  <li key={o.public_key} data-testid="my-order">
                    <Link href={`/${o.slug}/order/${o.public_key}`} className="flex items-center justify-between gap-2 rounded-md p-1 hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.restaurant_name} · {fmt(t.diner.orderNumber, { n: o.number })}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}
                          {" · "}{site.order.steps[o.status === "new" ? "placed" : o.status] ?? o.status}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm">{money(o.total_minor, o.currency, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t.diner.noOrders}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.diner.favorites}</CardTitle></CardHeader>
          <CardContent>
            {favorites.length ? (
              <ul className="grid gap-2">
                {favorites.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2" data-testid="my-favorite">
                    <Link href={f.item_id ? `/${f.slug}/item/${f.item_id}` : `/${f.slug}`} className="flex items-center gap-2 hover:underline">
                      {f.logo_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publicMediaUrl(f.logo_path) ?? ""} alt="" className="size-8 rounded-full object-cover" />
                      ) : null}
                      <span>{label(f) ? `${label(f)} · ${f.restaurant_name}` : f.restaurant_name}</span>
                    </Link>
                    <RowAction action={removeFavorite} fields={{ id: f.id }} label={t.diner.remove} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t.diner.noFavorites}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.diner.profile}</CardTitle>
            <CardDescription dir="ltr">{profile?.phone_e164}</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={saveDinerProfile}>
              <Field id="full_name" label={t.account.fullName}><Input name="full_name" defaultValue={profile?.full_name ?? ""} /></Field>
              <div className="grid gap-2">
                <Label htmlFor="locale">{t.diner.language}</Label>
                <select id="locale" name="locale" defaultValue={profile?.locale ?? "en"} className="h-11 rounded-md border border-input bg-background px-3">
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t.diner.privacy}</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="analytics_opt_out" defaultChecked={profile?.analytics_opt_out} className="mt-1" /> {t.diner.analyticsOptOut}
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="marketing_opt_in" defaultChecked={profile?.marketing_opt_in} className="mt-1" /> {t.diner.marketingOptIn}
                </label>
              </fieldset>
              <SubmitButton>{t.common.save}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <p className="text-sm text-muted-foreground">{t.diner.deleteBody}</p>
            <ActionForm action={deleteMyDinerData}>
              <div><SubmitButton variant="outline" size="sm">{t.diner.deleteData}</SubmitButton></div>
            </ActionForm>
            <form action={logout}><button type="submit" className="text-sm underline">{t.common.logout}</button></form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}
