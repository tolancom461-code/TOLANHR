import React from 'react';
import { format } from 'date-fns';

interface ReportHeaderProps {
  reportTitle: string;
  reportSubtitle: string;
  reportNumber: string;
  reportStatus: string;
  companyName: string;
  companyLogo?: string; // Optional logo path
}

const ReportHeader: React.FC<ReportHeaderProps> = ({
  reportTitle,
  reportSubtitle,
  reportNumber,
  reportStatus,
  companyName,
  companyLogo,
}) => {
  return (
    <div className="mb-8 text-right print-header">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          {companyLogo && <img src={companyLogo} alt="Company Logo" className="h-12 w-12 ml-4" />}
          <span className="text-xl font-bold">{companyName}</span>
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-1">{reportTitle}</h2>
          <p className="text-lg text-gray-600">{reportSubtitle}</p>
        </div>
        <div className="border p-3 rounded-md text-sm">
          <p><strong>تاريخ إصدار التقرير:</strong> {format(new Date(), 'yyyy-MM-dd')}</p>
          <p><strong>وقت الإصدار:</strong> {format(new Date(), 'HH:mm:ss')}</p>
          <p><strong>رقم التقرير:</strong> {reportNumber}</p>
          <p><strong>حالة التقرير:</strong> <span className="text-green-600 font-semibold">{reportStatus}</span></p>
        </div>
      </div>
      <hr className="my-4 border-gray-300" />
    </div>
  );
};

export default ReportHeader;
