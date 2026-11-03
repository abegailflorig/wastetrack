import { useEffect } from "react";
import { useNavigate } from "react-router";
import { img } from "../../utils";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate("/login", { replace: true });
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main
      aria-label="WasteTrack loading"
      className="
        relative flex min-h-[100dvh] w-full
        items-center justify-center
        overflow-hidden

        bg-[radial-gradient(circle_at_center,#ff8b8b_0%,#ff414b_45%,#e00008_100%)]

        px-5 py-8
        sm:px-8
        md:px-12
        lg:px-16
        xl:px-20
      "
    >
      {/* SPLASH CONTENT */}
      <div
        className="
          relative z-10
          flex w-full
          max-w-[1400px]
          flex-col
          items-center
          justify-center
        "
      >
        {/* WASTE TRACK LOGO */}
        <img
          src={img("waste-logo.png")}
          alt="WasteTrack Logo"
          draggable={false}
          className="
            block h-auto
            max-h-[75dvh]
            max-w-full
            object-contain
            select-none

            w-[260px]

            sm:w-[340px]

            md:w-[420px]

            lg:w-[500px]

            xl:w-[580px]

            2xl:w-[650px]

            drop-shadow-2xl

            motion-safe:animate-pulse
          "
        />
      </div>
    </main>
  );
}
