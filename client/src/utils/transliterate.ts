/**
 * Arabic → Latin name transliteration
 * تحويل صوتي تقريبي للأسماء العربية إلى الحروف اللاتينية
 * يعتمد قاموساً للأسماء الشائعة أولاً، ثم تحويلاً حرفياً لما عداها
 */

// قاموس الأسماء والمقاطع الشائعة (يُطابق ككلمات كاملة — الأطول أولاً)
const NAME_DICTIONARY: Record<string, string> = {
  'عبدالرحمن': 'Abdulrahman', 'عبدالعزيز': 'Abdulaziz', 'عبداللطيف': 'Abdullatif',
  'عبدالكريم': 'Abdulkarim', 'عبدالمجيد': 'Abdulmajeed', 'عبدالمحسن': 'Abdulmohsen',
  'عبدالوهاب': 'Abdulwahab', 'عبدالسلام': 'Abdulsalam', 'عبدالغني': 'Abdulghani',
  'عبدالهادي': 'Abdulhadi', 'عبدالحميد': 'Abdulhamid', 'عبدالحكيم': 'Abdulhakim',
  'عبدالفتاح': 'Abdulfattah', 'عبدالقادر': 'Abdulqadir', 'عبدالرحيم': 'Abdulrahim',
  'عبدالرزاق': 'Abdulrazzaq', 'عبدالصمد': 'Abdulsamad', 'عبدالباسط': 'Abdulbasit',
  'عبدالله': 'Abdullah', 'عبده': 'Abdo', 'عبيد': 'Obaid', 'عبيدالله': 'Obaidullah',
  'محمد': 'Mohammed', 'محمود': 'Mahmoud', 'مصطفى': 'Mustafa', 'مرتضى': 'Murtada',
  'أحمد': 'Ahmed', 'احمد': 'Ahmed', 'حمد': 'Hamad', 'حامد': 'Hamed', 'حمدان': 'Hamdan',
  'إبراهيم': 'Ibrahim', 'ابراهيم': 'Ibrahim', 'إسماعيل': 'Ismail', 'اسماعيل': 'Ismail',
  'يوسف': 'Yousef', 'يعقوب': 'Yaqoub', 'يحيى': 'Yahya', 'يحي': 'Yahya', 'يونس': 'Younes',
  'علي': 'Ali', 'عمر': 'Omar', 'عمار': 'Ammar', 'عثمان': 'Othman', 'عماد': 'Emad',
  'خالد': 'Khaled', 'خليل': 'Khalil', 'خميس': 'Khamis', 'حسن': 'Hassan', 'حسين': 'Hussein',
  'حسام': 'Hussam', 'سعد': 'Saad', 'سعيد': 'Saeed', 'سعود': 'Saud', 'مسعود': 'Masoud',
  'سلمان': 'Salman', 'سليمان': 'Sulaiman', 'سالم': 'Salem', 'سليم': 'Saleem',
  'فهد': 'Fahad', 'فيصل': 'Faisal', 'فارس': 'Fares', 'فؤاد': 'Fouad', 'فوزي': 'Fawzi',
  'ناصر': 'Nasser', 'نايف': 'Naif', 'نبيل': 'Nabil', 'نواف': 'Nawaf', 'نور': 'Noor',
  'طارق': 'Tariq', 'طلال': 'Talal', 'ماجد': 'Majed', 'مازن': 'Mazen', 'مالك': 'Malik',
  'منصور': 'Mansour', 'منير': 'Munir', 'مروان': 'Marwan', 'موسى': 'Mousa',
  'رشيد': 'Rashid', 'راشد': 'Rashed', 'رامي': 'Rami', 'رائد': 'Raed', 'رياض': 'Riyadh',
  'زياد': 'Ziyad', 'زيد': 'Zaid', 'كريم': 'Karim', 'كمال': 'Kamal', 'جمال': 'Jamal',
  'جابر': 'Jaber', 'جاسم': 'Jassim', 'قاسم': 'Qassim', 'باسم': 'Bassem', 'باسل': 'Basel',
  'بدر': 'Badr', 'بندر': 'Bandar', 'بلال': 'Bilal', 'وليد': 'Waleed', 'وائل': 'Wael',
  'هاني': 'Hani', 'هيثم': 'Haitham', 'همام': 'Hammam', 'أنس': 'Anas', 'انس': 'Anas',
  'أمين': 'Amin', 'امين': 'Amin', 'أيمن': 'Ayman', 'ايمن': 'Ayman', 'أسامة': 'Osama',
  'اسامة': 'Osama', 'أشرف': 'Ashraf', 'اشرف': 'Ashraf', 'أكرم': 'Akram', 'اكرم': 'Akram',
  'إياد': 'Iyad', 'اياد': 'Iyad', 'شادي': 'Shadi', 'شاكر': 'Shaker', 'شريف': 'Sharif',
  'صالح': 'Saleh', 'صلاح': 'Salah', 'صابر': 'Saber', 'ضياء': 'Diaa', 'ظافر': 'Dhafer',
  'غازي': 'Ghazi', 'غانم': 'Ghanem', 'عادل': 'Adel', 'عاطف': 'Atef', 'عارف': 'Aref',
  'عصام': 'Essam', 'عزيز': 'Aziz', 'عيسى': 'Issa', 'داود': 'Dawood', 'داوود': 'Dawood',
  'ديب': 'Deeb', 'ذياب': 'Thiab', 'تركي': 'Turki', 'ثامر': 'Thamer', 'لؤي': 'Louay',
  'مهند': 'Muhannad', 'معاذ': 'Muath', 'معتز': 'Moataz', 'منذر': 'Munther',
  'فاطمة': 'Fatima', 'عائشة': 'Aisha', 'عايشة': 'Aisha', 'خديجة': 'Khadija',
  'مريم': 'Mariam', 'زينب': 'Zainab', 'سارة': 'Sarah', 'ساره': 'Sarah', 'نورة': 'Noura',
  'نوره': 'Noura', 'هند': 'Hind', 'هدى': 'Huda', 'أمل': 'Amal', 'امل': 'Amal',
  'إيمان': 'Iman', 'ايمان': 'Iman', 'أسماء': 'Asmaa', 'اسماء': 'Asmaa', 'ابرار': 'Abrar',
  'أبرار': 'Abrar', 'شيراز': 'Shiraz', 'ريم': 'Reem', 'رنا': 'Rana', 'دانة': 'Dana',
  'لطيفة': 'Latifa', 'منى': 'Mona', 'نجلاء': 'Najla', 'وفاء': 'Wafa', 'سلمى': 'Salma',
  'الدين': 'Aldin', 'الله': 'Allah', 'بن': 'bin', 'بنت': 'bint', 'أبو': 'Abu', 'ابو': 'Abu',
  'آل': 'Al', 'ال': 'Al', 'بكر': 'Bakr',
  // أسماء عائلات شائعة
  'العتيبي': 'Al-Otaibi', 'الشمري': 'Al-Shammari', 'الغامدي': 'Al-Ghamdi',
  'القحطاني': 'Al-Qahtani', 'الدوسري': 'Al-Dosari', 'الحربي': 'Al-Harbi',
  'المطيري': 'Al-Mutairi', 'الزهراني': 'Al-Zahrani', 'العنزي': 'Al-Anazi',
  'السبيعي': 'Al-Subaie', 'الرشيدي': 'Al-Rashidi', 'المالكي': 'Al-Maliki',
  'الشهري': 'Al-Shehri', 'عسيري': 'Asiri', 'العسيري': 'Al-Asiri',
  'البقمي': 'Al-Buqami', 'الجهني': 'Al-Juhani', 'الثقفي': 'Al-Thaqafi',
  'السلمي': 'Al-Sulami', 'الحارثي': 'Al-Harthi', 'الصاعدي': 'Al-Saedi',
  'اليامي': 'Al-Yami', 'النجار': 'Al-Najjar', 'الحداد': 'Al-Haddad',
  'المصري': 'Al-Masri', 'السوري': 'Al-Souri', 'اليمني': 'Al-Yamani',
  // مصطلحات أعمال شائعة (مجموعات، مطاعم، مراكز تكلفة)
  'مطعم': 'Restaurant', 'مطاعم': 'Restaurants', 'مجموعة': 'Group', 'مجموعات': 'Groups',
  'مركز': 'Center', 'مراكز': 'Centers', 'تكلفة': 'Cost', 'فريق': 'Team',
  'رئيسي': 'Main', 'رئيسية': 'Main', 'فرع': 'Branch', 'فروع': 'Branches',
  'الأول': 'First', 'الأولى': 'First', 'الثاني': 'Second', 'الثانية': 'Second',
  'الثالث': 'Third', 'الثالثة': 'Third', 'الرابع': 'Fourth', 'الرابعة': 'Fourth',
  'إدارة': 'Management', 'ادارة': 'Management', 'دعم': 'Support', 'تشغيل': 'Operations',
  'الرياض': 'Riyadh', 'جدة': 'Jeddah', 'الدمام': 'Dammam', 'مكة': 'Makkah',
  'المدينة': 'Madinah', 'الشرقية': 'Eastern', 'الغربية': 'Western',
  'تولان': 'Tolan', 'الملقا': 'Al-Malqa', 'العليا': 'Al-Olaya', 'النخيل': 'Al-Nakheel',
  'الروضة': 'Al-Rawdah', 'الملز': 'Al-Malaz', 'السليمانية': 'Al-Sulaimaniyah',
  'الورود': 'Al-Wurud', 'حي': 'District', 'شارع': 'Street', 'طريق': 'Road',
};

