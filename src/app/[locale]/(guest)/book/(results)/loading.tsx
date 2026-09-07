// Skeleton for the /book results page. Scoped to this route group so
// /book/[slug] can redirect / 404 with real status codes.
export default function BookLoading() {
  return (
    <div className="g-container pt-8 sm:pt-12" aria-busy="true">
      <div className="g-skeleton h-4 w-24" />
      <div className="g-skeleton mt-4 h-10 w-1/2 max-w-sm" />
      <div className="g-skeleton mt-6 h-20 w-full rounded-2xl" />
      <div className="g-skeleton mt-10 h-8 w-2/3 max-w-md" />
      <div className="mt-6 space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="g-card grid overflow-hidden md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr_300px]">
            <div className="g-skeleton aspect-[4/3] rounded-none md:aspect-auto md:min-h-[240px]" />
            <div className="space-y-3 p-6">
              <div className="g-skeleton h-6 w-2/3" />
              <div className="g-skeleton h-4 w-full" />
              <div className="g-skeleton h-4 w-1/3" />
            </div>
            <div className="space-y-3 border-t border-stone-200 p-6 lg:border-s lg:border-t-0">
              <div className="g-skeleton h-4 w-full" />
              <div className="g-skeleton h-4 w-full" />
              <div className="g-skeleton h-8 w-1/2" />
              <div className="g-skeleton h-12 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
