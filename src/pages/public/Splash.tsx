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
        grid min-h-[100dvh] w-full place-items-center
        overflow-hidden px-5 py-8
        bg-[radial-gradient(circle_at_center,#ff8b8b_0%,#ff414b_45%,#e00008_100%)]
      "
    >
      <img
        src={img("waste-logo.png")}
        alt="WasteTrack Logo"
        draggable={false}
        className="
          block h-auto max-h-[75dvh] max-w-full
          w-[260px]
          sm:w-[340px]
          md:w-[420px]
          lg:w-[500px]
          xl:w-[580px]
          object-contain drop-shadow-2xl
          motion-safe:animate-pulse
          select-none
        "
      />
    </main>
  );
}