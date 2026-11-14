
import {
  useEffect,
  useState,
} from "react";

import type { ReactNode } from "react";

import {
  useLocation,
  useNavigate,
} from "react-router";

import {
  LogOut,
  Star,
  UserRound,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  User,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

import MobileBottomNav from "../../components/navigation/MobileBottomNav";

// ========================================
// TYPES
// ========================================

type UserRole = "resident" | "collector" | "admin";

type UserProfile = {
  user_id: string;
  full_name: string;
  email: string;
  contact_info: string | null;
  address: string | null;
  role: UserRole;
  is_active: boolean;
  collector_status: string | null;
  created_at: string;
  updated_at: string;
};

type AuthDetails = {
  email: string;
  avatarUrl: string;
};

// ========================================
// HELPERS
// ========================================

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load your profile.";
}

function getAvatarUrl(
  metadata: Record<string, unknown> | undefined
): string {
  const image =
    metadata?.avatar_url ?? metadata?.picture;

  if (
    typeof image === "string" &&
    /^https:\/\//i.test(image)
  ) {
    return image;
  }

  return "";
}

// ========================================
// PROFILE COMPONENT
// ========================================

export default function Profile() {
  const location = useLocation();
  const navigate = useNavigate();

  const isCollector =
    location.pathname.startsWith("/collector");

  const pageRole: "collector" | "resident" =
    isCollector ? "collector" : "resident";

  // ========================================
  // STATES
  // NO LOADING STATE OR SPINNER
  // ========================================

  const [profile, setProfile] =
    useState<UserProfile | null>(null);

  const [authDetails, setAuthDetails] =
    useState<AuthDetails | null>(null);

  const [error, setError] = useState("");

  const [retry, setRetry] = useState(0);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState("");

  const [avatarFailed, setAvatarFailed] =
    useState(false);

  // ========================================
  // DISPLAY DATA
  // ========================================

  const fullName =
    profile?.full_name?.trim() || "—";

  const roleLabel =
    profile?.role === "collector"
      ? "Collector"
      : profile?.role === "admin"
        ? "Admin"
        : "Resident";

  const email =
    profile?.email ||
    authDetails?.email ||
    "—";

  const contact =
    profile?.contact_info || "—";

  const address =
    profile?.address || "—";

  // ========================================
  // FETCH PROFILE FROM SUPABASE
  // ========================================

  useEffect(() => {
    let active = true;

    async function fetchProfile() {
      setError("");
      setAvatarFailed(false);

      try {
        // GET AUTHENTICATED USER

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        const user = authData.user;

        if (!user) {
          if (active) {
            navigate("/login", {
              replace: true,
            });
          }

          return;
        }

        // FETCH FROM PUBLIC.USERS TABLE

        const {
          data,
          error: profileError,
        } = await supabase
          .from("users")
          .select(
            `
              user_id,
              full_name,
              email,
              contact_info,
              address,
              role,
              is_active,
              collector_status,
              created_at,
              updated_at
            `
          )
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(
            `Failed to load profile: ${profileError.message}`
          );
        }

        if (!data) {
          throw new Error(
            "Your profile was not found in the users table."
          );
        }

        if (!active) {
          return;
        }

        const userData = data as UserProfile;

        setProfile(userData);

        setAuthDetails({
          email: user.email ?? userData.email,
          avatarUrl: getAvatarUrl(
            user.user_metadata as
              | Record<string, unknown>
              | undefined
          ),
        });
      } catch (failure) {
        if (!active) {
          return;
        }

        console.error(
          "[WasteTrack] Profile:",
          failure
        );

        setError(
          getErrorMessage(failure)
        );

        setProfile(null);
      }
    }

    void fetchProfile();

    return () => {
      active = false;
    };
  }, [navigate, retry]);

  // ========================================
  // RETRY PROFILE REQUEST
  // ========================================

  function refreshProfile() {
    setRetry((value) => value + 1);
  }

  // ========================================
  // LOGOUT
  // ========================================

  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    setLogoutError("");

    try {
      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      [
        "userRole",
        "userName",
        "userEmail",
        "userContact",
        "profilePhoto",
        "teamName",
      ].forEach((key) => {
        localStorage.removeItem(key);
      });

      navigate("/login", {
        replace: true,
      });
    } catch (failure) {
      setLogoutError(
        getErrorMessage(failure)
      );
    } finally {
      setLoggingOut(false);
    }
  }

  // ========================================
  // USER INTERFACE
  // ========================================

  return (
    <>
      <main
        className="
          flex min-h-[calc(100dvh-5rem)]
          w-full flex-col
          bg-white text-neutral-900
          pb-24
        "
      >
        <div
          className="
            mx-auto w-full
            max-w-[672px]
            pb-8 pt-5
            sm:pt-8
          "
        >
          {/* ====================================
              RED PROFILE HEADER
          ==================================== */}

          <header
            className="
              flex min-h-[42px]
              w-full items-center
              justify-center
              bg-[#d00000]
              px-3 py-2
              sm:min-h-[50px]
            "
          >
            <h1
              className="
                text-center text-base
                font-bold leading-5
                text-white sm:text-lg
              "
            >
              Profile
            </h1>
          </header>

          {/* ====================================
              ERROR MESSAGE (ONLY IF FAILED)
          ==================================== */}

          {error && (
            <div
              role="alert"
              className="
                mx-4 mt-4 rounded-lg
                border border-red-200
                bg-red-50 p-3
                text-center text-sm
                text-red-700
              "
            >
              <p>{error}</p>

              <button
                type="button"
                onClick={refreshProfile}
                className="
                  mt-2 min-h-10
                  rounded-lg bg-[#c90000]
                  px-4 text-sm
                  font-semibold text-white
                "
              >
                Try Again
              </button>
            </div>
          )}

          {/* ====================================
              PROFILE PICTURE
          ==================================== */}

          <section
            className="
              flex flex-col items-center
              px-4 pt-7
              sm:pt-10
            "
          >
            <div className="relative">
              <div
                className="
                  grid h-[66px] w-[66px]
                  place-items-center
                  rounded-full
                  border border-[#a5ba7b]
                  bg-white p-[4px]
                  sm:h-[80px]
                  sm:w-[80px]
                "
              >
                {authDetails?.avatarUrl &&
                !avatarFailed ? (
                  <img
                    src={authDetails.avatarUrl}
                    alt={`${fullName}'s profile`}
                    className="
                      h-full w-full
                      rounded-full
                      object-cover
                    "
                    onError={() =>
                      setAvatarFailed(true)
                    }
                  />
                ) : (
                  <div
                    className="
                      grid h-full w-full
                      place-items-center
                      rounded-full
                      bg-[#ff2254]
                    "
                  >
                    <UserRound
                      size={36}
                      strokeWidth={1.6}
                      className="text-[#fff0c7]"
                    />
                  </div>
                )}
              </div>

              <span
                aria-hidden="true"
                className="
                  absolute -bottom-0.5
                  -right-1 text-base
                "
              >
                ♻️
              </span>
            </div>

            {/* ====================================
                NAME FROM SUPABASE
            ==================================== */}

            <h2
              className="
                mt-2 max-w-full
                break-words text-center
                text-lg font-bold
                leading-6
                text-[#a1b673]
                sm:text-xl
              "
            >
              {fullName}
            </h2>

            {/* ====================================
                ROLE BADGE
            ==================================== */}

            <div
              className="
                mt-2 flex min-w-[114px]
                items-center
                justify-center gap-1.5
                rounded-full
                bg-[#a6b879]
                px-4 py-1
              "
            >
              <Star
                size={13}
                fill="currentColor"
                strokeWidth={0}
                className="text-black"
                aria-hidden="true"
              />

              <span
                className="
                  text-xs font-medium
                  text-black
                  sm:text-sm
                "
              >
                {roleLabel}
              </span>
            </div>
          </section>

          {/* ====================================
              PERSONAL INFORMATION CONTAINER
          ==================================== */}

          <section
            aria-labelledby="personal-info-title"
            className="
              mx-4 mt-7
              overflow-hidden
              rounded-xl
              border border-[#d0d0d0]
              bg-white
              shadow-[0_2px_5px_rgba(0,0,0,0.08)]
              sm:mx-6
              sm:mt-9
            "
          >
            {/* CONTAINER HEADER */}

            <div
              className="
                border-b border-[#e5e5e5]
                bg-[#fff6f7]
                px-4 py-3
                sm:px-5
              "
            >
              <h3
                id="personal-info-title"
                className="
                  text-sm font-bold
                  text-[#c90000]
                  sm:text-base
                "
              >
                Personal Information
              </h3>
            </div>

            {/* ====================================
                SUPABASE INFORMATION
            ==================================== */}

            <div className="px-3 py-1 sm:px-5">
              <ProfileInfoRow
                icon={<User size={18} />}
                label="Full Name"
                value={fullName}
              />

              <ProfileInfoRow
                icon={<Mail size={18} />}
                label="Email Address"
                value={email}
              />

              <ProfileInfoRow
                icon={<Phone size={18} />}
                label="Contact Number"
                value={contact}
              />

              <ProfileInfoRow
                icon={<MapPin size={18} />}
                label="Address"
                value={address}
              />

              <ProfileInfoRow
                icon={<ShieldCheck size={18} />}
                label="Role"
                value={roleLabel}
              />

              {profile?.role === "collector" && (
                <ProfileInfoRow
                  icon={<Star size={18} />}
                  label="Collector Status"
                  value={
                    profile.collector_status ||
                    "Not set"
                  }
                />
              )}
            </div>
          </section>

          {/* ====================================
              LOGOUT BUTTON
          ==================================== */}

          <div
            className="
              mt-8 flex flex-col
              items-center justify-center
              gap-2 pb-4
              sm:mt-10
            "
          >
            <button
              type="button"
              onClick={() =>
                void handleLogout()
              }
              disabled={loggingOut}
              className="
                inline-flex min-h-11
                items-center
                justify-center gap-2
                px-4 text-sm
                font-semibold
                text-[#ff383c]
                hover:text-red-700
                disabled:opacity-60
                focus-visible:outline
                focus-visible:outline-2
                focus-visible:outline-red-600
              "
            >
              <LogOut
                size={18}
                strokeWidth={1.8}
              />

              {loggingOut
                ? "Logging out..."
                : "Log out"}
            </button>

            {logoutError && (
              <p
                role="alert"
                className="
                  max-w-xs px-4
                  text-center text-xs
                  text-red-700
                "
              >
                {logoutError}
              </p>
            )}
          </div>
        </div>
      </main>

      {/* ====================================
          MOBILE BOTTOM NAVIGATION
          NO GRAY BACKGROUND
      ==================================== */}

      <div
        className="
          fixed inset-x-0 bottom-0
          z-[100] w-full
          bg-white
          pb-[env(safe-area-inset-bottom)]
        "
      >
        <MobileBottomNav role={pageRole} />
      </div>
    </>
  );
}

// ========================================
// PERSONAL INFORMATION ROW
// ========================================

type ProfileInfoRowProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function ProfileInfoRow({
  icon,
  label,
  value,
}: ProfileInfoRowProps) {
  return (
    <div
      className="
        flex items-start gap-3
        border-b border-[#eeeeee]
        px-1 py-3.5
        last:border-b-0
        sm:py-4
      "
    >
      {/* ICON */}

      <span
        className="
          mt-0.5 grid h-8 w-8
          shrink-0 place-items-center
          rounded-lg
          bg-[#fff0f1]
          text-[#c90000]
        "
      >
        {icon}
      </span>

      {/* LABEL AND VALUE */}

      <div className="min-w-0 flex-1">
        <p
          className="
            text-xs font-medium
            text-neutral-500
            sm:text-[13px]
          "
        >
          {label}
        </p>

        <p
          className="
            mt-1 break-words
            text-[13px] font-semibold
            leading-relaxed
            text-neutral-900
            sm:text-sm
          "
        >
          {value}
        </p>
      </div>
    </div>
  );
}
