# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Son Güncelleme: 19 Ağustos 2026

### BUG FIX: İçerik Yönetimi Sıralama Sorunu ✅ (19 Ağustos 2026)

Öğretmen ve Admin panellerindeki İçerik Yönetimi ekranında ünite, konu veya test adı güncellendiğinde öğenin listenin en başına atması sorunu düzeltildi.

#### Sorun
- Ünite/konu/test adı değiştirildiğinde `order` değeri 0 olarak güncelleniyordu
- Backend sıralamayı `order` field'ına göre yaptığı için öğe listenin en üstüne çıkıyordu

#### Çözüm
Backend endpoint'lerinde (`PUT /api/homework/units/{id}`, `PUT /api/homework/topics/{id}`, `PUT /api/homework/tests/{id}`) `order` değeri gönderilmediğinde veya 0 olduğunda mevcut değerin korunması sağlandı.

#### Test Sonuçları
- Ünite güncelleme: Sıralama korunuyor ✅
- Konu güncelleme: Sıralama korunuyor ✅
- Test güncelleme: Sıralama korunuyor ✅

---

### BUG FIX: Manuel Ders Ekleme Double-Click Koruması ✅ (19 Ağustos 2026)

Öğretmen panelinden manuel ders ekleme formlarında çift tıklama sorunu düzeltildi.

#### Sorun
- Öğretmen "Kaydet" butonuna çift tıkladığında duplicate ders kayıtları oluşuyordu
- Bu, öğrenci bakiyelerini ve öğretmen kazançlarını bozuyordu

#### Çözüm
**Frontend Koruması:**
- `saving` state ile Kaydet butonu ilk tıklamada disabled oluyor
- Buton metni "İşleniyor..." olarak değişiyor ve Loader2 animasyonu gösteriliyor
- Input alanları da disabled oluyor

**Backend Koruması:**
- `_lesson_start_locks` in-memory dictionary ile 1.5 saniye içindeki duplicate request'ler 429 ile reddediliyor
- Lock key: `manual_lesson:{user_id}:{student_course_id}:{date}:{number_of_lessons}`
- Grup dersleri için: `group_lesson:{user_id}:{group_id}:{date}:{number_of_lessons}`

#### Etkilenen Dosyalar
```
backend/server.py - create_lesson (~1879), create_group_lesson (~2685) endpoints
frontend/src/pages/teacher/TeacherStudentLessons.jsx - saving state, disabled button
frontend/src/pages/teacher/TeacherGroupLessons.jsx - saving state, disabled button
```

#### Test Sonuçları
- Backend: 3/3 test geçti ✅
- Frontend: E2E flow doğrulandı ✅
- Test dosyası: `/app/backend/tests/test_manual_lesson_double_click.py`

---

### YENİ ÖZELLİK: Ders Linkleri ve Dersi Başlat ✅ (7 Ağustos 2026)

Öğretmenler ders linkine giderken ayrıca manuel ders girişi yapmak zorunda kalmadan otomatik ders kaydı oluşturabilir.

#### Admin Paneli - Ders Linkleri Sayfası
- **Yeni Sayfa**: `Dersler > Ders Linkleri` menüsünde
- **CRUD**: Ekle, düzenle, sil işlemleri
- **Alanlar**: Branş, Öğretmen, Link Adı, Link URL
- **Silme Onayı**: Confirmation modal

#### Öğretmen Paneli - Dersi Başlat
- **Yeni Buton**: Öğrencilerim > Aksiyon barında "Dersi Başlat"
- **Popup**: Ders durumu seçimi + link seçimi
- **Yeni Ders Başlat**: Ders kaydı oluşturur/günceller, link açar
- **Mevcut Derse Devam**: Sadece link açar

#### Aynı Gün Birleştirme
- Aynı gün, aynı öğrenci/grup için ders varsa yeni satır açılmaz
- Mevcut ders sayısı +1 artırılır
- Fiyat/kazanç hesaplamaları otomatik güncellenir

#### Feature Toggle
- Yeni Geliştirmeler sayfasında `lesson_links_enabled` toggle
- Kapalıyken "Dersi Başlat" butonu gizlenir

#### Endpoint'ler:
```
GET/POST/PUT/DELETE /api/lesson-links (Admin)
GET /api/teacher/lesson-links (Öğretmen)
POST /api/lesson-links/start-lesson (Dersi başlat)
GET /api/system-settings/lesson-links-status (Toggle durumu)
```

#### Güncellenen/Eklenen Dosyalar:
```
backend/server.py - lesson_links endpoints
frontend/src/pages/admin/AdminLessonLinks.jsx (YENİ)
frontend/src/pages/teacher/TeacherStudents.jsx - Dersi Başlat butonu/popup
frontend/src/pages/admin/AdminSettings.jsx - lesson_links_enabled toggle
frontend/src/components/layouts/AdminLayout.jsx - Menü
frontend/src/App.js - Route
```

