import { readSettings } from "@/lib/db";
import AdmissionFormClient from "./AdmissionFormClient";

export const dynamic = "force-dynamic";

// Public admission enquiry page. No auth required — parents can apply
// online with the link. The submission lands in the `enquiries` table
// where principal / admin can review and convert to an admitted student
// via the existing Enquiries → Convert flow.
export default async function AdmissionFormPage() {
  // Pull the school identity so the form shows the right name.
  // Fall back to the bundled defaults if settings haven't been written.
  // Pull the school identity so the form shows the right names.
  // Fall back to the bundled defaults if settings haven't been written.
  let school = { name: "Sanfort International School", trustName: "Sanvi Educational and Charitable Trust" };
  try {
    const settings = await readSettings();
    const trust = settings?.trust || {};
    school = {
      name:      trust.name      || school.name,
      trustName: trust.trustName || trust.name || school.trustName,
      regNo:     trust.regNo     || null,
      contact:   trust.contact   || null,
    };
  } catch {}

  return <AdmissionFormClient school={school} />;
}
