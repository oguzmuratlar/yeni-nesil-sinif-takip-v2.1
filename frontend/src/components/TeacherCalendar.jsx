import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../api/axios';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Calendar, ChevronLeft, ChevronRight, Video, Radio, Users, Coffee, X } from 'lucide-react';

const EVENT_TYPE_LABELS = {
  video_cekimi: { label: 'Video Çekimi', icon: Video, color: 'bg-yellow-400' },
  kamp: { label: 'Kamp', icon: Users, color: 'bg-purple-500 text-white' },
  canli_yayin: { label: 'Canlı Yayın', icon: Radio, color: 'bg-purple-500 text-white' },
  bulusma: { label: 'Buluşma', icon: Coffee, color: 'bg-yellow-400' },
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
      const response = await apiClient.get(`/calendar/events?year=${year}&month=${month}`);
      setEvents(response.data);
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
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => e.event_date === dateStr);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const calendarDays = getDaysInMonth();

  return (
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

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <span>Kamp / Canlı Yayın</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-400" />
              <span>Video Çekimi / Buluşma</span>
            </div>
          </div>

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
                        const typeInfo = EVENT_TYPE_LABELS[event.event_type] || {};
                        return (
                          <div
                            key={event.id}
                            className={`text-[10px] p-0.5 px-1 rounded truncate ${typeInfo.color || 'bg-slate-200'}`}
                          >
                            {event.event_time && <span className="font-medium">{event.event_time} </span>}
                            {typeInfo.label}
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { TeacherCalendarBar, TeacherCalendarDialog };
