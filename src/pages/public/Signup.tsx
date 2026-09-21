import {
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react";

import { Link, useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { img } from "../../utils";

export default function Signup() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [loading, setLoading] = useState(false);

  async function handleSignup(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const cleanName = fullName.trim();
      const cleanEmail = email.trim().toLowerCase();

      // Create account in Supabase Authentication.
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.signUp({
        email: cleanEmail,
        password,

        options: {
          data: {
            name: cleanName,
            role: "resident",
          },
        },
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error(
          "The account could not be created."
        );
      }

      // Save profile in public.users.
      const { error: userError } = await supabase
        .from("users")
        .insert({
          user_id: authData.user.id,
          full_name: cleanName,
          email: cleanEmail,
          contact_info: null,
          role: "resident",
        });

      if (userError) {
        // Remove the current browser session if profile creation fails.
        await supabase.auth.signOut();

        throw new Error(
          `Account profile error: ${userError.message}`
        );
      }

      // When email confirmation is enabled.
      if (!authData.session) {
        setSuccessMessage(
          "Account created. Please check your email to confirm your account."
        );

        setFullName("");
        setEmail("");
        setPassword("");

        return;
      }

      localStorage.setItem(
        "userRole",
        "resident"
      );

      localStorage.setItem(
        "userName",
        cleanName
      );

      navigate("/resident/dashboard", {
        replace: true,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create your account.";

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
              h-[126px] w-[100px]
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

          {/* White curved area */}
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

        {/* Signup form */}
        <form
          onSubmit={handleSignup}
          className="relative z-30 bg-white px-5 pb-12 pt-1"
        >
          <div className="space-y-[11px]">
            <Field
              label="Full Name"
              icon={<UserRound size={17} />}
              placeholder="Enter your name"
              value={fullName}
              onChange={setFullName}
              autoComplete="name"
            />

            <Field
              label="Email Address"
              icon={<Mail size={17} />}
              placeholder="email@example.com"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />

            <Field
              label="Password"
              icon={<LockKeyhole size={17} />}
              placeholder="At least 6 characters"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              password
              minLength={6}
            />
          </div>

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

          {successMessage && (
            <p
              className="
                mt-3 rounded-lg
                border border-green-200
                bg-green-50 p-2
                text-[9px] text-green-700
              "
            >
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="
              mt-5 w-full rounded-full
              bg-[#d00000] py-[13px]
              text-[9px] font-medium text-white
              transition hover:bg-[#b90000]
              active:scale-[0.99]
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            {loading
              ? "Creating Account..."
              : "Create an Account"}
          </button>

          <p className="mt-5 text-center text-[8px] text-black">
            Already have an Account?{" "}
            <Link
              to="/login"
              className="font-bold text-[#007846]"
            >
              Log In
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
  minLength?: number;
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
  minLength,
}: FieldProps) {
  const [showPassword, setShowPassword] =
    useState(false);

  const inputType =
    password && showPassword
      ? "text"
      : type;

  return (
    <label className="block">
      <span className="mb-1 block pl-1 text-[8px] text-neutral-500">
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
          minLength={minLength}
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