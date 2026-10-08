import { Alert } from "@gomenu/ui";

/** Legal pages are DRAFTS pending legal review (decision P2-Q10). */
export function LegalPage({ title, draftNote, sections }: {
  title: string; draftNote: string; sections: { heading: string; body: string }[];
}) {
  return (
    <article className="mx-auto grid max-w-3xl gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <Alert tone="warning">{draftNote}</Alert>
      {sections.map((s) => (
        <section key={s.heading} className="grid gap-2">
          <h2 className="text-lg font-semibold">{s.heading}</h2>
          <p className="leading-7 text-muted-foreground">{s.body}</p>
        </section>
      ))}
    </article>
  );
}
