/**
 * Timezone Helper for Business Logic
 * 
 * This module provides timezone-aware date calculations for calendar boundaries.
 * All calendar math is performed in IST (Asia/Kolkata, UTC+5:30), then converted
 * to UTC Date objects for MongoDB queries.
 * 
 * Key principle: Calendar math in IST → Query in UTC
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30

/**
 * Convert a UTC Date to IST Date (for calendar math only)
 * @param {Date} utcDate - Date in UTC
 * @returns {Date} Date representing the same instant in IST
 */
function utcToIST(utcDate) {
    return new Date(utcDate.getTime() + IST_OFFSET_MS);
}

/**
 * Convert an IST Date to UTC Date (for MongoDB queries)
 * @param {Date} istDate - Date in IST
 * @returns {Date} Date representing the same instant in UTC
 */
function istToUTC(istDate) {
    return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/**
 * Parse an ISO date string and interpret it appropriately
 * - If it's a UTC ISO string (ends with Z or has timezone), parse as UTC and convert to IST date
 * - If it's just a date (YYYY-MM-DD), interpret as IST date
 * @param {string} dateString - ISO date string (e.g., "2026-01-05", "2026-01-05T00:00:00", or "2026-01-04T18:30:00.000Z")
 * @returns {Date} UTC Date object representing IST midnight of that date
 */
function parseISTDate(dateString) {
    // Check if it's a UTC timestamp (ends with Z or has timezone offset)
    if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
        // Parse as UTC timestamp, then get IST date components
        const utcDate = new Date(dateString);
        if (isNaN(utcDate.getTime())) {
            throw new Error(`Invalid UTC date string: ${dateString}`);
        }
        // Get IST components of this UTC timestamp
        const istComponents = getISTComponents(utcDate);
        // Create IST midnight of that date
        return createFromISTComponents(istComponents.year, istComponents.month, istComponents.date, 0, 0, 0);
    } else {
        // If it's just a date (YYYY-MM-DD), append timezone to make it IST midnight
        const dateOnly = dateString.split('T')[0];
        // Create date string with IST timezone: "2026-01-05T00:00:00+05:30"
        const istDateString = `${dateOnly}T00:00:00+05:30`;
        // JavaScript Date constructor correctly parses this and creates a UTC Date
        return new Date(istDateString);
    }
}

/**
 * Get current date/time components in IST
 * @returns {Object} IST components of current time
 */
function nowIST() {
    return getISTComponents(new Date());
}

/**
 * Get IST calendar components from a UTC Date
 * @param {Date} utcDate - Date in UTC
 * @returns {Object} { year, month (0-11), date, day (0-6), hours, minutes, seconds }
 */
function getISTComponents(utcDate) {
    const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
    return {
        year: istDate.getUTCFullYear(),
        month: istDate.getUTCMonth(),
        date: istDate.getUTCDate(),
        day: istDate.getUTCDay(), // 0=Sunday, 1=Monday, ..., 6=Saturday
        hours: istDate.getUTCHours(),
        minutes: istDate.getUTCMinutes(),
        seconds: istDate.getUTCSeconds()
    };
}

/**
 * Create UTC Date from IST calendar components
 * @param {number} year - Year in IST
 * @param {number} month - Month (0-11) in IST
 * @param {number} date - Date (1-31) in IST (JavaScript Date handles rollover automatically)
 * @param {number} hours - Hours (0-23) in IST
 * @param {number} minutes - Minutes (0-59) in IST
 * @param {number} seconds - Seconds (0-59) in IST
 * @returns {Date} UTC Date object
 */
