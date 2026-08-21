import { createFileRoute } from "@tanstack/react-router";
import { EmployeeDetailPage } from "@/components/management-pages";

export const Route = createFileRoute("/manage/$tenantId/team/$employeeId")({
  component: EmployeeRoute,
});

function EmployeeRoute() {
  const { tenantId, employeeId } = Route.useParams();
  return <EmployeeDetailPage tenantId={tenantId} employeeId={employeeId} />;
}
