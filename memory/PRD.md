# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Uygulanan Özellikler (21 Mayıs 2026 - Son Güncelleme)

### 🔴 Kritik Bug Düzeltmeleri - Grup Dersi
- [x] **Grup Dersi Görünmüyor Hatası**: TAMAMEN ÇÖZÜLDÜ
  - **Dedicated Endpoint**: `GET /api/group-lessons/{group_id}` - Doğrudan group_id ile sorgulama
  - **Frontend Güncelleme**: Admin ve Teacher sayfaları artık bu dedicated endpoint'i kullanıyor
  - **student_course_id filtrelemesi KALDIRILDI** - Kırılgan yapı ortadan kaldırıldı
  - Backend: `create_group_lesson` endpoint'i `group_id`, `teacher_id`, `branch_id`, `student_id` alanlarını kaydediyor
  - Teacher earning sadece bir kez hesaplanıyor (ilk öğrencide full rate, diğerlerinde 0)

### 🔧 Repair Endpoints
- `POST /api/admin/repair-group-lessons` - Eski verilerde group_id tespiti (karmaşık)
- `POST /api/admin/repair-group-lessons-v2` - GÜVENLİ: Sadece group_id olan ama eksik alanları olan dersleri düzeltir

### 🆕 Feature Flag Sistemi
- [x] **Yeni Geliştirmeler Sayfası**: `/admin/settings`
- [x] **Ödev Takip Sistemi Toggle**: Aktif/Pasif toggle
- [x] **Backend Koruması**: Pasif olduğunda 403 döner

### 📄 Pagination (Tarih Bazlı)
- [x] **Grup Dersleri**: 15 tarih satırı/sayfa
- [x] **Dedicated Endpoint**: `GET /api/group-lessons/{group_id}` - total_lessons, total_dates, grouped lessons

---

## Teknik Detaylar

### Yeni Backend Endpoints
```
GET  /api/group-lessons/{group_id}     - Grup derslerini group_id ile getir
GET  /api/system-settings              - Tüm ayarları listele
PUT  /api/system-settings/{key}        - Ayar güncelle
GET  /api/system-settings/homework-status
GET  /api/lessons/paginated            - Sayfalı ders listesi
POST /api/admin/repair-group-lessons-v2 - Güvenli repair
```

### Dosya Yapısı
```
/app
├── backend/server.py
└── frontend/src/pages/
    ├── admin/
    │   ├── AdminGroupLesson.jsx    (dedicated endpoint kullanıyor)
    │   ├── AdminHomeworkContent.jsx
    │   └── AdminSettings.jsx
    └── teacher/
        ├── TeacherGroupLessons.jsx (dedicated endpoint kullanıyor)
        ├── TeacherHomeworkEntry.jsx
        └── TeacherStudents.jsx
```

---

## Backlog / Gelecek Görevler

### P2 - Yakın Vadeli
- [ ] Birebir öğrenci dersleri için pagination

### P3 - Uzak Vadeli
- [ ] Hızlı Ders Girişi butonu
- [ ] Kamp SMS hatırlatmaları
- [ ] WordPress entegrasyonu

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`

## Son Test: 21 Mayıs 2026 - Backend 12/12, Frontend 100%
