import { Button, Card, CardContent } from "@gomenu/ui";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Contact" };

export default async function ContactPage() {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_contact");
  const contact = (data ?? {}) as { whatsapp?: string; email?: string };
  const m = t.marketing;
  return (
    <section className="mx-auto grid max-w-2xl gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">{m.contactTitle}</h1>
      <p className="text-muted-foreground">{m.contactBody}</p>
      <Card>
        <CardContent className="flex flex-wrap gap-3">
          {contact.whatsapp ? (
            <Button asChild><a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`} rel="noopener">{m.contactWhatsapp}</a></Button>
          ) : null}
          {contact.email ? (
            <Button asChild variant="outline"><a href={`mailto:${contact.email}`}>{m.contactEmail}</a></Button>
          ) : null}
          {!contact.whatsapp && !contact.email ? <p className="text-sm text-muted-foreground">{m.contactSoon}</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}