---

### YENİ ÖZELLİK: Enter Tuşu ile Kaydetme ✅ (31 Temmuz 2026)

İçerik Yönetimi sayfalarında (Admin ve Öğretmen) popup'larda Enter tuşuna basılarak hızlı kaydetme özelliği eklendi:
- **Ünite Ekleme/Düzenleme**: Enter ile kaydet
- **Konu Ekleme/Düzenleme**: Enter ile kaydet
- **Test Ekleme/Düzenleme**: Enter ile kaydet
- **Shift+Enter Koruması**: Çok satırlı giriş için koruma

#### Güncellenen Dosyalar:
```
AdminHomeworkContent.jsx   - Satır 781, 815, 850
TeacherHomeworkContent.jsx - Satır 824, 857, 891
```

---

### YENİ ÖZELLİK: Banka Hesapları Arası Transfer ✅ (4 Temmuz 2026)

Admin kullanıcılar, banka hesapları arasında para transferi yapabilir:
- **Çıkış Hesabı**: Paranın çıkacağı banka hesabı seçilir
- **Giriş Hesabı**: Paranın geçeceği banka hesabı seçilir
- **Tutar ve Tarih**: Zorunlu alanlar
- **Açıklama**: Opsiyonel alan
- **Branş Kasaları Etkilenmez**: Transfer sadece banka hesapları arasında gerçekleşir

#### Yeni Endpoint:
```
POST /api/bank-accounts/transfer
Body: { "from_account_id": "...", "to_account_id": "...", "amount": 100, "date": "2026-07-04", "description": "..." }
```

---

### YENİ ÖZELLİK: Öğretmen İçerik Yönetimi ✅ (4 Temmuz 2026)

Öğretmenler artık kendi branşlarına ait kitap ve içerikleri yönetebilir:
- **Dashboard'da 6. Kart**: "İçerik Yönetimi" kartı eklendi
- **Tam Özellik**: Admin sayfasıyla aynı tüm özellikler (ekle, düzenle, sil, kopyala)
- **Branş Kısıtlaması**: Sadece öğretmenin branşına ait kitaplar görünür
- **Branş Filtresi Gizli**: Öğretmen başka branşlara geçemez

#### Yeni Sayfa:
```
/teacher/content - TeacherHomeworkContent.jsx
```

---

### Günlük Değişiklikler Filtresi ✅ (4 Temmuz 2026)

Admin kullanıcılar, Günlük Değişiklikler sayfasında öğrenci ve öğretmen filtresi kullanabilir:
- **Öğrenci Filtresi**: Seçilen öğrencinin derslerini (grup dersleri dahil) filtreler
- **Öğretmen Filtresi**: Seçilen öğretmenin yaptığı değişiklikleri filtreler
- **Tarih Aralığı**: Başlangıç ve bitiş tarihi ile kombinasyon mümkün

#### Güncellenen Endpoint:
```
GET /api/admin/audit-logs?student_id={id}&teacher_id={id}
```

---

### Tarih Bazlı Fiyat Güncelleme ✅

Admin kullanıcılar, öğrenci ve öğretmen fiyatlarını tarih bazlı güncelleyebilir:
- **Geçerlilik Tarihi**: Fiyat değişikliğinin başlangıç tarihi belirlenebilir
- **Geriye Dönük Koruma**: Bu tarihten önce alınan dersler eski fiyattan hesaplanır
- **İleriye Dönük Uygulama**: Bu tarihten sonra alınan dersler yeni fiyattan hesaplanır
- **Bakiye Yeniden Hesaplama**: Öğrenci ve öğretmen bakiyeleri fiyat geçmişi snapshot'larına göre hesaplanır

#### Yeni Endpoint'ler:
```
GET  /api/student-price-history/{student_id}     - Öğrenci fiyat geçmişi
POST /api/student-price-history                   - Öğrenci fiyatı güncelle
GET  /api/teacher-price-history/{teacher_id}     - Öğretmen fiyat geçmişi
POST /api/teacher-price-history                   - Öğretmen fiyatı güncelle
```

#### Frontend Güncellemeleri:
- `AdminStudentForm.jsx`: "Fiyat Güncelle" butonu ve modal eklendi
- `AdminTeacherForm.jsx`: "Fiyat Güncelle" butonu ve modal eklendi
- Her iki modal'da tarih seçici ve fiyat geçmişi görüntüleme mevcut

#### Test Sonuçları:
- Backend: %100 (9/9 test geçti)
- Frontend: %100 (tüm akışlar doğrulandı)

---

## SENE SONU İŞLEMİ - TÜM FAZLAR TAMAMLANDI ✅

