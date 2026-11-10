
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { useNavigate } from "react-router";
import { createClient } from "@supabase/supabase-js";

import {
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

interface AdminProfile {
  role: string;
  is_active: boolean;
}

interface CreatedAccount {
  userId: string;
  fullName: string;
  email: string;
  requiresConfirmation: boolean;
}

interface PendingSignup {
  userId: string;
  email: string;
  requiresConfirmation: boolean;
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function CollectorsAccount() {
  const navigate = useNavigate();

  // ========================================
  // COLLECTOR INFORMATION
  // ========================================

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");

  // ========================================
  // PASSWORD
  // ========================================

  const [
    showPasswordFields,
    setShowPasswordFields,
  ] = useState(false);

  const [showPassword, setShowPassword] =
    useState(false);

  const [password, setPassword] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  // ========================================
  // ACCOUNT CREATION STATES
  // ========================================

  const [checkingAdmin, setCheckingAdmin] =
    useState(true);

  const [isAdmin, setIsAdmin] = useState(false);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [adminError, setAdminError] =
    useState("");

  const [created, setCreated] =
    useState<CreatedAccount | null>(null);

  // If Auth signup succeeds but saving the profile
  // fails, retain the new user ID so the admin can
  // retry without creating another Auth account.
  const [pendingSignup, setPendingSignup] =
    useState<PendingSignup | null>(null);

  // ========================================
  // CHECK ADMIN PROFILE
  // ========================================

  useEffect(() => {
    let mounted = true;

    async function verifyAdmin() {
      try {
        setCheckingAdmin(true);
        setAdminError("");

        // Get current signed-in administrator.
        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!authData.user) {
          throw new Error(
            "Please sign in as an administrator."
          );
        }

        // Check role in existing public.users.
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from("users")
          .select("role, is_active")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (profileError) {
          throw new Error(
            `Admin verification failed: ${profileError.message}`
          );
        }

        const profile =
          profileData as AdminProfile | null;

        if (
          !profile ||
          profile.role !== "admin" ||
          profile.is_active !== true
        ) {
          throw new Error(
            "Only active administrators can create collector accounts."
          );
        }

        if (mounted) {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error(
          "[WasteTrack] Admin verification:",
          err
        );

        if (mounted) {
          setIsAdmin(false);

          setAdminError(
            err instanceof Error
              ? err.message
              : "Unable to verify administrator."
          );
        }
      } finally {
        if (mounted) {
          setCheckingAdmin(false);
        }
      }
    }

    verifyAdmin();

    return () => {
      mounted = false;
    };
  }, []);

  // ========================================
  // CREATE COLLECTOR ACCOUNT
  // ========================================

  async function handleSave(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      saving ||
      created ||
      checkingAdmin ||
      !isAdmin
    ) {
      return;
    }

    setError("");

    const cleanName = fullName.trim();

    const cleanEmail =
      email.trim().toLowerCase();

    const cleanContact = contact.trim();

    // ====================================
    // VALIDATE COLLECTOR INFORMATION
    // ====================================

    if (!cleanName) {
      setError("Full name is required.");
      return;
    }

    if (cleanName.length > 200) {
      setError(
        "Full name cannot exceed 200 characters."
      );
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      setError(
        "Enter a valid email address."
      );
      return;
    }

    if (cleanContact.length > 100) {
      setError(
        "Contact number cannot exceed 100 characters."
      );
      return;
    }

    // Only require a password during the first
    // Authentication signup. A pending signup
    // needs only its profile saved.

    if (!pendingSignup) {
      if (!showPasswordFields) {
        setShowPasswordFields(true);

        setError(
          "Please add a password for the collector."
        );
        return;
      }

      if (
        password.length < 8 ||
        password.length > 128
      ) {
        setError(
          "Password must contain 8 to 128 characters."
        );
        return;
      }

      if (password !== confirmPassword) {
        setError(
          "Passwords do not match."
        );
        return;
      }
    }

    if (
      pendingSignup &&
      pendingSignup.email !== cleanEmail
    ) {
      setError(
        "The login email cannot be changed while finishing an existing signup."
      );
      return;
    }

    setSaving(true);

    try {
      // ====================================
      // 1. VERIFY ADMIN SESSION
      // ====================================

      const {
        data: sessionData,
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!sessionData.session) {
        throw new Error(
          "Your administrator session has expired. Please sign in again."
        );
      }

      // The SQL function also independently
      // verifies that the caller is an active admin.

      // ====================================
      // 2. DETERMINE ACCOUNT TO SAVE
      // ====================================

      let newUserId = pendingSignup?.userId || "";

      let requiresConfirmation =
        pendingSignup?.requiresConfirmation ?? false;

      // ====================================
      // 3. CREATE AUTH ACCOUNT IF NEEDED
      // ====================================

      if (!pendingSignup) {
        // Uses the same project credentials as
        // your existing Supabase client.
        //
        // Never use a service-role key in React.

        const supabaseUrl =
          import.meta.env.VITE_SUPABASE_URL as
            | string
            | undefined;

        const supabaseKey =
          (
            import.meta.env.VITE_SUPABASE_ANON_KEY ||
            import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
          ) as string | undefined;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "Missing Supabase frontend configuration. Check the environment variables used in src/lib/supabase.ts."
          );
        }

        // Create a separate temporary client.
        // The administrator's existing session
        // is not replaced by the new collector.

        const signupClient = createClient(
          supabaseUrl,
          supabaseKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          }
        );

        const {
          data: signupData,
          error: signupError,
        } = await signupClient.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
            },
          },
        });

        if (signupError) {
          throw new Error(
            `Authentication signup failed: ${signupError.message}`
          );
        }

        if (!signupData.user?.id) {
          throw new Error(
            "Supabase Authentication did not return a new user ID."
          );
        }

        // Supabase may return an obfuscated user
        // for an existing email when email
        // confirmation is enabled.

        if (
          signupData.user.identities &&
          signupData.user.identities.length === 0
        ) {
          throw new Error(
            "This email may already have an Authentication account. Check the existing user before creating another."
          );
        }

        newUserId = signupData.user.id;

        requiresConfirmation =
          signupData.session === null;

        // Save the new ID immediately. If the
        // profile RPC fails, clicking the button
        // again will retry ONLY the profile save.

        setPendingSignup({
          userId: newUserId,
          email: cleanEmail,
          requiresConfirmation,
        });

        // Credentials have already been sent to
        // Supabase Authentication; clear them
        // from the form after signup.

        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowPasswordFields(false);
      }

      // ====================================
      // 4. SAVE PROFILE THROUGH SQL FUNCTION
      // ====================================

      // Existing SQL function:
      // public.wastetrack_save_collector_profile
      //
      // It will insert or update public.users:
      //
      // user_id          = Auth user UUID
      // full_name        = Collector name
      // email            = Collector email
      // contact_info     = Contact number
      // role             = "collector"
      // is_active        = true
      // collector_status = "Active"
      //
      // Do NOT call users.insert() or users.update()
      // here. The protected SQL function performs
      // that database operation.

      const {
        data: savedUserId,
        error: profileError,
      } = await supabase.rpc(
        "wastetrack_save_collector_profile",
        {
          p_user_id: newUserId,
          p_full_name: cleanName,
          p_email: cleanEmail,
          p_contact_info: cleanContact,
        }
      );

      if (profileError) {
        throw new Error(
          `Failed to save collector profile: ${profileError.message}`
        );
      }

      if (!savedUserId) {
        throw new Error(
          "Collector profile was not saved."
        );
      }

      // ====================================
      // 5. ACCOUNT CREATED SUCCESSFULLY
      // ====================================

      setCreated({
        userId: String(savedUserId),
        fullName: cleanName,
        email: cleanEmail,
        requiresConfirmation,
      });

      setPendingSignup(null);

      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowPasswordFields(false);
    } catch (err) {
      console.error(
        "[WasteTrack] Collector creation error:",
        err
      );

      const message =
        err instanceof Error
          ? err.message
          : "Unable to create collector account.";

      setError(message);
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // TAILWIND CLASSES
  // ========================================

  const inputClass =
    "h-11 w-full min-w-0 rounded-lg border border-[#D1C8BB] bg-white px-3 text-[13px] text-[#242424] outline-none transition focus:border-[#A5B879] focus:ring-2 focus:ring-[#A5B879]/25 disabled:cursor-not-allowed disabled:bg-[#F0ECE5]";

  const labelClass =
    "mb-1.5 block text-[12px] font-semibold text-[#555]";

  const panelClass =
    "min-w-0 rounded-2xl bg-[#F7F0E4] p-5 sm:p-6";

  const primaryButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[#B80000] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#940000] disabled:cursor-not-allowed disabled:opacity-50";

  const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-[#D0102B] bg-white px-5 py-2.5 text-[13px] font-bold text-[#D0102B] transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main className="min-h-[100dvh] w-full min-w-0 bg-white text-[#1B1B1B]">
      {/* HEADER — NO ADMIN ACCOUNT BUTTON */}
      <header className="border-b-[7px] border-[#A5B879] px-4 py-5 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() =>
            navigate("/admin/collectors")
          }
          className="mb-2 flex items-center gap-1 text-xs font-bold text-[#D0102B] hover:underline"
        >
          <ArrowLeft size={15} />
          Back to Collectors
        </button>

        <h1 className="text-[23px] font-bold sm:text-[28px]">
          Collectors account
        </h1>

        <p className="mt-1 text-xs text-gray-500 sm:text-sm">
          Create a new collector account.
        </p>
      </header>

      {/* ADMIN VERIFICATION ERROR */}
      {adminError && (
        <div
          role="alert"
          className="mx-3 mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:mx-5 lg:mx-7"
        >
          <AlertCircle
            size={19}
            className="shrink-0 text-red-700"
          />

          <p className="text-xs leading-relaxed text-red-700">
            {adminError}
          </p>
        </div>
      )}

      {/* PENDING SIGNUP NOTICE */}
      {pendingSignup && !created && (
        <div className="mx-3 mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:mx-5 lg:mx-7">
          <AlertCircle
            size={20}
            className="shrink-0 text-amber-700"
          />

          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900">
              Authentication account created
            </p>

            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              The login account was created, but
              its collector profile has not been
              confirmed as saved. Click
              "Finish collector setup" to retry
              saving the profile without creating
              another Authentication account.
            </p>
          </div>
        </div>
      )}

      {/* ACCOUNT CREATED */}
      {created && (
        <div className="mx-3 mt-5 flex flex-col gap-4 rounded-xl border border-green-200 bg-green-50 p-4 sm:mx-5 sm:flex-row sm:items-center sm:justify-between lg:mx-7">
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={24}
              className="shrink-0 text-green-700"
            />

            <div className="min-w-0">
              <p className="text-sm font-bold text-green-800">
                Collector account created successfully!
              </p>

              <p className="mt-2 text-xs text-green-800">
                {created.fullName}
              </p>

              <p className="mt-1 break-all text-xs text-green-800">
                {created.email}
              </p>

              <p className="mt-1 break-all text-[11px] text-green-700">
                Collector ID: {created.userId}
              </p>

              <p className="mt-2 text-xs font-semibold text-green-800">
                Role: Collector
              </p>

              {created.requiresConfirmation && (
                <p className="mt-2 text-[11px] leading-relaxed text-green-800">
                  Email confirmation may be required
                  before the collector can sign in.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate("/admin/collectors")
            }
            className={primaryButton}
          >
            View collectors
          </button>
        </div>
      )}

      {/* ACCOUNT FORM */}
      <form
        onSubmit={handleSave}
        className="grid w-full grid-cols-1 items-start gap-4 px-3 py-6 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-7"
      >
        {/* LEFT PANEL */}
        <section className={panelClass}>
          <h2 className="mb-5 text-[15px] font-bold uppercase text-[#626262]">
            Collector Information
          </h2>

          {/* FULL NAME */}
          <div className="mb-5">
            <label
              htmlFor="ca-name"
              className={labelClass}
            >
              Full name
            </label>

            <input
              id="ca-name"
              type="text"
              required
              maxLength={200}
              autoComplete="name"
              disabled={!!created || saving}
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setError("");
              }}
              className={inputClass}
              placeholder="Enter collector full name"
            />
          </div>

          {/* EMAIL */}
          <div className="mb-5">
            <label
              htmlFor="ca-email"
              className={labelClass}
            >
              Gmail / Email address
            </label>

            <input
              id="ca-email"
              type="email"
              required
              autoComplete="off"
              disabled={
                !!created ||
                saving ||
                !!pendingSignup
              }
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              className={inputClass}
              placeholder="collector@gmail.com"
            />
          </div>

          {/* CONTACT NUMBER */}
          <div className="mb-6">
            <label
              htmlFor="ca-contact"
              className={labelClass}
            >
              Contact number
            </label>

            <input
              id="ca-contact"
              type="tel"
              maxLength={100}
              autoComplete="tel"
              disabled={!!created || saving}
              value={contact}
              onChange={(event) => {
                setContact(event.target.value);
                setError("");
              }}
              className={inputClass}
              placeholder="Enter contact number"
            />
          </div>

          {/* BUTTONS */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                navigate("/admin/collectors")
              }
              className={outlineButton}
            >
              {created ? "Back" : "Cancel"}
            </button>

            <button
              type="submit"
              disabled={
                saving ||
                checkingAdmin ||
                !isAdmin ||
                !!created
              }
              className={primaryButton}
            >
              {saving && (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                />
              )}

              {saving
                ? pendingSignup
                  ? "Finishing setup..."
                  : "Creating account..."
                : created
                  ? "Account created"
                  : pendingSignup
                    ? "Finish collector setup"
                    : checkingAdmin
                      ? "Checking admin..."
                      : "Add account"}
            </button>
          </div>

          {/* ERROR MESSAGE */}
          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700"
            >
              <AlertCircle
                size={17}
                className="shrink-0"
              />

              <span className="break-words">
                {error}
              </span>
            </div>
          )}
        </section>

        {/* RIGHT PANEL */}
        <section className={panelClass}>
          <div className="mb-5 flex items-center gap-2">
            <LockKeyhole
              size={19}
              className="text-[#B80000]"
            />

            <h2 className="text-[15px] font-bold uppercase text-[#626262]">
              Login Credentials
            </h2>
          </div>

          {/* COLLECTOR ID */}
          <div className="mb-5">
            <label
              htmlFor="ca-collector-id"
              className={labelClass}
            >
              Collector ID
            </label>

            <input
              id="ca-collector-id"
              type="text"
              value={
                created?.userId ||
                pendingSignup?.userId ||
                "Generated after account creation"
              }
              disabled
              readOnly
              className={`${inputClass} text-[11px]`}
            />

            <p className="mt-1.5 text-[11px] text-gray-500">
              Generated by Supabase Authentication.
            </p>
          </div>

          {/* ADD PASSWORD */}
          {!pendingSignup && (
            <>
              <button
                type="button"
                disabled={!!created || saving}
                onClick={() => {
                  setShowPasswordFields((previous) => {
                    if (previous) {
                      setPassword("");
                      setConfirmPassword("");
                      setShowPassword(false);
                    }

                    return !previous;
                  });
                }}
                className={outlineButton}
              >
                {showPasswordFields
                  ? "Hide password fields"
                  : "Add password"}
              </button>

              {/* PASSWORD FIELDS */}
              {showPasswordFields && !created && (
                <div className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="ca-password"
                      className={labelClass}
                    >
                      Password
                    </label>

                    <div className="relative">
                      <input
                        id="ca-password"
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        required
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                        disabled={saving}
                        value={password}
                        onChange={(event) =>
                          setPassword(event.target.value)
                        }
                        className={`${inputClass} pr-11`}
                        placeholder="Enter password"
                      />

                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        onClick={() =>
                          setShowPassword(
                            (previous) => !previous
                          )
                        }
                        className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-800"
                      >
                        {showPassword ? (
                          <EyeOff size={17} />
                        ) : (
                          <Eye size={17} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="ca-confirm"
                      className={labelClass}
                    >
                      Confirm password
                    </label>

                    <input
                      id="ca-confirm"
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      disabled={saving}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(
                          event.target.value
                        )
                      }
                      className={inputClass}
                      placeholder="Confirm password"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ACCOUNT DETAILS */}
          <div className="mt-5 rounded-lg border border-[#E3D6C4] bg-white/70 p-4">
            <p className="text-[12px] font-bold text-[#555]">
              Account details
            </p>

            <p className="mt-3 text-[12px] text-[#666]">
              <strong>Role:</strong> Collector
            </p>

            <p className="mt-2 text-[12px] text-[#666]">
              <strong>Initial status:</strong> Active
            </p>

            <p className="mt-2 break-all text-[12px] text-[#666]">
              <strong>Login email:</strong>{" "}
              {email || "Not entered"}
            </p>
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-[#777]">
            The collector signs in using their
            registered email and password.
            The password is managed by Supabase
            Authentication, not stored in
            the public users table.
          </p>
        </section>
      </form>
    </main>
  );
}
