import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/khazna/AppShell";
import { useKhazna } from "@/lib/khazna/store";

function AdminLayout() {
  return (
    <AppShell role="admin">
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    const role = useKhazna.getState().currentRole;
    if (role === "manager") {
      const slug = useKhazna.getState().managerSector;
      throw redirect({
        to: "/m/$sectorSlug",
        params: { sectorSlug: slug },
      });
    } else if (role === "student") {
      throw redirect({ to: "/app" });
    }
  },
  component: AdminLayout,
});
