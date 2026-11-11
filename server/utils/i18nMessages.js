// -----------------------------------------------------------------------------
//  i18nMessages.js — the API answers in the language of the screen that asked.
//
//  English is the source of truth: every service and validator throws an
//  English message, the logs stay readable, and the test suites keep asserting
//  one wording. The client sends `X-App-Lang: ar|fa` on every request (see
//  client/js/api.js), and this table rewrites the KNOWN user-facing messages on
//  the way out, so an Arabic or Persian phone never sees "Invalid phone or
//  password".
//
//  Anything not listed passes through untouched — adding a message to the
//  server can never break a screen, it just shows English until someone
//  translates it. Numbers that a message carries (a size limit) are kept by the
//  pattern rules at the bottom.
// -----------------------------------------------------------------------------

/** English text -> [arabic, persian]. */
const MESSAGES = {
  // --- session and account ---
  'Phone is required': ['رقم الموبايل مطلوب.', 'شماره موبایل لازم است.'],
  'Phone must be 7-15 digits': ['رقم الموبايل لازم بين ٧ و ١٥ رقم.', 'شماره موبایل باید ۷ تا ۱۵ رقم باشد.'],
  'Phone is required and must be 7-15 digits': ['رقم الموبايل مطلوب ولازم بين ٧ و ١٥ رقم.', 'شماره موبایل لازم است و باید ۷ تا ۱۵ رقم باشد.'],
  'Password is required': ['كلمة المرور مطلوبة.', 'رمز عبور لازم است.'],
  'Password must be at least 6 characters': ['كلمة المرور لازم تكون ٦ أحرف على الأقل.', 'رمز عبور باید حداقل ۶ نویسه باشد.'],
  'Invalid phone or password': ['رقم الموبايل أو كلمة المرور غلط.', 'شماره موبایل یا رمز عبور نادرست است.'],
  'Could not create account with these details': ['ما قدرت أفتح حساب بهذي التفاصيل.', 'با این اطلاعات حساب باز نشد.'],
  'Current password is required': ['اكتب كلمة المرور الحالية.', 'رمز عبور فعلی را وارد کنید.'],
  'Current password is wrong': ['كلمة المرور الحالية غلط.', 'رمز عبور فعلی نادرست است.'],
  'New password must be at least 6 characters': ['كلمة المرور الجديدة لازم تكون ٦ أحرف على الأقل.', 'رمز جدید باید حداقل ۶ نویسه باشد.'],
  'Name is required (max 100 chars)': ['الاسم مطلوب (١٠٠ حرف كحد أقصى).', 'نام لازم است (حداکثر ۱۰۰ نویسه).'],
  'Name must be 1-100 chars': ['الاسم لازم بين ١ و ١٠٠ حرف.', 'نام باید ۱ تا ۱۰۰ نویسه باشد.'],
  'Unsupported currency': ['وحدة مال ما مدعومة.', 'واحد پول پشتیبانی نمی‌شود.'],
  'Language must be fa or ar': ['اللغة لازم تكون fa أو ar.', 'زبان باید fa یا ar باشد.'],
  'Footer text is too long (max 500)': ['خانة التذييل طويلة (٥٠٠ حرف كحد أقصى).', 'متن پاورقی بیش از حد بلند است (حداکثر ۵۰۰).'],
  'Authentication required. Provide a Bearer token.': ['لازم تسجّل دخول أولًا.', 'باید ابتدا وارد شوید.'],
  'Invalid or expired token': ['الجلسة منتهية — سجّل دخول من جديد.', 'توکن نامعتبر یا منقضی است.'],
  'User not found': ['المستخدم مو موجود.', 'کاربر یافت نشد.'],

  // --- app lock (Phase 9) ---
  'The code must be 4 to 8 digits': ['الرمز لازم يكون بين ٤ و ٨ أرقام.', 'رمز باید ۴ تا ۸ رقم باشد.'],
  'This account has no lock code': ['هاد الحساب ما فيه رمز قفل.', 'این حساب رمز قفل ندارد.'],
  'The code is wrong': ['الرمز غلط.', 'رمز نادرست است.'],
  'Too many wrong attempts — try again later': [
    'محاولات غلط كثيرة — انتظر شوي وجرب.',
    'تلاش‌های نادرست زیاد — کمی صبر کنید و دوباره امتحان کنید.',
  ],

  // --- parties, notes, bank info ---
  'Party name is required (max 100 chars)': ['اسم الطرف مطلوب (١٠٠ حرف كحد أقصى).', 'نام طرف لازم است (حداکثر ۱۰۰).'],
  'Party name must be 1-100 chars': ['اسم الطرف لازم بين ١ و ١٠٠ حرف.', 'نام طرف باید ۱ تا ۱۰۰ نویسه باشد.'],
  'You already have a party with this name': ['عندك طرف بنفس الاسم.', 'شما طرفی با این نام دارید.'],
  'Party not found': ['الطرف ما موجود.', 'طرف یافت نشد.'],
  'Invalid party id': ['رقم الطرف مو صحيح.', 'شناسهٔ طرف نامعتبر است.'],
  'Note text is required': ['نص الملاحظة مطلوب.', 'متن یادداشت لازم است.'],
  'Note is too long': ['الملاحظة طويلة.', 'یادداشت بلند است.'],
  'Note is too long (max 2000 chars)': ['الملاحظة طويلة (٢٠٠٠ حرف كحد أقصى).', 'یادداشت بلند است (حداکثر ۲۰۰۰).'],
  'Note not found': ['الملاحظة ما موجودة.', 'یادداشت یافت نشد.'],
  'Invalid note id': ['رقم الملاحظة مو صحيح.', 'شناسهٔ یادداشت نامعتبر است.'],
  'Card number must be digits': ['رقم الكارت لازم أرقام بس.', 'شماره کارت باید فقط رقم باشد.'],
  'Card number is too long': ['رقم الكارت طويل.', 'شماره کارت بیش از حد بلند است.'],
  'IBAN is too long': ['الآيبان طويل.', 'آیبان بیش از حد بلند است.'],

  // --- transactions ---
  'Amount is required': ['المبلغ مطلوب.', 'مبلغ لازم است.'],
  'Amount must be a number': ['المبلغ لازم رقم.', 'مبلغ باید عدد باشد.'],
  'Amount must be greater than zero': ['المبلغ لازم أكبر من صفر.', 'مبلغ باید بزرگ‌تر از صفر باشد.'],
  'Amount is too large': ['المبلغ كبير زيادة.', 'مبلغ بیش از حد بزرگ است.'],
  'Date must be YYYY-MM-DD': ['التاريخ لازم يكون YYYY-MM-DD.', 'تاریخ باید YYYY-MM-DD باشد.'],
  'Type must be credit or debit': ['نوع الحركة لازم credit أو debit.', 'نوع باید credit یا debit باشد.'],
  'Transaction not found': ['الحركة ما موجودة.', 'تراکنش یافت نشد.'],
  'Invalid transaction id': ['رقم الحركة مو صحيح.', 'شناسهٔ تراکنش نامعتبر است.'],
  'Description is too long (max 500 chars)': ['الوصف طويل (٥٠٠ حرف كحد أقصى).', 'توضیح بلند است (حداکثر ۵۰۰).'],
  'This account is already settled': ['حساب هذا مسوّى أصلاً — الرصيد صفر.', 'این حساب از قبل تسویه شده — موجودی صفر است.'],

  // --- checks ---
  'Type must be issued or received': ['نوع الصك لازم issued أو received.', 'نوع چک باید issued یا received باشد.'],
  'Due date is required': ['تاريخ السرسيّد مطلوب.', 'تاریخ سررسید لازم است.'],
  'Due date must be YYYY-MM-DD': ['تاريخ السرسيّد لازم YYYY-MM-DD.', 'تاریخ سررسید باید YYYY-MM-DD باشد.'],
  'Unknown check status': ['حالة الصك ما معروفة.', 'وضعیت چک نامشخص است.'],
  'Check not found': ['الصك ما موجود.', 'چک یافت نشد.'],
  'Invalid check id': ['رقم الصك مو صحيح.', 'شناسهٔ چک نامعتبر است.'],

  // --- loans and installments ---
  'Type must be received or given': ['نوع القرض لازم received أو given.', 'نوع وام باید received یا given باشد.'],
  'Principal must be greater than zero': ['أصل القرض لازم أكبر من صفر.', 'اصل وام باید بزرگ‌تر از صفر باشد.'],
  'Start date is required': ['تاريخ البداية مطلوب.', 'تاریخ شروع لازم است.'],
  'Start date must be YYYY-MM-DD': ['تاريخ البداية لازم YYYY-MM-DD.', 'تاریخ شروع باید YYYY-MM-DD باشد.'],
  'Give a monthly payment or a number of installments': ['حدد القسط الشهري أو عدد الأقساط.', 'قسط ماهانه یا تعداد اقساط را مشخص کنید.'],
  'Installments must be between 1 and 600': ['عدد الأقساط لازم بين ١ و ٦٠٠.', 'تعداد اقساط باید بین ۱ تا ۶۰۰ باشد.'],
  'Number of installments must be 1-600': ['عدد الأقساط لازم بين ١ و ٦٠٠.', 'تعداد اقساط باید ۱ تا ۶۰۰ باشد.'],
  'Monthly payment must be greater than zero': ['القسط الشهري لازم أكبر من صفر.', 'قسط ماهانه باید بزرگ‌تر از صفر باشد.'],
  'Monthly payment is too small for this principal': ['القسط الشهري صغير على هذا الأصل.', 'قسط ماهانه برای این اصل وام خیلی کم است.'],
  'That plan does not fit the principal — the last installment would be zero': [
    'الخطة ما تنطبق على الأصل — القسط الأخير بيصير صفر.',
    'این برنامه با اصل وام نمی‌خواند — قسط آخر صفر می‌شود.',
  ],
  'Unknown loan status': ['حالة القرض ما معروفة.', 'وضعیت وام نامشخص است.'],
  'Loan not found': ['القرض ما موجود.', 'وام یافت نشد.'],
  'Invalid loan id': ['رقم القرض مو صحيح.', 'شناسهٔ وام نامعتبر است.'],
  'Installment not found': ['القسط ما موجود.', 'قسط یافت نشد.'],
  'Invalid installment id': ['رقم القسط مو صحيح.', 'شناسهٔ قسط نامعتبر است.'],
  'paid must be true or false': ['حالة الدفع لازم true أو false.', 'وضعیت پرداخت باید true یا false باشد.'],

  // --- reminders ---
  'Title is required': ['العنوان مطلوب.', 'عنوان لازم است.'],
  'Title is too long': ['العنوان طويل.', 'عنوان بلند است.'],
  'Time is required': ['الوقت مطلوب.', 'زمان لازم است.'],
  'Time must be YYYY-MM-DD HH:MM': ['الوقت لازم YYYY-MM-DD HH:MM.', 'زمان باید YYYY-MM-DD HH:MM باشد.'],
  'now must be YYYY-MM-DD HH:MM': ['الوقت الحالي لازم YYYY-MM-DD HH:MM.', 'زمان فعلی باید YYYY-MM-DD HH:MM باشد.'],
  'Message is too long': ['الرسالة طويلة.', 'پیام بلند است.'],
  'sent must be true or false': ['حالة الإرسال لازم true أو false.', 'وضعیت ارسال باید true یا false باشد.'],
  'Reminder not found': ['التذكير ما موجود.', 'یادآور یافت نشد.'],
  'Invalid reminder id': ['رقم التذكير مو صحيح.', 'شناسهٔ یادآور نامعتبر است.'],

  // --- pictures ---
  'No image was sent': ['ما انصورة مرسلة.', 'تصویری ارسال نشده است.'],
  'That file is not a real image': ['الملف هذا مو صورة حقيقية.', 'این فایل یک تصویر واقعی نیست.'],
  'Only JPEG, PNG or WebP images are allowed': ['المسموح JPEG أو PNG أو WebP بس.', 'فقط JPEG، PNG یا WebP مجاز است.'],
  'Unknown attachment target': ['المرفق مو معروف على شنو.', 'هدف پیوست نامشخص است.'],

  // --- backup ---
  'Backup file is missing': ['ملف النسخة مو موجود على السيرفر.', 'فایل پشتیبان روی سرور نیست.'],
  'Backup file is not valid': ['الملف هذا مو نسخة صحيحة.', 'فایل پشتیبان معتبر نیست.'],
  'Backup not found': ['النسخة ما موجودة.', 'نسخهٔ پشتیبان یافت نشد.'],
  'Invalid backup id': ['رقم النسخة مو صحيح.', 'شناسهٔ پشتیبان نامعتبر است.'],
  'mode must be replace or merge': ['طريقة الاسترجاع لازم replace أو merge.', 'حالت باید replace یا merge باشد.'],
  'kind must be auto or manual': ['نوع النسخة لازم auto أو manual.', 'نوع پشتیبان باید auto یا manual باشد.'],
  'Backup kind must be auto or manual': ['نوع النسخة لازم auto أو manual.', 'نوع پشتیبان باید auto یا manual باشد.'],
  'Replacing all data needs confirm=true': ['استبدال كل البيانات لازم مع تأكيد.', 'جایگزینی همهٔ داده‌ها نیاز به تأیید دارد.'],
  'snapshot must be the JSON object from a backup file': [
    'المرسول لازم يكون محتوى نسخة JSON.',
    'محتوای ارسالی باید همان JSON فایل پشتیبان باشد.',
  ],

  // --- reports and generic ---
  'from must be YYYY-MM-DD': ['«من تاريخ» لازم YYYY-MM-DD.', '«از تاریخ» باید YYYY-MM-DD باشد.'],
  'to must be YYYY-MM-DD': ['«لغاية تاريخ» لازم YYYY-MM-DD.', '«تا تاریخ» باید YYYY-MM-DD باشد.'],
  'Validation failed': ['التحقق ما اكمل.', 'اعتبارسنجی انجام نشد.'],
};

/**
 * Messages that carry a number (an upload limit) keep it: the rule matches the
 * English shape and the translation is built with the same digits.
 * [regex, (group) => [arabic, persian]]
 */
const PATTERNS = [
  [/^Image is too large \(max (\d+) MB\)$/, (n) => [`الصورة كبيرة — الحد الأقصى ${n} MB.`, `تصویر بزرگ است — حداکثر ${n} مگابایت.`]],
];

/**
 * @param {string} message  the English message the server threw
 * @param {string} lang     'ar' | 'fa' | anything else = keep English
 */
function localize(message, lang) {
  if (!message || (lang !== 'ar' && lang !== 'fa')) return message;
  const idx = lang === 'ar' ? 0 : 1;

  const direct = MESSAGES[message];
  if (direct) return direct[idx];

  for (const [re, build] of PATTERNS) {
    const m = String(message).match(re);
    if (m) return build(m[1])[idx];
  }
  return message;
}

module.exports = { localize, MESSAGES };
