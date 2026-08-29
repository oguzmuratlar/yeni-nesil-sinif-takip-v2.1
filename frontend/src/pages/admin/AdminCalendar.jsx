import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/layouts/AdminLayout';
import apiClient from '../../api/axios';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import { 
  ChevronLeft, ChevronRight, Plus, Calendar, Video, Radio, Users, 
  Coffee, Pencil, Trash2, Clock, X
} from 'lucide-react';

const EVENT_TYPES = [
  { value: 'video_cekimi', label: 'Video Çekimi', icon: Video },
  { value: 'video_paylasimi', label: 'Video Paylaşımı', icon: Radio },
  { value: 'kamp', label: 'Kamp', icon: Users },
  { value: 'canli_yayin', label: 'Canlı Yayın', icon: Radio },
  { value: 'bulusma', label: 'Buluşma', icon: Coffee },
];

const STATUS_OPTIONS = [
  { value: 'cekilecek', label: 'Çekilecek', color: 'bg-white border-2 border-slate-300', textColor: 'text-slate-600' },
  { value: 'cekildi', label: 'Çekildi', color: 'bg-orange-200', textColor: 'text-orange-800' },
  { value: 'duzenlendi', label: 'Düzenlendi', color: 'bg-blue-200', textColor: 'text-blue-800' },
  { value: 'planlandi', label: 'Planlandı', color: 'bg-green-500 text-white', textColor: 'text-white' },
];

const AdminCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  
  // Form state
  const [eventForm, setEventForm] = useState({
    event_type: '',
    teacher_ids: [],
    branch_ids: [],
    event_time: '',
    video_name: '',
    title: '',
    status: 'cekilecek',
    notes: ''
  });

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  const fetchEvents = useCallback(async () => {
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const response = await apiClient.get(`/calendar/events?year=${year}&month=${month}`);
      setEvents(response.data);
    } catch (error) {
      console.error('Events fetch error:', error);
    }
  }, [currentDate]);

  const fetchTeachers = async () => {
    try {
      const response = await apiClient.get('/calendar/teachers-colors');
      setTeachers(response.data);
    } catch (error) {
      console.error('Teachers fetch error:', error);
    }
  };

  const fetchBranches = async () => {
    try {
      const response = await apiClient.get('/branches');
      setBranches(response.data);
    } catch (error) {
      console.error('Branches fetch error:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchEvents(), fetchTeachers(), fetchBranches()]);
      setLoading(false);
    };
    loadData();
  }, [fetchEvents]);

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Monday = 0, Sunday = 6
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const days = [];
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthLastDay - i)
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return days;
  };

  const getEventsForDate = (date) => {
    // Yerel tarih formatı kullan (UTC sorununu önlemek için)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return events.filter(e => e.event_date === dateStr);
  };

  const getEventColor = (event) => {
    const { event_type, status } = event;
    
    if (event_type === 'canli_yayin' || event_type === 'kamp') {
      return 'bg-purple-500 text-white';
    }
    
    if (event_type === 'video_cekimi') {
      return 'bg-yellow-400 text-slate-800';
    }
    
    if (event_type === 'bulusma') {
      return 'bg-pink-400 text-white';
    }
    
    if (event_type === 'video_paylasimi') {
      // Status-based background - farklı renkler
      const statusColors = {
        'cekilecek': 'bg-white border border-slate-300 text-slate-600',
        'cekildi': 'bg-orange-200 text-orange-800',
        'duzenlendi': 'bg-blue-200 text-blue-800',
        'planlandi': 'bg-green-500 text-white'
      };
      return statusColors[status] || 'bg-slate-100';
    }
    
    return 'bg-slate-200';
  };

  const getEventIcon = (eventType) => {
    const icons = {
      video_cekimi: '🎬',
      video_paylasimi: '📺',
      kamp: '🏕️',
      canli_yayin: '📡',
      bulusma: '☕'
    };
    return icons[eventType] || '📅';
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleDayClick = (dayInfo) => {
    if (!dayInfo.isCurrentMonth) return;
    setSelectedDate(dayInfo.date);
    setEditingEvent(null);
    setEventForm({
      event_type: '',
      teacher_ids: [],
      branch_ids: [],
      event_time: '',
      video_name: '',
      title: '',
      status: 'cekilecek',
      notes: ''
    });
    setShowEventDialog(true);
  };

  const handleEventClick = (event, e) => {
    e.stopPropagation();
    setEditingEvent(event);
    setSelectedDate(new Date(event.event_date));
    setEventForm({
      event_type: event.event_type,
      teacher_ids: event.teacher_ids || [],
      branch_ids: event.branch_ids || [],
      event_time: event.event_time || '',
      video_name: event.video_name || '',
      title: event.title || '',
      status: event.status || 'cekilecek',
      notes: event.notes || ''
    });
    setShowEventDialog(true);
  };

  const handleSaveEvent = async () => {
    if (!eventForm.event_type) {
      toast.error('Etkinlik tipi seçiniz');
      return;
    }
    if (eventForm.teacher_ids.length === 0) {
      toast.error('En az bir öğretmen seçiniz');
      return;
    }

    try {
      // Yerel tarih formatı kullan
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const payload = {
        event_date: dateStr,
        event_type: eventForm.event_type,
        teacher_ids: eventForm.teacher_ids,
        branch_ids: eventForm.branch_ids,
        event_time: (eventForm.event_type === 'kamp' || eventForm.event_type === 'canli_yayin') ? eventForm.event_time : null,
        video_name: (eventForm.event_type === 'video_paylasimi' || eventForm.event_type === 'canli_yayin') ? eventForm.video_name : null,
        title: eventForm.title || null,
        status: eventForm.event_type === 'video_paylasimi' ? eventForm.status : null,
        notes: eventForm.notes || null
      };

      if (editingEvent) {
        await apiClient.put(`/calendar/events/${editingEvent.id}`, payload);
        toast.success('Etkinlik güncellendi');
      } else {
        await apiClient.post('/calendar/events', payload);
        toast.success('Etkinlik oluşturuldu');
      }

      setShowEventDialog(false);
      fetchEvents();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleDeleteEvent = async () => {
    if (!editingEvent) return;
    if (!confirm('Bu etkinliği silmek istediğinize emin misiniz?')) return;

    try {
      await apiClient.delete(`/calendar/events/${editingEvent.id}`);
      toast.success('Etkinlik silindi');
      setShowEventDialog(false);
      fetchEvents();
    } catch (error) {
      toast.error('Silme işlemi başarısız');
    }
  };

  const toggleTeacher = (teacherId) => {
    setEventForm(prev => ({
      ...prev,
      teacher_ids: prev.teacher_ids.includes(teacherId)
        ? prev.teacher_ids.filter(id => id !== teacherId)
        : [...prev.teacher_ids, teacherId]
    }));
  };

  const toggleBranch = (branchId) => {
    setEventForm(prev => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(branchId)
        ? prev.branch_ids.filter(id => id !== branchId)
        : [...prev.branch_ids, branchId]
    }));
  };

  const renderMultiColorStripe = (colors) => {
    if (!colors || colors.length === 0) return null;
    const width = 100 / colors.length;
    return (
      <div className="absolute bottom-0 left-0 right-0 h-1 flex">
        {colors.map((color, idx) => (
          <div key={idx} style={{ width: `${width}%`, backgroundColor: color }} />
        ))}
      </div>
    );
  };

  const calendarDays = getDaysInMonth();

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <Calendar className="w-8 h-8 text-purple-600" />
              Takvim
            </h1>
            <p className="text-slate-600 mt-1">Etkinlik ve içerik planlaması</p>
          </div>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-6 bg-white rounded-lg p-4 shadow-sm">
          <Button variant="outline" onClick={handlePrevMonth}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h2 className="text-xl font-semibold text-slate-800">
            {months[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <Button variant="outline" onClick={handleNextMonth}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4 bg-white rounded-lg p-3 shadow-sm text-sm">
          <div className="flex items-center gap-2">
            <span>🏕️</span>
            <div className="w-4 h-4 rounded bg-purple-500" />
            <span>Kamp</span>
          </div>
          <div className="flex items-center gap-2">
            <span>📡</span>
            <div className="w-4 h-4 rounded bg-purple-500" />
            <span>Canlı Yayın</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🎬</span>
            <div className="w-4 h-4 rounded bg-yellow-400" />
            <span>Video Çekimi</span>
          </div>
          <div className="flex items-center gap-2">
            <span>☕</span>
            <div className="w-4 h-4 rounded bg-pink-400" />
            <span>Buluşma</span>
          </div>
          <div className="border-l pl-4 flex items-center gap-2">
            <span>📺 Video Paylaşımı:</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-white border-2 border-slate-300" />
            <span>Çekilecek</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-200" />
            <span>Çekildi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-200" />
            <span>Düzenlendi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500" />
            <span>Planlandı</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 bg-slate-100">
            {days.map(day => (
              <div key={day} className="p-3 text-center text-sm font-medium text-slate-600 border-b">
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
                  onClick={() => handleDayClick(dayInfo)}
                  className={`min-h-[120px] p-2 border-b border-r cursor-pointer transition-colors ${
                    dayInfo.isCurrentMonth 
                      ? 'bg-white hover:bg-slate-50' 
                      : 'bg-slate-50 text-slate-400'
                  } ${isToday ? 'ring-2 ring-inset ring-purple-500' : ''}`}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-purple-600' : ''}`}>
                    {dayInfo.day}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        onClick={(e) => handleEventClick(event, e)}
                        className={`relative text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 ${getEventColor(event)}`}
                      >
                        {event.event_type === 'video_paylasimi' && event.teacher_colors?.length > 0 && (
                          renderMultiColorStripe(event.teacher_colors)
                        )}
                        <span className="relative z-10 flex items-center gap-1">
                          <span>{getEventIcon(event.event_type)}</span>
                          {event.event_time && <span className="font-medium">{event.event_time}</span>}
                          {event.event_type === 'video_paylasimi' ? (
                            <span className="truncate">
                              {event.branch_abbrevs?.length > 0 && (
                                <span className="font-semibold">{event.branch_abbrevs.join('/')}</span>
                              )}
                              {event.video_name && (
                                <span> - {event.video_name}</span>
                              )}
                            </span>
                          ) : event.event_type === 'canli_yayin' && event.video_name ? (
                            <span className="truncate">{event.video_name}</span>
                          ) : (
                            <>
                              {event.teacher_names?.[0]?.split(' ')[0] || ''}
                              {event.teacher_names?.length > 1 && ` +${event.teacher_names.length - 1}`}
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-slate-500 text-center">
                        +{dayEvents.length - 3} daha
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event Dialog */}
        <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingEvent ? 'Etkinlik Düzenle' : 'Yeni Etkinlik'}
                {selectedDate && (
                  <span className="text-sm font-normal text-slate-500 ml-2">
                    - {selectedDate.getDate()} {months[selectedDate.getMonth()]}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Event Type */}
              <div>
                <Label>Etkinlik Tipi</Label>
                <Select
                  value={eventForm.event_type}
                  onValueChange={(val) => setEventForm(prev => ({ ...prev, event_type: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Etkinlik seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <type.icon className="w-4 h-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Time for Kamp/Canlı Yayın */}
              {(eventForm.event_type === 'kamp' || eventForm.event_type === 'canli_yayin') && (
                <div>
                  <Label>Saat</Label>
                  <Input
                    type="time"
                    value={eventForm.event_time}
                    onChange={(e) => setEventForm(prev => ({ ...prev, event_time: e.target.value }))}
                  />
                </div>
              )}

              {/* Name for Canlı Yayın */}
              {eventForm.event_type === 'canli_yayin' && (
                <div>
                  <Label>Yayın Adı</Label>
                  <Input
                    value={eventForm.video_name}
                    onChange={(e) => setEventForm(prev => ({ ...prev, video_name: e.target.value }))}
                    placeholder="Örn: Canlı Soru Çözümü"
                  />
                </div>
              )}

              {/* Video Name for Video Paylaşımı */}
              {eventForm.event_type === 'video_paylasimi' && (
                <div>
                  <Label>Video Adı</Label>
                  <Input
                    value={eventForm.video_name}
                    onChange={(e) => setEventForm(prev => ({ ...prev, video_name: e.target.value }))}
                    placeholder="Örn: Denklemler Konu Anlatımı"
                  />
                </div>
              )}

              {/* Teachers */}
              <div>
                <Label>Öğretmen(ler)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {teachers.map(teacher => (
                    <div
                      key={teacher.id}
                      onClick={() => toggleTeacher(teacher.id)}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                        eventForm.teacher_ids.includes(teacher.id) 
                          ? 'bg-purple-100 border-purple-300 border' 
                          : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div 
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: teacher.color }}
                      />
                      <span className="text-sm truncate">{teacher.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Branches for Video Paylaşımı */}
              {eventForm.event_type === 'video_paylasimi' && (
                <div>
                  <Label>Branş(lar)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {branches.map(branch => (
                      <div
                        key={branch.id}
                        onClick={() => toggleBranch(branch.id)}
                        className={`px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
                          eventForm.branch_ids.includes(branch.id)
                            ? 'bg-purple-500 text-white'
                            : 'bg-slate-100 hover:bg-slate-200'
                        }`}
                      >
                        {branch.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status for Video Paylaşımı */}
              {eventForm.event_type === 'video_paylasimi' && (
                <div>
                  <Label>Durum</Label>
                  <div className="flex gap-2 mt-2">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setEventForm(prev => ({ ...prev, status: opt.value }))}
                        className={`px-3 py-1.5 rounded text-sm ${opt.color} ${
                          eventForm.status === opt.value ? 'ring-2 ring-purple-500' : ''
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Change */}
              {editingEvent && (
                <div>
                  <Label>Tarih Değiştir</Label>
                  <Input
                    type="date"
                    value={selectedDate?.toISOString().split('T')[0]}
                    onChange={(e) => setSelectedDate(new Date(e.target.value))}
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>Notlar</Label>
                <Input
                  value={eventForm.notes}
                  onChange={(e) => setEventForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Opsiyonel not..."
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              {editingEvent && (
                <Button variant="destructive" onClick={handleDeleteEvent}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Sil
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowEventDialog(false)}>
                İptal
              </Button>
              <Button onClick={handleSaveEvent} className="bg-purple-600 hover:bg-purple-700">
                {editingEvent ? 'Güncelle' : 'Oluştur'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCalendar;
