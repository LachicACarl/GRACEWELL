/**
 * Timezone Utilities for Gracewell NEXUS
 * Standardized timezone handling for Asia/Manila (UTC+8)
 * 
 * All timestamps in the system are stored in the database as:
 * - Dates: YYYY-MM-DD (Manila timezone)
 * - Times: HH:MM:SS (Manila timezone)
 * 
 * Backend automatically converts all timestamps to Manila timezone.
 * Frontend displays should use these utilities for consistency.
 */

// Asia/Manila timezone offset from UTC (in hours)
export const MANILA_TIMEZONE_OFFSET = 8;
export const MANILA_TIMEZONE = 'Asia/Manila';

/**
 * Format a datetime string for display in Manila timezone
 * @param {string} dateTimeString - ISO datetime string (e.g., 2026-03-04T20:29:00+08:00)
 * @returns {string} - Formatted datetime string
 */
export const formatDateTime = (dateTimeString) => {
  if (!dateTimeString) return '-';
  
  try {
    // Parse the datetime string
    // Backend sends: YYYY-MM-DDTHH:MM:SS+08:00 (Manila timezone)
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return dateTimeString;
    
    // Use Intl.DateTimeFormat to display in Manila timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: MANILA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting datetime:', error);
    return dateTimeString;
  }
};

/**
 * Format a date string for display in Manila timezone
 * @param {string} dateString - ISO date string or YYYY-MM-DD
 * @returns {string} - Formatted date string
 */
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    // Use Intl.DateTimeFormat for Manila timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: MANILA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

/**
 * Format a time string for display in 12-hour format
 * @param {string} timeString - Time string HH:MM:SS or ISO datetime with timezone
 * @returns {string} - Formatted time string (e.g., "8:29 PM")
 */
export const formatTime = (timeString) => {
  if (!timeString) return '-';
  
  try {
    // If it's a full ISO string with timezone (e.g., 2026-03-04T20:29:00+08:00)
    if (timeString.includes('T')) {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return timeString;
      
      // Format using Manila timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      return formatter.format(date);
    }
    
    // If it's just HH:MM:SS format, parse directly
    const [hours, minutes] = timeString.split(':').map(Number);
    
    // Convert to 12-hour format with AM/PM
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
  } catch (error) {
    console.error('Error formatting time:', error);
    return timeString;
  }
};

/**
 * Format check-in/check-out time for attendance display
 * @param {string} dateString - Date (YYYY-MM-DD)
 * @param {string} timeString - Time (HH:MM:SS)
 * @returns {string} - Formatted datetime string
 */
export const formatAttendanceTime = (dateString, timeString) => {
  if (!dateString || !timeString) return '-';
  
  try {
    const dateTime = `${dateString}T${timeString}`;
    return formatDateTime(dateTime);
  } catch (error) {
    console.error('Error formatting attendance time:', error);
    return timeString;
  }
};

/**
 * Get current date in Manila timezone as YYYY-MM-DD
 * @returns {string} - Date string
 */
export const getManilaDateString = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD format
    timeZone: MANILA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  return formatter.format(now);
};

/**
 * Get current time in Manila timezone
 * @returns {string} - Time string
 */
export const getManilaTimeString = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  return formatter.format(now);
};

/**
 * Parse attendance datetime from backend response
 * Backend sends times as: YYYY-MM-DDTHH:MM:SS (already in Manila timezone)
 * @param {string} dateTimeString - Datetime string from backend
 * @returns {object} - { date, time, formatted }
 */
export const parseAttendanceDateTime = (dateTimeString) => {
  if (!dateTimeString) return { date: null, time: null, formatted: '-' };
  
  try {
    const [date, time] = dateTimeString.split('T');
    return {
      date: date || null,
      time: time ? time.split('.')[0] : null, // Remove milliseconds if present
      formatted: formatDateTime(dateTimeString)
    };
  } catch (error) {
    console.error('Error parsing attendance datetime:', error);
    return { date: null, time: null, formatted: dateTimeString };
  }
};

/**
 * Format duration in hours to human-readable format
 * @param {number} hours - Duration in hours
 * @returns {string} - Formatted duration string
 */
export const formatDuration = (hours) => {
  if (!hours || hours === 0) return '0 hrs';
  
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  
  if (minutes === 0) return `${wholeHours} hrs`;
  return `${wholeHours} hrs ${minutes} mins`;
};

/**
 * Check if a date is today in Manila timezone
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {boolean} - True if date is today
 */
export const isToday = (dateString) => {
  if (!dateString) return false;
  return dateString === getManilaDateString();
};

/**
 * Display timezone information
 * @returns {string} - Timezone display string
 */
export const getTimezoneDisplay = () => {
  return `${MANILA_TIMEZONE} (UTC+${MANILA_TIMEZONE_OFFSET})`;
};

export default {
  formatDateTime,
  formatDate,
  formatTime,
  formatAttendanceTime,
  getManilaDateString,
  getManilaTimeString,
  parseAttendanceDateTime,
  formatDuration,
  isToday,
  getTimezoneDisplay,
  MANILA_TIMEZONE,
  MANILA_TIMEZONE_OFFSET
};
