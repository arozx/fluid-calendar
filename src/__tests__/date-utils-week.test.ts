import {
  getISOWeekStart,
  getISOWeekEnd,
  isInSameISOWeek,
  getPreviousISOWeekStart,
  getNextISOWeekStart,
  isInPreviousISOWeek,
} from "../lib/date-utils";

describe("ISO Week Utilities", () => {
  // Test with a known date: Wednesday, January 10, 2024
  // This should be in the week of Monday, January 8, 2024 to Sunday, January 14, 2024
  const testDate = new Date("2024-01-10T15:30:00.000Z");

  describe("getISOWeekStart", () => {
    it("should return Monday 00:00 UTC for a date in the middle of the week", () => {
      const weekStart = getISOWeekStart(testDate);
      
      expect(weekStart.getUTCFullYear()).toBe(2024);
      expect(weekStart.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(weekStart.getUTCDate()).toBe(8); // Monday, January 8
      expect(weekStart.getUTCDay()).toBe(1); // Monday
      expect(weekStart.getUTCHours()).toBe(0);
      expect(weekStart.getUTCMinutes()).toBe(0);
      expect(weekStart.getUTCSeconds()).toBe(0);
      expect(weekStart.getUTCMilliseconds()).toBe(0);
    });

    it("should return the same Monday for all days in the same week", () => {
      // Test different days of the same week
      const monday = new Date("2024-01-08T10:00:00.000Z");
      const tuesday = new Date("2024-01-09T10:00:00.000Z");
      const sunday = new Date("2024-01-14T10:00:00.000Z");

      const mondayStart = getISOWeekStart(monday);
      const tuesdayStart = getISOWeekStart(tuesday);
      const sundayStart = getISOWeekStart(sunday);

      expect(mondayStart.getTime()).toBe(tuesdayStart.getTime());
      expect(mondayStart.getTime()).toBe(sundayStart.getTime());
      expect(mondayStart.getUTCDate()).toBe(8);
    });

    it("should handle Sunday correctly (should return the Monday of that week)", () => {
      const sunday = new Date("2024-01-14T10:00:00.000Z"); // Sunday of the week
      const weekStart = getISOWeekStart(sunday);
      
      expect(weekStart.getUTCDate()).toBe(8); // Monday, January 8
      expect(weekStart.getUTCDay()).toBe(1); // Monday
    });
  });

  describe("getISOWeekEnd", () => {
    it("should return Sunday 23:59:59.999 UTC for a date in the middle of the week", () => {
      const weekEnd = getISOWeekEnd(testDate);
      
      expect(weekEnd.getUTCFullYear()).toBe(2024);
      expect(weekEnd.getUTCMonth()).toBe(0); // January
      expect(weekEnd.getUTCDate()).toBe(14); // Sunday, January 14
      expect(weekEnd.getUTCDay()).toBe(0); // Sunday
      expect(weekEnd.getUTCHours()).toBe(23);
      expect(weekEnd.getUTCMinutes()).toBe(59);
      expect(weekEnd.getUTCSeconds()).toBe(59);
      expect(weekEnd.getUTCMilliseconds()).toBe(999);
    });
  });

  describe("isInSameISOWeek", () => {
    it("should return true for dates in the same week", () => {
      const monday = new Date("2024-01-08T10:00:00.000Z");
      const wednesday = new Date("2024-01-10T15:30:00.000Z");
      const sunday = new Date("2024-01-14T23:00:00.000Z");

      expect(isInSameISOWeek(monday, wednesday)).toBe(true);
      expect(isInSameISOWeek(wednesday, sunday)).toBe(true);
      expect(isInSameISOWeek(monday, sunday)).toBe(true);
    });

    it("should return false for dates in different weeks", () => {
      const thisWeek = new Date("2024-01-10T15:30:00.000Z");
      const nextWeek = new Date("2024-01-15T10:00:00.000Z");
      const previousWeek = new Date("2024-01-07T10:00:00.000Z");

      expect(isInSameISOWeek(thisWeek, nextWeek)).toBe(false);
      expect(isInSameISOWeek(thisWeek, previousWeek)).toBe(false);
    });
  });

  describe("getPreviousISOWeekStart", () => {
    it("should return the Monday of the previous week", () => {
      const previousWeekStart = getPreviousISOWeekStart(testDate);
      
      expect(previousWeekStart.getUTCFullYear()).toBe(2024);
      expect(previousWeekStart.getUTCMonth()).toBe(0); // January
      expect(previousWeekStart.getUTCDate()).toBe(1); // Monday, January 1
      expect(previousWeekStart.getUTCDay()).toBe(1); // Monday
      expect(previousWeekStart.getUTCHours()).toBe(0);
      expect(previousWeekStart.getUTCMinutes()).toBe(0);
      expect(previousWeekStart.getUTCSeconds()).toBe(0);
      expect(previousWeekStart.getUTCMilliseconds()).toBe(0);
    });
  });

  describe("getNextISOWeekStart", () => {
    it("should return the Monday of the next week", () => {
      const nextWeekStart = getNextISOWeekStart(testDate);
      
      expect(nextWeekStart.getUTCFullYear()).toBe(2024);
      expect(nextWeekStart.getUTCMonth()).toBe(0); // January
      expect(nextWeekStart.getUTCDate()).toBe(15); // Monday, January 15
      expect(nextWeekStart.getUTCDay()).toBe(1); // Monday
      expect(nextWeekStart.getUTCHours()).toBe(0);
      expect(nextWeekStart.getUTCMinutes()).toBe(0);
      expect(nextWeekStart.getUTCSeconds()).toBe(0);
      expect(nextWeekStart.getUTCMilliseconds()).toBe(0);
    });
  });

  describe("isInPreviousISOWeek", () => {
    it("should return true for dates in the previous week", () => {
      const currentDate = new Date("2024-01-10T15:30:00.000Z"); // Wednesday, week of Jan 8-14
      const previousWeekDate = new Date("2024-01-03T10:00:00.000Z"); // Wednesday, week of Jan 1-7
      
      expect(isInPreviousISOWeek(previousWeekDate, currentDate)).toBe(true);
    });

    it("should return false for dates in the current week", () => {
      const currentDate = new Date("2024-01-10T15:30:00.000Z");
      const sameWeekDate = new Date("2024-01-12T10:00:00.000Z");
      
      expect(isInPreviousISOWeek(sameWeekDate, currentDate)).toBe(false);
    });

    it("should return false for dates in future weeks", () => {
      const currentDate = new Date("2024-01-10T15:30:00.000Z");
      const futureWeekDate = new Date("2024-01-17T10:00:00.000Z");
      
      expect(isInPreviousISOWeek(futureWeekDate, currentDate)).toBe(false);
    });
  });

  describe("Edge cases", () => {
    it("should handle year boundaries correctly", () => {
      // Test transition from December 31, 2023 (Sunday) to January 1, 2024 (Monday)
      const dec31 = new Date("2023-12-31T12:00:00.000Z"); // Sunday
      const jan1 = new Date("2024-01-01T12:00:00.000Z"); // Monday
      
      const dec31WeekStart = getISOWeekStart(dec31);
      const jan1WeekStart = getISOWeekStart(jan1);
      
      // Dec 31, 2023 should be in the week starting Monday, Dec 25, 2023
      expect(dec31WeekStart.getUTCDate()).toBe(25);
      expect(dec31WeekStart.getUTCMonth()).toBe(11); // December
      expect(dec31WeekStart.getUTCFullYear()).toBe(2023);
      
      // Jan 1, 2024 should be in the week starting Monday, Jan 1, 2024
      expect(jan1WeekStart.getUTCDate()).toBe(1);
      expect(jan1WeekStart.getUTCMonth()).toBe(0); // January
      expect(jan1WeekStart.getUTCFullYear()).toBe(2024);
      
      expect(isInSameISOWeek(dec31, jan1)).toBe(false);
    });
  });
});