// تحويل حرفي احتياطي لما ليس في القاموس
const CHAR_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'dh', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'a', 'و': 'w', 'ؤ': 'o', 'ي': 'y', 'ى': 'a', 'ئ': 'e',
  'ء': '', 'ﻻ': 'la', 'لا': 'la',
  // التشكيل يُحذف
  'ً': '', 'ٌ': '', 'ٍ': '', 'َ': '', 'ُ': '', 'ِ': '', 'ّ': '', 'ْ': '', 'ـ': '',
};

function transliterateWord(word: string): string {
  // القاموس أولاً
  if (NAME_DICTIONARY[word]) return NAME_DICTIONARY[word];
  // "عبد" + اسم ملتصق غير مقوس
  if (word.startsWith('عبد') && word.length > 3) {
    const rest = word.slice(3);
    const restLatin = NAME_DICTIONARY[rest] || transliterateWord(rest);
    return 'Abdul' + restLatin.toLowerCase();
  }
  // تعريف "ال" في بداية الكلمة (أسماء العائلات)
  if (word.startsWith('ال') && word.length > 2) {
    const rest = word.slice(2);
    const restLatin = NAME_DICTIONARY[rest] || charByChar(rest);
    return 'Al' + capitalize(restLatin);
  }
  return capitalize(charByChar(word));
}

function charByChar(word: string): string {
  let out = '';
  for (const ch of word) {
    out += CHAR_MAP[ch] !== undefined ? CHAR_MAP[ch] : ch;
  }
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** يحوّل اسماً عربياً كاملاً إلى لاتيني. النصوص غير العربية تُعاد كما هي. */
export function transliterateName(name: string | null | undefined): string {
  if (!name) return '';
  if (!/[\u0600-\u06FF]/.test(name)) return name; // ليس عربياً
  return name
    .trim()
    .split(/\s+/)
    .map(w => transliterateWord(w))
    .join(' ');
}
