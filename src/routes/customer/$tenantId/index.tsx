import { createFileRoute } from "@tanstack/react-router";
import { CustomerSalonPage } from "@/components/customer-pages";

export const Route = createFileRoute("/customer/$tenantId/")({
  component: CustomerRoute,
});

function CustomerRoute() {
  const { tenantId } = Route.useParams();
  return <CustomerSalonPage tenantId={tenantId} />;
}
