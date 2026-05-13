# Eğitim Yönetim Sistemi - PRD

## Son Güncelleme: 7 Nisan 2026

### Son Değişiklik
- **Planlama Ustası Gamification:** Öğretmenler için aylık planlama takip sistemi eklendi (7 Nisan 2026)
- **Ödeme Pop-up Scroll:** AdminPayments.jsx dialog'una max-height ve overflow-y-auto eklendi (7 Nisan 2026)

## Proje Özeti
Özel ders merkezi yönetim sistemi. Admin ve Teacher rolleri ile öğrenci, öğretmen, ders, ödeme, kamp ve YouTube içerik yönetimi.

## Versiyon: 3.1 (UI/UX İyileştirmeleri)

---

## Tamamlanan Özellikler

### 1. Temel Modüller ✅
- JWT tabanlı authentication (Admin/Teacher)
- Öğrenci CRUD (soft delete)
- Öğretmen CRUD (kullanıcı bilgileri düzenleme dahil)
- Branş yönetimi
- Ders tipleri (Birebir/Grup)
- Planlı dersler
- Gruplar ve grup dersleri

### 2. Kamp Modülü ✅
- Kamp oluşturma/düzenleme
- Öğrenci kayıt durumu (ön kayıt/kesin kayıt)
- Öğretmen kamp kazancı hesaplama

### 3. YouTube Modülü ✅
- YouTube içerik kaydı
- Öğretmen YouTube kazancı

### 4. Aylık Program ✅
- Detaylı aylık program aggregation endpoint
- Ödeme durumu takibi
- Filtreleme (ay, ödeme günü, ödeme durumu)

### 5. Branş Bazlı Kasa Sistemi ✅ (v3.0)

#### 5.1 Kasa Yönetimi
- **Her branş için ayrı kasa**: Matematik, Fen, Türkçe
- **Kasa bakiyesi hesaplama**: Giriş - Çıkış
- **Toplam bakiye görünümü**: Tüm kasaların toplamı
- **Kasalar arası transfer**: Kaynak → Hedef otomatik işlem kaydı
- **Kasa işlem geçmişi**: Her kasanın detaylı geçmişi

#### 5.2 Ödeme Akışı Güncelleme
- **Ödeme girişi**: Öğrenci + Branş + Öğretmen + Kasa seçimi
- **Para çıkışı kategorileri**: Maaş, Kira, Reklam, Ofis, Sermaye, Transfer
- **Maaş ödemesi**: Öğretmen seçimi zorunlu
- **Kasa bazlı filtreleme**: Ödemelerde kasa filtresi

#### 5.3 Öğretmen Gelir Detay Ekranları
- **Ders Kazanç Detayı**: Grup bazlı listeleme
  - Grup adı, branş, ders tipi, grup boyutu
  - Ders sayısı, birim ücret, hesaplama
  - Ders tarihleri
- **Kamp Kazanç Detayı**: Kamp bazlı listeleme
- **YouTube Kazanç Detayı**: İçerik bazlı listeleme
- **Aylık filtreleme**: Tüm detay ekranlarında

#### 5.4 Öğrenci Finans Detayı
- **Branş bazlı hesaplama**:
  - Girilen ders sayısı
  - Ödenen tutar
  - Kullanılan tutar (ders × fiyat)
  - Kalan bakiye
  - Kalan ders sayısı
  - Borçlu/Alacaklı durumu

#### 5.5 Branş Bazlı Öğrenci Listesi
- `/admin/students/branch/{branchId}` sayfası
- Özet kartlar (öğrenci sayısı, toplam ödeme, kullanılan, net bakiye)
- Her öğrenci için detaylı finans bilgisi
- Borçludan alacaklıya sıralama
- İsim/veli arama

### 6. Grup Dersi Hesaplama Düzeltmesi ✅
- **DOĞRU**: Öğretmen kazancı = Ders sayısı × Grup ücreti
- **YANLIŞ DEĞİL**: Öğrenci sayısı ile çarpılmıyor
- İlk öğrenciye tam ücret, diğerlerine 0 yazılıyor
- Mevcut veriler fix endpoint ile düzeltildi

### 7. UI/UX İyileştirmeleri ✅ (YENİ - v3.1)

#### 7.1 Tarih Formatı Türkçe
- Tüm tarihler "26 Mart 2026" formatında gösteriliyor
- `formatDateTurkish()` utility fonksiyonu eklendi
- Güncellenen sayfalar:
  - Ödemeler listesi
  - Öğretmen bakiye sayfası
  - Öğretmen ders gelir detayı
  - Grup dersleri listesi
  - YouTube kazançları
  - Ders geçmişi listeleri

