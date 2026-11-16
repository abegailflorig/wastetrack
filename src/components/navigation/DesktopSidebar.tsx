
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  NavLink,
  useNavigate,
} from "react-router";

import {
  BarChart3,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  UserRound,
  Users,
} from "lucide-react";

import wasteLogo from "../../assets/waste-logo1.png";
import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

type SidebarItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
};

type UserProfile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean | null;
};

// ========================================
// SIDEBAR NAVIGATION
// ========================================

const ITEMS: SidebarItem[] = [
  {
    label: "Dashboard",
    to: "/admin/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Waste status",
    to: "/admin/waste-status",
    icon: BarChart3,
  },
  {
    label: "Disposal sites",
    to: "/admin/disposal-sites",
    icon: MapPin,
  },
  {
    label: "Uploaded images",
    to: "/admin/uploaded-images",
    icon: ImageIcon,
  },
  {
    label: "Collectors",
    to: "/admin/collectors",
    icon: Users,
  },
  {
    label: "Schedules",
    to: "/admin/schedules",
    icon: CalendarDays,
  },
  {
    label: "Reports",
    to: "/admin/reports",
    icon: FileText,
  },
];

// ========================================
// ROLE LABEL
// ========================================

function getRoleLabel(role: string): string {
  switch (role.trim().toLowerCase()) {
    case "admin":
      return "Administrator";

    case "collector":
      return "Collector";

    case "resident":
      return "Resident";

    default:
      return role || "Unknown role";
  }
}

// ========================================
// USER INITIALS
// ========================================

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "WT";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

// ========================================
// MAIN SIDEBAR COMPONENT
// ========================================

