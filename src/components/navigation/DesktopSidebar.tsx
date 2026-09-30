import { NavLink, useNavigate } from "react-router";
import wasteLogo from "../../assets/waste-logo1.png";

type Item = {
  label: string;
  to?: string;
};

const ITEMS: Item[] = [
  { label: "Dashboard", to: "/admin/dashboard" },
  { label: "Waste status", to: "/admin/waste-status" },
  { label: "Disposal sites", to: "/admin/disposal-sites" },
  { label: "Uploaded images", to: "/admin/uploaded-images" },
  { label: "Collectors", to: "/admin/collectors" },
  { label: "Schedules", to: "/admin/schedules" },
  { label: "Alerts", to: "/admin/alerts" },
  { label: "Reports", to: "/admin/reports" },
];

const USER_NAME = "Marco Reyes";
const USER_ROLE = "Barangay Staff";

export default function DesktopSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-[#a81b1e] px-3 pb-5 pt-3 text-white md:flex">
      <div className="flex items-center gap-3.5 border-b-2 border-[#c9a24a] px-1.5 pb-3">
        <div className="grid h-[52px] w-[52px] place-items-center rounded-[10px] bg-white">
          <img
            src={wasteLogo}
            alt="Waste Track logo"
            className="h-[42px] w-[42px] object-contain"
          />
        </div>

        <span className="text-[15px] font-bold">
          Waste Track
        </span>
      </div>

      <nav
        className="mt-4 flex flex-1 flex-col gap-0.5"
        aria-label="Admin navigation"
      >
        {ITEMS.map((item) =>
          item.to ? (
            <NavLink
              key={item.label}
              to={item.to}
              className="flex items-center gap-3.5 rounded-md px-2 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`h-5 w-5 shrink-0 rounded-[5px] ${
                      isActive ? "bg-white" : "bg-white/60"
                    }`}
                  />

                  {item.label}
                </>
              )}
            </NavLink>
          ) : (
            <div
              key={item.label}
              className="flex cursor-not-allowed items-center gap-3.5 rounded-md px-2 py-2.5 text-sm font-semibold opacity-60"
              title="Coming soon"
            >
              <span className="h-5 w-5 shrink-0 rounded-[5px] bg-white/60" />
              {item.label}
            </div>
          )
        )}
      </nav>

      <button
        type="button"
        className="mt-4 border-t-2 border-[#c9a24a] pt-3.5 text-left text-sm font-bold"
        onClick={() => navigate("/admin/account")}
      >
        Manage account
      </button>

      <div className="px-1.5 pt-3.5 text-[13.5px] font-medium leading-snug text-[#f3d9d9]">
        {USER_NAME}
        <br />
        {USER_ROLE}
      </div>
    </aside>
  );
}