#### 7.2 DatePicker Bileşeni
- Takvimli tarih seçim bileşeni (`DatePicker`)
- Türkçe ay/gün isimleri
- Güncellenen formlar:
  - Ödeme girişi/düzenleme formu
  - Birebir ders ekleme formu (Admin)
  - Birebir ders ekleme formu (Teacher)
  - Grup dersi ekleme formu (Admin)
  - Grup dersi ekleme formu (Teacher)

#### 7.3 Öğrenci Arama Combobox (Ödemeler)
- **Ödeme formu öğrenci seçimi**: "Öğrenci Adı - Veli Adı" formatında combobox
- **Combo arama**: Hem öğrenci hem veli ismine göre arama yapılabilir (ör: "eda ayşegül")
- **Öğrenci filtresi**: Ödemeler listesinde öğrenci bazlı filtreleme
- Backend'e `student_id` filtre parametresi eklendi

### 9. Planlama Ustası Gamification ✅ (YENİ - v3.8)

#### 9.1 Amaç
Öğretmenlerin gelecek ay için tüm aktif öğrenci ve gruplarına eksiksiz planlama girmesini teşvik etmek.

#### 9.2 Puanlama Kuralları
- **+10 puan + Mini Rozet**: Ayın 25'ine kadar eksiksiz planlama
- **+5 puan**: Ayın 25'i ile son günü arası eksiksiz planlama
- **0 puan**: Eksik veya hiç planlama yok
- **Geçerli Aylar**: Eylül-Haziran (Temmuz/Ağustos hariç)

#### 9.3 Rozet Sistemi
- **Mini Rozet**: Sadece +10 puan alanlara verilir
- **Büyük Rozet**: 8 mini rozet toplayan öğretmene verilir
- **Streak**: Sadece +10 puanlar streak'i artırır, +5/0 puan streak'i sıfırlar

#### 9.4 Teacher Tarafı
- **Login Uyarısı**: Eksik planlama varsa popup gösterilir ("X gün kaldı, Y öğrenci Z grup eksik")
- **Dashboard Kartı**: Planlama Ustası kartı (Bu Ay Puan, Toplam Puan, Mini Rozet Sayısı, Streak)
- **Detay Modal**: Tıklanınca öğrenci/grup listesi ve planlama durumu gösterilir

#### 9.5 Admin Tarafı
- **Rozetler Sayfası**: `/admin/badges` - Tüm öğretmenlerin rozet durumu
- **Bu Ay Detay**: Her öğretmen için anlık planlama durumu
- **Geçmiş Modal**: Sezon boyunca aylık puanlar ve rozet geçmişi
- **Sene Sonu İşlemi**: Mini rozetleri ve streak'leri sıfırlar, geçmiş arşivde kalır

#### 9.6 Veri Modelleri
```python
PlanningMasterRecord:
  id, teacher_id, season, month, planning_score, mini_badge, completed_at

PlanningMasterSummary:
  id, teacher_id, season, total_score, mini_badge_count, big_badge,
  current_streak, longest_streak
```

#### 9.7 API Endpoints
- `GET /api/planning-master/check/{teacher_id}` - Login uyarısı için kontrol
- `GET /api/planning-master/summary/{teacher_id}` - Dashboard kartı için özet
- `GET /api/planning-master/detail/{teacher_id}` - Öğrenci/grup detayı
- `GET /api/planning-master/history/{teacher_id}` - Aylık geçmiş
- `GET /api/planning-master/all-teachers` - Admin için tüm öğretmenler
- `POST /api/planning-master/season-end` - Sene sonu işlemi

---

### 8. Diğer Geliştirmeler ✅
- Test hesap bilgisi login'den kaldırıldı
- Banka hesabı silme (bakiye kontrolü ile)
- Ödeme düzenleme/silme
- Öğretmen kullanıcı bilgileri görüntüleme/düzenleme
- Ders eklerken branş bazlı öğretmen filtreleme
- Grup oluşturmada sınıf seçimi (5-8) ve öğrenci arama
- Öğrenciler sayfasında özet istatistikler
- 4+ kişilik gruplarda öğretmen geliri 4 kişi üzerinden
- Sene sonu butonu (sınıf arttırma, 8. sınıf pasif)

---

## Veri Modelleri

### BranchCashbox (YENİ)
```python
id: str
branch_id: str
name: str  # "Türkçe Kasası"
created_at: datetime
```

### CashboxTransfer (YENİ)
```python
id: str
from_cashbox_id: str
to_cashbox_id: str
amount: float
description: str
date: str
created_at: datetime
```

### Payment (Güncellendi)
```python
id: str
payment_type: str  # student_payment, teacher_payment, expense, transfer_in, transfer_out
amount: float
date: str
student_id: str (optional)
teacher_id: str (optional)
branch_id: str (optional)  # YENİ
cashbox_id: str (optional)  # YENİ
bank_account_id: str (optional)
description: str (optional)
expense_category: str (optional)  # Maaş, Kira, Reklam, Ofis, Sermaye, Transfer
transfer_id: str (optional)  # YENİ
```

