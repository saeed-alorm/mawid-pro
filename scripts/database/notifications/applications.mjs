// Server-owned routing policy. Package names never create actor permissions.
export const APPLICATIONS = [
  "com.mawid.demo",
  "com.mawid.customer.platinum",
  "com.mawid.management",
];
export const ENVIRONMENTS = ["development", "staging"];
export function applicationAllows(application, access, kind = "booking") {
  if (application === "com.mawid.demo") return true; // disposable compatibility client
  if (application === "com.mawid.customer.platinum")
    return kind !== "pending_reminder" && access.customers.length > 0 && access.roles.length === 0;
  if (application === "com.mawid.management")
    return (
      kind !== "review_invitation" &&
      access.roles.some((r) => ["admin", "manager", "professional"].includes(r))
    );
  return false;
}
