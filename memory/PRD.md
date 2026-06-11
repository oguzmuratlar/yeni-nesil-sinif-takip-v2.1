# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Uygulanan Özellikler (21 Mayıs 2026 - Son Güncelleme)

### 🔴 SENE SONU İŞLEMİ - FAZ 1 TAMAMLANDI ✅

**Tarih:** 21 Mayıs 2026

#### Genişletilen/Eklenen Modeller:
| Model | Değişiklik |
|-------|------------|
| `Season` | `start_date`, `end_date`, `closed_at`, `closed_by`, `previous_season_id`, `next_season_id` eklendi |
| `StudentPriceHistory` | YENİ - `student_id + branch_id + lesson_type` bazlı fiyat geçmişi |
| `TeacherPriceHistory` | YENİ - Öğretmen fiyat geçmişi |
| `SeasonCarryover` | YENİ - Dönem devir kayıtları |
| `ManualBalanceAdjustment` | YENİ - Manuel bakiye düzeltmeleri |
| `YearEndLog` | YENİ - Sene sonu işlem logları |
| `StudentGroup` | `season_id`, `closed_at`, `closed_reason` eklendi |
| `StudentCourse` | `group_id`, `closed_at`, `copied_to_id` eklendi |
| `Lesson` | Fiyat snapshot alanları eklendi (FAZ 4'te kullanılacak) |
| `PlannedLesson` | `season_id` eklendi |
| `CampStudent` | `season_id` eklendi |

#### Yeni Endpoint'ler:
```
GET  /api/seasons                                  - Tüm dönemleri listele
GET  /api/seasons/current                          - Aktif dönemi getir
POST /api/admin/seasons/create-initial             - İlk dönem oluştur (admin girer, hardcoded değil)
POST /api/admin/seasons/migrate                    - Season_id migration (DRY-RUN destekli)
POST /api/admin/seasons/migrate-price-history      - Fiyat geçmişi migration (DRY-RUN destekli)
GET  /api/admin/seasons/migration-status/{id}      - Migration durumu kontrol
```

#### Test Sonuçları:
- ✅ Dönem listesi çalışıyor
- ✅ Aktif dönem endpoint'i çalışıyor
- ✅ İlk dönem oluşturma çalışıyor (admin seçimi, hardcoded değil)
- ✅ Duplicate dönem kontrolü çalışıyor
- ✅ Aktif dönem kontrolü çalışıyor
- ✅ Migration DRY-RUN çalışıyor (416 kayıt)
- ✅ Fiyat geçmişi migration DRY-RUN çalışıyor (60 öğretmen fiyatı)
- ✅ Idempotency kontrolleri çalışıyor

#### DRY-RUN Çıktısı (PREVIEW):
```json
{
  "total_records_to_update": 416,
  "collections": {
    "lessons": 254,
    "student_courses": 19,
    "payments": 9,
    "planned_lessons": 36,
    ...
  }
}
```

---

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

## Sene Sonu İşlemi - Kalan Fazlar

### Faz 2: Sene Sonu Preview (TAMAMLANDI ✅)
- [x] `POST /api/year-end/preview` endpoint'i
- [x] Preview UI sayfası (`/admin/year-end-preview`)

### Faz 3: Sene Sonu Execute (BEKLEMEDE)
- [ ] `POST /api/year-end/execute` endpoint'i
- [ ] Execute UI sayfası

### Faz 4: Fiyat Geçmişi Uygulaması (BEKLEMEDE)
- [ ] Student/Teacher price history endpoint'leri
- [ ] Ders kaydı fiyat snapshot mantığı

### Faz 5: Zorunlu UI (BEKLEMEDE)
- [ ] Dönem filtresi (tüm listeleme sayfaları)
- [ ] Kapalı dönem kontrolleri (tüm CUD endpoint'leri)
- [ ] Dashboard kartları

---

## Teknik Detaylar

### Yeni Backend Endpoints (Faz 1 + Faz 2)
```
GET  /api/seasons                                  - Dönem listesi
GET  /api/seasons/current                          - Aktif dönem
POST /api/admin/seasons/create-initial             - İlk dönem oluştur
POST /api/admin/seasons/migrate                    - Season_id migration
POST /api/admin/seasons/migrate-price-history      - Fiyat geçmişi migration
GET  /api/admin/seasons/migration-status/{id}      - Migration durumu
POST /api/year-end/preview                         - Sene sonu preview (FAZ 2)
```

### Mevcut Backend Endpoints
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
├── backend/server.py                 # Genişletildi - Yeni modeller ve endpoint'ler
├── memory/
│   ├── PRD.md                        # Güncellendi
│   └── SENE_SONU_TEKNIK_DOKUMAN.md  # v2.0 - Onaylandı
└── frontend/src/pages/
    ├── admin/
    │   ├── AdminGroupLesson.jsx
    │   ├── AdminHomeworkContent.jsx
    │   └── AdminSettings.jsx
    └── teacher/
        ├── TeacherGroupLessons.jsx
        ├── TeacherHomeworkEntry.jsx
        └── TeacherStudents.jsx
```

---

## Backlog / Gelecek Görevler

### P0 - Sene Sonu (Faz 2-5)
- [ ] Preview/Execute endpoint'leri
- [ ] Fiyat geçmişi uygulaması
- [ ] Kapalı dönem kontrolleri
- [ ] Dönem filtresi UI

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

## Son Test: 21 Mayıs 2026 - Faz 1 + Faz 2 Tamamlandı ✅
