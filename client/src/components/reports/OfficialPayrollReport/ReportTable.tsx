import React from 'react';

interface ReportTableProps {
  data: any[]; // Define a more specific type for report data if available
}

const ReportTable: React.FC<ReportTableProps> = ({ data }) => {
  return (
    <div className="mb-8">
      <table className="min-w-full bg-white border border-gray-300 rtl-table">
        <thead>
          <tr className="bg-gray-200 text-right">
            <th className="py-2 px-4 border-b">م</th>
            <th className="py-2 px-4 border-b">اسم المجموعة</th>
            <th className="py-2 px-4 border-b">عدد العمال</th>
            <th className="py-2 px-4 border-b">إجمالي الرواتب</th>
            <th className="py-2 px-4 border-b">إجمالي الخصومات</th>
            <th className="py-2 px-4 border-b">إجمالي الإضافي</th>
            <th className="py-2 px-4 border-b">الإجمالي المستحق</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={row.groupId} className="text-right">
              <td className="py-2 px-4 border-b">{index + 1}</td>
              <td className="py-2 px-4 border-b">{row.groupName}</td>
              <td className="py-2 px-4 border-b">{row.workerCount}</td>
              <td className="py-2 px-4 border-b">{row.totalBaseAmount.toFixed(2)}</td>
              <td className="py-2 px-4 border-b">{row.totalDeductions.toFixed(2)}</td>
              <td className="py-2 px-4 border-b">{row.totalBonuses.toFixed(2)}</td>
              <td className="py-2 px-4 border-b">{row.totalNetAmount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportTable;
