import { createFileRoute } from "@tanstack/react-router";
import { CustomerAppointmentsPage } from "@/components/customer-pages";

export const Route = createFileRoute("/customer/$tenantId/appointments")({
  component: AppointmentsRoute,
});

function AppointmentsRoute() {
  const { tenantId } = Route.useParams();
  return <CustomerAppointmentsPage tenantId={tenantId} />;
}
