import React, { useState, useEffect } from 'react';
import { X, Clock, User, Users, BookOpen, Calendar, Edit, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import apiClient from '../../api/axios';

const AuditLogPopup = ({ open, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    if (open) {
      fetchRecentLogs();
    }
  }, [open]);

  const fetchRecentLogs = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/audit-logs/recent');
      setLogs(response.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    // Logları okundu olarak işaretle
    try {
      await apiClient.post('/admin/audit-logs/mark-read');
    } catch (error) {
      console.error('Failed to mark logs as read:', error);
    }
    onClose();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'add': return <Plus className="w-4 h-4 text-green-600" />;
      case 'update': return <Edit className="w-4 h-4 text-blue-600" />;
      case 'delete': return <Trash2 className="w-4 h-4 text-red-600" />;
      default: return <BookOpen className="w-4 h-4 text-slate-600" />;
    }
  };

  const getActionLabel = (actionType) => {
    switch (actionType) {
      case 'add': return 'Ekledi';
      case 'update': return 'Güncelledi';
      case 'delete': return 'Sildi';
      default: return actionType;
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'lesson_entry': return 'Ders Girişi';
      case 'lesson_planning': return 'Ders Planlaması';
      default: return category;
    }
  };

  const getActionBgColor = (actionType) => {
    switch (actionType) {
      case 'add': return 'bg-green-50 border-green-200';
      case 'update': return 'bg-blue-50 border-blue-200';
      case 'delete': return 'bg-red-50 border-red-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl mx-auto max-h-[85vh] overflow-hidden rounded-xl p-0">
        <DialogHeader className="p-4 sm:p-6 pb-2 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Son Değişiklikler
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 max-h-[60vh]">
          <div className="p-4 sm:p-6 pt-2 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-slate-500">
                Yükleniyor...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <p className="text-slate-600 font-medium">Yeni bir değişiklik yapılmadı</p>
                <p className="text-slate-500 text-sm mt-1">Son girişinizden bu yana öğretmenler tarafından yapılan değişiklik yok.</p>
              </div>
            ) : (
              logs.map((log) => (
                <div 
                  key={log.id} 
                  className={`border rounded-lg overflow-hidden ${getActionBgColor(log.action_type)}`}
                >
                  {/* Header */}
                  <div 
                    className="p-3 cursor-pointer"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {getActionIcon(log.action_type)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800">{log.teacher_name}</span>
                            <span className="text-slate-600">{getActionLabel(log.action_type)}</span>
                            <span className="px-2 py-0.5 bg-white/50 rounded text-xs font-medium text-slate-600">
                              {getCategoryLabel(log.category)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-slate-600">
                            {log.group_id ? (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {log.group_name || 'Grup'}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {log.student_name || 'Öğrenci'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500">{formatDate(log.created_at)}</span>
                        {expandedLog === log.id ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedLog === log.id && (
                    <div className="border-t bg-white/80 p-3 space-y-2 text-sm">
                      {/* Grup öğrencileri */}
                      {log.group_students_snapshot && log.group_students_snapshot.length > 0 && (
                        <div>
                          <span className="text-slate-500 font-medium">Grup Öğrencileri:</span>
                          <span className="ml-2 text-slate-700">
                            {log.group_students_snapshot.map(s => s.name).join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Eski Veri */}
                      {log.old_data && (
                        <div className="bg-red-50 p-2 rounded border border-red-100">
                          <span className="text-red-700 font-medium text-xs uppercase">Eski Veri:</span>
                          <div className="mt-1 space-y-1">
                            {Object.entries(log.old_data).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-xs">
                                <span className="text-slate-600">{key}:</span>
                                <span className="text-slate-800 font-medium">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Yeni Veri */}
                      {log.new_data && (
                        <div className="bg-green-50 p-2 rounded border border-green-100">
                          <span className="text-green-700 font-medium text-xs uppercase">Yeni Veri:</span>
                          <div className="mt-1 space-y-1">
                            {Object.entries(log.new_data).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-xs">
                                <span className="text-slate-600">{key}:</span>
                                <span className="text-slate-800 font-medium">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t bg-slate-50">
          <Button onClick={handleClose} className="w-full">
            Tamam
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AuditLogPopup;
