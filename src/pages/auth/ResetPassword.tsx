
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";

const inputStyle =
  "w-full min-w-0 rounded-xl border border-[#E2D9CE] bg-[#FFFCF8] px-4 py-3 text-[13px] text-[#333] outline-none transition focus:border-[#A5B26B] focus:ring-2 focus:ring-[#A5B26B]/20";

const buttonStyle =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#A81B1E] px-5 py-3 text-[12px] font-bold text-white transition hover:bg-[#8F1619] disabled:cursor-not-allowed disabled:opacity-50";

type Status =
  | "checking"
  | "ready"
  | "unavailable"
  | "done";

export default function ResetPassword() {
  const navigate = useNavigate();

  const [status, setStatus] =
    useState<Status>("checking");

  const [accountEmail, setAccountEmail] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // VERIFY PASSWORD RECOVERY SESSION
  // ==========================================

  useEffect(() => {
    let mounted = true;

    const { data: listener } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          if (!mounted) return;

          if (
            event === "PASSWORD_RECOVERY" &&
            session
          ) {
            setAccountEmail(
              session.user.email ?? ""
            );

            setError("");
            setStatus("ready");
          }
        }
      );

    // Recover an existing session if the
    // redirect was processed before page mount.
    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return;

        if (sessionError) {
          setError(sessionError.message);
          setStatus("unavailable");
          return;
        }

        if (data.session) {
          setAccountEmail(
            data.session.user.email ?? ""
          );

          setStatus("ready");
          return;
        }

        const params = new URLSearchParams(
          window.location.hash.slice(1)
        );

        setError(
          params
            .get("error_description")
            ?.replace(/\+/g, " ") ||
            "The recovery link has expired, is invalid, or has not established a session. Request a new password-reset email."
        );

        setStatus("unavailable");
      });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // ==========================================
  // UPDATE COLLECTOR PASSWORD
  // ==========================================

  async function updatePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (saving || status !== "ready") return;

    if (newPassword.length < 8) {
      setError(
        "Use a password containing at least 8 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        "New password and confirmation do not match."
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      const {
        data: current,
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!current.user) {
        throw new Error(
          "Your recovery session has expired. Request a new reset link."
        );
      }

      if (
        accountEmail &&
        current.user.email?.toLowerCase() !==
          accountEmail.toLowerCase()
      ) {
        throw new Error(
          "The signed-in account changed. Open a new recovery link."
        );
      }

      // Change password for the account
      // authenticated by the recovery link.
      const {
        error: updateError,
      } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // End recovery session after success.
      const {
        error: signOutError,
      } = await supabase.auth.signOut({
        scope: "local",
      });

      if (signOutError) {
        console.warn(
          "[WasteTrack] Recovery sign-out:",
          signOutError
        );
      }

      setNewPassword("");
      setConfirmPassword("");
      setStatus("done");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update your password. Try again or request another link."
      );
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // PASSWORD RESET USER INTERFACE
  // ==========================================

  return (
    <main
      className="
        flex min-h-[100dvh]
        items-center justify-center
        bg-[#FFFCF8] px-4 py-8
        font-['Fira_Sans','Segoe_UI',Arial,sans-serif]
        text-[#242424]
      "
    >
      <section
        className="
          w-full max-w-[480px]
          overflow-hidden rounded-2xl
          border border-[#EAE2D7]
          bg-white shadow-sm
        "
      >
        {/* HEADER */}

        <header
          className="
            flex items-center gap-3
            border-b border-[#F0E9E0]
            px-5 py-5 sm:px-6
          "
        >
          <div
            className="
              grid h-11 w-11 shrink-0
              place-items-center rounded-xl
              bg-[#F7F0E4] text-[#A81B1E]
            "
          >
            <KeyRound size={20} />
          </div>

          <div>
            <h1 className="text-[19px] font-extrabold">
              Reset password
            </h1>

            <p className="mt-1 text-[11px] text-[#888]">
              WasteTrack account recovery
            </p>
          </div>
        </header>

        <div className="space-y-4 p-5 sm:p-6">

          {/* VERIFYING SESSION */}

          {status === "checking" && (
            <p
              role="status"
              className="flex items-center gap-2 text-[13px] text-[#666]"
            >
              <LoaderCircle
                size={18}
                className="animate-spin text-[#A5B26B]"
              />

              Verifying recovery link...
            </p>
          )}

          {/* INVALID OR EXPIRED LINK */}

          {status === "unavailable" && (
            <div
              role="alert"
              className="
                flex items-start gap-2
                rounded-xl border
                border-[#F2CDCD]
                bg-[#FFF0F0] p-3.5
                text-[12px] text-[#A81B1E]
              "
            >
              <AlertCircle
                size={17}
                className="shrink-0"
              />

              <span>{error}</span>
            </div>
          )}

          {/* NEW PASSWORD FORM */}

          {status === "ready" && (
            <form
              onSubmit={(event) =>
                void updatePassword(event)
              }
              className="space-y-4"
            >
              {/* ACCOUNT EMAIL */}

              <div>
                <label
                  htmlFor="reset-email"
                  className="mb-2 block text-[12px] font-bold text-[#555]"
                >
                  Account receiving the password change
                </label>

                <input
                  id="reset-email"
                  type="email"
                  readOnly
                  value={accountEmail}
                  className={`${inputStyle} bg-[#F5F1EA]`}
                />
              </div>

              {/* NEW PASSWORD */}

              <div>
                <label
                  htmlFor="reset-new-password"
                  className="mb-2 block text-[12px] font-bold text-[#555]"
                >
                  New password
                </label>

                <input
                  id="reset-new-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(event.target.value)
                  }
                  className={inputStyle}
                />
              </div>

              {/* CONFIRM PASSWORD */}

              <div>
                <label
                  htmlFor="reset-confirm-password"
                  className="mb-2 block text-[12px] font-bold text-[#555]"
                >
                  Confirm new password
                </label>

                <input
                  id="reset-confirm-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  className={inputStyle}
                />
              </div>

              {/* SHOW PASSWORDS */}

              <label
                className="
                  inline-flex cursor-pointer
                  items-center gap-2
                  text-[12px] text-[#666]
                "
              >
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) =>
                    setShowPassword(
                      event.target.checked
                    )
                  }
                  className="accent-[#A81B1E]"
                />

                {showPassword ? (
                  <EyeOff size={15} />
                ) : (
                  <Eye size={15} />
                )}

                Show passwords
              </label>

              {/* ERROR MESSAGE */}

              {error && (
                <p
                  role="alert"
                  className="
                    flex items-start gap-2
                    rounded-xl border
                    border-[#F2CDCD]
                    bg-[#FFF0F0] p-3
                    text-[12px] text-[#A81B1E]
                  "
                >
                  <AlertCircle
                    size={16}
                    className="shrink-0"
                  />

                  {error}
                </p>
              )}

              {/* SUBMIT */}

              <button
                type="submit"
                disabled={saving}
                className={buttonStyle}
              >
                {saving ? (
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <KeyRound size={17} />
                )}

                {saving
                  ? "Updating password..."
                  : "Update password"}
              </button>
            </form>
          )}

          {/* SUCCESS */}

          {status === "done" && (
            <div
              role="status"
              className="
                flex items-start gap-2
                rounded-xl border
                border-[#D8E9CC]
                bg-[#F2F9ED] p-3.5
                text-[12px] text-[#547733]
              "
            >
              <CheckCircle2
                size={18}
                className="shrink-0"
              />

              <span>
                Password successfully changed.
                Sign in with your new password.
              </span>
            </div>
          )}

          {/* BACK TO LOGIN */}

          <button
            type="button"
            onClick={() =>
              navigate("/login", {
                replace: true,
              })
            }
            className="
              w-full rounded-xl
              border border-[#A81B1E]
              bg-white px-4 py-2.5
              text-[12px] font-bold
              text-[#A81B1E]
              hover:bg-[#FFF1EF]
            "
          >
            Back to login
          </button>
        </div>
      </section>
    </main>
  );
}