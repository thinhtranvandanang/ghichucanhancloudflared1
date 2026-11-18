/**
 * Định dạng chuỗi ISO 8601 sang định dạng dd/mm/yyyy HH:mm theo múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 */
export function formatVietnamDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '--/--/---- --:--';
  }

  const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  const day = map.day || '00';
  const month = map.month || '00';
  const year = map.year || '0000';
  const hour = map.hour === '24' ? '00' : map.hour || '00';
  const minute = map.minute || '00';

  return `${day}/${month}/${year} ${hour}:${minute}`;
}
