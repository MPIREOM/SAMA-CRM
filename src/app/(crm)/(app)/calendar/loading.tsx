export default function CalendarLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-40 rounded-lg bg-maroon-100" />
        <div className="h-9 w-64 rounded-lg bg-maroon-100" />
      </div>
      <div className="overflow-hidden rounded-xl border border-maroon-100 bg-white shadow-card">
        <div className="h-10 border-b border-maroon-100 bg-maroon-50" />
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex h-9 items-center gap-3 border-b border-maroon-50 px-3">
            <div className="h-3 w-16 rounded bg-maroon-100" />
            <div className="h-5 flex-1 rounded bg-maroon-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
