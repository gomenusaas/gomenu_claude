import { Input } from "@gomenu/ui";
import {
  acceptOrder, assignOrder, cancelOrder, completeOrder, confirmOrder, markServed, markTestOrder, recordPayment, rejectOrder,
} from "@/app/actions/orders";
import { ActionForm } from "@/components/action-form";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import type { Dictionary } from "@/lib/i18n/en";
import type { OrderRow, StaffMember } from "@/lib/orders/data";

const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * The buttons a person sees for an order. Only a convenience: every action is checked again in
 * the database (permission, branch, shift, status), so a hidden button is never the protection.
 */
export function OrderActions({ order: o, restaurantId, userId, can, mode, staff, onShift, t, full }: {
  order: OrderRow; restaurantId: string; userId: string; can: (p: string) => boolean; mode: string;
  staff: StaffMember[]; onShift: boolean; t: Dictionary; full?: boolean;
}) {
  const base = { restaurant_id: restaurantId, id: o.id };
  const manager = can("orders.manage");
  const mine = o.assigned_waiter_id === userId;
  const isNew = o.status === "new";
  const unpaid = ["unpaid", "failed", "pending"].includes(o.payment_status);
  const closed = ["completed", "rejected", "cancelled", "refunded"].includes(o.status);
  const handlesTable = o.service_type === "table" && (mine || manager || (!o.assigned_waiter_id && mode === "open" && onShift));
  const responsible = mine || o.created_by === userId || manager;

  return (
    <div className="flex flex-wrap items-start gap-2">
      {isNew && o.service_type === "table" && !o.assigned_waiter_id && mode === "open" && can("orders.confirm_table") ? (
        <RowAction action={acceptOrder} fields={base} label={t.orders.accept} variant="outline" testId="order-accept" />
      ) : null}
      {isNew && ((o.service_type === "table" && handlesTable && can("orders.confirm_table")) || (o.service_type !== "table" && manager)) ? (
        <RowAction action={confirmOrder} fields={base} label={o.service_type === "table" ? t.orders.confirmTable : t.orders.confirm}
                   variant="primary" testId="order-confirm" />
      ) : null}
      {isNew && unpaid && (handlesTable || manager) ? (
        <ActionForm action={rejectOrder} className="flex flex-wrap items-center gap-1" quiet>
          <input type="hidden" name="restaurant_id" value={restaurantId} />
          <input type="hidden" name="id" value={o.id} />
          <select name="reason" aria-label={t.orders.rejectReason} className={select} defaultValue="not_at_table">
            {Object.entries(t.orders.reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {full ? <Input name="note" placeholder={t.orders.note} className="h-9 w-40" /> : null}
          <SubmitButton size="sm" variant="ghost" data-testid="order-reject">{t.orders.reject}</SubmitButton>
        </ActionForm>
      ) : null}
      {o.status === "ready" && (mine || manager) ? (
        <RowAction action={markServed} fields={base} label={t.orders.served} variant="outline" testId="order-served" />
      ) : null}
      {!closed && unpaid && (!o.needs_confirmation || o.confirmed_at) && responsible ? (
        <>
          <RowAction action={recordPayment} fields={{ ...base, method: "cash" }} label={t.orders.cash} variant="outline" testId="order-cash" />
          <RowAction action={recordPayment} fields={{ ...base, method: "card_at_restaurant" }} label={t.orders.card} />
        </>
      ) : null}
      {["ready", "served"].includes(o.status) && o.payment_status === "paid" && (mine || manager) ? (
        <RowAction action={completeOrder} fields={base} label={t.orders.complete} variant="primary" testId="order-complete" />
      ) : null}
      {manager && !closed ? (
        <ActionForm action={assignOrder} className="flex items-center gap-1" quiet>
          <input type="hidden" name="restaurant_id" value={restaurantId} />
          <input type="hidden" name="id" value={o.id} />
          <select name="waiter_id" aria-label={t.orders.assignTo} className={select} defaultValue={o.assigned_waiter_id ?? ""}>
            <option value="">{t.orders.nobody}</option>
            {staff.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}{m.on_shift ? " ●" : ""}</option>)}
          </select>
          <SubmitButton size="sm" variant="ghost" data-testid="order-assign">{t.orders.assign}</SubmitButton>
        </ActionForm>
      ) : null}
      {full && manager && !closed ? (
        <ActionForm action={cancelOrder} className="flex flex-wrap items-center gap-1" quiet>
          <input type="hidden" name="restaurant_id" value={restaurantId} />
          <input type="hidden" name="id" value={o.id} />
          <Input name="note" placeholder={t.orders.cancelReason} aria-label={t.orders.cancelReason} className="h-9 w-48" />
          <SubmitButton size="sm" variant="ghost" data-testid="order-cancel">{t.orders.cancel}</SubmitButton>
        </ActionForm>
      ) : null}
      {full && manager ? (
        <RowAction action={markTestOrder} fields={{ ...base, value: String(!o.is_test) }} label={o.is_test ? t.orders.unmarkTest : t.orders.markTest} />
      ) : null}
    </div>
  );
}
