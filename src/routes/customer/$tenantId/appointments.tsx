import { createFileRoute } from "@tanstack/react-router";
import { CustomerAppointmentsPage } from "@/components/customer-pages";
import { BookingBoundary } from "@/components/server-booking";

export const Route = createFileRoute("/customer/$tenantId/appointments")({
  component: AppointmentsRoute,
});

function AppointmentsRoute() {
  const { tenantId } = Route.useParams();
  return (
    <BookingBoundary>
      <CustomerAppointmentsPage tenantId={tenantId} />
    </BookingBoundary>
  );
}
