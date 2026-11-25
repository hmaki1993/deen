import azkarData from '../data/azkar.json';
import { getLang } from '../i18n/index.js';

// Get all categories
export function getCategories() {
  const lang = getLang();
  return azkarData.categories.map(cat => ({
    id: cat.id,
    name: lang === 'ar' ? cat.nameAr : cat.nameEn,
    icon: cat.icon,
    count: cat.azkar.length,
  }));
}

// Get azkar by category id
export function getAzkarByCategory(categoryId) {
  const lang = getLang();
  const category = azkarData.categories.find(c => c.id === categoryId);
  if (!category) return null;
  return {
    id: category.id,
    name: lang === 'ar' ? category.nameAr : category.nameEn,
    icon: category.icon,
    azkar: category.azkar.map(z => ({
      id: z.id,
      text: lang === 'ar' ? z.textAr : z.textEn,
      textAr: z.textAr,
      textEn: z.textEn,
      isEn: lang === 'en',
      count: z.count,
      reference: lang === 'ar' ? z.referenceAr : z.referenceEn,
    })),
  };
}

// Get category name by id
export function getCategoryName(categoryId) {
  const lang = getLang();
  const category = azkarData.categories.find(c => c.id === categoryId);
  if (!category) return '';
  return lang === 'ar' ? category.nameAr : category.nameEn;
}
