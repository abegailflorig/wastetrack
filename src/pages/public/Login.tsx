import {
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

    setErrorMessage("");
    setLoading(true);

    try {
      // Supabase Authentication checks the email and password.
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Unable to find the authenticated user.");
      }

      // Get the user's role from the public.users table.
      const {
        data: userProfile,
        error: profileError,
      } = await supabase
        .from("users")
        .select("user_id, full_name, email, role")
        .eq("user_id", authData.user.id)
        .single();

      if (profileError) {
        await supabase.auth.signOut();

        throw new Error(
          "Your account exists, but its users-table profile was not found."
        );
      }

      const role = userProfile.role as UserRole;

      // Store only basic information needed by the UI.
      localStorage.setItem("userRole", role);
      localStorage.setItem(
        "userName",
        userProfile.full_name
      );

      // Redirect according to the user's role.
      if (role === "admin") {
<<<<<<< HEAD
        navigate("/admin/AdminDashboard", {
=======
        navigate("/admin/dashboard", {
>>>>>>> e3d315ca13db7b1bea31382fed7c021dc25eecf1
          replace: true,
        });

        return;
      }

      if (role === "collector") {
        navigate("/collector/dashboard", {
          replace: true,
        });

        return;
      }

      navigate("/resident/dashboard", {
        replace: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to log in. Please try again.";

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="relative mx-auto min-h-screen w-full max-w-[430px] overflow-hidden bg-white">
        {/* Red header */}
        <header className="relative h-[200px] overflow-hidden bg-[#A61B1B]">
          {/* Logo container */}
          <div
            className="
              absolute left-1/2 top-[58px] z-20
              h-[125px] w-[100px]
              -translate-x-1/2
              rounded-t-[28px] bg-white
              px-3 pt-3
            "
          >
            <img
              src={img("waste-logo1.png")}
              alt="Waste Track Logo"
              className="h-[106px] w-full object-contain"
            />
          </div>

          {/* White curve */}
          <svg
            viewBox="0 0 430 75"
            preserveAspectRatio="none"
            className="absolute bottom-0 left-0 z-10 h-[75px] w-full"
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
        </header>

        {/* Login form */}
        <form
          onSubmit={handleLogin}
          className="relative z-30 bg-white px-5 pb-12 pt-1"
        >
          <h1 className="mb-7 text-center text-[13px] font-bold text-[#df0000]">
            Welcome, Waste Track
          </h1>

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
          />

          {errorMessage && (
            <p
              role="alert"
              className="
                mt-3 rounded-lg
                border border-red-200
                bg-red-50 p-2
                text-[9px] text-red-700
              "
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              mt-7 flex w-full items-center
              justify-center gap-5
              rounded-full bg-[#d00000]
              py-[13px] text-[10px]
              font-medium text-white
              transition-colors
              hover:bg-[#b90000]
              active:scale-[0.99]
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            <span>
              {loading
                ? "Logging in..."
                : "Log In"}
            </span>

            {!loading && (
              <ArrowRight size={16} />
            )}
          </button>

          <p className="mt-5 text-center text-[8px] text-black">
            Don&apos;t have an account?{" "}
            <Link
              to="/signup"
              className="font-bold text-[#007846]"
            >
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  icon: ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  password?: boolean;
  autoComplete?: string;
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
}: FieldProps) {
  const [showPassword, setShowPassword] =
    useState(false);

  const inputType =
    password && showPassword
      ? "text"
      : type;

  return (
    <label className="mb-[14px] block">
      <span className="mb-1.5 block pl-1 text-[8px] text-neutral-500">
        {label}
      </span>

      <div
        className="
          flex h-[34px] items-center gap-2
          rounded-xl border border-[#b9e5ce]
          px-2.5 text-neutral-400
          transition-colors
          focus-within:border-[#15965e]
        "
      >
        <span className="flex shrink-0 items-center">
          {icon}
        </span>

        <input
          required
          type={inputType}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="
            h-full w-full bg-transparent
            text-[10px] text-neutral-700
            outline-none
            placeholder:text-neutral-300
          "
        />

        {password && (
          <button
            type="button"
            onClick={() =>
              setShowPassword(
                (current) => !current
              )
            }
            className="flex shrink-0 items-center text-neutral-400"
            aria-label={
              showPassword
                ? "Hide password"
                : "Show password"
            }
          >
            {showPassword ? (
              <EyeOff size={16} />
            ) : (
              <Eye size={16} />
            )}
          </button>
        )}
      </div>
    </label>
  );
}