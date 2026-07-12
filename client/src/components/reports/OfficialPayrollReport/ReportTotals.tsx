import React from 'react';

interface ReportTotalsProps {
  data: any[]; // Define a more specific type for report data if available
}

const ReportTotals: React.FC<ReportTotalsProps> = ({ data }) => {
  const grandTotal = data.reduce((sum, row) => sum + row.totalNetAmount, 0);
  const totalBaseAmount = data.reduce((sum, row) => sum + row.totalBaseAmount, 0);
  const totalDeductions = data.reduce((sum, row) => sum + row.totalDeductions, 0);
  const totalBonuses = data.reduce((sum, row) => sum + row.totalBonuses, 0);

  return (
    <div className="text-left mb-8">
      <div className="inline-block bg-blue-50 p-4 rounded-lg shadow-inner">
        <p className="text-xl font-bold text-blue-800">الإجمالي العام: {grandTotal.toFixed(2)}</p>
        <p className="text-md text-gray-700">إجمالي الرواتب الأساسية: {totalBaseAmount.toFixed(2)}</p>
        <p className="text-md text-gray-700">إجمالي الخصومات: {totalDeductions.toFixed(2)}</p>
        <p className="text-md text-gray-700">إجمالي الإضافي: {totalBonuses.toFixed(2)}</p>
      </div>
    </div>
  );
};

export default ReportTotals;
