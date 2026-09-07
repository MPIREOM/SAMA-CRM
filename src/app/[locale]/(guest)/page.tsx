import { setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/routing";

// Placeholder home — replaced by the guest-site build (Phase 2a).
export default function HomePage({ params }: { params: { locale: string } }) {
  if (isLocale(params.locale)) setRequestLocale(params.locale);
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-extrabold text-maroon-900">Sama Hotel</h1>
    </main>
  );
}
