
import {
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { Link, useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { img } from "../../utils";

type UserRole = "resident" | "admin" | "collector";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setErrorMessage("");
    setLoading(true);

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error(
          "Unable to find the authenticated user."
        );
      }

      const {
        data: userProfile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("user_id, full_name, email, role")
        .eq("user_id", authData.user.id)
        .single();

      if (profileError || !userProfile) {
        await supabase.auth.signOut();

        throw new Error(
          "Unable to load your account profile. Please try again."
        );
      }

      const role: UserRole | null =
        userProfile.role === "admin" ||
        userProfile.role === "staff"
          ? "admin"
          : userProfile.role === "collector"
            ? "collector"
            : userProfile.role === "resident"
              ? "resident"
              : null;

      if (!role) {
        await supabase.auth.signOut();

        throw new Error(
          "Your account has an unsupported role."
        );
      }

      localStorage.setItem("userRole", role);
      localStorage.setItem(
        "userName",
        userProfile.full_name || "User"
      );

      const destinations: Record<UserRole, string> = {
        admin: "/admin/AdminDashboard",
        collector: "/collector/dashboard",
        resident: "/resident/dashboard",
      };

      navigate(destinations[role], {
        replace: true,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to log in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="
        flex min-h-[100dvh] w-full
        items-center justify-center
        overflow-x-hidden bg-white
        md:bg-[#f4f7f5]
        md:p-6 lg:p-8
      "
    >
      <div
        className="
          relative flex min-h-[100dvh] w-full
          flex-col overflow-hidden bg-white

          md:min-h-0 md:max-w-[650px]
          md:rounded-[28px]
          md:shadow-xl

          lg:min-h-[620px]
          lg:max-w-[1100px]
          lg:flex-row
          lg:rounded-[30px]

          xl:max-w-[1250px]
        "
      >
        {/* HEADER / BRANDING SECTION */}
        <header
          className="
            relative h-[200px] w-full
            shrink-0 overflow-hidden
            bg-[#A61B1B]

            md:h-[240px]

            lg:flex lg:h-auto
            lg:min-h-[620px]
            lg:w-[48%]
            lg:items-center
            lg:justify-center

            xl:w-1/2
          "
        >
          {/* MOBILE LOGO */}
          <div
            className="
              absolute left-1/2 top-[58px] z-20
              h-[125px] w-[100px]
              -translate-x-1/2
              rounded-t-[28px]
              bg-white px-3 pt-3

              md:top-[75px]

              lg:hidden
            "
          >
            <img
              src={img("waste-logo1.png")}
              alt="Waste Track Logo"
              draggable={false}
              className="
                h-[106px] w-full
                object-contain
              "
            />
          </div>

          {/* MOBILE WHITE CURVE */}
          <svg
            viewBox="0 0 430 75"
            preserveAspectRatio="none"
            className="
              absolute bottom-0 left-0
              z-10 h-[75px] w-full
              lg:hidden
            "
            aria-hidden="true"
          >
            <path
              fill="#ffffff"
              d="
                M0,75
                L0,48
                C14,22 50,8 112,8
                L250,8
                C295,8 321,32 359,32
                C395,32 420,15 430,0
                L430,75
                Z
              "
            />
          </svg>

          {/* DESKTOP BRANDING */}
          <div
            className="
              hidden w-full flex-col
              items-center justify-center
              px-10 text-center
              text-white lg:flex
            "
          >
            <div
              className="
                mb-8 flex h-[180px]
                w-[180px] items-center
                justify-center rounded-[35px]
                bg-white p-5 shadow-lg
              "
            >
              <img
                src={img("waste-logo1.png")}
                alt="Waste Track Logo"
                draggable={false}
                className="
                  h-full w-full object-contain
                "
              />
            </div>

            <h2
              className="
                text-4xl font-extrabold
                tracking-wide xl:text-5xl
              "
            >
              Waste Track
            </h2>

            <p
              className="
                mt-5 max-w-[350px]
                text-base leading-relaxed
                text-white/90
              "
            >
              Smart Waste Management and
              Monitoring System
            </p>

            <div
              className="
                mt-8 h-1 w-20
                rounded-full bg-white/70
              "
            />
          </div>
        </header>

        {/* LOGIN FORM SECTION */}
        <section
          className="
            relative z-30 flex w-full
            flex-1 flex-col
            bg-white

            lg:w-[52%]
            lg:items-center
            lg:justify-center

            xl:w-1/2
          "
        >
          <form
            onSubmit={handleLogin}
            aria-busy={loading}
            className="
              w-full px-5 pb-10 pt-1

              sm:px-8

              md:px-12 md:pb-12
              md:pt-5

              lg:mx-auto
              lg:max-w-[470px]
              lg:px-8
              lg:py-12

              xl:max-w-[500px]
            "
          >
            {/* MOBILE TITLE */}
            <h1
              className="
                mb-7 text-center
                text-lg font-bold
                leading-snug
                text-[#df0000]

                sm:text-xl

                lg:hidden
              "
            >
              Welcome, Waste Track
            </h1>

            {/* DESKTOP TITLE */}
            <div
              className="
                mb-10 hidden
                text-center lg:block
              "
            >
              <h1
                className="
                  text-3xl font-bold
                  text-[#A61B1B]
                  xl:text-4xl
                "
              >
                Welcome Back!
              </h1>

              <p
                className="
                  mt-3 text-sm
                  text-neutral-500
                "
              >
                Log in to your Waste Track account
              </p>
            </div>

            <Field
              label="Email Address"
              icon={
                <Mail
                  size={17}
                  strokeWidth={2}
                />
              }
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              disabled={loading}
            />

            <Field
              label="Password"
              icon={
                <LockKeyhole
                  size={17}
                  strokeWidth={2}
                />
              }
              placeholder="Enter your password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              password
              disabled={loading}
            />

            {/* ERROR MESSAGE */}
            {errorMessage && (
              <p
                role="alert"
                className="
                  mt-3 break-words
                  rounded-lg border
                  border-red-200
                  bg-red-50 p-3
                  text-sm leading-relaxed
                  text-red-700
                "
              >
                {errorMessage}
              </p>
            )}

            {/* LOGIN BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="
                mt-7 flex w-full
                items-center justify-center
                gap-3 rounded-full
                bg-[#d00000]
                px-4 py-3
                text-sm font-semibold
                text-white
                transition-all
                hover:bg-[#b90000]
                active:scale-[0.99]

                focus-visible:outline
                focus-visible:outline-2
                focus-visible:outline-offset-2
                focus-visible:outline-red-600

                disabled:cursor-not-allowed
                disabled:opacity-60

                lg:mt-9 lg:py-3.5
                lg:text-base
              "
            >
              <span>
                {loading
                  ? "Logging in..."
                  : "Log In"}
              </span>

              {!loading && (
                <ArrowRight
                  size={17}
                  aria-hidden="true"
                />
              )}
            </button>

            {/* SIGNUP LINK */}
            <p
              className="
                mt-5 text-center
                text-sm leading-relaxed
                text-neutral-700

                lg:mt-7
              "
            >
              Don&apos;t have an account?{" "}
              <Link
                to="/signup"
                className="
                  font-bold text-[#007846]
                  hover:underline
                "
              >
                Sign up
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

/* REUSABLE INPUT FIELD */

type FieldProps = {
  label: string;
  icon: ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  password?: boolean;
  autoComplete?: string;
  disabled?: boolean;
};

function Field({
  label,
  icon,
  placeholder,
  value,
  onChange,
  type = "text",
  password = false,
  autoComplete,
  disabled = false,
}: FieldProps) {
  const id = useId();

  const [showPassword, setShowPassword] =
    useState(false);

  const inputType =
    password && showPassword
      ? "text"
      : type;

  return (
    <div className="mb-4 lg:mb-6">
      <label
        htmlFor={id}
        className="
          mb-1.5 block pl-1
          text-sm font-medium
          text-neutral-600

          lg:mb-2
        "
      >
        {label}
      </label>

      <div
        className="
          flex h-[34px] items-center
          gap-2 rounded-xl
          border border-[#b9e5ce]
          px-2.5 text-neutral-500
          transition-colors

          focus-within:border-[#15965e]

          lg:h-[48px]
          lg:px-4
        "
      >
        <span
          aria-hidden="true"
          className="
            flex shrink-0
            items-center
          "
        >
          {icon}
        </span>

        <input
          id={id}
          required
          disabled={disabled}
          type={inputType}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          className="
            h-full min-w-0 flex-1
            bg-transparent
            text-base text-neutral-800
            outline-none
            placeholder:text-neutral-500
            disabled:opacity-60
          "
        />

        {password && (
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setShowPassword(
                (current) => !current
              )
            }
            aria-controls={id}
            aria-pressed={showPassword}
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
            className="
              grid h-7 w-7
              shrink-0 place-items-center
              rounded text-neutral-500
              hover:text-neutral-800

              focus-visible:outline
              focus-visible:outline-2
              focus-visible:outline-green-700

              disabled:opacity-50
            "
          >
            {showPassword ? (
              <EyeOff size={17} />
            ) : (
              <Eye size={17} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
