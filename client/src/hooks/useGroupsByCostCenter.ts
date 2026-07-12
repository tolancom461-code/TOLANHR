import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';

/**
 * Hook لاستدعاء المجموعات حسب مركز التكلفة مع caching تلقائي
 * 
 * يستخدم tRPC caching الداخلي لتقليل استدعاءات API المتكررة
 * 
 * @param costCenterId - معرّف مركز التكلفة (اختياري)
 * @param options - خيارات إضافية
 * @returns البيانات والحالة
 */
export function useGroupsByCostCenter(
  costCenterId?: number,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
  }
) {
  // استخدام tRPC query مع caching
  const { data, isLoading, error, refetch } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId },
    {
      enabled: options?.enabled !== false,
      // tRPC يستخدم staleTime افتراضي 0 (بيانات جديدة دائماً)
      // يمكن تخصيصه حسب الحاجة
      staleTime: options?.staleTime ?? 0,
      // cacheTime افتراضي 5 دقائق
      gcTime: options?.cacheTime ?? 5 * 60 * 1000,
    }
  );

  // memoize النتائج لتجنب إعادة الحسابات غير الضرورية
  const memoizedData = useMemo(() => data || [], [data]);

  return {
    groups: memoizedData,
    isLoading,
    error,
    refetch,
    isEmpty: memoizedData.length === 0,
  };
}

/**
 * Hook لاستدعاء جميع المجموعات مع caching
 * 
 * @returns البيانات والحالة
 */
export function useAllGroups() {
  const { data, isLoading, error, refetch } = trpc.groups.list.useQuery(
    undefined,
    {
      staleTime: 0,
      gcTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return {
    groups: memoizedData,
    isLoading,
    error,
    refetch,
    isEmpty: memoizedData.length === 0,
  };
}

/**
 * Hook لاستدعاء المجموعات مع دعم التصفية والـ pagination
 * 
 * @param page - رقم الصفحة
 * @param limit - عدد العناصر في الصفحة
 * @param costCenterId - معرّف مركز التكلفة (اختياري)
 * @returns البيانات والحالة
 */
export function useGroupsWithPagination(
  page: number = 1,
  limit: number = 10,
  costCenterId?: number
) {
  const { data, isLoading, error, refetch } = trpc.groups.listWithPagination.useQuery(
    {
      page,
      limit,
      costCenterId,
    },
    {
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
    }
  );

  const memoizedData = useMemo(() => data || {
    data: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
  }, [data, page, limit]);

  return {
    ...memoizedData,
    isLoading,
    error,
    refetch,
    isEmpty: memoizedData.data.length === 0,
  };
}
