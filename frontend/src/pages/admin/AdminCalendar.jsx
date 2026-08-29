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
  { value: 'cekilecek', label: 'Çekilecek', color: 'bg-white border-2 border-slate-300', textColor: 'text-slate-600', shortLabel: '⏳', bgColor: '#e2e8f0' },
  { value: 'cekildi', label: 'Çekildi', color: 'bg-orange-200', textColor: 'text-orange-800', shortLabel: '🎬', bgColor: '#fed7aa' },
  { value: 'duzenlendi', label: 'Düzenlendi', color: 'bg-blue-200', textColor: 'text-blue-800', shortLabel: '✂️', bgColor: '#93c5fd' },
  { value: 'planlandi', label: 'Planlandı', color: 'bg-green-500 text-white', textColor: 'text-white', shortLabel: '✓', bgColor: '#22c55e' },
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
  
  // Color picker state
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState(null); // {type: 'event_type', key: 'kamp'} or {type: 'teacher', id: '...'}
  const [eventTypeColors, setEventTypeColors] = useState({
    video_cekimi: '#facc15',
    video_paylasimi: '#8b5cf6',
    kamp: '#10b981',
    canli_yayin: '#8b5cf6',
    bulusma: '#f472b6'
  });
  
  // Preset colors for picker
  const presetColors = [
    '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16',
    '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
    '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f472b6', '#fb7185', '#64748b', '#1e293b'
  ];
  
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

  const fetchEventTypeColors = async () => {
    try {
      const response = await apiClient.get('/calendar/event-type-colors');
      setEventTypeColors(response.data);
    } catch (error) {
      console.error('Event type colors fetch error:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchEvents(), fetchTeachers(), fetchBranches(), fetchEventTypeColors()]);
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

  // Dinamik etkinlik rengi (eventTypeColors state'inden)
  const getEventTypeColor = (eventType) => {
    return eventTypeColors[eventType] || '#8b5cf6';
  };

  const getEventColor = (event) => {
    const { event_type } = event;
    
    // Video paylaşımı için sadece text rengi ver, arka plan gradient ile yapılacak
    if (event_type === 'video_paylasimi') {
      return 'text-white';
    }
    
    // Diğer etkinlik tipleri için dinamik renk kullan
    return 'text-white';
  };

  // Renk seçme işlevi
  const handleColorSelect = async (color) => {
    if (!colorPickerTarget) return;
    
    try {
      if (colorPickerTarget.type === 'event_type') {
        // Etkinlik tipi rengi güncelle
        const newColors = { [colorPickerTarget.key]: color };
        await apiClient.put('/calendar/event-type-colors', newColors);
        setEventTypeColors(prev => ({ ...prev, [colorPickerTarget.key]: color }));
        toast.success('Renk güncellendi');
      } else if (colorPickerTarget.type === 'teacher') {
        // Öğretmen rengi güncelle
        await apiClient.put(`/teachers/${colorPickerTarget.id}/color`, { color });
        setTeachers(prev => prev.map(t => 
          t.id === colorPickerTarget.id ? { ...t, color } : t
        ));
        toast.success('Öğretmen rengi güncellendi');
      }
    } catch (error) {
      toast.error('Renk güncellenemedi');
    }
    
    setShowColorPicker(false);
    setColorPickerTarget(null);
  };

  const openColorPicker = (type, key) => {
    setColorPickerTarget({ type, key: type === 'teacher' ? undefined : key, id: type === 'teacher' ? key : undefined });
    setShowColorPicker(true);
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      'cekilecek': { label: '⏳', title: 'Çekilecek', color: '#e2e8f0' },
      'cekildi': { label: '🎬', title: 'Çekildi', color: '#fed7aa' },
      'duzenlendi': { label: '✂️', title: 'Düzenlendi', color: '#93c5fd' },
      'planlandi': { label: '✓', title: 'Planlandı', color: '#22c55e' }
    };
    return statusMap[status] || statusMap['cekilecek'];
  };

  const getStatusColor = (status) => {
    const statusColors = {
      'cekilecek': '#e2e8f0', // slate-200
      'cekildi': '#fed7aa', // orange-200
      'duzenlendi': '#93c5fd', // blue-300
      'planlandi': '#22c55e' // green-500
    };
    return statusColors[status] || '#e2e8f0';
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
    // Buluşma için hoca seçimi gerekmez (backend otomatik atayacak)
    if (eventForm.event_type !== 'bulusma' && eventForm.teacher_ids.length === 0) {
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

        {/* Legend - Kompakt Versiyon + Renk Seçici */}
        <div className="bg-white rounded-lg p-3 shadow-sm mb-4">
          {/* Etkinlik Tipleri - İlk Satır */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2">
            <span className="font-semibold text-slate-700">Etkinlikler:</span>
            <div className="flex items-center gap-1">
              <span>🎬</span>
              <div 
                className="w-4 h-4 rounded cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 transition-all"
                style={{ backgroundColor: eventTypeColors.video_cekimi }}
                onClick={() => openColorPicker('event_type', 'video_cekimi')}
                title="Rengi değiştirmek için tıkla"
              />
              <span>Video Çekimi</span>
            </div>
            <div className="flex items-center gap-1">
              <span>📺</span>
              <span className="text-slate-500">(Hoca Rengi)</span>
              <span>V. Paylaşımı</span>
            </div>
            <div className="flex items-center gap-1">
              <span>🏕️</span>
              <div 
                className="w-4 h-4 rounded cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 transition-all"
                style={{ backgroundColor: eventTypeColors.kamp }}
                onClick={() => openColorPicker('event_type', 'kamp')}
                title="Rengi değiştirmek için tıkla"
              />
              <span>Kamp</span>
            </div>
            <div className="flex items-center gap-1">
              <span>📡</span>
              <div 
                className="w-4 h-4 rounded cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 transition-all"
                style={{ backgroundColor: eventTypeColors.canli_yayin }}
                onClick={() => openColorPicker('event_type', 'canli_yayin')}
                title="Rengi değiştirmek için tıkla"
              />
              <span>Canlı Yayın</span>
            </div>
            <div className="flex items-center gap-1">
              <span>☕</span>
              <div 
                className="w-4 h-4 rounded cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 transition-all"
                style={{ backgroundColor: eventTypeColors.bulusma }}
                onClick={() => openColorPicker('event_type', 'bulusma')}
                title="Rengi değiştirmek için tıkla"
              />
              <span>Buluşma</span>
            </div>
            <span className="text-slate-400 ml-2 italic">(renklere tıklayarak değiştir)</span>
          </div>
          
          {/* Statüler - İkinci Satır */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-2 border-t pt-2">
            <span className="font-semibold text-slate-700">Video Statüleri:</span>
            {STATUS_OPTIONS.map(s => (
              <div key={s.value} className="flex items-center gap-1">
                <span>{s.shortLabel}</span>
                <div className="w-3 h-3 rounded" style={{ backgroundColor: s.bgColor }} />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          
          {/* Hoca Renkleri - Üçüncü Satır */}
          {teachers.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border-t pt-2">
              <span className="font-semibold text-slate-700">Hocalar:</span>
              {teachers.map(teacher => (
                <div key={teacher.id} className="flex items-center gap-1">
                  <div 
                    className="w-4 h-4 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400 transition-all"
                    style={{ backgroundColor: teacher.color }}
                    onClick={() => openColorPicker('teacher', teacher.id)}
                    title={`${teacher.name} - Rengi değiştirmek için tıkla`}
                  />
                  <span>{teacher.name.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Color Picker Dialog */}
        <Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Renk Seç</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-5 gap-2 py-4">
              {presetColors.map(color => (
                <div
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className="w-10 h-10 rounded-lg cursor-pointer hover:scale-110 transition-transform border-2 border-transparent hover:border-slate-400"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t">
              <Label className="text-sm">Özel:</Label>
              <Input
                type="color"
                className="w-12 h-10 p-1 cursor-pointer"
                onChange={(e) => handleColorSelect(e.target.value)}
              />
            </div>
          </DialogContent>
        </Dialog>

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
                    {dayEvents.slice(0, 3).map(event => {
                      // Video paylaşımı için özel gradient arka plan (%80 hoca, %20 statü)
                      const isVideoPaylasimi = event.event_type === 'video_paylasimi';
                      const teacherColor = event.teacher_colors?.[0] || '#6366f1';
                      const statusColor = getStatusColor(event.status);
                      const statusInfo = getStatusInfo(event.status);
                      
                      // Birden fazla hoca varsa, hoca renklerini eşit böl (%80 içinde)
                      let gradientStyle = {};
                      if (isVideoPaylasimi && event.teacher_colors?.length > 0) {
                        const teacherCount = event.teacher_colors.length;
                        const teacherWidth = 80 / teacherCount;
                        let gradientParts = [];
                        
                        event.teacher_colors.forEach((color, idx) => {
                          const start = idx * teacherWidth;
                          const end = (idx + 1) * teacherWidth;
                          gradientParts.push(`${color} ${start}%, ${color} ${end}%`);
                        });
                        gradientParts.push(`${statusColor} 80%, ${statusColor} 100%`);
                        
                        gradientStyle = {
                          background: `linear-gradient(to right, ${gradientParts.join(', ')})`
                        };
                      }
                      
                      // Canlı Yayın ve Kamp için görüntüleme formatı: {Hoca Adı} - {Etkinlik Adı}
                      const getDisplayText = () => {
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
                        if (event.event_type === 'video_paylasimi') {
                          let parts = [];
                          if (event.branch_abbrevs?.length > 0) {
                            parts.push(event.branch_abbrevs.join('/'));
                          }
                          if (event.video_name) {
                            parts.push(event.video_name);
                          }
                          return parts.join(' - ') || 'Video';
                        }
                        // Video Çekimi
                        const teacherName = event.teacher_names?.[0]?.split(' ')[0] || '';
                        return teacherName + (event.teacher_names?.length > 1 ? ` +${event.teacher_names.length - 1}` : '');
                      };
                      
                      // Dinamik etkinlik rengi
                      const eventBgColor = isVideoPaylasimi ? {} : { backgroundColor: getEventTypeColor(event.event_type) };
                      
                      return (
                        <div
                          key={event.id}
                          onClick={(e) => handleEventClick(event, e)}
                          className={`relative text-xs p-1 rounded truncate cursor-pointer hover:opacity-80 ${getEventColor(event)}`}
                          style={isVideoPaylasimi ? gradientStyle : eventBgColor}
                          title={`${EVENT_TYPES.find(t => t.value === event.event_type)?.label || ''} - ${event.teacher_names?.join(', ') || ''}`}
                        >
                          <span className="relative z-10 flex items-center gap-1">
                            <span>{getEventIcon(event.event_type)}</span>
                            {event.event_time && <span className="font-medium">{event.event_time}</span>}
                            <span className="truncate">{getDisplayText()}</span>
                            {/* Video paylaşımı için statü ikonu */}
                            {isVideoPaylasimi && (
                              <span 
                                className="ml-auto shrink-0 text-[10px]" 
                                title={statusInfo.title}
                              >
                                {statusInfo.label}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
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

              {/* Name for Kamp */}
              {eventForm.event_type === 'kamp' && (
                <div>
                  <Label>Kamp Adı</Label>
                  <Input
                    value={eventForm.title}
                    onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Örn: Soru Çözüm Kampı"
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

              {/* Buluşma için bilgi mesajı */}
              {eventForm.event_type === 'bulusma' && (
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-sm text-pink-700">
                  <span className="font-medium">☕ Buluşma</span> etkinliği tüm hocalara otomatik olarak atanacaktır.
                </div>
              )}

              {/* Teachers - Buluşma hariç */}
              {eventForm.event_type !== 'bulusma' && (
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
              )}

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
