import { NavLink } from "react-router";
import type { UserRole } from "../../layouts/RoleLayout";

import homeIcon from "../../assets/home.png";
import calendarIcon from "../../assets/calendar.png";
import routeIcon from "../../assets/route.png";
import qrIcon from "../../assets/qr.png";
import reportsIcon from "../../assets/reports.png";
import profileIcon from "../../assets/profile.png";

type MobileBottomNavProps = {
  role: UserRole;
};

type NavigationItem = {
  label: string;
  path: string;
  image: string;
  raised?: boolean;
};

const residentLinks: NavigationItem[] = [
  {
    label: "Home",
    path: "/resident/dashboard",
    image: homeIcon,
  },
  {
    label: "Calendar",
    path: "/resident/calendar",
    image: calendarIcon,
  },
  {
    label: "Report waste",
    path: "/resident/report-waste",
    image: qrIcon,
    raised: true,
  },
  {
    label: "My reports",
    path: "/resident/reports",
    image: reportsIcon,
  },
  {
    label: "Account",
    path: "/resident/profile",
    image: profileIcon,
  },
];

const collectorLinks: NavigationItem[] = [
  {
    label: "Home",
    path: "/collector/dashboard",
    image: homeIcon,
  },
  {
    label: "Schedule",
    path: "/collector/calendar",
    image: calendarIcon,
  },
  {
    label: "Collection",
    path: "/collector/route",
    image: routeIcon,
    raised: true,
  },
  {
    label: "History",
    path: "/collector/history",
    image: reportsIcon,
  },
  {
    label: "Account",
    path: "/collector/profile",
    image: profileIcon,
  },
];

export default function MobileBottomNav({
  role,
}: MobileBottomNavProps) {
  if (role === "admin") {
    return null;
  }

  const links =
    role === "collector" ? collectorLinks : residentLinks;

  return (
    <nav
      aria-label="Bottom navigation"
      className="relative w-full overflow-visible border-t border-[#FF383C] bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.04)]"
    >
      <div className="mx-auto grid h-16 w-full max-w-6xl grid-cols-5 items-center px-1 sm:px-6 lg:px-8">
        {links.map((item) => (
          <NavLink
            key={item.label}
            to={item.path}
            aria-label={item.label}
            title={item.label}
            className="relative flex h-full min-w-0 items-center justify-center focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-red-600"
          >
            {({ isActive }) =>
              item.raised ? (
                <span className="absolute -top-4 z-10 flex h-14 w-14 items-center justify-center rounded-full border border-[#FF383C] bg-white shadow-sm sm:-top-[19px] sm:h-[60px] sm:w-[60px]">
                  <img
                    src={item.image}
                    alt=""
                    className="h-10 w-10 object-contain sm:h-11 sm:w-11"
                    draggable={false}
                  />
                </span>
              ) : (
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors sm:h-[50px] sm:w-[50px] ${
                    isActive
                      ? "bg-[#FF383C]"
                      : "bg-transparent hover:bg-red-50"
                  }`}
                >
                  <img
                    src={item.image}
                    alt=""
                    className="h-8 w-8 object-contain sm:h-9 sm:w-9"
                    draggable={false}
                  />
                </span>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  );
}