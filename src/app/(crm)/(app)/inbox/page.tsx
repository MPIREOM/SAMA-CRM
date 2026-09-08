import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { InboxClient } from "@/components/inbox/inbox-client";

export const dynamic = "force-dynamic";

// The inbox uses useSearchParams (deep link ?contact=<id>), so it must be
// wrapped in a Suspense boundary.
export default function InboxPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-6rem)] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-maroon-300" />
        </div>
      }
    >
      <InboxClient />
    </Suspense>
  );
}
