
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useNavigate } from "react-router";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase";

// ========================================
// TYPES
// ========================================

type AdminProfile = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  contact_info: string | null;
  profile_image: string | null;
  role: string;
  is_active: boolean | null;
};

type Notice = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

// ========================================
// CONSTANTS
// ========================================

const AVATAR_BUCKET = "account-avatars";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// ========================================
// SHARED STYLES
// ========================================

const inputStyle = `
  w-full min-w-0 rounded-xl
  border border-[#E2D9CE]
  bg-[#FFFCF8] px-4 py-3
  text-[13px] text-[#333]
  outline-none transition
  focus:border-[#A5B26B]
  focus:ring-2 focus:ring-[#A5B26B]/20
  disabled:opacity-50
`;

const panelStyle = `
  min-w-0 overflow-hidden
  rounded-2xl
  border border-[#EAE2D7]
  bg-white shadow-sm
`;

const primaryButton = `
  inline-flex items-center
  justify-center gap-2
  rounded-xl
  bg-[#A81B1E]
  px-5 py-3
  text-[12px] font-bold
  text-white transition
  hover:bg-[#8F1619]
  disabled:cursor-not-allowed
  disabled:opacity-50
`;

const outlineButton = `
  inline-flex items-center
  justify-center gap-2
  rounded-xl
  border border-[#A81B1E]
  bg-white px-4 py-2.5
  text-[12px] font-bold
  text-[#A81B1E] transition
  hover:bg-[#FFF1EF]
  disabled:cursor-not-allowed
  disabled:opacity-50
`;

// ========================================
// ERROR HANDLING
// ========================================

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const item = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const details = [
      item.message,
      item.details,
      item.hint,
    ]
      .filter(
        (part): part is string =>
          typeof part === "string" &&
          Boolean(part)
      )
      .join(" — ");

    if (details) {
      return typeof item.code === "string"
        ? `${details} (code: ${item.code})`
        : details;
    }
  }

  return "An unexpected error occurred.";
}

// ========================================
// GET INITIALS
// ========================================

function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return "AD";
  }

  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : `${words[0][0]}${
        words[words.length - 1][0]
      }`.toUpperCase();
}

// ========================================
// NOTICE COMPONENT
// ========================================

function NoticeBox({
  notice,
}: {
  notice: Notice;
}) {
  if (!notice) return null;

  const success = notice.kind === "success";
  const info = notice.kind === "info";

  return (
    <div
      role={success || info ? "status" : "alert"}
      className={`
        mt-4 flex items-start gap-2.5
        rounded-xl border p-3.5
        text-[12px] leading-relaxed
        ${
          success
            ? "border-[#D8E9CC] bg-[#F2F9ED] text-[#547733]"
            : info
            ? "border-[#DCE5F3] bg-[#F3F7FD] text-[#456182]"
            : "border-[#F2CDCD] bg-[#FFF0F0] text-[#A81B1E]"
        }
      `}
    >
      {success ? (
        <CheckCircle2
          size={17}
          className="mt-0.5 shrink-0"
        />
      ) : (
        <AlertCircle
          size={17}
          className="mt-0.5 shrink-0"
        />
      )}

      <span className="min-w-0 break-words">
        {notice.message}
      </span>
    </div>
  );
}

// ========================================
// AVATAR COMPONENT
// ========================================