function createFromISTComponents(year, month, date, hours = 0, minutes = 0, seconds = 0) {
    // Create ISO string with IST timezone
    // JavaScript Date constructor handles month/day rollover when the date is out of range
    // For example, month=0, date=32 becomes Feb 1, and month=0, date=0 becomes Dec 31 of previous year
    const monthStr = String(month + 1).padStart(2, '0');
    const dateStr = String(date).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');
    
    // Handle negative dates by adjusting year/month first
    let adjustedYear = year;
    let adjustedMonth = month;
    let adjustedDate = date;
    
    // If date is negative, we need to go to previous month
    if (date < 1) {
        adjustedMonth = month - 1;
        if (adjustedMonth < 0) {
            adjustedMonth = 11;
            adjustedYear = year - 1;
        }
        // Get days in previous month
        const tempDate = new Date(Date.UTC(adjustedYear, adjustedMonth + 1, 0));
        adjustedDate = tempDate.getUTCDate() + date; // date is negative, so this subtracts
        const monthStr2 = String(adjustedMonth + 1).padStart(2, '0');
        const dateStr2 = String(adjustedDate).padStart(2, '0');
        const istString = `${adjustedYear}-${monthStr2}-${dateStr2}T${hoursStr}:${minutesStr}:${secondsStr}+05:30`;
        return new Date(istString);
    }
    
    // Normal case: create ISO string with IST timezone
    const istString = `${adjustedYear}-${monthStr}-${dateStr}T${hoursStr}:${minutesStr}:${secondsStr}+05:30`;
    const result = new Date(istString);
    
    // Validate the result
    if (isNaN(result.getTime())) {
        throw new Error(`Invalid date created from IST components: year=${year}, month=${month}, date=${date}, hours=${hours}, minutes=${minutes}, seconds=${seconds}`);
    }
    
    return result;
}

/**
 * Get start of week (Monday 00:00:00 IST) for a given date
 * @param {Date|string} inputDate - Date to calculate week start for (interpreted as IST)
 * @returns {Date} UTC Date object representing Monday 00:00:00 IST
 */
function getWeekStartIST(inputDate) {
    let baseDate;
    
    if (typeof inputDate === 'string') {
        baseDate = parseISTDate(inputDate);
    } else {
        baseDate = inputDate;
    }
    
    // Get IST components
    const istComponents = getISTComponents(baseDate);
    
    // Calculate days to subtract to get to Monday
    // If Sunday (0), go back 6 days; otherwise go back (day - 1) days
    const daysToMonday = istComponents.day === 0 ? 6 : istComponents.day - 1;
    
    // Create a date for the current day, then subtract days (handles month/year rollover)
    const currentDayIST = createFromISTComponents(
        istComponents.year,
        istComponents.month,
        istComponents.date,
        0, 0, 0
    );
    
    // Subtract days to get Monday (JavaScript Date handles month/year rollover)
    const mondayIST = new Date(currentDayIST.getTime() - daysToMonday * 24 * 60 * 60 * 1000);
    
    return mondayIST;
}

/**
 * Get end of week (Sunday 23:59:59.999 IST) for a given week start
 * @param {Date} weekStartUTC - Week start date (UTC Date from getWeekStartIST)
 * @returns {Date} UTC Date object representing Sunday 23:59:59.999 IST
 */
function getWeekEndIST(weekStartUTC) {
    // Add 6 days to week start to get Sunday
    const sundayUTC = new Date(weekStartUTC.getTime() + 6 * 24 * 60 * 60 * 1000);
    
    // Get IST components of Sunday
    const sundayIST = getISTComponents(sundayUTC);
    
    // Create Sunday 23:59:59.999 IST
    const sundayEnd = createFromISTComponents(
        sundayIST.year,
        sundayIST.month,
        sundayIST.date,
        23, 59, 59
    );
    
    // Add 999ms for milliseconds
    return new Date(sundayEnd.getTime() + 999);
}

/**
 * Get start of day (00:00:00 IST) for a given date
 * @param {Date} dateUTC - Date in UTC
 * @param {number} dayOffset - Days to add (0 for same day, 1 for next day, etc.)
 * @returns {Date} UTC Date object representing start of day in IST
 */
