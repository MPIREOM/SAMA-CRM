import type { Metadata } from "next";
import { CheckinKiosk } from "@/components/kiosk/checkin-kiosk";

// Standalone locked kiosk route — deliberately OUTSIDE the (app) group:
// no CRM shell, no CRM data, reachable without a staff session (middleware
// allowlists /checkin). All interactivity lives in the client component.
export const metadata: Metadata = {
  title: "Guest Check-in | تسجيل وصول الضيوف — Sama Hotel",
};

export default function CheckinPage() {
  return <CheckinKiosk />;
}
