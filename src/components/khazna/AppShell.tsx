import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  FileCheck,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MoreVertical,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  UserPlus,
  UserRound,
  BarChart3,
  Building2,
  Plus,
  Upload,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Sector, Student } from "@/lib/khazna/types";
import { QuickActionSheet } from "./QuickActionSheet";
import { AestheticMenu } from "./AestheticMenu";
import { NewEntryDialog, type EntryPreset } from "./NewEntryDialog";
import { StudentFormDrawer } from "./StudentFormDrawer";

const NO_STUDENT: Student = { id: "—", name: "Student", className: "—", phone: "", guardian: "—", joined: "" };
const NO_SECTOR: Sector = { slug: "", name: "No sector yet", short: "—", description: "", color: "var(--sector-office)", receiptPrefix: "", target: 1, creditTitles: [], debitTitles: [] };
import { clearSignInTransition, isSignInTransitionPending } from "@/lib/khazna/sign-in-transition";
import { managerNameIn, useKhazna } from "@/lib/khazna/store";
import type { Role, SectorSlug } from "@/lib/khazna/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./primitives";
import { KMenu, KMenuItem } from "./overlays";
import { sectorIcon, tileVar } from "./sector-meta";
import { Logo } from "./Logo";

const ROLE_META: Record<Role, { label: string; icon: LucideIcon }> = {
  admin: { label: "Admin", icon: ShieldCheck },
  manager: { label: "Sector Manager", icon: UserCog },
  student: { label: "Student", icon: GraduationCap },
};

type LinkRenderProps = { className: string; onClick: () => void; children: (s: { isActive: boolean }) => ReactNode };
interface NavItem {
  label: string;
  icon: LucideIcon;
  badge?: string | undefined;
  render: (p: LinkRenderProps) => ReactNode;
  tile?: string | undefined;
}

function useNav(role: Role, sectorSlug: SectorSlug): { title: string; items: NavItem[] }[] {
  const sectors = useKhazna((s) => s.sectors);
  const unread = useKhazna((s) => s.notices.filter((n) => !n.read).length);
  if (role === "admin") {
    return [
      {
        title: "Overview",
        items: [
          { label: "Dashboard", icon: LayoutDashboard, render: (p) => <Link to="/admin" data-guide-id="nav-dashboard" activeOptions={{ exact: true }} {...p} /> },
          { label: "Audit Log", icon: ScrollText, render: (p) => <Link to="/admin/audit" data-guide-id="nav-audit" {...p} /> },
          { label: "Issued Reports", icon: FileCheck, render: (p) => <Link to="/admin/issued-reports" data-guide-id="nav-reports" {...p} /> },
        ],
      },
      {
        title: "People",
        items: [
          { label: "Student Directory", icon: Users, render: (p) => <Link to="/admin/students" data-guide-id="nav-students" activeOptions={{ exact: true }} {...p} /> },
          { label: "Bulk Import", icon: Upload, render: (p) => <Link to="/admin/students/import" data-guide-id="nav-students-import" {...p} /> },
          { label: "Admins", icon: UserCog, render: (p) => <Link to="/admin/admins" data-guide-id="nav-admins" {...p} /> },
        ],
      },
      {
        title: "Structure",
        items: [
          { label: "Institution Profile", icon: Building2, render: (p) => <Link to="/admin/institution" data-guide-id="nav-institution" {...p} /> },
          { label: "Sectors & Classes", icon: Layers, render: (p) => <Link to="/admin/sectors" data-guide-id="nav-sectors" {...p} /> },
        ],
      },
    ];
  }
  if (role === "manager") {
    const p = { sectorSlug };
    return [
      {
        title: "Sector",
        items: [
          { label: "Overview", icon: LayoutDashboard, render: (lp) => <Link to="/m/$sectorSlug" params={p} data-guide-id="nav-manager-overview" activeOptions={{ exact: true }} {...lp} /> },
          { label: "Ledger", icon: ReceiptText, render: (lp) => <Link to="/m/$sectorSlug/ledger" params={p} data-guide-id="nav-manager-ledger" {...lp} /> },
          { label: "Bulk Entry", icon: ListChecks, badge: "New", render: (lp) => <Link to="/m/$sectorSlug/bulk" params={p} data-guide-id="nav-manager-bulk" {...lp} /> },
        ],
      },
      {
        title: "Records",
        items: [
          { label: "Class Reports", icon: BarChart3, render: (lp) => <Link to="/m/$sectorSlug/reports" params={p} data-guide-id="nav-manager-reports" {...lp} /> },
          { label: "Batches", icon: FileSpreadsheet, render: (lp) => <Link to="/m/$sectorSlug/batches" params={p} data-guide-id="nav-manager-batches" {...lp} /> },
        ],
      },
    ];
  }
  return [
    { title: "Me", items: [{ label: "Overview", icon: LayoutDashboard, render: (p) => <Link to="/app" data-guide-id="nav-student-overview" activeOptions={{ exact: true }} {...p} /> }] },
    {
      title: "My Ledgers",
      items: sectors.map((s) => ({
        label: s.name,
        icon: sectorIcon(s.slug),
        tile: s.color,
        render: (p: LinkRenderProps) => <Link to="/app/s/$sectorSlug" params={{ sectorSlug: s.slug }} {...p} />,
      })),
    },
    {
      title: "Account",
      items: [
        { label: "Notifications", icon: Bell, badge: unread ? String(unread) : undefined, render: (p) => <Link to="/app/notifications" data-guide-id="nav-student-notifications" {...p} /> },
        { label: "Profile", icon: UserRound, render: (p) => <Link to="/app/profile" data-guide-id="nav-student-profile" {...p} /> },
      ],
    },
  ];
}

