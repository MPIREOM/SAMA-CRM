// Skeleton for /rooms while room types load. Scoped to this route group so
// /rooms/[slug] can still answer unknown slugs with a real 404 status.
// Mirrors the page: intro, photo band, booking bar, then one row per room.
export default function RoomsLoading() {
  return (
    <div className="g-page" aria-busy="true">
      <div className="g-container">
        <div className="g-skeleton h-3 w-16" />
        <div className="g-skeleton mt-6 h-12 w-2/3 max-w-lg sm:h-16" />
        <div className="g-skeleton mt-6 h-5 w-full max-w-2xl" />
        <div className="g-skeleton mt-3 h-5 w-3/4 max-w-xl" />
      </div>

      <div className="g-container mt-12 sm:mt-16">
        <div className="g-skeleton aspect-[4/3] w-full sm:aspect-[21/9]" />
        <div className="g-card relative z-10 mx-auto -mt-10 w-[calc(100%-2rem)] p-2 sm:-mt-14 sm:w-[calc(100%-4rem)] lg:-mt-16 lg:w-[calc(100%-6rem)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.2fr_1.2fr_0.8fr_0.8fr_auto]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="g-skeleton h-16" />
            ))}
            <div className="g-skeleton col-span-2 h-12 md:col-span-1 md:h-16 md:w-44" />
          </div>
          <div className="g-skeleton mt-2 h-8 w-full" />
        </div>
      </div>

      <div className="g-container pb-20 pt-10 sm:pb-28 sm:pt-14">
        <ul className="border-b border-ink-line">
          {[0, 1, 2].map((i) => (
            <li key={i} className="grid items-center gap-8 border-t border-ink-line py-10 sm:py-14 lg:grid-cols-12 lg:gap-x-14 lg:py-16 xl:gap-x-20">
              <div className={i % 2 === 1 ? "g-skeleton aspect-[3/2] lg:order-2 lg:col-span-7" : "g-skeleton aspect-[3/2] lg:col-span-7"} />
              <div className={i % 2 === 1 ? "lg:order-1 lg:col-span-5" : "lg:col-span-5"}>
                <div className="g-skeleton h-10 w-4/5 sm:h-12" />
                <div className="g-skeleton mt-6 h-3 w-2/3" />
                <div className="g-skeleton mt-6 h-5 w-full" />
                <div className="g-skeleton mt-4 h-4 w-full" />
                <div className="g-skeleton mt-2 h-4 w-5/6" />
                <div className="g-skeleton mt-7 h-8 w-36" />
                <div className="mt-8 flex gap-8">
                  <div className="g-skeleton h-10 w-32" />
                  <div className="g-skeleton h-10 w-24" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
