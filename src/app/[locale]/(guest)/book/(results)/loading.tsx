// Skeleton for the /book results page. Scoped to this route group so
// /book/[slug] can redirect / 404 with real status codes.
export default function BookLoading() {
  return (
    <div className="g-page pb-24 sm:pb-32" aria-busy="true">
      <div className="g-container">
        <div className="g-skeleton h-3 w-24" />
        <div className="g-skeleton mt-6 h-12 w-1/2 max-w-sm sm:h-16" />
        <div className="g-card mt-8 grid grid-cols-2 divide-ink-line sm:mt-10 md:grid-cols-[1.2fr_1.2fr_1fr_auto] md:divide-x">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2.5 px-5 py-4">
              <div className="g-skeleton h-2.5 w-14" />
              <div className="g-skeleton h-5 w-32" />
            </div>
          ))}
          <div className="flex items-center px-5 py-3">
            <div className="g-skeleton h-10 w-24" />
          </div>
        </div>
        <div className="mt-14 border-t border-ink-line pt-10 sm:mt-16">
          <div className="g-skeleton h-10 w-2/3 max-w-md" />
          <div className="g-skeleton mt-4 h-4 w-1/2 max-w-sm" />
        </div>
        <div className="mt-8 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="g-card grid overflow-hidden md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3.4fr)]">
              <div className="g-skeleton aspect-[4/3] rounded-none md:aspect-auto md:min-h-[260px]" />
              <div className="space-y-4 p-6 sm:p-8">
                <div className="g-skeleton h-7 w-2/3" />
                <div className="g-skeleton h-4 w-full" />
                <div className="g-skeleton h-4 w-1/3" />
              </div>
              <div className="space-y-3 border-t border-ink-line bg-paper-100 p-6 sm:p-8 md:col-span-2 lg:col-span-1 lg:border-s lg:border-t-0">
                <div className="g-skeleton h-3 w-full" />
                <div className="g-skeleton h-3 w-full" />
                <div className="g-skeleton h-3 w-2/3" />
                <div className="g-skeleton mt-6 h-7 w-1/2" />
                <div className="g-skeleton mt-6 h-12 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
