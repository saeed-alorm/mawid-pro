import { createFileRoute } from "@tanstack/react-router";
import { ManagementPage, type ManageSection } from "@/components/management-pages";

const sections: ManageSection[] = [
  "overview",
  "bookings",
  "calendar",
  "team",
  "customers",
  "analytics",
  "settings",
];

export const Route = createFileRoute("/manage/$tenantId/$section")({
  component: ManageRoute,
});

function ManageRoute() {
  const { tenantId, section } = Route.useParams();
  const safeSection = sections.includes(section as ManageSection)
    ? (section as ManageSection)
    : "overview";
  return <ManagementPage tenantId={tenantId} section={safeSection} />;
}
