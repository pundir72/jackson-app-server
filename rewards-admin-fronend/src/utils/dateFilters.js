// Date filtering utilities for Transaction & Wallet Manager

export const getDateRangeFilter = (dateRange, dateField = 'createdOn') => {
  if (!dateRange) return () => true;

  const now = new Date();
  let startDate;

  switch (dateRange) {
    case 'Last 7 days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'Last 30 days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'Last 3 months':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'Last 24 hours':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    default:
      return () => true;
  }

  return (item) => {
    const itemDate = parseDateString(item[dateField]);
    return itemDate >= startDate;
  };
};

// Parse various date formats used in the mock data
const parseDateString = (dateStr) => {
  if (!dateStr || dateStr === '-') return new Date(0);
  
  // Handle formats like "12/06/2025" or "2025-05-28 12:01 PM"
  if (dateStr.includes('/')) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
  }
  
  if (dateStr.includes('-')) {
    return new Date(dateStr);
  }
  
  return new Date(dateStr);
};

export default getDateRangeFilter;