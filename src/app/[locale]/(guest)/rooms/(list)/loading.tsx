// Skeleton for /rooms while room types load. Scoped to this route group so
// /rooms/[slug] can still answer unknown slugs with a real 404 status.
export default function RoomsLoading() {
  return (
    <div className="g-container pt-12 sm:pt-16" aria-busy="true">
      <div className="g-skeleton h-4 w-24" />
      <div className="g-skeleton mt-4 h-12 w-2/3 max-w-lg" />
      <div className="g-skeleton mt-4 h-6 w-full max-w-2xl" />
      <div className="g-skeleton mt-10 h-40 w-full rounded-2xl" />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="g-card overflow-hidden">
            <div className="g-skeleton aspect-[4/3] rounded-none" />
            <div className="space-y-3 p-5">
              <div className="g-skeleton h-6 w-3/4" />
              <div className="g-skeleton h-4 w-full" />
              <div className="g-skeleton h-4 w-1/2" />
              <div className="g-skeleton mt-4 h-8 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
