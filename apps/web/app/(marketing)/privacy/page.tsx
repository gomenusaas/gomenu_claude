import { LegalPage } from "@/components/legal-page";
import { getDictionary } from "@/lib/i18n";

export const metadata = { title: "Privacy Policy" };

// DRAFT structure only. Must be reviewed by legal counsel, including the audit-retention
// decision (audit history is kept indefinitely with actor details).
const sections = [
  { heading: "1. What we collect", body: "Mobile numbers and names for sign-in, restaurant business data, order and loyalty activity, and security logs. [Draft]" },
  { heading: "2. How restaurants see diner data", body: "A restaurant sees only a diner's activity with that restaurant. [Draft]" },
  { heading: "3. Security and audit logs", body: "We keep an activity log of security-relevant actions, including who performed them. [Draft: retention period to be confirmed.]" },
  { heading: "4. Your choices", body: "Account, privacy and communication controls. [Draft]" },
  { heading: "5. Contact", body: "[Draft: data protection contact details.]" },
];

export default async function PrivacyPage() {
  const { t } = await getDictionary();
  return <LegalPage title={t.marketing.privacyTitle} draftNote={t.marketing.legalDraft} sections={sections} />;
}
