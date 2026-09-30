import {
  CalendarDays,
  ClipboardList,
  History,
  Home,
  MapPin,
  PlusCircle,
} from "lucide-react";
import { NavLink } from "react-router";
import type { UserRole } from "../../layouts/RoleLayout";

type MobileBottomNavProps = {
  role: UserRole;
};

export default function MobileBottomNav({
  role,
}: MobileBottomNavProps) {
  const residentLinks = [
    {
      label: "Home",
      path: "/resident/dashboard",
      icon: Home,
    },
    {
      label: "Report",
      path: "/resident/report-waste",
      icon: PlusCircle,
    },
    {
      label: "Reports",
      path: "/resident/reports",
      icon: ClipboardList,
    },
    {
      label: "Calendar",
      path: "/resident/calendar",
      icon: CalendarDays,
    },
  ];

  const collectorLinks = [
    {
      label: "Home",
      path: "/collector/dashboard",
      icon: Home,
    },
    {
      label: "Schedule",
      path: "/collector/schedule",
      icon: CalendarDays,
    },
    {
      label: "Map",
      path: "/collector/map",
      icon: MapPin,
    },
    {
      label: "History",
      path: "/collector/history",
      icon: History,
    },
  ];

  const links =
    role === "collector"
      ? collectorLinks
      : residentLinks;

  return (
    <nav
      className="
        mx-auto flex h-16 w-full max-w-[430px]
        items-center justify-around
        border-t border-neutral-200
        bg-white px-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]
      "
    >
      {links.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex min-w-[55px] flex-col items-center gap-1
               text-[9px] transition-colors ${
                 isActive
                   ? "font-semibold text-red-600"
                   : "text-neutral-500"
               }`
            }
          >
            <Icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}