
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, QrCode } from "lucide-react";

import { supabase } from "../lib/supabase";

type RegisteredSite = {
  site_id: string;
  site_name: string;
  location: string;
  qr_code: string | null;
  is_registered: boolean;
  is_active: boolean;
};

type Props = {
  siteId: string;
};

export default function RegisteredSiteQR({
  siteId,
}: Props) {
  const [site, setSite] =
    useState<RegisteredSite | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const qrRef = useRef<HTMLDivElement>(null);

  // Load registered location from Supabase.
  useEffect(() => {
    let active = true;

    async function loadSite() {
      setLoading(true);
      setError("");
      setSite(null);

      try {
        const { data, error: queryError } =
          await supabase
            .from("disposal_sites")
            .select(`
              site_id,
              site_name,
              location,
              qr_code,
              is_registered,
              is_active
            `)
            .eq("site_id", siteId)
            .eq("is_registered", true)
            .eq("is_active", true)
            .maybeSingle();

        if (queryError) throw queryError;

        if (!active) return;

        if (!data) {
          throw new Error(
            "This location is not registered or active."
          );
        }

        setSite(data as RegisteredSite);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load QR code."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSite();

    return () => {
      active = false;
    };
  }, [siteId]);

  // Download QR image in SVG format.
  function downloadQR() {
    if (!site || !qrRef.current) return;

    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const content =
      new XMLSerializer().serializeToString(svg);

    const blob = new Blob([content], {
      type: "image/svg+xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `WasteTrack-${site.site_id}.svg`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  if (loading) {
    return (
      <p className="p-5 text-center text-sm">
        Loading registered location...
      </p>
    );
  }

  if (error || !site) {
    return (
      <p className="p-5 text-center text-sm text-red-600">
        {error || "Location unavailable."}
      </p>
    );
  }

  const qrValue = site.qr_code || site.site_id;

  return (
    <section className="mx-auto w-full max-w-sm rounded-2xl border bg-white p-5 text-center shadow-sm">
      <div className="flex items-center justify-center gap-2">
        <QrCode size={23} className="text-red-600" />

        <h2 className="text-lg font-bold">
          Registered Location
        </h2>
      </div>

      <h3 className="mt-4 text-base font-bold">
        {site.site_name}
      </h3>

      <p className="mt-1 text-xs text-neutral-600">
        {site.location}
      </p>

      <p className="mt-2 text-xs font-semibold text-green-700">
        Active • Registered
      </p>

      <div
        ref={qrRef}
        className="my-5 flex justify-center"
      >
        <QRCodeSVG
          value={qrValue}
          size={230}
          level="H"
          marginSize={4}
          bgColor="#FFFFFF"
          fgColor="#000000"
          title={`QR code for ${site.site_name}`}
        />
      </div>

      <p className="text-xs text-neutral-500">
        Scan this code using the WasteTrack QR Scanner.
      </p>

      <button
        type="button"
        onClick={downloadQR}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#A81B1E] px-5 py-3 text-sm font-semibold text-white hover:bg-red-800"
      >
        <Download size={17} />
        Download QR Code
      </button>
    </section>
  );
}
