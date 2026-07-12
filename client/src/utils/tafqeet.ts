const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
const thousands = [
  "",
  "ألف",
  "ألفان",
  "ثلاثة آلاف",
  "أربعة آلاف",
  "خمسة آلاف",
  "ستة آلاف",
  "سبعة آلاف",
  "ثمانية آلاف",
  "تسعة آلاف",
];
const millions = [
  "",
  "مليون",
  "مليونان",
  "ملايين",
  "ملايين",
  "ملايين",
  "ملايين",
  "ملايين",
  "ملايين",
  "ملايين",
];
const billions = [
  "",
  "مليار",
  "ملياران",
  "مليارات",
  "مليارات",
  "مليارات",
  "مليارات",
  "مليارات",
  "مليارات",
  "مليارات",
];

function convertLessThanOneThousand(num: number): string {
  let result = "";
  if (num === 0) return "";

  if (num >= 100) {
    result += hundreds[Math.floor(num / 100)];
    num %= 100;
    if (num > 0) result += " و";
  }

  if (num >= 20) {
    result += tens[Math.floor(num / 10)];
    num %= 10;
    if (num > 0) result += " و";
  }

  if (num >= 10) {
    result += teens[num - 10];
    num = 0;
  }

  if (num > 0) {
    result += units[num];
  }

  return result;
}

function convert(num: number): string {
  if (num === 0) return "صفر";

  let result = "";
  let i = 0;

  const parts = [];
  while (num > 0) {
    parts.push(num % 1000);
    num = Math.floor(num / 1000);
  }

  for (let j = 0; j < parts.length; j++) {
    const part = parts[j];
    if (part === 0) continue;

    let convertedPart = convertLessThanOneThousand(part);

    if (j === 1) { // Thousands
      if (part === 1) convertedPart = "ألف";
      else if (part === 2) convertedPart = "ألفان";
      else if (part >= 3 && part <= 9) convertedPart += " آلاف";
      else convertedPart += " ألف";
    } else if (j === 2) { // Millions
      if (part === 1) convertedPart = "مليون";
      else if (part === 2) convertedPart = "مليونان";
      else if (part >= 3 && part <= 10) convertedPart += " ملايين";
      else convertedPart += " مليون";
    } else if (j === 3) { // Billions
      if (part === 1) convertedPart = "مليار";
      else if (part === 2) convertedPart = "ملياران";
      else if (part >= 3 && part <= 10) convertedPart += " مليارات";
      else convertedPart += " مليار";
    }

    if (result !== "") result = convertedPart + " و" + result;
    else result = convertedPart;
  }

  return result;
}

export function tafqeet(amount: number): string {
  if (amount === 0) return "صفر ريال سعودي فقط لا غير";

  const [riyals, halalas] = amount.toFixed(2).split(".").map(Number);

  let result = "";

  if (riyals > 0) {
    result += convert(riyals);
    if (riyals === 1) result += " ريال سعودي";
    else if (riyals === 2) result += " ريالان سعوديان";
    else if (riyals >= 3 && riyals <= 10) result += " ريالات سعودية";
    else result += " ريال سعودي";
  }

  if (halalas > 0) {
    if (riyals > 0) result += " و";
    result += convert(halalas);
    if (halalas === 1) result += " هللة";
    else if (halalas === 2) result += " هللتان";
    else if (halalas >= 3 && halalas <= 10) result += " هللات";
    else result += " هللة";
  }

  return result + " فقط لا غير";
}
