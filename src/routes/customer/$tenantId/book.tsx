import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/components/customer-pages";
import { BookingBoundary } from "@/components/server-booking";

export const Route = createFileRoute("/customer/$tenantId/book")({
  validateSearch: (search: Record<string, unknown>) => ({
    service: typeof search["service"] === "string" ? search["service"] : undefined,
    employee: typeof search["employee"] === "string" ? search["employee"] : undefined,
  }),
  component: BookingRoute,
});

function BookingRoute() {
  const { tenantId } = Route.useParams();
  const { service, employee } = Route.useSearch();
  return (
    <BookingBoundary initialProfessional={employee}>
      <BookingPage tenantId={tenantId} initialService={service} initialEmployee={employee} />
    </BookingBoundary>
  );
}
