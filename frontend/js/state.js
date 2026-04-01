export const STATE = {
  currentWeekStart: null,
  allBookings: [],
  allUsers: [],
  allHolidays: [],
  selectedSlot: { date: null, time: null },
  selectedBooking: null,
  holidayMode: false,
  selectedHolidaySlots: [],

  extraWorkMode: false,
  currentAssignDepositId: null,
  extraWorkHoursTotal: 0,
  selectedExtraWorkSlots: [],

  bookingModal: null,
  detailModal: null,
  deleteConfirmModal: null,

  isDragging: false,
  dragStartCell: null,
  dragMode: null,

  isDraggingBooking: false,
  draggedBooking: null,

  dragGhostElement: null,
  longPressTimer: null,
  touchStartX: 0,
  touchStartY: 0,
  
  allServices: []
};

export const timeSlotsWeekday = [
  '08:30', '08:45', '09:00', '09:15', '09:30', '09:45',
  '10:00', '10:15', '10:30', '10:45', '11:00', '11:15',
  '11:30', '11:45', '12:00', '12:15',
  '14:30', '14:45', '15:00', '15:15', '15:30', '15:45',
  '16:00', '16:15', '16:30', '16:45', '17:00', '17:15',
  '17:30', '17:45', '18:00', '18:15'
];

export const timeSlotsSaturday = [
  '08:30', '08:45', '09:00', '09:15', '09:30', '09:45',
  '10:00', '10:15', '10:30', '10:45', '11:00', '11:15',
  '11:30', '11:45'
];

export const allTimeSlots = [
  '08:30', '08:45', '09:00', '09:15', '09:30', '09:45',
  '10:00', '10:15', '10:30', '10:45', '11:00', '11:15',
  '11:30', '11:45', '12:00', '12:15',
  '14:30', '14:45', '15:00', '15:15', '15:30', '15:45',
  '16:00', '16:15', '16:30', '16:45', '17:00', '17:15',
  '17:30', '17:45', '18:00', '18:15'
];

export const workDays = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

export function getTimeSlotsForDate(date) {
  const dayOfWeek = new Date(date).getDay();
  return dayOfWeek === 6 ? timeSlotsSaturday : timeSlotsWeekday;
}

export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateDisplay(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatDateStringDisplay(dateStr) {
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
