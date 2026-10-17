import { useLocation, useNavigate } from "react-router";
import MiniCalendar from "../../components/MiniCalendar";

type Props = {
  role?: "resident" | "collector";
};

export default function Calendar({ role }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  const currentRole =
    role ||
    (location.pathname.startsWith("/collector")
      ? "collector"
      : "resident");

  return (
    <main className="h-[calc(100dvh-5rem)] overflow-y-auto bg-white">
      <section className="mx-auto w-full max-w-[430px] px-3 pt-8">
        <div className="overflow-hidden rounded-t-xl shadow-[0_2px_3px_rgba(0,0,0,0.25)]">
          <header className="bg-[#c90000] px-3 pb-4 pt-3">
            <h1 className="text-sm font-bold text-white">
              Collection Schedule
            </h1>
          </header>

          <div className="relative -mt-2 rounded-t-xl bg-white">
            <MiniCalendar
              onDateSelect={(date) =>
                navigate(`/${currentRole}/calendar/list/${date}`)
              }
            />
          </div>

          {currentRole === "resident" ? (
            <div className="grid grid-cols-3 gap-1 bg-[#f5e7d2] px-2 py-3 text-center text-[8px]">
              <Legend
                color="bg-red-600"
                title="Priority Collection"
                description="(FULL)"
              />
              <Legend
                color="bg-amber-400"
                title="Scheduled"
                description="(NEAR FULL)"
              />
              <Legend
                color="bg-[#9db77a]"
                title="Open for Disposal"
                description="(EMPTY LEVEL)"
              />
            </div>
          ) : (
            <div aria-hidden="true" className="h-8 bg-[#f5e7d2]" />
          )}
        </div>
      </section>
    </main>
  );
}

function Legend({
  color,
  title,
  description,
}: {
  color: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="font-semibold">
        <span
          className={`mr-1 inline-block h-2 w-2 rounded-full ${color}`}
        />
        {title}
      </p>
      <p className="mt-1">{description}</p>
    </div>
  );
}