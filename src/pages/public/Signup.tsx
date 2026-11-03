
import {
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";

import { Link, useNavigate } from "react-router";
import { supabase } from "../../lib/supabase";
import { img } from "../../utils";

export default function Signup() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading) return;

    setErrorMessage("");
    setSuccessMessage("");

    const cleanName = fullName.trim();

    const cleanContact = contactNumber
      .trim()
      .replace(/[\s()-]/g, "");

    const cleanAddress = streetAddress.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!cleanContact) {
      setErrorMessage("Please enter your contact number.");
      return;
    }

    // Allows a leading + and 7–15 digits.
    if (!/^\+?[0-9]{7,15}$/.test(cleanContact)) {
      setErrorMessage(
        "Enter a valid contact number, such as 09123456789 or +639123456789."
      );
      return;
    }

    if (!cleanAddress) {
      setErrorMessage("Please enter your street address.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.signUp({
        email: cleanEmail,
        password,

        options: {
          data: {
            full_name: cleanName,
            name: cleanName,
            contact_info: cleanContact,
            address: cleanAddress,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error(
          "Unable to complete signup. Please try again."
        );
      }

      // Database trigger creates public.users.
      // No browser-side profile insert is needed.
      if (!authData.session) {
        setSuccessMessage(
          "If your email is eligible for registration, you will receive a confirmation email. Please check your inbox."
        );

        setFullName("");
        setContactNumber("");
        setStreetAddress("");
        setEmail("");
        setPassword("");

        return;
      }

      localStorage.setItem("userRole", "resident");
      localStorage.setItem("userName", cleanName);

      navigate("/resident/dashboard", {
        replace: true,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create your account."
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

          md:min-h-0
          md:max-w-[650px]
          md:rounded-[28px]
          md:shadow-xl

          lg:min-h-[680px]
          lg:max-w-[1100px]
          lg:flex-row
          lg:rounded-[30px]

          xl:max-w-[1250px]
        "
      >
        {/* HEADER / BRANDING */}
        <header
          className="
            relative h-[200px] w-full
            shrink-0 overflow-hidden
            bg-[#A61B1B]

            md:h-[240px]

            lg:flex
            lg:h-auto
            lg:min-h-[680px]
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
              h-[126px] w-[100px]
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
              absolute bottom-0 left-0 z-10
              h-[75px] w-full
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
              px-10 text-center text-white
              lg:flex
            "
          >
            <div
              className="
                mb-8 flex h-[180px] w-[180px]
                items-center justify-center
                rounded-[35px]
                bg-white p-5 shadow-lg
              "
            >
              <img
                src={img("waste-logo1.png")}
                alt="Waste Track Logo"
                draggable={false}
                className="
                  h-full w-full
                  object-contain
                "
              />
            </div>

            <h2
              className="
                text-4xl font-extrabold
                tracking-wide
                xl:text-5xl
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

        {/* SIGNUP FORM SECTION */}
        <section
          className="
            relative z-30 flex w-full
            flex-1 flex-col bg-white

            lg:w-[52%]
            lg:items-center
            lg:justify-center

            xl:w-1/2
          "
        >
          <form
            onSubmit={handleSignup}
            aria-busy={loading}
            className="
              relative w-full
              px-5 pb-10 pt-1

              sm:px-8

              md:px-12
              md:pb-12
              md:pt-5

              lg:mx-auto
              lg:max-w-[490px]
              lg:px-8
              lg:py-10

              xl:max-w-[520px]
            "
          >
            {/* DESKTOP TITLE */}
            <div
              className="
                mb-8 hidden
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
                Create an Account
              </h1>

              <p
                className="
                  mt-3 text-sm
                  text-neutral-500
                "
              >
                Join Waste Track and start managing
                waste efficiently.
              </p>
            </div>

            {/* INPUT FIELDS */}
            <div className="space-y-4 lg:space-y-5">
              <Field
                label="Full Name"
                icon={<UserRound size={17} />}
                placeholder="Enter your full name"
                value={fullName}
                onChange={setFullName}
                autoComplete="name"
                maxLength={150}
                disabled={loading}
              />

              <Field
                label="Contact Number"
                icon={<Phone size={17} />}
                placeholder="09123456789"
                type="tel"
                value={contactNumber}
                onChange={setContactNumber}
                autoComplete="tel"
                maxLength={25}
                disabled={loading}
              />

              <Field
                label="Street Address"
                icon={<MapPin size={17} />}
                placeholder="House number, street, barangay"
                value={streetAddress}
                onChange={setStreetAddress}
                autoComplete="street-address"
                maxLength={300}
                disabled={loading}
              />

              <Field
                label="Email Address"
                icon={<Mail size={17} />}
                placeholder="email@example.com"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                disabled={loading}
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
                disabled={loading}
              />
            </div>

            {/* ERROR MESSAGE */}
            {errorMessage && (
              <p
                role="alert"
                className="
                  mt-3 break-words rounded-lg
                  border border-red-200
                  bg-red-50 p-3
                  text-sm leading-relaxed
                  text-red-700
                "
              >
                {errorMessage}
              </p>
            )}

            {/* SUCCESS MESSAGE */}
            {successMessage && (
              <p
                role="status"
                className="
                  mt-3 break-words rounded-lg
                  border border-green-200
                  bg-green-50 p-3
                  text-sm leading-relaxed
                  text-green-700
                "
              >
                {successMessage}
              </p>
            )}

            {/* CREATE ACCOUNT BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="
                mt-6 w-full rounded-full
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

                lg:mt-8
                lg:py-3.5
                lg:text-base
              "
            >
              {loading
                ? "Creating Account..."
                : "Create an Account"}
            </button>

            {/* LOGIN LINK */}
            <p
              className="
                mt-5 text-center
                text-sm leading-relaxed
                text-neutral-700

                lg:mt-6
              "
            >
              Already have an account?{" "}
              <Link
                to="/login"
                className="
                  font-bold text-[#007846]
                  hover:underline
                "
              >
                Log In
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
  minLength?: number;
  maxLength?: number;
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
  minLength,
  maxLength,
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
    <div>
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
          minLength={minLength}
          maxLength={maxLength}
          autoCapitalize={
            type === "email" || password
              ? "none"
              : undefined
          }
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
