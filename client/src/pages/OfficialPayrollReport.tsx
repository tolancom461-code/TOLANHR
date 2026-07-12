import React, { useState } from 'react';
import { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import ReportHeader from '@/components/reports/OfficialPayrollReport/ReportHeader';
import ReportTable from '@/components/reports/OfficialPayrollReport/ReportTable';
import ReportTotals from '@/components/reports/OfficialPayrollReport/ReportTotals';
import ReportAmountInWords from '@/components/reports/OfficialPayrollReport/ReportAmountInWords';
import ReportSignatures from '@/components/reports/OfficialPayrollReport/ReportSignatures';

// Define the schema for the report filters
const reportFilterSchema = z.object({
  periodStart: z.string().min(1, 'تاريخ البدء مطلوب'),
  periodEnd: z.string().min(1, 'تاريخ الانتهاء مطلوب'),
  costCenterId: z.number().optional().nullable(),
  groupIds: z.array(z.number()).optional(),
});

type ReportFilters = z.infer<typeof reportFilterSchema>;

const OfficialPayrollReportPage: React.FC = () => {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReportFilters>({
    resolver: zodResolver(reportFilterSchema),
    defaultValues: {
      periodStart: format(new Date(), 'yyyy-MM-dd'),
      periodEnd: format(new Date(), 'yyyy-MM-dd'),
      costCenterId: null,
      groupIds: [],
    },
  });

  const [filters, setFilters] = useState<ReportFilters | null>(null);

  const { data: reportData, isLoading, isError } = trpc.payroll.getOfficialFinancialReport.useQuery(
    filters!,
    { enabled: !!filters }
  );

  const { data: costCentersData } = trpc.costCenters.list.useQuery();
  const { data: groupsData, refetch: refetchGroups } = trpc.groups.listByCostCenter.useQuery(
    { costCenterId: watch('costCenterId') || undefined },
    { enabled: !!watch('costCenterId') }
  );

  const onSubmit = (data: ReportFilters) => {
    setFilters(data);
  };

  // Handle dynamic group selection
  const handleGroupChange = (groupId: number, isChecked: boolean) => {
    const currentGroupIds = watch('groupIds') || [];
    if (isChecked) {
      setValue('groupIds', [...currentGroupIds, groupId]);
    } else {
      setValue('groupIds', currentGroupIds.filter((id) => id !== groupId));
    }
  };

  const handleSelectAllGroups = () => {
    if (groupsData) {
      setValue('groupIds', groupsData.map(group => group.id));
    }
  };

  const handleClearAllGroups = () => {
    setValue('groupIds', []);
  };

  return (
    <div className="p-4 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 text-right">تقرير كشف رواتب العمالة اليومية</h1>

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4 text-right">الفلاتر</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-3 gap-4 rtl-grid">
          <div>
            <label htmlFor="periodStart" className="block text-sm font-medium text-gray-700 text-right">من تاريخ</label>
            <input
              type="date"
              id="periodStart"
              {...register('periodStart')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-right"
            />
            {errors.periodStart && <p className="mt-1 text-sm text-red-600 text-right">{errors.periodStart.message}</p>}
          </div>
          <div>
            <label htmlFor="periodEnd" className="block text-sm font-medium text-gray-700 text-right">إلى تاريخ</label>
            <input
              type="date"
              id="periodEnd"
              {...register('periodEnd')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-right"
            />
            {errors.periodEnd && <p className="mt-1 text-sm text-red-600 text-right">{errors.periodEnd.message}</p>}
          </div>
          <div>
            <label htmlFor="costCenterId" className="block text-sm font-medium text-gray-700 text-right">مركز التكلفة</label>
            <select
              id="costCenterId"
              {...register('costCenterId', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-right"
              onChange={(e) => {
                setValue('costCenterId', e.target.value ? parseInt(e.target.value) : null);
                setValue('groupIds', []); // Clear groups when cost center changes
                refetchGroups();
              }}
            >
              <option value="">جميع مراكز التكلفة</option>
              {costCentersData?.map((cc) => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
            {errors.costCenterId && <p className="mt-1 text-sm text-red-600 text-right">{errors.costCenterId.message}</p>}
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 text-right mb-2">المجموعات</label>
            <div className="flex flex-wrap gap-2 mb-2 justify-end">
              <button type="button" onClick={handleSelectAllGroups} className="px-3 py-1 bg-blue-500 text-white rounded-md text-sm">تحديد الكل</button>
              <button type="button" onClick={handleClearAllGroups} className="px-3 py-1 bg-red-500 text-white rounded-md text-sm">إلغاء الكل</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-right">
              {groupsData?.map((group) => (
                <div key={group.id} className="flex items-center justify-end">
                  <label htmlFor={`group-${group.id}`} className="ml-2 text-sm text-gray-900">{group.name}</label>
                  <input
                    type="checkbox"
                    id={`group-${group.id}`}
                    checked={(watch('groupIds') || []).includes(group.id)}
                    onChange={(e) => handleGroupChange(group.id, e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-3 text-left">
            <button
              type="submit"
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              توليد التقرير
            </button>
          </div>
        </form>
      </div>

      {filters && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          {isLoading && <p className="text-center">جاري تحميل التقرير...</p>}
          {isError && <p className="text-center text-red-600">حدث خطأ أثناء تحميل التقرير.</p>}
          {reportData && reportData.length === 0 && <p className="text-center">لا توجد بيانات لهذا التقرير بالفلاتر المحددة.</p>}

          {reportData && reportData.length > 0 && (
            <div className="report-container">
              {/* Report Header Component */}
              <ReportHeader
                reportTitle="تقرير كشف رواتب العمالة اليومية"
                reportSubtitle="تقرير مالي رسمي معتمد"
                reportNumber="PR-2026-05-23-001" // Placeholder, will generate dynamically
                reportStatus="معتمد"
                companyName="شركة تولان الدولية"
                companyLogo="/path/to/company-logo.png" // Placeholder
              />

              {/* Report Table Component */}
              <ReportTable data={reportData} />

              {/* Report Totals Component */}
              <ReportTotals data={reportData} />

              {/* Amount in Words Component */}
              <ReportAmountInWords totalAmount={reportData.reduce((sum, row) => sum + row.totalNetAmount, 0)} />

              {/* Signature Section Component */}
              <ReportSignatures />

              {/* Print Button */}
              <div className="text-center mt-8">
                <button
                  onClick={() => window.print()}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 print:hidden"
                >
                  طباعة التقرير
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OfficialPayrollReportPage;


