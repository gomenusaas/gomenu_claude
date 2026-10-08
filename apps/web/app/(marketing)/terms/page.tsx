import { LegalPage } from "@/components/legal-page";
import { getDictionary } from "@/lib/i18n";

export const metadata = { title: "Terms of Service" };

// DRAFT structure only. Replace with text approved by legal counsel before launch.
const sections = [
  { heading: "1. The service", body: "GoMenu provides restaurants with a website, digital menu, ordering, staff tools, loyalty and reporting. [Draft: describe the service and its availability.]" },
  { heading: "2. Accounts and staff", body: "Each person uses their own account. Restaurant owners are responsible for who they invite and the roles they assign. [Draft]" },
  { heading: "3. Free trial and subscriptions", body: "First-time restaurants receive a free trial. Subscriptions are billed annually in advance; unpaid accounts move through past due, grace and suspension as described in the billing section. [Draft]" },
  { heading: "4. Payments from your guests", body: "Guest payments are processed by the restaurant's own payment gateway and settle to the restaurant. GoMenu does not hold guest funds. [Draft]" },
  { heading: "5. Your content and data", body: "Restaurants own their menus, media and business data. GoMenu processes it to provide the service. [Draft]" },
  { heading: "6. Acceptable use, liability, termination and governing law", body: "[Draft: to be written with legal counsel, including the governing law of the Sultanate of Oman if applicable.]" },
];

export default async function TermsPage() {
  const { t } = await getDictionary();
  return <LegalPage title={t.marketing.termsTitle} draftNote={t.marketing.legalDraft} sections={sections} />;
}
