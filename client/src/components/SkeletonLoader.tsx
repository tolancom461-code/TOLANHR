import { Skeleton } from "@/components/ui/skeleton";

export function SelectSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-20" /> {/* Label */}
      <Skeleton className="h-10 w-full" /> {/* Select trigger */}
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function FilterSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SelectSkeleton key={i} />
      ))}
    </div>
  );
}

export function BatchListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-40" /> {/* Title */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" /> {/* Filter button */}
          <Skeleton className="h-10 w-40" /> {/* Create button */}
        </div>
      </div>
      <TableSkeleton />
    </div>
  );
}
