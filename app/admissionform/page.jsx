import { readSettings } from "@/lib/db";
import AdmissionFormClient from "./AdmissionFormClient";
import { tenantConfig } from "@/lib/tenants";
import { currentTenant } from "@/lib/tenant-context";
import { resolveSchool } from "@/lib/export";

export const dynamic = "force-dynamic";

// Public admission enquiry page. No auth required — parents can apply
// online with the link. The submission lands in the `enquiries` table
// where principal / admin can review and convert to an admitted student
// via the existing Enquiries → Convert flow.
export default async function AdmissionFormPage() {
  // This page is public, so it has no session to read a tenant from —
  // middleware resolves it from the ?tenant= parameter or the hint cookie
  // and stamps it on the request. The registry is the fallback identity,
  // which means the form is correctly branded even before any settings row
  // has been written.
  const institution = tenantConfig(currentTenant());
  let school = {
    name: institution.name,
    trustName: institution.trustName,
    city: institution.city,
    address: `${institution.addressLine1}, ${institution.addressLine2} ${institution.pincode}`,
    phone: institution.phone,
    contact: institution.email,
    regNo: institution.trustRegNo,
    institutionType: institution.institutionType,
  };
  try {
    const settings = await readSettings();
    const configured = resolveSchool(settings);
    school = {
      ...school,
      name:      configured.name      || school.name,
      trustName: configured.trustName || school.trustName,
      city:      configured.city      || school.city,
      address:   configured.address   || school.address,
      phone:     configured.phone     || school.phone,
      contact:   configured.contact   || school.contact,
      regNo:     configured.regNo     || school.regNo,
    };
  } catch {}

  return <AdmissionFormClient school={school} />;
}
