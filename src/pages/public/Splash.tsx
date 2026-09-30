import { useEffect } from "react";
import { useNavigate } from "react-router";
import { img } from "../../utils";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      navigate("/login");
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <main
      className="
        grid min-h-[100dvh] w-full place-items-center
        overflow-hidden
        bg-[radial-gradient(circle_at_center,#ff8b8b_0%,#ff414b_45%,#e00008_100%)]
        px-5
      "
    >
      <img
        src={img("waste-logo.png")}
        alt="Waste Management Logo"
        className="
          h-auto object-contain drop-shadow-xl
          w-[130px]
          sm:w-[170px]
          md:w-[210px]
          lg:w-[250px]
          xl:w-[280px]
          animate-pulse
        "
      />
    </main>
  );
}