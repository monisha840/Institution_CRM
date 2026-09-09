import { readSettings } from "@/lib/db";
import DonorFormClient from "./DonorFormClient";

export const dynamic = "force-dynamic";

// Public donor onboarding page. No auth required — anyone with the link
// can submit. The submission lands in donor_form_submissions where
// admin / principal / trust accountant can review and accept it from
// the Donors screen.
export default async function DonorFormPage() {
  // Pull the trust identity so the form shows the right school name.
  // Fall back to the bundled defaults if settings haven't been written.
  // Pull the trust identity so the form shows the right school name.
  // Fall back to the bundled defaults if settings haven't been written.
  let school = { name: "Sanfort International School", trustName: "Sanvi Educational and Charitable Trust" };
  try {
    const settings = await readSettings();
    const trust = settings?.trust || {};
    school = {
      name:      trust.name      || school.name,
      trustName: trust.trustName || trust.name || school.trustName,
      regNo:     trust.regNo     || null,
      pan80g:    trust.pan80g    || null,
      contact:   trust.contact   || null,
    };
  } catch {}

  return <DonorFormClient school={school} />;
}