function getDayStartIST(dateUTC, dayOffset = 0) {
    // Add day offset first (handles month/year rollover)
    const targetDateUTC = new Date(dateUTC.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    
    // Get IST components of the target date
    const istComponents = getISTComponents(targetDateUTC);
    
    // Create start of day in IST
    return createFromISTComponents(
        istComponents.year,
        istComponents.month,
        istComponents.date,
        0, 0, 0
    );
}

/**
 * Get end of day (23:59:59.999 IST) for a given date
 * @param {Date} dateUTC - Date in UTC
 * @param {number} dayOffset - Days to add (0 for same day, 1 for next day, etc.)
 * @returns {Date} UTC Date object representing end of day in IST
 */
function getDayEndIST(dateUTC, dayOffset = 0) {
    // Add day offset first (handles month/year rollover)
    const targetDateUTC = new Date(dateUTC.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    
    // Get IST components of the target date
    const istComponents = getISTComponents(targetDateUTC);
    
    // Create end of day in IST
    const endOfDay = createFromISTComponents(
        istComponents.year,
        istComponents.month,
        istComponents.date,
        23, 59, 59
    );
    return new Date(endOfDay.getTime() + 999);
}

/**
 * Get start of cycle (Session-based day: 12:00:00 IST of (date - 1))
 * A cycle for date D starts at 12:00:00 IST on date (D-1).
 * @param {Date} dateUTC - Reference date in UTC
 * @param {number} dayOffset - Days to add/subtract
 * @returns {Date} UTC Date object representing 12:00:00 IST of the start day
 */
function getCycleStartIST(dateUTC, dayOffset = 0) {
    // A cycle for date D starts at 12 PM on day (D-1)
    const targetDateUTC = new Date(dateUTC.getTime() + (dayOffset - 1) * 24 * 60 * 60 * 1000);
    const ist = getISTComponents(targetDateUTC);
    return createFromISTComponents(ist.year, ist.month, ist.date, 12, 0, 0);
}

/**
 * Get end of cycle (Session-based day: 11:59:59.999 IST of date)
 * A cycle for date D ends at 11:59:59.999 IST on date D.
 * @param {Date} dateUTC - Reference date in UTC
 * @param {number} dayOffset - Days to add/subtract
 * @returns {Date} UTC Date object representing 11:59:59.999 IST of the end day
 */
function getCycleEndIST(dateUTC, dayOffset = 0) {
    // A cycle for date D ends at 11:59:59.999 AM on day D
    const targetDateUTC = new Date(dateUTC.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const ist = getISTComponents(targetDateUTC);
    const end = createFromISTComponents(ist.year, ist.month, ist.date, 11, 59, 59);
    return new Date(end.getTime() + 999);
}

/**
 * Get start of month (1st day 00:00:00 IST) for a given date
 * @param {Date|string} inputDate - Date to calculate month start for (interpreted as IST)
 * @returns {Date} UTC Date object representing 1st day 00:00:00 IST
 */
function getMonthStartIST(inputDate) {
    let istComponents;
    
    if (typeof inputDate === 'string') {
        const parsed = parseISTDate(inputDate);
        istComponents = getISTComponents(parsed);
    } else {
        istComponents = getISTComponents(inputDate);
    }
    
    // Create 1st day of month at 00:00:00 IST
    return createFromISTComponents(
        istComponents.year,
        istComponents.month,
        1,
        0, 0, 0
    );
}

/**
 * Get end of month (last day 23:59:59.999 IST) for a given month start
 * @param {Date} monthStartUTC - Month start date (UTC Date from getMonthStartIST)
 * @returns {Date} UTC Date object representing last day 23:59:59.999 IST
 */
function getMonthEndIST(monthStartUTC) {
    const monthStartIST = getISTComponents(monthStartUTC);
    
    // Get last day of month: create a date for the 1st of next month, then subtract 1 day
    // First, create 1st of next month at 00:00:00 IST
    let nextMonth = monthStartIST.month + 1;
    let nextYear = monthStartIST.year;
    if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
    }
    
    // Create 1st of next month, then subtract 1 day to get last day of current month
    const firstOfNextMonth = createFromISTComponents(nextYear, nextMonth, 1, 0, 0, 0);
    const lastDay = new Date(firstOfNextMonth.getTime() - 24 * 60 * 60 * 1000); // Subtract 1 day
    
    // Set to 23:59:59.999 IST
    const lastDayIST = getISTComponents(lastDay);
    const lastDayEnd = createFromISTComponents(
        lastDayIST.year,
        lastDayIST.month,
        lastDayIST.date,
        23, 59, 59
    );
    
    return new Date(lastDayEnd.getTime() + 999);
}

/**
 * Get number of days in month for a given month start
 * @param {Date} monthStartUTC - Month start date (UTC Date from getMonthStartIST)
 * @returns {number} Number of days in the month
 */
function getDaysInMonthIST(monthStartUTC) {
    const monthStartIST = getISTComponents(monthStartUTC);
    
    // Get last day by going to next month, then subtracting 1 day
    let nextMonth = monthStartIST.month + 1;
    let nextYear = monthStartIST.year;
    if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
    }
    
    // Create 1st of next month, then subtract 1 day
    const firstOfNextMonth = createFromISTComponents(nextYear, nextMonth, 1, 0, 0, 0);
    const lastDay = new Date(firstOfNextMonth.getTime() - 24 * 60 * 60 * 1000);
    const lastDayComponents = getISTComponents(lastDay);
    
    return lastDayComponents.date;
}

/**
 * Check if a UTC date represents today in IST
 * @param {Date} dateUTC - Date in UTC
 * @returns {boolean} True if the date is today in IST
 */
function isTodayIST(dateUTC) {
    const nowComponents = getISTComponents(new Date());
    const dateComponents = getISTComponents(dateUTC);
    
    return (
        nowComponents.year === dateComponents.year &&
        nowComponents.month === dateComponents.month &&
        nowComponents.date === dateComponents.date
    );
}

/**
 * Format a UTC date as YYYY-MM-DD in IST
 * @param {Date} dateUTC - Date in UTC
 * @returns {string} Date string in YYYY-MM-DD format (IST date)
 */
function formatISTDate(dateUTC) {
    // Validate date
    if (!dateUTC || isNaN(dateUTC.getTime())) {
        throw new Error(`Invalid date passed to formatISTDate: ${dateUTC}`);
    }
    
    const components = getISTComponents(dateUTC);
    const year = components.year;
    const month = String(components.month + 1).padStart(2, '0');
    const day = String(components.date).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Format a Date as "YYYY-MM-DD HH:mm:ss IST" for display/CSV (same moment, IST timezone).
 * @param {Date} date - Date (stored as UTC)
 * @returns {string} e.g. "2025-02-13 18:30:00 IST"
 */
function formatTimestampIST(date) {
    if (!date || isNaN(new Date(date).getTime())) return '';
    const components = getISTComponents(new Date(date));
    const y = components.year;
    const m = String(components.month + 1).padStart(2, '0');
    const d = String(components.date).padStart(2, '0');
    const h = String(components.hours).padStart(2, '0');
    const min = String(components.minutes).padStart(2, '0');
    const s = String(components.seconds).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s} IST`;
}

module.exports = {
    getWeekStartIST,
    getWeekEndIST,
    getDayStartIST,
    getDayEndIST,
    getMonthStartIST,
    getMonthEndIST,
    getDaysInMonthIST,
    isTodayIST,
    formatISTDate,
    formatTimestampIST,
    nowIST,
    utcToIST,
    istToUTC,
    parseISTDate,
    getISTComponents,
    createFromISTComponents,
    getCycleStartIST,
    getCycleEndIST,
    getResolvedTimezone,
    formatGraphXLabel,
    formatSessionTime
};

/**
 * Resolve timezone based on priority:
 * 1. User profile / account settings
 * 2. API request header (X-Timezone)
 * 3. Device timezone
 * 4. UTC (fallback)
 * @param {Object} req - Express request object
 * @param {Object} user - User document
 * @param {Object} device - Device document
 * @returns {string} resolved timezone string
 */
function getResolvedTimezone(req, user, device) {
    if (user && user.timezone) return user.timezone;
    
    const headerTz = req && req.headers && (req.headers['x-timezone'] || req.headers['X-Timezone']);
    if (headerTz) return headerTz;
    
    if (device && device.timezone) return device.timezone;
    
    return 'UTC';
}

/**
 * Format a Date object as "HH:mm" in the specified timezone
 * @param {Date|number} timestamp - The timestamp
 * @param {string} timezone - Timezone string
 * @returns {string} Formatted "HH:mm"
 */
function formatGraphXLabel(timestamp, timezone = 'UTC') {
    if (!timestamp) return '';
    try {
        return new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: timezone
        }).format(new Date(timestamp));
    } catch (e) {
        console.warn(`Invalid timezone: ${timezone}, falling back to UTC`);
        return new Intl.DateTimeFormat('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'UTC'
        }).format(new Date(timestamp));
    }
}

/**
 * Format a Date object as "DD MMM, HH:mm" in the specified timezone
 * @param {Date|number} timestamp - The timestamp
 * @param {string} timezone - Timezone string
 * @returns {string} Formatted "DD MMM, HH:mm"
 */
function formatSessionTime(timestamp, timezone = 'UTC') {
    if (!timestamp) return '';
    try {
        const d = new Date(timestamp);
        const day = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: timezone }).format(d);
        const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: timezone }).format(d);
        const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(d);
        return `${day} ${month}, ${time}`;
    } catch (e) {
        console.warn(`Invalid timezone: ${timezone}, falling back to UTC`);
        const d = new Date(timestamp);
        const day = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'UTC' }).format(d);
        const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(d);
        const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(d);
        return `${day} ${month}, ${time}`;
    }
}

