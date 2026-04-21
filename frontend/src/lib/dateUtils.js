// Turkish date formatting utilities

const turkishMonths = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const turkishDays = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
];

/**
 * Format date string to Turkish format: "1 Mart 2026"
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format
 * @returns {string} Formatted date in Turkish
 */
export const formatDateTurkish = (dateStr) => {
  if (!dateStr) return '';
  
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const monthName = turkishMonths[month - 1];
    return `${day} ${monthName} ${year}`;
  } catch (error) {
    return dateStr; // Return original if parsing fails
  }
};

/**
 * Format date string to Turkish format with day name: "Pazartesi, 1 Mart 2026"
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format
 * @returns {string} Formatted date in Turkish with day name
 */
export const formatDateTurkishWithDay = (dateStr) => {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    const dayName = turkishDays[date.getDay()];
    const day = date.getDate();
    const monthName = turkishMonths[date.getMonth()];
    const year = date.getFullYear();
    return `${dayName}, ${day} ${monthName} ${year}`;
  } catch (error) {
    return dateStr;
  }
};

/**
 * Format Date object to "YYYY-MM-DD" string
 * @param {Date} date - JavaScript Date object
 * @returns {string} Date string in "YYYY-MM-DD" format
 */
export const formatDateToISO = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse "YYYY-MM-DD" string to Date object
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format
 * @returns {Date|null} JavaScript Date object or null
 */
export const parseISODate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  } catch (error) {
    return null;
  }
};

/**
 * Get Turkish month name
 * @param {number} monthIndex - Month index (0-11)
 * @returns {string} Turkish month name
 */
export const getTurkishMonth = (monthIndex) => {
  return turkishMonths[monthIndex] || '';
};

/**
 * Get Turkish day name
 * @param {number} dayIndex - Day index (0-6, where 0 is Sunday)
 * @returns {string} Turkish day name
 */
export const getTurkishDay = (dayIndex) => {
  return turkishDays[dayIndex] || '';
};

// Turkish locale for react-day-picker
export const turkishLocale = {
  localize: {
    month: (n) => turkishMonths[n],
    day: (n) => turkishDays[n].substring(0, 2), // Pz, Pt, Sa, Ça, Pe, Cu, Ct
  },
  formatLong: {
    date: () => 'd MMMM yyyy',
  },
};

/**
 * Dinamik ay listesi oluşturur
 * @param {number} monthsBefore - Mevcut aydan kaç ay öncesi (varsayılan: 6)
 * @param {number} monthsAfter - Mevcut aydan kaç ay sonrası (varsayılan: 3)
 * @param {boolean} nextMonthFirst - Bir sonraki ay ilk sırada olsun mu (varsayılan: false)
 * @returns {Array} Ay listesi [{value: 'YYYY-MM', label: 'Ay Yıl'}, ...]
 */
export const generateMonthOptions = (monthsBefore = 6, monthsAfter = 3, nextMonthFirst = false) => {
  const months = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  
  // Başlangıç ve bitiş aylarını hesapla
  const startDate = new Date(currentYear, currentMonth - monthsBefore, 1);
  const endDate = new Date(currentYear, currentMonth + monthsAfter, 1);
  
  // Tüm ayları ekle
  let date = new Date(startDate);
  while (date <= endDate) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const value = `${year}-${String(month + 1).padStart(2, '0')}`;
    const label = `${turkishMonths[month]} ${year}`;
    months.push({ value, label });
    date.setMonth(date.getMonth() + 1);
  }
  
  if (nextMonthFirst) {
    // Bir sonraki ayı bul ve en üste taşı
    const nextMonth = new Date(currentYear, currentMonth + 1, 1);
    const nextMonthValue = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    
    // Önce bir sonraki ayı, sonra diğerlerini sırala
    months.sort((a, b) => {
      if (a.value === nextMonthValue) return -1;
      if (b.value === nextMonthValue) return 1;
      return a.value.localeCompare(b.value);
    });
  }
  
  return months;
};

/**
 * Bir sonraki ayın değerini döndürür
 * @returns {string} YYYY-MM formatında bir sonraki ay
 */
export const getNextMonth = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
};
