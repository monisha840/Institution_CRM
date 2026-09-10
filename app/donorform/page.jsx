import { readSettings } from "@/lib/db";
import DonorFormClient from "./DonorFormClient";
import { tenantConfig } from "@/lib/tenants";
import { currentTenant } from "@/lib/tenant-context";
import { resolveSchool } from "@/lib/export";

export const dynamic = "force-dynamic";

// Public donor onboarding page. No auth required — anyone with the link
// can submit. The submission lands in donor_form_submissions where
// admin / principal / trust accountant can review and accept it from
// the Donors screen.
export default async function DonorFormPage() {
  // Public page: middleware resolves the tenant from ?tenant= or the hint
  // cookie, and the registry supplies the identity so the form is branded
  // correctly even before any settings row exists.
  const institution = tenantConfig(currentTenant());
  let school = {
    name: institution.name,
    trustName: institution.trustName,
    regNo: institution.trustRegNo,
    pan80g: institution.trust80g,
    contact: institution.email,
  };
  try {
    const settings = await readSettings();
    const configured = resolveSchool(settings);
    school = {
      name:      configured.name      || school.name,
      trustName: configured.trustName || school.trustName,
      regNo:     configured.regNo     || school.regNo,
      pan80g:    configured.pan80g    || school.pan80g,
      contact:   configured.contact   || school.contact,
    };
  } catch {}

  return <DonorFormClient school={school} />;
}
