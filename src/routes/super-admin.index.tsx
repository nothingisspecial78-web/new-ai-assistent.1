import { createFileRoute, redirect } from "@tanstack/react-router";
import { SuperAdminDashboard } from "@/apps/super-admin/SuperAdminDashboard";

export const Route = createFileRoute("/super-admin/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("khazna_super_admin_token");
      if (!token) {
        throw redirect({ to: "/super-admin/login" });
      }
    }
  },
  component: SuperAdminDashboard,
});
