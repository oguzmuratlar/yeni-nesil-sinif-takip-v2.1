import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { User } from 'lucide-react';

const VeliStudentSelector = ({ students, value, onChange }) => {
  if (!students || students.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 mb-4" data-testid="veli-student-selector">
      <User size={18} className="text-indigo-500" />
      <span className="text-sm font-medium text-slate-600">Öğrenci:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-56" data-testid="veli-student-select-trigger">
          <SelectValue placeholder="Öğrenci seçin" />
        </SelectTrigger>
        <SelectContent>
          {students.map((s) => (
            <SelectItem key={s.id} value={s.id} data-testid={`veli-student-option-${s.id}`}>
              {s.name}{s.level ? ` (${s.level}. Sınıf)` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default VeliStudentSelector;
