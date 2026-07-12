import React from 'react';

const ReportSignatures: React.FC = () => (
  <div className="mt-12 print-signatures">
    <div className="flex justify-around text-center rtl-flex">
      <div className="flex-1 mx-2">
        <p>إعداد</p>
        <p className="mt-8 border-t border-gray-400 pt-2"></p>
      </div>
      <div className="flex-1 mx-2">
        <p>مراجعة أولى</p>
        <p className="mt-8 border-t border-gray-400 pt-2"></p>
      </div>
      <div className="flex-1 mx-2">
        <p>المراجع المالي</p>
        <p className="mt-8 border-t border-gray-400 pt-2"></p>
      </div>
      <div className="flex-1 mx-2">
        <p>رئيس الحسابات</p>
        <p className="mt-8 border-t border-gray-400 pt-2"></p>
      </div>
      <div className="flex-1 mx-2">
        <p>تدقيق ومراجعة</p>
        <p className="mt-8 border-t border-gray-400 pt-2">م. سعد الزكري</p>
      </div>
      <div className="flex-1 mx-2">
        <p>الرئيس التنفيذي</p>
        <p className="mt-8 border-t border-gray-400 pt-2"><strong>م. زكري بن عبدالله الزكري</strong></p>
      </div>
    </div>
  </div>
);

export default ReportSignatures;
