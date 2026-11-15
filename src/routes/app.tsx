import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/khazna/AppShell";
import { useKhazna } from "@/lib/khazna/store";

function StudentLayout() {
  return (
    <AppShell role="student">
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    const role = useKhazna.getState().currentRole;
    if (role === "admin") {
      throw redirect({ to: "/admin" });
    } else if (role === "manager") {
      const slug = useKhazna.getState().managerSector;
      throw redirect({
        to: "/m/$sectorSlug",
        params: { sectorSlug: slug },
      });
    }
  },
  component: StudentLayout,
});
