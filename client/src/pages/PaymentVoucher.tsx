import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Printer, FileText } from 'lucide-react';

// تحويل الأرقام إلى كلمات عربية
function numberToArabicWords(num: number): string {
  if (!num || num === 0) return 'صفر ريال سعودي';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
    'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertBelow1000(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) {
      const ten = Math.floor(n / 10);
      const one = n % 10;
      return one === 0 ? tens[ten] : `${ones[one]} و${tens[ten]}`;
    }
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return rest === 0 ? hundreds[h] : `${hundreds[h]} و${convertBelow1000(rest)}`;
  }

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);

  let result = '';
  if (intPart >= 1000000) result += convertBelow1000(Math.floor(intPart / 1000000)) + ' مليون ';
  if (intPart >= 1000) {
    const thousands = Math.floor((intPart % 1000000) / 1000);
    if (thousands > 0) result += convertBelow1000(thousands) + ' ألف ';
  }
  result += convertBelow1000(intPart % 1000);
  result += ' ريال سعودي';
  if (decPart > 0) result += ` و${convertBelow1000(decPart)} هللة`;
  result += ' فقط لا غير';
  return result.trim();
}

export default function PaymentVoucher() {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');

  const [selectedCostCenterId, setSelectedCostCenterId] = useState<number | undefined>();
  const [voucherDate, setVoucherDate] = useState(todayStr);
  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const { data: costCenters } = trpc.costCenters.list.useQuery();

  const selectedCostCenter = costCenters?.find(cc => cc.id === selectedCostCenterId);
  const companyName = selectedCostCenter?.name || 'شركة تولان الدولية';

  const voucherNumber = `PV-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const amountNum = parseFloat(amount.replace(/,/g, '')) || 0;
  const amountInWords = amountNum > 0 ? numberToArabicWords(amountNum) : '';

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handlePrint = () => window.print();

  const isReady = recipientName && amount && description && voucherDate;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 p-6">

      {/* ===== فورم الإدخال ===== */}
      <div className="no-print max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-700" />
          إعداد سند الصرف
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* مركز التكلفة */}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-sm font-semibold text-gray-700">مركز التكلفة</Label>
            <Select
              onValueChange={(val) => setSelectedCostCenterId(val === 'all' ? undefined : parseInt(val))}
              defaultValue="all"
            >
              <SelectTrigger className="bg-gray-50">
                <SelectValue placeholder="اختر مركز التكلفة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">شركة تولان الدولية (افتراضي)</SelectItem>
                {costCenters?.map(cc => (
                  <SelectItem key={cc.id} value={cc.id.toString()}>{cc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* تاريخ السند */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-gray-700">تاريخ السند</Label>
            <Input
              type="date"
              value={voucherDate}
              onChange={e => setVoucherDate(e.target.value)}
              className="bg-gray-50"
            />
          </div>

          {/* اسم المستلم */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold text-gray-700">أصرفوا للمكرم</Label>
            <Input
              placeholder="اسم المستلم"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              className="bg-gray-50"
            />
          </div>

          {/* المبلغ */}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-sm font-semibold text-gray-700">المبلغ رقماً</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-gray-50 text-lg font-bold"
            />
            {amountInWords && (
              <p className="text-sm text-blue-700 font-semibold mt-1 bg-blue-50 px-3 py-2 rounded-lg">
                {amountInWords}
              </p>
            )}
          </div>

          {/* البيان */}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-sm font-semibold text-gray-700">وذلك مقابل</Label>
            <Input
              placeholder="اكتب البيان هنا..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="bg-gray-50"
            />
          </div>
        </div>

        {/* زر الطباعة */}
        <div className="mt-6 flex justify-end">
          <Button
            onClick={handlePrint}
            disabled={!isReady}
            className="bg-blue-700 hover:bg-blue-800 text-white flex items-center gap-2 px-6"
          >
            <Printer className="h-4 w-4" />
            طباعة السند
          </Button>
        </div>
      </div>

      {/* ===== السند القابل للطباعة ===== */}
      <div id="voucher-print" className="max-w-2xl mx-auto">

        {/* السند - النصف العلوي */}
        <div className="voucher-body bg-white border-2 border-gray-300 rounded-xl overflow-hidden shadow-sm">

          {/* هيدر السند */}
          <div className="bg-blue-800 text-white px-6 py-4 flex justify-between items-center">
            <div>
          {/* <p className="text-xs opacity-70 mb-0.5">حديقة الوطن</p> */}
              <p className="text-lg font-black">{companyName}</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black tracking-wide">سـنـد صـرف نـقـدي</p>
            </div>
            <div className="text-left text-sm">
              <div className="flex justify-between gap-3">
                <span className="opacity-70">رقم السند:</span>
                <span className="font-bold">{voucherNumber}</span>
              </div>
              <div className="flex justify-between gap-3 mt-1">
                <span className="opacity-70">التاريخ:</span>
                <span className="font-bold">{new Date(voucherDate).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* جسم السند */}
          <div className="px-8 py-6 space-y-4">

            {/* أصرفوا للمكرم */}
            <div className="flex items-baseline gap-3 border-b border-dashed border-gray-300 pb-3">
              <span className="font-bold text-gray-700 whitespace-nowrap min-w-[140px]">أصرفوا للمكرم:</span>
              <span className="text-lg font-black text-gray-900 flex-1 border-b-2 border-gray-400 pb-0.5 min-h-[28px]">
                {recipientName || <span className="text-gray-300">___________________________</span>}
              </span>
            </div>

            {/* المبلغ رقماً */}
            <div className="flex items-baseline gap-3 border-b border-dashed border-gray-300 pb-3">
              <span className="font-bold text-gray-700 whitespace-nowrap min-w-[140px]">مبلغ وقدره:</span>
              <span className="text-xl font-black text-blue-800 flex-1">
                {amount ? `${parseFloat(amount).toLocaleString('ar-SA', { minimumFractionDigits: 2 })} ر.س` : <span className="text-gray-300 text-base">___________________________</span>}
              </span>
            </div>

            {/* المبلغ كتابةً */}
            <div className="flex items-baseline gap-3 border-b border-dashed border-gray-300 pb-3">
              <span className="font-bold text-gray-700 whitespace-nowrap min-w-[140px]">فقط:</span>
              <span className="text-sm font-bold text-gray-800 flex-1 bg-gray-50 px-3 py-1.5 rounded min-h-[32px]">
                {amountInWords || <span className="text-gray-300">___________________________</span>}
              </span>
            </div>

            {/* البيان */}
            <div className="flex items-baseline gap-3">
              <span className="font-bold text-gray-700 whitespace-nowrap min-w-[140px]">وذلك مقابل:</span>
              <span className="text-base font-semibold text-gray-800 flex-1 border-b-2 border-gray-400 pb-0.5 min-h-[28px]">
                {description || <span className="text-gray-300 font-normal">___________________________</span>}
              </span>
            </div>
          </div>

          {/* قسم التوقيعات */}
          <div className="px-8 py-5 bg-gray-50 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-6 text-center text-sm">

              {/* المستلم */}
              <div className="space-y-2">
                <p className="font-bold text-gray-700">المستلم</p>
                <p className="text-gray-800 font-semibold min-h-[20px] border-b border-gray-300 pb-1">
                  {recipientName || ''}
                </p>
                <div className="h-10 border-b-2 border-gray-400"></div>
                <p className="text-xs text-gray-500">التوقيع</p>
              </div>

              {/* المحاسب */}
              <div className="space-y-2">
                <p className="font-bold text-gray-700">المحاسب</p>
                <div className="min-h-[20px] border-b border-gray-300 pb-1"></div>
                <div className="h-10 border-b-2 border-gray-400"></div>
                <p className="text-xs text-gray-500">التوقيع</p>
              </div>

              {/* المراجع */}
              <div className="space-y-2">
                <p className="font-bold text-gray-700">المراجع</p>
                <div className="min-h-[20px] border-b border-gray-300 pb-1"></div>
                <div className="h-10 border-b-2 border-gray-400"></div>
                <p className="text-xs text-gray-500">التوقيع</p>
              </div>

            </div>
          </div>

        </div>

        {/* خط فاصل بين النصفين */}
        <div className="my-4 border-t-2 border-dashed border-gray-300 relative no-print">
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-50 px-3 text-xs text-gray-400">
            ✂ قص هنا
          </span>
        </div>
        <div className="print-only-divider"></div>

        {/* النصف السفلي فارغ للطباعة */}
        <div className="voucher-empty-half hidden-screen">
        </div>

      </div>

      {/* CSS للطباعة */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #voucher-print, #voucher-print * { visibility: visible; }
          #voucher-print {
            position: absolute;
            top: 0; right: 0; left: 0;
            width: 100%;
            max-width: 100%;
          }
          .no-print { display: none !important; }
          .voucher-body {
            height: 50vh;
            page-break-inside: avoid;
          }
          .print-only-divider {
            display: block !important;
            border-top: 2px dashed #aaa;
            margin: 8px 0;
          }
          .voucher-empty-half {
            display: block !important;
            height: 45vh;
          }
          @page {
            size: A4 portrait;
            margin: 1cm;
          }
        }
        .hidden-screen { display: none; }
        .print-only-divider { display: none; }
      `}</style>
    </div>
  );
}
