import { customType } from 'drizzle-orm/mysql-core';
import { attendanceTimeFromDatabase, attendanceTimeToDatabase } from '../shared/attendance-time';

/** No DDL/type change: same TIMESTAMP SQL type, explicit legacy Riyadh value codec. */
export const riyadhAttendanceTimestamp = customType<{ data: string; driverData: string }>({
  dataType: () => 'timestamp',
  toDriver: value => attendanceTimeToDatabase(value),
  fromDriver: value => attendanceTimeFromDatabase(value),
});
