import type { NextConfig } from "next";
import { contactFromEnv, missingForLaunch } from "./src/lib/contact";

/**
 * Pojistka spusteni: s SHOP_LIVE=1 se obchod nesmi nasadit bez povinnych udaju
 * v Impressum (adresa, telefon, UID). Selhani pri buildu/startu je lepsi nez
 * ostry web bez Impressum, ktere je ve Svycarsku u e-shopu povinne.
 */
if (process.env.SHOP_LIVE === "1") {
  const missing = [
    ...missingForLaunch(contactFromEnv(process.env)),
    ...["RESEND_API_KEY", "EMAIL_FROM", "SHOP_IBAN"].filter((key) => !process.env[key]?.trim()),
  ];
  if (missing.length > 0) {
    throw new Error(
      `SHOP_LIVE=1, ale chybi povinne promenne prostredi: ${missing.join(", ")}. ` +
        "Doplnte je (viz .env.example) nebo nastavte SHOP_LIVE=0.",
    );
  }
}

const nextConfig: NextConfig = {
  // `pg` si otevira TCP spojeni a nacita nativni doplnky — zabaleni do bundlu
  // mu rozbije resolver. Musi zustat externi (stejne jako v citadela-app).
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
