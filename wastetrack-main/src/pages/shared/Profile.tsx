import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  ChevronRight,
  LogOut,
  Star,
  UserRound,
  X,
} from "lucide-react";

type Panel = "personal" | "privacy" | "help" | null;

export default function Profile() {
  const location = useLocation();
  const navigate = useNavigate();

  const [panel, setPanel] = useState<Panel>(null);

  const isCollector = location.pathname.startsWith("/collector");
  const roleLabel = isCollector ? "Collector" : "Resident";
  const rolePath = isCollector ? "/collector" : "/resident";

  const fullName =
    localStorage.getItem("userName") || "Abegail Florig";

  const email = localStorage.getItem("userEmail") || "";
  const contact = localStorage.getItem("userContact") || "";
  const profilePhoto = localStorage.getItem("profilePhoto") || "";

  function handleLogout() {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userContact");
    localStorage.removeItem("profilePhoto");

    navigate("/login", { replace: true });
  }

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-white">
      <div className="mx-auto w-full max-w-[430px] pb-8 pt-8 sm:max-w-xl sm:pt-10">
        {/* Red title bar */}
        <header className="bg-[#c90000] px-4 py-3 text-center">
          <h1 className="text-base font-bold text-white sm:text-lg">
            Profile
          </h1>
        </header>

        {/* User information */}
        <section className="flex flex-col items-center px-5 pt-10 sm:pt-12">
          <div className="relative">
            <div className="grid h-[62px] w-[62px] place-items-center rounded-full border-[1.5px] border-[#a6b879] bg-white p-1.5 sm:h-[72px] sm:w-[72px]">
              {profilePhoto ? (
                <img
                  src={profilePhoto}
                  alt={`${fullName}'s profile`}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center rounded-full bg-[#ff365c]">
                  <UserRound
                    size={33}
                    strokeWidth={1.6}
                    className="text-[#fff0c7]"
                  />
                </div>
              )}
            </div>

            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-1 text-lg"
            >
              ♻️
            </span>
          </div>

          <h2 className="mt-2 max-w-full break-words text-center text-lg font-bold text-[#a6b879] sm:text-xl">
            {fullName}
          </h2>

          <div className="mt-1 flex min-w-[112px] items-center justify-center gap-2 rounded-full bg-[#a6b879] px-4 py-1">
            <Star
              size={14}
              fill="currentColor"
              strokeWidth={0}
              aria-hidden="true"
              className="text-black"
            />

            <span className="text-xs text-black">
              {roleLabel}
            </span>
          </div>
        </section>

        {/* Profile menu */}
        <section
          aria-label="Profile options"
          className="mt-6 space-y-3 px-6 sm:px-8"
        >
          <MenuButton
            label="Personal Information"
            onClick={() => setPanel("personal")}
          />

          <Link
            to={`${rolePath}/notifications`}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[#c9c9c9] bg-white px-3 py-2.5 text-xs font-medium text-[#555] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:text-sm"
          >
            <span>Notification</span>
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="shrink-0 text-neutral-500"
            />
          </Link>

          <MenuButton
            label="Privacy & Security"
            onClick={() => setPanel("privacy")}
          />

          <MenuButton
            label="Help and Support"
            onClick={() => setPanel("help")}
          />
        </section>

        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[#ff383c] hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Log out
          </button>
        </div>
      </div>

      {/* Profile option dialogs */}
      {panel && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 p-5"
          onClick={() => setPanel(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-dialog-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPanel(null);
            }}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="profile-dialog-title"
                className="text-base font-bold"
              >
                {panel === "personal"
                  ? "Personal Information"
                  : panel === "privacy"
                    ? "Privacy & Security"
                    : "Help and Support"}
              </h2>

              <button
                type="button"
                autoFocus
                aria-label="Close dialog"
                onClick={() => setPanel(null)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-neutral-100"
              >
                <X size={20} />
              </button>
            </div>

            {panel === "personal" && (
              <dl className="mt-4 space-y-3 text-sm">
                <Information label="Full name" value={fullName} />
                <Information label="Role" value={roleLabel} />
                <Information label="Email" value={email || "Not provided"} />
                <Information
                  label="Contact number"
                  value={contact || "Not provided"}
                />
              </dl>
            )}

            {panel === "privacy" && (
              <p className="mt-4 text-sm leading-relaxed text-neutral-600">
                Password changes and account security settings are not
                connected yet.
              </p>
            )}

            {panel === "help" && (
              <p className="mt-4 text-sm leading-relaxed text-neutral-600">
                Contact your barangay staff for help with your account,
                waste reports, or collection schedules.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function MenuButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[#c9c9c9] bg-white px-3 py-2.5 text-left text-xs font-medium text-[#555] transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:text-sm"
    >
      <span>{label}</span>
      <ChevronRight
        size={14}
        aria-hidden="true"
        className="shrink-0 text-neutral-500"
      />
    </button>
  );
}

function Information({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-neutral-100 pb-2">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}