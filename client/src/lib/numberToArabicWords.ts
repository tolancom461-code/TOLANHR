/**
 * تحويل الأرقام إلى كلمات عربية بالريال السعودي
 * Number to Arabic Words Converter (Saudi Riyal)
 */

const ones = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];

const tens = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

const hundreds = [
  '', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
  'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
];

function convertThreeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ones[n];

  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  let result = '';

  if (h > 0) {
    result += hundreds[h];
  }

  if (remainder > 0) {
    if (result) result += ' و';
    if (remainder < 20) {
      result += ones[remainder];
    } else {
      if (o > 0) {
        result += ones[o] + ' و' + tens[t];
      } else {
        result += tens[t];
      }
    }
  }

  return result;
}

/**
 * تحويل رقم إلى كلمات عربية بالريال السعودي
 * @param amount - المبلغ بالريال
 * @returns النص العربي للمبلغ
 */
export function numberToArabicWords(amount: number): string {
  if (isNaN(amount) || amount < 0) return '';
  if (amount === 0) return 'صفر ريال سعودي';

  const intPart = Math.floor(amount);
  const decPart = Math.round((amount - intPart) * 100);

  const billions = Math.floor(intPart / 1_000_000_000);
  const millions = Math.floor((intPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((intPart % 1_000_000) / 1_000);
  const remainder = intPart % 1_000;

  const parts: string[] = [];

  if (billions > 0) {
    const b = convertThreeDigits(billions);
    parts.push(billions === 1 ? 'مليار' : billions === 2 ? 'ملياران' : `${b} مليار`);
  }

  if (millions > 0) {
    const m = convertThreeDigits(millions);
    parts.push(millions === 1 ? 'مليون' : millions === 2 ? 'مليونان' : `${m} مليون`);
  }

  if (thousands > 0) {
    const t = convertThreeDigits(thousands);
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands <= 10) parts.push(`${t} آلاف`);
    else parts.push(`${t} ألف`);
  }

  if (remainder > 0) {
    parts.push(convertThreeDigits(remainder));
  }

  let result = parts.join(' و');

  // إضافة العملة
  if (intPart === 1) result += ' ريال سعودي';
  else if (intPart === 2) result = 'ريالان سعوديان';
  else result += ' ريال سعودي';

  // إضافة الهللات إن وجدت
  if (decPart > 0) {
    const halalaText = convertThreeDigits(decPart);
    result += ` و${halalaText} هللة`;
  }

  result += ' فقط لا غير';

  return result;
}