function NavList({ role, sectorSlug, onNavigate }: { role: Role; sectorSlug: SectorSlug; onNavigate?: (() => void) | undefined }) {
  const groups = useNav(role, sectorSlug);
  return (
    <nav className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-subtle">{g.title}</div>
          <div className="space-y-0.5">
            {g.items.map((it) => (
              <div key={it.label}>
                {it.render({
                  onClick: () => onNavigate?.(),
                  className:
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground",
                  children: ({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />}
                      {it.tile ? (
                        <span className="tile-icon size-6" style={tileVar(it.tile)}>
                          <it.icon className="size-3.5" />
                        </span>
                      ) : (
                        <it.icon className={cn("size-4", isActive && "text-primary")} />
                      )}
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.badge && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{it.badge}</span>}
                    </>
                  ),
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function TabletNavRail({ role, sectorSlug }: { role: Role; sectorSlug: SectorSlug }) {
  const groups = useNav(role, sectorSlug);
  return (
    <aside className="no-print sticky top-[5.75rem] z-30 hidden w-20 shrink-0 self-start md:flex lg:hidden">
      <div className="glass max-h-[calc(100dvh-6.75rem)] w-full overflow-y-auto p-2 flex flex-col items-center gap-4 rounded-2xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col items-center gap-1.5 w-full">
            {g.items.map((it) => (
              <div key={it.label} className="w-full flex justify-center">
                {it.render({
                  onClick: () => {},
                  className:
                    "group relative flex flex-col items-center justify-center rounded-xl p-2 text-muted-foreground hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-primary w-14 transition-colors",
                  children: ({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="rail-active"
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                        />
                      )}
                      {it.tile ? (
                        <span className="tile-icon size-6 mb-1" style={tileVar(it.tile)}>
                          <it.icon className="size-3.5" />
                        </span>
                      ) : (
                        <it.icon className={cn("size-5 mb-1", isActive && "text-primary")} />
                      )}
                      <span className="text-[10px] text-center font-medium leading-tight truncate w-full">
                        {it.label}
                      </span>
                    </>
                  ),
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ContextCard({ role, sectorSlug }: { role: Role; sectorSlug: SectorSlug }) {
  const sector = useKhazna((s) => s.sectors.find((x) => x.slug === sectorSlug)) ?? NO_SECTOR;
  const managerName = useKhazna((s) => managerNameIn(s, sectorSlug));
  const collegeName = useKhazna((s) => s.college.name);
  const me = useKhazna((s) => s.students.find((x) => x.id === s.meStudentId)) ?? NO_STUDENT;
  if (role === "manager") {
    const Icon = sectorIcon(sector.slug);
    return (
      <div className="tile-glossy mb-5 p-3.5" style={tileVar(sector.color)}>
        <div className="relative flex items-center gap-3">
          <span className="tile-icon size-9">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{sector.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">Managed by {managerName}</div>
          </div>
        </div>
      </div>
    );
  }
  if (role === "student") {
    return (
      <div className="glass-inset mb-5 flex items-center gap-3 p-3">
        <Avatar name={me.name} size={36} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{me.name}</div>
          <div className="text-[11px] text-muted-foreground num">
            {me.id} · {me.className}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="glass-inset mb-5 p-3">
      <div className="text-[11px] uppercase tracking-wider text-subtle">Academic year</div>
      <div className="text-sm font-semibold text-foreground">2026–27 · Term 2</div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{collegeName}</div>
    </div>
  );
}

export function AppShell({ role, sectorSlug, children }: { role: Role; sectorSlug?: SectorSlug | undefined; children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const managerSector = useKhazna((s) => s.managerSector);
  const setManagerSector = useKhazna((s) => s.setManagerSector);
  const sectors = useKhazna((s) => s.sectors);
  const unread = useKhazna((s) => s.notices.filter((n) => !n.read).length);
  const me = useKhazna((s) => s.students.find((x) => x.id === s.meStudentId)) ?? NO_STUDENT;
  const setCurrentRole = useKhazna((s) => s.setCurrentRole);
  const [aestheticMenuOpen, setAestheticMenuOpen] = useState(false);
  // Arriving straight from the login hand-off: play a one-time blur-to-sharp reveal.
  const [entering, setEntering] = useState(isSignInTransitionPending);
  useEffect(() => {
    clearSignInTransition();
  }, []);
  const slug = sectorSlug ?? managerSector;
  const current = sectors.find((s) => s.slug === slug) ?? NO_SECTOR;
  const college = useKhazna((s) => s.college);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [globalEntryOpen, setGlobalEntryOpen] = useState(false);
  const [globalEntryPreset, setGlobalEntryPreset] = useState<EntryPreset | undefined>(undefined);
  const [globalStudentOpen, setGlobalStudentOpen] = useState(false);
  const currentManager = useKhazna((s) => managerNameIn(s, slug));
  const RoleIcon = ROLE_META[role].icon;

  const quickActions = [
    {
      id: "add-receipt",
      title: "Add Credit / Receipt",
      subtitle: "Record fee, donation, or incoming payment",
      icon: ArrowDownLeft,
      colorClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      onClick: () => {
        setGlobalEntryPreset({ type: "credit" });
        setGlobalEntryOpen(true);
      },
    },
    {
      id: "add-debit",
      title: "Add Debit / Expense",
      subtitle: "Record sector expense, voucher, or payout",
      icon: ArrowUpRight,
      colorClass: "bg-rose-500/10 text-rose-500 border-rose-500/20",
      onClick: () => {
        setGlobalEntryPreset({ type: "debit" });
        setGlobalEntryOpen(true);
      },
    },
    {
      id: "add-student",
      title: "Add Student",
      subtitle: "Register a new student with auto-assigned Ad.No",
      icon: UserPlus,
      colorClass: "bg-primary/10 text-primary border-primary/20",
      onClick: () => {
        setGlobalStudentOpen(true);
      },
    },
    ...(role === "manager"
      ? [
          {
            id: "bulk-entry",
            title: "Bulk Class Entry",
            subtitle: "Post one fee amount to multiple students at once",
            icon: ListChecks,
            colorClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
            onClick: () => {
              navigate({ to: "/m/$sectorSlug/bulk", params: { sectorSlug: slug } });
            },
          },
        ]
      : []),
  ];

  const switchRole = (r: Role) => {
    setCurrentRole(r);
    if (r === "admin") navigate({ to: "/admin" });
    else if (r === "manager") {
      const target = sectors.find((s) => s.slug === managerSector)?.slug ?? sectors[0]?.slug;
      if (!target) {
        toast("Add a sector first", { description: "Sector managers appear once a sector exists." });
        navigate({ to: "/admin/sectors" });
      } else navigate({ to: "/m/$sectorSlug", params: { sectorSlug: target } });
    } else if (me === NO_STUDENT) {
      toast("No students yet", { description: "Upload students first, then they can sign in with their admission number." });
      navigate({ to: "/admin/students/import" });
    } else navigate({ to: "/app" });
  };

  const switchSector = (s: SectorSlug) => {
    setManagerSector(s);
    const sub = pathname.split("/")[3];
    const params = { sectorSlug: s };
    if (sub === "ledger") navigate({ to: "/m/$sectorSlug/ledger", params });
    else if (sub === "bulk") navigate({ to: "/m/$sectorSlug/bulk", params });
    else if (sub === "reports") navigate({ to: "/m/$sectorSlug/reports", params });
    else if (sub === "batches") navigate({ to: "/m/$sectorSlug/batches", params });
    else navigate({ to: "/m/$sectorSlug", params });
  };

  const user =
    role === "admin"
      ? { name: college.adminName, sub: "Admin" }
      : role === "manager"
        ? { name: currentManager, sub: `${current.name} manager` }
        : { name: me.name, sub: `${me.id} · ${me.className}` };

  return (
    <div className="min-h-screen overflow-x-clip">
      {entering && <motion.div aria-hidden className="signin-glow pointer-events-none fixed inset-0 z-[70]" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9, ease: "easeOut" }} />}
      <motion.header
        initial={entering ? { opacity: 0, y: -18 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="no-print sticky top-0 z-40 px-3 pt-2.5 sm:px-4 md:px-6 md:pt-3"
      >
        <div className="glass-strong mx-auto flex h-16 max-w-[1440px] items-center gap-2 rounded-2xl px-3 md:gap-3 md:px-4">
          <button
            className="glass-inset grid size-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-accent transition-colors lg:hidden"
            onClick={() => setAestheticMenuOpen(true)}
            data-guide-id="mobile-menu-button"
            aria-label="Open menu"
          >
            <MoreVertical className="size-5 text-muted-foreground hover:text-foreground" />
          </button>
          <Logo />

          {/* College Workspace Badge (Organization scoped to Admin) */}
          <div className="hidden sm:block">
            <div className="glass-inset flex h-10 items-center gap-2 px-3 text-xs text-foreground md:text-sm">
              <Building2 className="size-3.5 text-primary" />
              <span className="max-w-[120px] truncate font-medium md:max-w-[180px]">{college.name}</span>
              {college.demo ? (
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Demo</span>
              ) : (
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" title="Live Workspace" />
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5 md:gap-2">
            <span className="hidden text-[11px] uppercase tracking-wider text-subtle xl:inline">Preview as</span>
            <KMenu
              label="Switch role (demo)"
              trigger={
                <button className="glass-inset flex h-10 items-center gap-2 px-3 text-sm text-foreground hover:bg-accent">
                  <RoleIcon className="size-4 text-primary" />
                  <span className="hidden sm:inline">{ROLE_META[role].label}</span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
              }
            >
              {(Object.keys(ROLE_META) as Role[]).map((r) => {
                const M = ROLE_META[r];
                return (
                  <KMenuItem key={r} onSelect={() => switchRole(r)} active={r === role}>
                    <M.icon className="size-4" />
                    <span className="flex-1">
                      {M.label}
                      {r === "student" && <span className="ml-1 text-xs text-subtle">Safwan · S0125</span>}
                    </span>
                    {r === role && <Check className="size-4 text-primary" />}
                  </KMenuItem>
                );
              })}
            </KMenu>

            {role === "manager" && (
              <KMenu
                label="Switch sector"
                trigger={
                  <button className="glass-inset flex h-10 items-center gap-2 px-3 text-sm text-foreground hover:bg-accent" style={tileVar(current.color)}>
                    <span className="size-2.5 rounded-full bg-tile shadow-glow" />
                    <span className="hidden max-w-[9rem] truncate md:inline">{current.name}</span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </button>
                }
              >
                {sectors.map((s) => {
                  const Icon = sectorIcon(s.slug);
                  return (
                    <KMenuItem key={s.slug} onSelect={() => switchSector(s.slug)} active={s.slug === slug}>
                      <span className="tile-icon size-6" style={tileVar(s.color)}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className="flex-1">{s.name}</span>
                      {s.slug === slug && <Check className="size-4 text-primary" />}
                    </KMenuItem>
                  );
                })}
              </KMenu>
            )}

            {role === "student" && (
              <Link to="/app/notifications" className="relative grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Notifications">
                <Bell className="size-[18px]" />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>
                )}
              </Link>
            )}

            {role === "student" ? (
              <>
                <Link
                  to="/app/profile"
                  aria-label="My profile"
                  className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-accent data-[status=active]:bg-accent"
                >
                  <Avatar name={user.name} size={32} />
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block text-sm font-medium text-foreground">{user.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{user.sub}</span>
                  </span>
                </Link>
                <Link
                  to="/login"
                  aria-label="Sign out"
                  title="Sign out"
                  className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-debit"
                >
                  <LogOut className="size-[18px]" />
                </Link>
              </>
            ) : (
              <KMenu
                trigger={
                  <button className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-accent">
                    <Avatar name={user.name} size={32} />
                    <span className="hidden text-left leading-tight md:block">
                      <span className="block text-sm font-medium text-foreground">{user.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{user.sub}</span>
                    </span>
                  </button>
                }
              >
                <KMenuItem destructive onSelect={() => navigate({ to: "/login" })}>
                  <LogOut className="size-4" /> Sign out
                </KMenuItem>
              </KMenu>
            )}
          </div>
        </div>
      </motion.header>

      <div className="mx-auto flex max-w-[1440px] items-start gap-6 px-3 pb-32 pt-4 sm:px-4 sm:pb-28 md:px-6 md:pt-6 lg:pb-20">
        <aside className="no-print sticky top-[5.75rem] z-30 hidden w-60 shrink-0 self-start lg:block">
          <motion.div
            initial={entering ? { opacity: 0, x: -24 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="glass max-h-[calc(100dvh-6.75rem)] overflow-y-auto p-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <ContextCard role={role} sectorSlug={slug} />
            <NavList role={role} sectorSlug={slug} />
          </motion.div>
        </aside>

        {/* Tablet Slim Navigation Rail (768px - 1023px) */}
        <TabletNavRail role={role} sectorSlug={slug} />

        <main className="min-w-0 flex-1">
          <motion.div
            key={pathname}
            style={{ willChange: "transform, opacity" }}
            initial={entering ? { opacity: 0, y: 16 } : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={entering ? { duration: 0.25, ease: [0.16, 1, 0.3, 1] } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => entering && setEntering(false)}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Aesthetic Menu (Glass Bottom Sheet on Mobile, Floating Popover on Tablet/Desktop) */}
      <AestheticMenu
        open={aestheticMenuOpen}
        onOpenChange={setAestheticMenuOpen}
        role={role}
        sectorSlug={slug}
      />

      {/* Quick Action Sheet triggered by Mobile Bottom Nav "+" Button */}
      <QuickActionSheet
        open={quickActionOpen}
        onOpenChange={setQuickActionOpen}
        actions={quickActions}
      />

      {/* Global Entry Dialog */}
      {slug && (
        <NewEntryDialog
          open={globalEntryOpen}
          onOpenChange={setGlobalEntryOpen}
          sector={slug}
          preset={globalEntryPreset}
        />
      )}

      {/* Global Add Student Drawer */}
      <StudentFormDrawer
        open={globalStudentOpen}
        onOpenChange={setGlobalStudentOpen}
      />

      {/* Modern Floating Frosted Bottom Navigation Bar */}
      <MobileBottomNav
        role={role}
        sectorSlug={slug}
        quickActionOpen={quickActionOpen}
        onQuickAction={() => setQuickActionOpen((prev) => !prev)}
      />
    </div>
  );
}

interface MobileNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number | undefined;
  to?: string;
  params?: Record<string, string>;
  onClick?: () => void;
  isActive: boolean;
  isAction?: boolean;
}

function MobileBottomNav({
  role,
  sectorSlug,
  quickActionOpen,
  onQuickAction,
}: {
  role: Role;
  sectorSlug: SectorSlug;
  quickActionOpen: boolean;
  onQuickAction: () => void;
}) {
  const { pathname } = useLocation();
  const sectors = useKhazna((s) => s.sectors);
  const unread = useKhazna((s) => s.notices.filter((n) => !n.read).length);
  const firstSector = sectors[0]?.slug ?? "office";

  let items: MobileNavItem[] = [];

  if (role === "admin") {
    items = [
      {
        id: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        to: "/admin",
        isActive: pathname === "/admin",
      },
      {
        id: "students",
        label: "Students",
        icon: Users,
        to: "/admin/students",
        isActive: pathname.startsWith("/admin/students"),
      },
      {
        id: "quick-action",
        label: "Add",
        icon: Plus,
        isAction: true,
        onClick: onQuickAction,
        isActive: false,
      },
      {
        id: "sectors",
        label: "Sectors",
        icon: Layers,
        to: "/admin/sectors",
        isActive: pathname.startsWith("/admin/sectors"),
      },
      {
        id: "admins",
        label: "Admins",
        icon: UserCog,
        to: "/admin/admins",
        isActive: pathname.startsWith("/admin/admins"),
      },
    ];
  } else if (role === "manager") {
    items = [
      {
        id: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        to: "/m/$sectorSlug",
        params: { sectorSlug },
        isActive: pathname === `/m/${sectorSlug}`,
      },
      {
        id: "ledger",
        label: "Ledger",
        icon: ReceiptText,
        to: "/m/$sectorSlug/ledger",
        params: { sectorSlug },
        isActive: pathname.includes("/ledger"),
      },
      {
        id: "quick-action",
        label: "Add",
        icon: Plus,
        isAction: true,
        onClick: onQuickAction,
        isActive: false,
      },
      {
        id: "reports",
        label: "Reports",
        icon: BarChart3,
        to: "/m/$sectorSlug/reports",
        params: { sectorSlug },
        isActive: pathname.includes("/reports"),
      },
      {
        id: "batches",
        label: "Batches",
        icon: FileSpreadsheet,
        to: "/m/$sectorSlug/batches",
        params: { sectorSlug },
        isActive: pathname.includes("/batches"),
      },
    ];
  } else {
    items = [
      {
        id: "home",
        label: "Home",
        icon: LayoutDashboard,
        to: "/app",
        isActive: pathname === "/app",
      },
      {
        id: "ledgers",
        label: "Ledgers",
        icon: Wallet,
        to: "/app/s/$sectorSlug",
        params: { sectorSlug: firstSector },
        isActive: pathname.startsWith("/app/s"),
      },
      {
        id: "notices",
        label: "Notices",
        icon: Bell,
        badge: unread > 0 ? unread : undefined,
        to: "/app/notifications",
        isActive: pathname.startsWith("/app/notifications"),
      },
      {
        id: "profile",
        label: "Profile",
        icon: UserRound,
        to: "/app/profile",
        isActive: pathname.startsWith("/app/profile"),
      },
    ];
  }

  return (
    <nav
      aria-label="Mobile Navigation Bar"
      className="no-print fixed bottom-3 inset-x-3.5 z-40 mx-auto max-w-md md:hidden"
    >
      <div className="glass-strong rounded-2xl p-1.5 shadow-[0_14px_45px_rgba(0,0,0,0.18),0_2px_10px_rgba(0,0,0,0.06)] border border-white/70 dark:border-white/10 backdrop-blur-2xl">
        <div className="relative flex items-center justify-around gap-0.5">
          {items.map((item) => {
            if (item.isAction) {
              return (
                <motion.button
                  key={item.id}
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.08 }}
                  type="button"
                  data-guide-id="quick-action-button"
                  onClick={item.onClick}
                  aria-label={quickActionOpen ? "Close actions" : item.label}
                  className="relative -mt-5 flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow border-2 border-background/90 transition-transform focus:outline-none"
                >
                  <motion.div
                    animate={{ rotate: quickActionOpen ? 45 : 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="flex items-center justify-center"
                  >
                    <Plus className="size-6 stroke-[2.5]" />
                  </motion.div>
                </motion.button>
              );
            }

            const Icon = item.icon;
            const inner = (
              <motion.div
                whileTap={{ scale: 0.88 }}
                className={cn(
                  "relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-colors min-w-[54px] select-none",
                  item.isActive ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.isActive && (
                  <motion.div
                    layoutId="mobile-nav-pill"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-primary/15 border border-primary/25 shadow-glow"
                  />
                )}
                <div className="relative">
                  <Icon className={cn("size-5 transition-transform duration-200", item.isActive && "scale-110")} />
                  {item.badge !== undefined && (
                    <span className="absolute -top-1 -right-2 grid min-w-3.5 h-3.5 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shadow-glow animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="relative mt-0.5 text-[10px] tracking-tight">
                  {item.label}
                </span>
              </motion.div>
            );

            if (item.onClick) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  aria-label={item.label}
                  className="outline-none"
                >
                  {inner}
                </button>
              );
            }

            return (
              <Link
                key={item.id}
                to={item.to!}
                params={item.params as any}
                className="outline-none"
                aria-label={item.label}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