function ProfileAvatar({
  photoUrl,
  name,
}: {
  photoUrl: string;
  name: string;
}) {
  return (
    <div
      className="
        grid h-20 w-20 shrink-0
        place-items-center overflow-hidden
        rounded-2xl bg-[#FCE8E9]
        text-[24px] font-extrabold
        text-[#A81B1E]
      "
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt="Administrator profile"
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

// ========================================
// GET PROFILE IMAGE URL
// ========================================

async function getPhotoUrl(
  value: string | null
): Promise<string> {
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const path = value.startsWith(
    `${AVATAR_BUCKET}/`
  )
    ? value.slice(AVATAR_BUCKET.length + 1)
    : value;

  const {
    data,
    error,
  } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    console.warn(
      "[WasteTrack] Photo preview:",
      error
    );
    return "";
  }

  return data?.signedUrl ?? "";
}

// ========================================
// MAIN COMPONENT
// ========================================

export default function ManageAccount() {
  const navigate = useNavigate();

  // ========================================
  // PROFILE STATES
  // ========================================

  const [profile, setProfile] =
    useState<AdminProfile | null>(null);

  const [fullName, setFullName] =
    useState("");

  const [contactInfo, setContactInfo] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [newEmail, setNewEmail] =
    useState("");

  const [photoUrl, setPhotoUrl] =
    useState("");

  // ========================================
  // PASSWORD STATES
  // ========================================

  const [
    currentPassword,
    setCurrentPassword,
  ] = useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    showPasswords,
    setShowPasswords,
  ] = useState(false);

  // ========================================
  // LOADING STATES
  // ========================================

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [
    changingEmail,
    setChangingEmail,
  ] = useState(false);

  const [
    changingPassword,
    setChangingPassword,
  ] = useState(false);

  const [
    signingOut,
    setSigningOut,
  ] = useState(false);

  // ========================================
  // MESSAGES
  // ========================================

  const [loadError, setLoadError] =
    useState("");

  const [
    profileNotice,
    setProfileNotice,
  ] = useState<Notice>(null);

  const [
    emailNotice,
    setEmailNotice,
  ] = useState<Notice>(null);

  const [
    passwordNotice,
    setPasswordNotice,
  ] = useState<Notice>(null);

  const [
    logoutNotice,
    setLogoutNotice,
  ] = useState<Notice>(null);

  // ========================================
  // REFS
  // ========================================

  const fileRef =
    useRef<HTMLInputElement>(null);

  const requestRef = useRef(0);

  const displayName =
    fullName.trim() || "Administrator";

  // ========================================
  // LOAD ACCOUNT FROM SUPABASE
  // ========================================

  const loadAccount = useCallback(async () => {
    const requestId = ++requestRef.current;

    setLoading(true);
    setLoadError("");

    try {
      // GET AUTHENTICATED USER

      const {
        data: auth,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!auth.user) {
        throw new Error(
          "Please sign in before opening Manage Account."
        );
      }

      // FETCH ACTUAL USERS TABLE COLUMNS

      const {
        data: row,
        error: profileError,
      } = await supabase
        .from("users")
        .select(
          "user_id,full_name,email,contact_info,profile_image,role,is_active"
        )
        .eq("user_id", auth.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      if (!row) {
        throw new Error(
          "No matching user profile was returned. Check the users table and RLS policies."
        );
      }

      const account = row as AdminProfile;

      // VERIFY ADMINISTRATOR ROLE

      if (
        account.role?.toLowerCase() !== "admin"
      ) {
        throw new Error(
          "This page is for administrator accounts only."
        );
      }

      if (account.is_active === false) {
        throw new Error(
          "This administrator account is inactive."
        );
      }

      // LOAD PROFILE PHOTO

      const signedPhoto =
        await getPhotoUrl(
          account.profile_image
        );

      if (
        requestId !== requestRef.current
      ) {
        return;
      }

      // UPDATE STATES

      setProfile(account);
      setFullName(account.full_name ?? "");
      setContactInfo(account.contact_info ?? "");

      const currentEmail =
        auth.user.email ??
        account.email ??
        "";

      setEmail(currentEmail);
      setNewEmail(currentEmail);
      setPhotoUrl(signedPhoto);
    } catch (cause) {
      if (
        requestId !== requestRef.current
      ) {
        return;
      }

      console.error(
        "[WasteTrack] Failed to load account:",
        cause
      );

      setProfile(null);
      setLoadError(errorText(cause));
    } finally {
      if (
        requestId === requestRef.current
      ) {
        setLoading(false);
      }
    }
  }, []);

  // ========================================
  // LOAD ON MOUNT
  // ========================================

  useEffect(() => {
    void loadAccount();

    return () => {
      requestRef.current += 1;
    };
  }, [loadAccount]);

  // ========================================
  // SAVE PROFILE INFORMATION
  // ========================================

  async function saveProfile() {
    if (!profile || saving) return;

    const name = fullName.trim();
    const phone = contactInfo.trim();

    if (!name || name.length > 120) {
      setProfileNotice({
        kind: "error",
        message:
          "Enter a full name of 1–120 characters.",
      });
      return;
    }

    if (phone.length > 30) {
      setProfileNotice({
        kind: "error",
        message:
          "Contact information must be 30 characters or fewer.",
      });
      return;
    }

    setSaving(true);
    setProfileNotice(null);

    try {
      const {
        data,
        error,
      } = await supabase
        .from("users")
        .update({
          full_name: name,
          contact_info: phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", profile.user_id)
        .select("full_name,contact_info")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Profile was not updated. Check the UPDATE and SELECT RLS policies."
        );
      }

      setProfile((previous) =>
        previous
          ? {
              ...previous,
              full_name: data.full_name,
              contact_info: data.contact_info,
            }
          : previous
      );

      setFullName(data.full_name ?? "");
      setContactInfo(data.contact_info ?? "");

      setProfileNotice({
        kind: "success",
        message:
          "Account details saved to Supabase.",
      });
    } catch (cause) {
      console.error(
        "[WasteTrack] Profile update:",
        cause
      );

      setProfileNotice({
        kind: "error",
        message: errorText(cause),
      });
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // CHANGE PROFILE PHOTO
  // ========================================

  async function changePhoto(file?: File) {
    if (
      !file ||
      !profile ||
      uploading
    ) {
      return;
    }

    if (
      ![
        "image/jpeg",
        "image/png",
      ].includes(file.type)
    ) {
      setProfileNotice({
        kind: "error",
        message: "Select a JPG or PNG photo.",
      });
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setProfileNotice({
        kind: "error",
        message:
          "The photo must be 2 MB or smaller.",
      });
      return;
    }

    setUploading(true);
    setProfileNotice(null);

    const extension =
      file.type === "image/png"
        ? "png"
        : "jpg";

    const path =
      `${profile.user_id}/` +
      `${crypto.randomUUID()}.${extension}`;

    try {
      // UPLOAD PHOTO TO SUPABASE STORAGE

      const {
        error: uploadError,
      } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // SAVE PATH TO EXISTING COLUMN

      const {
        data,
        error: updateError,
      } = await supabase
        .from("users")
        .update({
          profile_image: path,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", profile.user_id)
        .select("profile_image")
        .maybeSingle();

      if (updateError || !data) {
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([path]);

        throw (
          updateError ??
          new Error(
            "Photo uploaded but profile_image could not be updated."
          )
        );
      }

      // GET NEW PHOTO URL

      const url = await getPhotoUrl(path);

      setPhotoUrl(url);

      setProfile((previous) =>
        previous
          ? {
              ...previous,
              profile_image: path,
            }
          : previous
      );

      setProfileNotice({
        kind: url ? "success" : "info",
        message: url
          ? "Profile photo saved to Supabase."
          : "Photo saved, but its preview is unavailable. Check Storage permissions.",
      });
    } catch (cause) {
      console.error(
        "[WasteTrack] Photo update:",
        cause
      );

      setProfileNotice({
        kind: "error",
        message: errorText(cause),
      });
    } finally {
      setUploading(false);
    }
  }

  // ========================================
  // CHANGE EMAIL
  // ========================================

  async function updateEmail() {
    if (changingEmail) return;

    const next =
      newEmail.trim().toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)
    ) {
      setEmailNotice({
        kind: "error",
        message: "Enter a valid email address.",
      });
      return;
    }

    if (next === email.toLowerCase()) {
      setEmailNotice({
        kind: "info",
        message:
          "This is already your current email.",
      });
      return;
    }

    setChangingEmail(true);
    setEmailNotice(null);

    try {
      const {
        error,
      } = await supabase.auth.updateUser({
        email: next,
      });

      if (error) {
        throw error;
      }

      setEmailNotice({
        kind: "info",
        message:
          "Email change requested. Follow the verification instructions sent by Supabase.",
      });
    } catch (cause) {
      console.error(
        "[WasteTrack] Email change:",
        cause
      );

      setEmailNotice({
        kind: "error",
        message: errorText(cause),
      });
    } finally {
      setChangingEmail(false);
    }
  }

  // ========================================
  // UPDATE PASSWORD
  // ========================================

  async function updatePassword() {
    if (!profile || changingPassword) {
      return;
    }

    // VALIDATE INPUTS

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setPasswordNotice({
        kind: "error",
        message:
          "Fill in all three password fields.",
      });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordNotice({
        kind: "error",
        message:
          "Use a new password with at least 8 characters.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordNotice({
        kind: "error",
        message:
          "New password and confirmation do not match.",
      });
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordNotice({
        kind: "error",
        message:
          "Your new password must differ from the current password.",
      });
      return;
    }

    setChangingPassword(true);
    setPasswordNotice(null);

    try {
      // ==================================
      // GET CURRENT USER
      // ==================================

      const {
        data: auth,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (
        !auth.user?.email ||
        auth.user.id !== profile.user_id
      ) {
        throw new Error(
          "Your login session is invalid. Sign in again and retry."
        );
      }

      // ==================================
      // VERIFY CURRENT PASSWORD
      // ==================================

      const {
        data: verified,
        error: verifyError,
      } = await supabase.auth
        .signInWithPassword({
          email: auth.user.email,
          password: currentPassword,
        });

      if (
        verifyError ||
        verified.user?.id !== profile.user_id
      ) {
        throw new Error(
          "Current password is incorrect or could not be verified."
        );
      }

      // ==================================
      // CHANGE PASSWORD IN SUPABASE AUTH
      // ==================================

      const {
        error: changeError,
      } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (changeError) {
        throw changeError;
      }

      // CLEAR PASSWORD INPUTS

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswords(false);

      setPasswordNotice({
        kind: "success",
        message:
          "Password updated successfully. Use your new password the next time you sign in.",
      });
    } catch (cause) {
      console.error(
        "[WasteTrack] Password change:",
        cause
      );

      setPasswordNotice({
        kind: "error",
        message: errorText(cause),
      });
    } finally {
      setChangingPassword(false);
    }
  }

  // ========================================
  // LOG OUT
  // ========================================

  async function handleLogout() {
    if (signingOut) return;

    setSigningOut(true);
    setLogoutNotice(null);

    try {
      // END CURRENT BROWSER SESSION

      const {
        error,
      } = await supabase.auth.signOut({
        scope: "local",
      });

      if (error) {
        throw error;
      }

      // REDIRECT TO LOGIN

      navigate("/login", {
        replace: true,
      });
    } catch (cause) {
      console.error(
        "[WasteTrack] Log out:",
        cause
      );

      setLogoutNotice({
        kind: "error",
        message: errorText(cause),
      });

      setSigningOut(false);
    }
  }

  // ========================================
  // MAIN UI
  // ========================================

  return (
    <main
      className="
        min-h-[100dvh] w-full
        bg-[#FFFCF8]
        font-['Fira_Sans','Segoe_UI',Arial,sans-serif]
        text-[#242424]
      "
    >
      <div
        className="
          mx-auto w-full max-w-[1500px]
          px-4 py-6 sm:px-6
          lg:px-8 lg:py-8
        "
      >
        {/* ==================================
            PAGE HEADER + LOG OUT
        ================================== */}

        <div
          className="
            mb-5 flex flex-wrap
            items-center justify-between gap-3
          "
        >
          <div>
            <h1
              className="
                text-[22px] font-extrabold
                tracking-tight sm:text-[27px]
              "
            >
              Manage account
            </h1>

            <p className="mt-1 text-[12px] text-[#888]">
              Your profile and login settings
            </p>
          </div>

          {/* LOG OUT BUTTON */}

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={signingOut}
            className={outlineButton}
          >
            {signingOut ? (
              <LoaderCircle
                size={17}
                className="animate-spin"
              />
            ) : (
              <LogOut size={17} />
            )}

            {signingOut
              ? "Logging out..."
              : "Log out"}
          </button>
        </div>

        <NoticeBox notice={logoutNotice} />

        {/* ==================================
            LOADING STATE
        ================================== */}

        {loading ? (
          <div
            role="status"
            className={`
              ${panelStyle}
              flex min-h-[260px]
              items-center justify-center
              gap-3 text-[13px] text-[#777]
            `}
          >
            <LoaderCircle
              size={26}
              className="animate-spin text-[#A5B26B]"
            />

            Loading account information...
          </div>
        ) : !profile ? (
          /* ==================================
              ERROR STATE
          ================================== */

          <section
            className={`${panelStyle} p-5 sm:p-6`}
          >
            <h2 className="text-[18px] font-extrabold">
              Account information unavailable
            </h2>

            <NoticeBox
              notice={{
                kind: "error",
                message:
                  loadError ||
                  "Unable to load account information.",
              }}
            />

            <button
              type="button"
              onClick={() => void loadAccount()}
              className={`${primaryButton} mt-4`}
            >
              Try again
            </button>
          </section>
        ) : (
          /* ==================================
              ACCOUNT LAYOUT
          ================================== */

          <div
            className="
              grid grid-cols-1
              items-start gap-5
              lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]
            "
          >
            {/* ==================================
                LEFT COLUMN: PROFILE
            ================================== */}

            <section className={panelStyle}>
              <div
                className="
                  flex items-center gap-3
                  border-b border-[#F0E9E0]
                  px-4 py-5 sm:px-6
                "
              >
                <div
                  className="
                    grid h-11 w-11 shrink-0
                    place-items-center rounded-xl
                    bg-[#F7F0E4] text-[#A81B1E]
                  "
                >
                  <UserRound size={21} />
                </div>

                <div>
                  <h2
                    className="
                      text-[17px] font-extrabold
                      sm:text-[19px]
                    "
                  >
                    Profile information
                  </h2>

                  <p className="mt-1 text-[11px] text-[#999]">
                    Your administrator profile information
                  </p>
                </div>
              </div>

              <div className="space-y-5 p-4 sm:p-6">
                {/* PROFILE PHOTO */}

                <div
                  className="
                    flex flex-wrap items-center gap-4
                    rounded-2xl
                    border border-[#EEE6DA]
                    bg-[#FFFCF8] p-4
                  "
                >
                  <ProfileAvatar
                    photoUrl={photoUrl}
                    name={displayName}
                  />

                  <div className="min-w-0 flex-1">
                    <p
                      className="
                        text-[13px] font-bold
                        text-[#333]
                      "
                    >
                      Profile picture
                    </p>

                    <p className="mt-1 text-[11px] text-[#888]">
                      JPG or PNG, maximum 2 MB
                    </p>

                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png"
                      aria-label="Choose profile photo"
                      className="hidden"
                      onChange={(event) => {
                        const file =
                          event.target.files?.[0];

                        void changePhoto(file);

                        event.target.value = "";
                      }}
                    />

                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() =>
                        fileRef.current?.click()
                      }
                      className={`${outlineButton} mt-3`}
                    >
                      {uploading ? (
                        <LoaderCircle
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <Camera size={16} />
                      )}

                      {uploading
                        ? "Uploading..."
                        : "Change photo"}
                    </button>
                  </div>
                </div>

                {/* FULL NAME */}

                <div>
                  <label
                    htmlFor="ma-full-name"
                    className="
                      mb-2 block text-[12px]
                      font-bold text-[#555]
                    "
                  >
                    Full name
                  </label>

                  <input
                    id="ma-full-name"
                    value={fullName}
                    maxLength={120}
                    autoComplete="name"
                    onChange={(event) => {
                      setFullName(event.target.value);
                      setProfileNotice(null);
                    }}
                    className={inputStyle}
                  />
                </div>

                {/* CONTACT NUMBER */}

                <div>
                  <label
                    htmlFor="ma-contact-info"
                    className="
                      mb-2 block text-[12px]
                      font-bold text-[#555]
                    "
                  >
                    Contact number
                  </label>

                  <input
                    id="ma-contact-info"
                    type="tel"
                    value={contactInfo}
                    maxLength={30}
                    autoComplete="tel"
                    placeholder="Enter contact number"
                    onChange={(event) => {
                      setContactInfo(event.target.value);
                      setProfileNotice(null);
                    }}
                    className={inputStyle}
                  />
                </div>

                {/* SAVE CHANGES */}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveProfile()}
                  className={primaryButton}
                >
                  {saving ? (
                    <LoaderCircle
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <Save size={17} />
                  )}

                  {saving
                    ? "Saving..."
                    : "Save changes"}
                </button>

                <NoticeBox notice={profileNotice} />
              </div>
            </section>

            {/* ==================================
                RIGHT COLUMN
            ================================== */}

            <div className="space-y-5">
              {/* ==================================
                  EMAIL SETTINGS
              ================================== */}

              <section className={panelStyle}>
                <div
                  className="
                    flex items-center gap-3
                    border-b border-[#F0E9E0]
                    px-4 py-5 sm:px-6
                  "
                >
                  <div
                    className="
                      grid h-11 w-11 shrink-0
                      place-items-center rounded-xl
                      bg-[#F7F0E4] text-[#A81B1E]
                    "
                  >
                    <Mail size={20} />
                  </div>

                  <div>
                    <h2
                      className="
                        text-[16px] font-extrabold
                        sm:text-[18px]
                      "
                    >
                      Email address
                    </h2>

                    <p className="mt-1 text-[11px] text-[#999]">
                      Managed through Supabase Authentication
                    </p>
                  </div>
                </div>

                <div className="space-y-4 p-4 sm:p-6">
                  {/* CURRENT EMAIL */}

                  <div>
                    <label
                      htmlFor="ma-current-email"
                      className="
                        mb-2 block
                        text-[12px] font-bold
                        text-[#555]
                      "
                    >
                      Current email
                    </label>

                    <input
                      id="ma-current-email"
                      type="email"
                      readOnly
                      value={email}
                      className={`
                        ${inputStyle}
                        bg-[#F5F1EA] text-[#777]
                      `}
                    />
                  </div>

                  {/* NEW EMAIL */}

                  <div>
                    <label
                      htmlFor="ma-new-email"
                      className="
                        mb-2 block
                        text-[12px] font-bold
                        text-[#555]
                      "
                    >
                      New email address
                    </label>

                    <input
                      id="ma-new-email"
                      type="email"
                      autoComplete="email"
                      value={newEmail}
                      onChange={(event) => {
                        setNewEmail(event.target.value);
                        setEmailNotice(null);
                      }}
                      className={inputStyle}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={changingEmail}
                    onClick={() => void updateEmail()}
                    className={outlineButton}
                  >
                    {changingEmail ? (
                      <LoaderCircle
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Mail size={16} />
                    )}

                    {changingEmail
                      ? "Requesting..."
                      : "Change email"}
                  </button>

                  <NoticeBox notice={emailNotice} />
                </div>
              </section>

              {/* ==================================
                  CHANGE PASSWORD
              ================================== */}

              <section className={panelStyle}>
                <div
                  className="
                    flex items-center gap-3
                    border-b border-[#F0E9E0]
                    px-4 py-5 sm:px-6
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
                    <h2
                      className="
                        text-[16px] font-extrabold
                        sm:text-[18px]
                      "
                    >
                      Change password
                    </h2>

                    <p className="mt-1 text-[11px] text-[#999]">
                      Verify your current password to update it
                    </p>
                  </div>
                </div>

                <form
                  className="space-y-4 p-4 sm:p-6"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void updatePassword();
                  }}
                >
                  {/* CURRENT PASSWORD */}

                  <div>
                    <label
                      htmlFor="ma-current-password"
                      className="
                        mb-2 block
                        text-[12px] font-bold
                        text-[#555]
                      "
                    >
                      Current password
                    </label>

                    <input
                      id="ma-current-password"
                      type={
                        showPasswords
                          ? "text"
                          : "password"
                      }
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => {
                        setCurrentPassword(
                          event.target.value
                        );
                        setPasswordNotice(null);
                      }}
                      className={inputStyle}
                      required
                    />
                  </div>

                  {/* NEW PASSWORD */}

                  <div>
                    <label
                      htmlFor="ma-new-password"
                      className="
                        mb-2 block
                        text-[12px] font-bold
                        text-[#555]
                      "
                    >
                      New password
                    </label>

                    <input
                      id="ma-new-password"
                      type={
                        showPasswords
                          ? "text"
                          : "password"
                      }
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(
                          event.target.value
                        );
                        setPasswordNotice(null);
                      }}
                      className={inputStyle}
                      minLength={8}
                      required
                    />
                  </div>

                  {/* CONFIRM PASSWORD */}

                  <div>
                    <label
                      htmlFor="ma-confirm-password"
                      className="
                        mb-2 block
                        text-[12px] font-bold
                        text-[#555]
                      "
                    >
                      Confirm new password
                    </label>

                    <input
                      id="ma-confirm-password"
                      type={
                        showPasswords
                          ? "text"
                          : "password"
                      }
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(
                          event.target.value
                        );
                        setPasswordNotice(null);
                      }}
                      className={inputStyle}
                      minLength={8}
                      required
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
                      checked={showPasswords}
                      onChange={(event) =>
                        setShowPasswords(
                          event.target.checked
                        )
                      }
                      className="accent-[#A81B1E]"
                    />

                    {showPasswords ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}

                    Show passwords
                  </label>

                  {/* UPDATE PASSWORD BUTTON */}

                  <div>
                    <button
                      type="submit"
                      disabled={changingPassword}
                      className={primaryButton}
                    >
                      {changingPassword ? (
                        <LoaderCircle
                          size={17}
                          className="animate-spin"
                        />
                      ) : (
                        <KeyRound size={17} />
                      )}

                      {changingPassword
                        ? "Updating..."
                        : "Update password"}
                    </button>
                  </div>

                  <NoticeBox notice={passwordNotice} />
                </form>
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
