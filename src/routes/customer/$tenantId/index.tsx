import { createFileRoute } from "@tanstack/react-router";
import { CustomerSalonPage } from "@/components/customer-pages";
import { BookingBoundary } from "@/components/server-booking";

export const Route = createFileRoute("/customer/$tenantId/")({
  component: CustomerRoute,
});

function CustomerRoute() {
  const { tenantId } = Route.useParams();
  return (
    <BookingBoundary>
      <CustomerSalonPage tenantId={tenantId} />
    </BookingBoundary>
  );
}
