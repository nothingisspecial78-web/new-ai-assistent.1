import { createFileRoute } from "@tanstack/react-router";
import { SuperAdminLogin } from "@/apps/super-admin/SuperAdminLogin";

export const Route = createFileRoute("/super-admin/login")({
  component: SuperAdminLogin,
});