export default function DesktopSidebar() {
  const navigate = useNavigate();

  // ========================================
  // SUPABASE STATES
  // ========================================

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [userId, setUserId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const requestRef = useRef(0);

  // ========================================
  // LOAD USER PROFILE
  // ========================================

  const loadUserProfile = useCallback(
    async () => {
      const requestId =
        ++requestRef.current;

      try {
        // ==================================
        // 1. GET AUTHENTICATED USER
        // ==================================

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const authUser = authData.user;

        if (!authUser) {
          throw new Error(
            "No authenticated user found."
          );
        }

        // ==================================
        // 2. FETCH EXISTING USERS TABLE
        // ==================================

        const {
          data: userData,
          error: userError,
        } = await supabase
          .from("users")
          .select(
            "user_id,full_name,email,role,is_active"
          )
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (userError) {
          throw userError;
        }

        if (!userData) {
          throw new Error(
            "No matching profile found in public.users."
          );
        }

        const account = userData as UserProfile;

        if (
          requestId !== requestRef.current
        ) {
          return;
        }

        // ==================================
        // 3. UPDATE SIDEBAR STATES
        // ==================================

        setProfile(account);
        setUserId(authUser.id);
      } catch (cause) {
        if (
          requestId !== requestRef.current
        ) {
          return;
        }

        console.error(
          "[WasteTrack] Sidebar account error:",
          cause
        );

        setProfile(null);
        setUserId(null);
      } finally {
        if (
          requestId === requestRef.current
        ) {
          setLoading(false);
        }
      }
    },
    []
  );

  // ========================================
  // INITIAL LOAD + AUTH CHANGES
  // ========================================

  useEffect(() => {
    void loadUserProfile();

    // ==================================
    // SUPABASE AUTH LISTENER
    // ==================================

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_OUT") {
          requestRef.current += 1;

          setProfile(null);
          setUserId(null);
          setLoading(false);

          return;
        }

        if (
          event === "SIGNED_IN" ||
          event === "USER_UPDATED"
        ) {
          window.setTimeout(() => {
            void loadUserProfile();
          }, 0);
        }
      }
    );

    // ==================================
    // REFRESH EVERY 60 SECONDS
    // ==================================

    const interval = window.setInterval(
      () => {
        void loadUserProfile();
      },
      60_000
    );

    // ==================================
    // REFRESH WHEN WINDOW IS FOCUSED
    // ==================================

    const onFocus = () => {
      void loadUserProfile();
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    return () => {
      requestRef.current += 1;

      authListener.subscription.unsubscribe();

      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        onFocus
      );
    };
  }, [loadUserProfile]);

  // ========================================
  // SUPABASE REALTIME USER UPDATES
  // ========================================

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(
        `wastetrack-sidebar-${userId}`
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadUserProfile();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadUserProfile]);

  // ========================================
  // USER DISPLAY DATA
  // ========================================

  const displayName =
    profile?.full_name?.trim() ||
    (
      loading
        ? "Loading account..."
        : "Account unavailable"
    );

  const displayRole = profile
    ? getRoleLabel(profile.role)
    : loading
      ? "Loading..."
      : "Not available";

  // ========================================
  // SIDEBAR UI
  // ========================================

  return (
    <aside
      className="
        fixed inset-y-0 left-0 z-40
        hidden w-64 flex-col
        bg-[#A81B1E]
        px-3 pb-5 pt-3
        text-white
        md:flex
      "
      aria-label="Administrator sidebar"
    >
      {/* ====================================
          WASTETRACK LOGO
      ==================================== */}

      <div
        className="
          flex items-center gap-3.5
          border-b-2 border-[#C9A24A]
          px-1.5 pb-3
        "
      >
        <div
          className="
            grid h-[52px] w-[52px]
            shrink-0 place-items-center
            rounded-[10px] bg-white
          "
        >
          <img
            src={wasteLogo}
            alt="WasteTrack logo"
            className="
              h-[42px] w-[42px]
              object-contain
            "
          />
        </div>

        <div className="min-w-0">
          <h2
            className="
              text-[15px] font-extrabold
              tracking-tight
            "
          >
            Waste Track
          </h2>

          <p
            className="
              mt-0.5 text-[10px]
              font-medium text-[#F3D9D9]
            "
          >
            Admin dashboard
          </p>
        </div>
      </div>

      {/* ====================================
          NAVIGATION MENU
          SCROLLBAR COMPLETELY HIDDEN
      ==================================== */}

      <nav
        className="
          mt-4
          flex min-h-0 flex-1
          flex-col gap-1

          overflow-y-auto
          overflow-x-hidden

          [scrollbar-width:none]
          [-ms-overflow-style:none]
          [&::-webkit-scrollbar]:hidden
        "
        aria-label="Admin navigation"
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) => `
                group
                flex shrink-0
                items-center
                gap-3.5
                rounded-lg
                px-3 py-3
                text-[13px]
                font-semibold
                transition-colors

                ${
                  isActive
                    ? "bg-white text-[#A81B1E] shadow-sm"
                    : "text-white hover:bg-white/10"
                }
              `}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={19}
                    className={`
                      shrink-0
                      ${
                        isActive
                          ? "text-[#A81B1E]"
                          : "text-white/85"
                      }
                    `}
                  />

                  <span className="min-w-0">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ====================================
          MANAGE ACCOUNT SECTION
      ==================================== */}

      <div
        className="
          mt-3
          shrink-0
          border-t-2
          border-[#C9A24A]
          pt-3.5
        "
      >
        {/* ==================================
            MANAGE ACCOUNT BUTTON
        ================================== */}

        <button
          type="button"
          onClick={() =>
            navigate("/admin/account")
          }
          className="
            flex w-full
            items-center
            gap-2.5
            rounded-lg
            px-2 py-2.5
            text-left
            text-[13px]
            font-bold
            transition
            hover:bg-white/10
            focus-visible:outline
            focus-visible:outline-2
            focus-visible:outline-white
          "
        >
          <UserRound size={18} />

          Manage account
        </button>

        {/* ==================================
            LOGGED-IN USER PROFILE
        ================================== */}

        <div
          className="
            mt-2
            flex items-center
            gap-3
            rounded-xl
            bg-white/10
            px-2.5 py-3
          "
        >
          {/* ADMIN INITIALS */}

          <div
            className="
              grid h-11 w-11
              shrink-0
              place-items-center
              overflow-hidden
              rounded-xl
              bg-[#FBE5E5]
              text-[14px]
              font-extrabold
              text-[#A81B1E]
            "
          >
            {loading && !profile ? (
              <LoaderCircle
                size={19}
                className="animate-spin"
              />
            ) : (
              <span>{getInitials(displayName)}</span>
            )}
          </div>

          {/* NAME AND ROLE */}

          <div className="min-w-0 flex-1">
            <p
              className="
                truncate
                text-[12.5px]
                font-bold
                text-white
              "
              title={displayName}
            >
              {displayName}
            </p>

            <p
              className="
                mt-1
                truncate
                text-[11px]
                text-[#F3D9D9]
              "
            >
              {displayRole}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}