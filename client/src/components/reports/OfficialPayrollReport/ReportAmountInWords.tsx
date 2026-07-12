import React from 'react';
import { tafqeet } from '@/utils/tafqeet';

interface ReportAmountInWordsProps {
  totalAmount: number;
}

const ReportAmountInWords: React.FC<ReportAmountInWordsProps> = ({ totalAmount }) => {
  const amountInWords = tafqeet(totalAmount);
  return (
    <div className="mb-8 text-right">
      <p className="text-lg font-semibold">{amountInWords}</p>
    </div>
  );
};

export default ReportAmountInWords;
