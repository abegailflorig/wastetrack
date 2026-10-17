import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft, MapPinned, ScanLine } from "lucide-react";

export default function ReportWaste() {
  return (
    <main
      className="h-[calc(100dvh-5rem)] w-full overflow-y-auto overscroll-contain"
      style={{
        backgroundColor: "#f7ead6",
        backgroundImage: `
          radial-gradient(
            ellipse at 75% 15%,
            #ff263d 0%,
            rgba(255, 38, 61, 0.9) 18%,
            transparent 55%
          ),
          radial-gradient(
            ellipse at 30% 25%,
            #b9000c 0%,
            rgba(185, 0, 12, 0.8) 16%,
            transparent 52%
          ),
          linear-gradient(
            to bottom,
            #f5b6b4 0%,
            #f7ead6 72%,
            #fffaf3 100%
          )
        `,
      }}
    >
      <div className="mx-auto w-full max-w-[430px] px-4 pb-8 pt-6 sm:max-w-xl sm:px-6 sm:pb-10 sm:pt-8 lg:max-w-3xl lg:px-8 lg:pt-12">
        {/* Page heading */}
        <header className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/resident/dashboard"
            aria-label="Back to dashboard"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-black transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
          >
            <ArrowLeft
              strokeWidth={1.7}
              className="h-6 w-6 sm:h-7 sm:w-7"
            />
          </Link>

          <h1 className="text-lg font-semibold text-black sm:text-xl lg:text-2xl">
            Report Waste
          </h1>
        </header>

        {/* Options remain in one column */}
        <section
          aria-label="Choose a reporting method"
          className="mt-6 sm:mt-8 lg:mt-10"
        >
          <Option
            to="/resident/report-waste/qr"
            option="Option 1"
            title="Scan QR Code"
            description="Scan the QR Code attached to a registered disposal site"
            icon={
              <div className="relative text-[#ed0034]">
                <ScanLine
                  strokeWidth={2}
                  className="h-9 w-9 sm:h-11 sm:w-11 lg:h-12 lg:w-12"
                />

                <span className="absolute -inset-x-0.5 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#153dba] sm:h-1" />
              </div>
            }
          />

          <p className="my-6 text-center text-sm font-semibold text-black sm:my-8 sm:text-base lg:my-9">
            or
          </p>

          <Option
            to="/resident/report-waste/map"
            option="Option 2"
            title="Pin Location"
            description="Manually mark an unregistered disposal site on the map"
            icon={
              <MapPinned
                strokeWidth={2.6}
                className="h-9 w-9 text-black sm:h-11 sm:w-11 lg:h-12 lg:w-12"
              />
            }
          />
        </section>
      </div>
    </main>
  );
}

type OptionProps = {
  to: string;
  option: string;
  title: string;
  description: string;
  icon: ReactNode;
};

function Option({
  to,
  option,
  title,
  description,
  icon,
}: OptionProps) {
  return (
    <Link
      to={to}
      className="block w-full rounded-[17px] border border-[#d9d6b5] bg-[#f5e7d2] px-3 pb-4 pt-3 shadow-[0_3px_2px_rgba(125,145,86,0.55)] transition-colors hover:bg-[#fff0dc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:rounded-2xl sm:px-5 sm:pb-6 sm:pt-4 lg:px-6"
    >
      <p className="text-xs font-medium text-[#dc0000] sm:text-sm lg:text-base">
        {option}
      </p>

      <div className="mt-3 flex items-center gap-3 sm:mt-4 sm:gap-5 lg:gap-6">
        <div
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center rounded-[15px] bg-[#d9dcda] sm:h-[72px] sm:w-[72px] lg:h-20 lg:w-20"
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-semibold text-black sm:text-base lg:text-lg">
            {title}
          </h2>

          <p className="mt-1.5 break-words text-[11px] leading-relaxed text-[#686868] sm:text-sm lg:text-base">
            {description}
          </p>
        </div>
      </div>
    </Link>
  );
}