| Faz | İçerik | Durum |
|-----|--------|-------|
| Faz 1 | Temel dönem altyapısı, migration | ✅ TAMAMLANDI |
| Faz 2 | Sene sonu preview | ✅ TAMAMLANDI |
| Faz 3 | Sene sonu execute | ✅ TAMAMLANDI |
| Faz 4 | Fiyat geçmişi ve snapshot | ✅ TAMAMLANDI |
| Faz 5 | Dönem filtresi ve dashboard | ✅ TAMAMLANDI |
| Faz 6 | Tarih bazlı fiyat güncelleme UI | ✅ TAMAMLANDI |

---

## Mevcut Özellikler

### Temel Modüller
- Öğrenci yönetimi (CRUD, kurs ataması, risk durumu)
- Öğretmen yönetimi (CRUD, branş/fiyat ataması)
- Ders girişi (birebir ve grup dersleri)
- Ödeme takibi (öğrenci ödemeleri, öğretmen maaşları)
- Kamp yönetimi
- YouTube içerik takibi
- Ödev sistemi (toggle ile açılıp kapanabilir)

### Finansal Özellikler
- Branş bazlı öğrenci bakiye hesaplama
- Öğretmen kazanç hesaplama (ders + kamp + YouTube)
- Fiyat geçmişi snapshot'ları ile gerçek zamanlı bakiye
- Dönem bazlı finansal raporlama

### Akademik Dönem Yönetimi
- Dönem oluşturma ve yönetimi
- Sene sonu preview (bakiye devir simülasyonu)
- Sene sonu execute (güvenli dönem kapatma)
- Kapalı dönem read-only koruması

---

## API Endpoints Özeti

### Öğrenci
```
GET    /api/students
GET    /api/students/{id}
POST   /api/students
PUT    /api/students/{id}
DELETE /api/students/{id}
GET    /api/students/{id}/finance-detail
```

### Öğretmen
```
GET    /api/teachers
GET    /api/teachers/{id}
POST   /api/teachers
PUT    /api/teachers/{id}
GET    /api/teacher-balance/{id}
GET    /api/teacher-prices
POST   /api/teacher-prices
```

### Fiyat Geçmişi (YENİ)
```
GET    /api/student-price-history/{student_id}
POST   /api/student-price-history
GET    /api/teacher-price-history/{teacher_id}
POST   /api/teacher-price-history
GET    /api/current-prices/{student_id}
```

### Ders Linkleri (YENİ)
```
GET    /api/lesson-links              # Admin - tüm linkler
POST   /api/lesson-links              # Admin - yeni link
PUT    /api/lesson-links/{id}         # Admin - düzenle
DELETE /api/lesson-links/{id}         # Admin - sil
GET    /api/teacher/lesson-links      # Öğretmen - kendi linkleri
POST   /api/lesson-links/start-lesson # Dersi başlat
GET    /api/system-settings/lesson-links-status
```

### Dönem (Season)
```
GET    /api/seasons
GET    /api/seasons/current
POST   /api/admin/seasons/create-initial
POST   /api/admin/seasons/migrate
POST   /api/year-end/preview
POST   /api/year-end/execute
```

---

## Dosya Yapısı

```
/app
├── backend/
│   ├── server.py          # Ana backend (9000+ satır)
│   └── tests/
│       ├── test_price_history.py
│       └── test_lesson_links.py
├── frontend/
│   └── src/
│       └── pages/
│           ├── admin/
│           │   ├── AdminStudentForm.jsx
│           │   ├── AdminTeacherForm.jsx
│           │   ├── AdminYearEndPreview.jsx
│           │   ├── AdminLessonLinks.jsx (YENİ)
│           │   ├── AdminSettings.jsx
│           │   └── AdminDashboard.jsx
│           └── teacher/
│               └── TeacherStudents.jsx (Dersi Başlat eklendi)
└── memory/
    ├── PRD.md
    ├── test_credentials.md
    └── SENE_SONU_TEKNIK_DOKUMAN.md
```

---

## Backlog / Gelecek Görevler

### P2 - Yakın Vadeli
- [ ] Birebir öğrenci dersleri için pagination
- [ ] Hızlı ders girişi butonu

### P3 - Uzak Vadeli
- [ ] Test sıralama: Konular içindeki testler için yukarı/aşağı sıralama
- [ ] Kamp SMS hatırlatmaları
- [ ] WordPress entegrasyonu

### Teknik Borç
- [ ] server.py modüler yapıya dönüştürme (8000+ satır)
- [ ] Fiyat geçmişi çakışma kontrolü düzeltme (duplicate $or key)

---

## Test Credentials
- **Admin**: `admin` / `test123`
- **Öğretmen**: `ilknur.uzunal` / `test123`

---

Son Test: 19 Ağustos 2026
Durum: TÜM TESTLER GEÇTİ ✅ (Backend: 18/18, Frontend: 100%)
