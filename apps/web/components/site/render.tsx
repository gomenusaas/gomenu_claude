import "./site.css";
import { CartBar } from "./cart";
import { Tracker } from "./client";
import { PreviewBanner, type SiteProps, TableBanner } from "./parts";
import { Cards, Classic, Minimal } from "./templates/free";
import { Bold, Showcase, Street } from "./templates/gold";
import { Cafe, Elegant, Magazine } from "./templates/paid";

const TEMPLATES: Record<string, (props: { p: SiteProps }) => React.ReactNode> = {
  classic: Classic, minimal: Minimal, cards: Cards,
  showcase: Showcase, bold: Bold, street: Street,
  elegant: Elegant, magazine: Magazine, cafe: Cafe,
};

/** The whole public website. Templates are presentation only; the data is the same for all. */
export function SiteRenderer({ p }: { p: SiteProps }) {
  const key = p.view.data.website.template in TEMPLATES ? p.view.data.website.template : "classic";
  const Template = TEMPLATES[key];
  return (
    <div className={`gm-site gm-t-${key}`} dir={p.view.dir} lang={p.view.locale} data-template={key}>
      <PreviewBanner p={p} />
      <TableBanner p={p} />
      <Template p={p} />
      <Tracker restaurantId={p.view.data.restaurant.id} locale={p.view.locale} branchId={p.view.branchId} disabled={p.ctx.preview}
               events={[{ type: "website_view" }, { type: "menu_view" }]} />
      {p.view.data.website.ordering_enabled && !p.ctx.preview ? (
        <CartBar restaurantId={p.view.data.restaurant.id} href={p.view.path("/checkout")} label={p.s.order.viewOrder}
                 itemsLabel={p.s.order.items} oneItemLabel={p.s.order.oneItem} currency={p.view.data.restaurant.currency} locale={p.view.locale} />
      ) : null}
    </div>
  );
}
