import { Navigate, Outlet, useLocation } from "react-router";
import DesktopSidebar from "../components/navigation/DesktopSidebar";
import MobileBottomNav from "../components/navigation/MobileBottomNav";

export type UserRole =
  | "resident"
  | "admin"
  | "collector";

type RoleLayoutProps = {
  allowedRoles: UserRole[];
};

export default function RoleLayout({
  allowedRoles,
}: RoleLayoutProps) {
  const location = useLocation();

  const role = localStorage.getItem(
    "userRole"
  ) as UserRole | null;

  if (!role) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  if (!allowedRoles.includes(role)) {
    return (
      <Navigate
        to={getDashboardPath(role)}
        replace
      />
    );
  }

  const isAdmin = role === "admin";
  const hasMobileNavigation =
    role === "resident" || role === "collector";

  return (
    <div className="min-h-[100dvh] w-full bg-neutral-50">
      {/* Barangay staff desktop sidebar */}
      {isAdmin && <DesktopSidebar />}

      <main
        className={`
          min-h-[100dvh] min-w-0
          ${isAdmin ? "md:ml-64" : ""}
          ${hasMobileNavigation ? "pb-20" : ""}
        `}
      >
        <Outlet />
      </main>

      {/* Resident and collector bottom navigation */}
      {hasMobileNavigation && (
        <div className="fixed inset-x-0 bottom-0 z-50">
          <MobileBottomNav role={role} />
        </div>
      )}
    </div>
  );
}

function getDashboardPath(role: UserRole) {
  switch (role) {
    case "admin":
      return "/admin/dashboard";

    case "collector":
      return "/collector/dashboard";

    default:
      return "/resident/dashboard";
  }
}