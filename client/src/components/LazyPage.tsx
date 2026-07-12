import React, { Suspense, ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface LazyPageProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * LazyPage component for code splitting and lazy loading
 * Wraps pages with Suspense and provides a loading skeleton
 */
export const LazyPage: React.FC<LazyPageProps> = ({ 
  children, 
  fallback 
}) => {
  const defaultFallback = (
    <div className="space-y-4 p-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-8 w-1/3" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );

  return (
    <Suspense fallback={fallback || defaultFallback}>
      {children}
    </Suspense>
  );
};

export default LazyPage;