### StudentCourse (Güncellendi)
```python
student_price: float (optional)  # YENİ - Öğrenci ders ücreti
```

### Lesson (Güncellendi)
```python
group_id: str (optional)  # YENİ - Grup dersi için
```

---

## API Endpoints

### Kasa Yönetimi
- `GET /api/cashboxes` - Tüm kasalar + bakiyeler + toplam
- `GET /api/cashboxes/{id}` - Kasa detayı + işlem geçmişi
- `POST /api/cashboxes` - Yeni kasa (branş başına 1)
- `POST /api/cashbox-transfers` - Kasalar arası transfer
- `POST /api/init-cashboxes` - Migration: Kasaları oluştur

### Öğretmen Gelir Detayları
- `GET /api/teachers/{id}/lesson-income-detail` - Ders kazanç detayı
- `GET /api/teachers/{id}/camp-income-detail` - Kamp kazanç detayı
- `GET /api/teachers/{id}/youtube-income-detail` - YouTube kazanç detayı

### Öğrenci Finans
- `GET /api/students/{id}/finance-detail` - Branş bazlı finans özeti
- `GET /api/students/by-branch/{branch_id}` - Branş bazlı öğrenci listesi

---

## Frontend Sayfaları

### Yeni Sayfalar
- `AdminCashboxes.jsx` - Kasa yönetimi
- `AdminStudentsByBranch.jsx` - Branş bazlı öğrenci listesi
- `TeacherLessonIncomeDetail.jsx` - Ders gelir detayı
- `TeacherCampIncomeDetail.jsx` - Kamp gelir detayı
- `TeacherYoutubeIncomeDetail.jsx` - YouTube gelir detayı

### Güncellenen Sayfalar
- `AdminPayments.jsx` - Kasa seçimi, branş seçimi eklendi
- `TeacherBalance.jsx` - Kartlar tıklanabilir (detay sayfalarına link)
- `AdminLayout.jsx` - Kasalar menüsü eklendi

---

## Menü Yapısı

### Admin Menü
1. Ana Sayfa
2. Öğrenciler
3. Öğretmenler
4. Gruplar
5. Kamplar
6. YouTube
7. Branşlar
8. Kasalar
9. Ödemeler
10. Banka Hesapları
11. Aylık Program
12. **Rozetler** (YENİ - Planlama Ustası)
13. Kullanıcı Ekle

---

## Gelecek Görevler

### P0 - Ödev Takip Sistemi Devam (Aktif Geliştirme)
- Aşama 4: Test durum sistemi (renk kodları, auto-save, undo)
- Aşama 5: Haftalık plan sistemi & PDF export
- Aşama 6: Deneme modülü
- Aşama 7: Mobile UX optimizasyonu

### P1 - Öncelikli
- iOS App / PWA Dönüşümü
- Backend refactoring (server.py ~5600 satır)

### P2 - Normal
- WordPress entegrasyonu
- SMS hatırlatıcıları
- Branş bazlı öğrenci alt menüleri

### P3 - Gelecek
- Raporlama modülü

---

## Test Bilgileri
- **Admin**: admin / test123
- **Teacher**: ilknur.uzunal / test123
- **URL**: https://quirky-ride-4.preview.emergentagent.com

---

## Son Güncelleme
- Tarih: 2026-05-13
- Versiyon: 5.0
- Değişiklikler:
  1. **ÖDEV TAKİP SİSTEMİ - AŞAMA 1-3** (YENİ - 13 Mayıs 2026):
     - 10+ yeni MongoDB koleksiyonu ve veri modeli
     - Backend: 20+ yeni endpoint (kitap, ünite, konu, test CRUD)
     - Admin "İçerik Yönetimi" sayfası - kitap/ünite/konu/test ağaç yapısı
     - Öğretmen "Ödev Girişi" butonu ve 3 panelli ödev takip ekranı
     - Öğrenciye kitap atama, tree view ile içerik görüntüleme
     - Branş bazlı kitap havuzu
  2. **Admin Sidebar Reorganizasyonu** (13 Mayıs 2026):
     - Dersler grubu (collapsible)
     - Muhasebe grubu (collapsible)
     - Ayrı bölümde: İçerik Yönetimi, Rozetler, Günlük Değişiklikler
  3. **Audit Log UI/UX İyileştirmeleri** (13 Mayıs 2026):
     - Grup işlemlerinde öğrenci isimleri parantez içinde gösteriliyor
     - İngilizce key'ler Türkçe'ye çevrildi
     - Boolean değerler Türkçe (Evet/Hayır)
  4. **Önceki Güncellemeler**: Audit Log sistemi, Grup dersi silme, Mobil UI/UX

