import { notFound } from "next/navigation";

// Any unknown path under /[locale] renders the localized 404.
export default function CatchAll() {
  notFound();
}
