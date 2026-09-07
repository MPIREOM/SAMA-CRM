export default function ReservationsLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-44 rounded-lg bg-maroon-100" />
        <div className="h-9 w-32 rounded-lg bg-maroon-100" />
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-lg bg-maroon-100" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-maroon-100 bg-white shadow-card">
        <div className="h-10 bg-maroon-50" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex h-11 items-center gap-6 border-t border-maroon-50 px-4">
            <div className="h-3 w-24 rounded bg-maroon-100" />
            <div className="h-3 w-40 rounded bg-maroon-50" />
            <div className="h-3 w-20 rounded bg-maroon-50" />
            <div className="h-3 w-20 rounded bg-maroon-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
