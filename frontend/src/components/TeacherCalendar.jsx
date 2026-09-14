import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/axios';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Calendar, ChevronLeft, ChevronRight, Clock, Users, FileText, Tag } from 'lucide-react';

// Yerleşik (built-in) etkinlik tipleri
const BUILTIN_TYPES = {
  video_cekimi: { label: 'Video Çekimi', icon: '🎬' },
  kamp: { label: 'Kamp', icon: '🏕️' },
  canli_yayin: { label: 'Canlı Yayın', icon: '📡' },
  bulusma: { label: 'Buluşma', icon: '☕' },
};

const DEFAULT_COLORS = {
  video_cekimi: '#facc15',
  kamp: '#10b981',
  canli_yayin: '#8b5cf6',
  bulusma: '#f472b6',
};

const TeacherCalendarBar = ({ onOpenCalendar }) => {
  const [upcomingEvent, setUpcomingEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpcoming = async () => {
      try {
        const response = await apiClient.get('/calendar/events/upcoming');
        setUpcomingEvent(response.data);
      } catch (error) {
        console.error('Upcoming event fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchUpcoming();
  }, []);

  if (loading) return null;

  return (
    <div 
      onClick={onOpenCalendar}
      data-testid="teacher-calendar-bar"
      className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl p-4 cursor-pointer hover:from-purple-600 hover:to-indigo-700 transition-all shadow-lg"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6" />
          <div>
            <p className="text-sm opacity-90">Takvim</p>
            {upcomingEvent ? (
              <p className="font-semibold">
                {upcomingEvent.formatted_date} - {upcomingEvent.display_name}
              </p>
            ) : (
              <p className="font-medium opacity-75">Yaklaşan etkinlik yok</p>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 opacity-75" />
      </div>
    </div>
  );
};

const TeacherCalendarDialog = ({ open, onClose }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [customTypes, setCustomTypes] = useState([]);
  const [eventTypeColors, setEventTypeColors] = useState(DEFAULT_COLORS);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const [eventsRes, typesRes, colorsRes] = await Promise.all([
        apiClient.get(`/calendar/events?year=${year}&month=${month}`),
        apiClient.get('/calendar/custom-event-types'),
        apiClient.get('/calendar/event-type-colors'),
      ]);
      setEvents(eventsRes.data);
      setCustomTypes(typesRes.data || []);
      setEventTypeColors({ ...DEFAULT_COLORS, ...(colorsRes.data || {}) });
    } catch (error) {
      console.error('Events fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    if (open) {
      fetchEvents();
    }
  }, [open, fetchEvents]);

  const getCustomType = (key) => customTypes.find(c => c.key === key);

  const getTypeInfo = (eventType) => {
    if (BUILTIN_TYPES[eventType]) {
      return {
        label: BUILTIN_TYPES[eventType].label,
        icon: BUILTIN_TYPES[eventType].icon,
        color: eventTypeColors[eventType] || DEFAULT_COLORS[eventType] || '#64748b',
      };
    }
    const custom = getCustomType(eventType);
    if (custom) {
      return {
        label: custom.label,
        icon: custom.icon || '📌',
        color: eventTypeColors[eventType] || custom.color || '#0ea5e9',
      };
    }
    return { label: 'Etkinlik', icon: '📅', color: '#64748b' };
  };

  const getDisplayText = (event) => {
    if (event.event_type === 'canli_yayin') {
      const teacherName = event.teacher_names?.[0]?.split(' ')[0] || '';
      const eventName = event.video_name || 'Canlı Yayın';
      return `${teacherName} - ${eventName}`;
    }
    if (event.event_type === 'kamp') {
      const teacherName = event.teacher_names?.[0]?.split(' ')[0] || '';
      const eventName = event.title || 'Kamp';
      return `${teacherName} - ${eventName}`;
    }
    if (event.event_type === 'bulusma') {
      return 'Buluşma';
    }
    return getTypeInfo(event.event_type).label;
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const calendarDays = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      calendarDays.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      calendarDays.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }

    const remainingDays = 42 - calendarDays.length;
    for (let i = 1; i <= remainingDays; i++) {
      calendarDays.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }

    return calendarDays;
  };

  const getEventsForDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return events.filter(e => e.event_date === dateStr);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const calendarDays = getDaysInMonth();

  // Bu ay görünen etkinlik tiplerinden dinamik lejant oluştur
  const presentTypes = Array.from(new Set(events.map(e => e.event_type)));
  const legendItems = presentTypes.map(t => ({ key: t, ...getTypeInfo(t) }));

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              Takvimim
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-4">
              <Button variant="outline" size="sm" onClick={handlePrevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h3 className="text-lg font-semibold text-slate-800">
                {months[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
              <Button variant="outline" size="sm" onClick={handleNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Legend - Dinamik (bu ay görünen tipler) */}
            {legendItems.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-4 text-xs" data-testid="teacher-calendar-legend">
                {legendItems.map(item => (
                  <div key={item.key} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
                    <span>{item.icon} {item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Calendar Grid */}
            <div className="border rounded-lg overflow-hidden">
              {/* Day Headers */}
              <div className="grid grid-cols-7 bg-slate-100">
                {days.map(day => (
                  <div key={day} className="p-2 text-center text-xs font-medium text-slate-600 border-b">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7">
                {calendarDays.map((dayInfo, idx) => {
                  const dayEvents = getEventsForDate(dayInfo.date);
                  const isToday = dayInfo.date.toDateString() === new Date().toDateString();

                  return (
                    <div
                      key={idx}
                      className={`min-h-[80px] p-1 border-b border-r ${
                        dayInfo.isCurrentMonth 
                          ? 'bg-white' 
                          : 'bg-slate-50 text-slate-400'
                      } ${isToday ? 'ring-2 ring-inset ring-purple-500' : ''}`}
                    >
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-purple-600' : ''}`}>
                        {dayInfo.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 2).map(event => {
                          const typeInfo = getTypeInfo(event.event_type);
                          return (
                            <div
                              key={event.id}
                              onClick={(e) => { e.stopPropagation(); setSelectedEvent(event); }}
                              data-testid={`teacher-event-${event.id}`}
                              className="text-[10px] p-0.5 px-1 rounded truncate text-white cursor-pointer hover:opacity-90"
                              style={{ backgroundColor: typeInfo.color }}
                              title={`${typeInfo.label} - ${event.teacher_names?.join(', ') || ''} (Detay için tıkla)`}
                            >
                              <span>{typeInfo.icon} </span>
                              {event.event_time && <span className="font-medium">{event.event_time} </span>}
                              {getDisplayText(event)}
                            </div>
                          );
                        })}
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] text-slate-500 text-center">
                            +{dayEvents.length - 2}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-3 text-center">
              Detayları görmek için etkinliğe tıklayın
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Read-only Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(o) => { if (!o) setSelectedEvent(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="teacher-event-detail-dialog">
          {selectedEvent && (() => {
            const typeInfo = getTypeInfo(selectedEvent.event_type);
            const dateObj = new Date(selectedEvent.event_date + 'T00:00:00');
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-2xl">{typeInfo.icon}</span>
                    {typeInfo.label}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: typeInfo.color }} />
                    <span className="text-slate-600">{typeInfo.label}</span>
                  </div>

                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                    <span className="font-medium">
                      {dateObj.getDate()} {months[dateObj.getMonth()]} {dateObj.getFullYear()}
                    </span>
                  </div>

                  {selectedEvent.event_time && (
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-slate-400 mt-0.5" />
                      <span className="font-medium">{selectedEvent.event_time}</span>
                    </div>
                  )}

                  {(selectedEvent.title || selectedEvent.video_name) && (
                    <div className="flex items-start gap-2">
                      <Tag className="w-4 h-4 text-slate-400 mt-0.5" />
                      <span className="font-medium">{selectedEvent.title || selectedEvent.video_name}</span>
                    </div>
                  )}

                  {selectedEvent.teacher_names?.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Users className="w-4 h-4 text-slate-400 mt-0.5" />
                      <span className="font-medium">{selectedEvent.teacher_names.join(', ')}</span>
                    </div>
                  )}

                  {selectedEvent.notes && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-slate-500 text-xs">Not</p>
                        <p className="font-medium whitespace-pre-wrap">{selectedEvent.notes}</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t">
                    <span className="text-xs text-slate-400">Bu görünüm salt okunurdur.</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setSelectedEvent(null)} data-testid="close-event-detail-btn">
                    Kapat
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export { TeacherCalendarBar, TeacherCalendarDialog };
