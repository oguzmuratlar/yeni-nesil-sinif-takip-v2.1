# Eğitim Portalı - Product Requirements Document

## Orijinal Problem Statement
Özel ders veren öğretmenler için kapsamlı bir eğitim merkezi yönetim sistemi.

---

## Son Güncelleme: 18 Eylül 2026

### Sponsorlu Paylaşım Düzenle/Sil + Finansal Rapor Yayınevi Geliri (Ekim 2026 - 2. tur)
- **Sponsorlu Paylaşım Düzenle/Sil**: Yayınevleri listesinde her yayınevi için "Paylaşımlar" butonu → o yayınevinin sponsorlu paylaşımlarını listeleyen dialog (yayınevi/öğretmen tutarları + düzenle/sil). Backend: `PUT /api/publishers/{pid}/sponsored-content/{cid}` (tutar/tip/hoca/ad güncellenir; publisher_amount manuel>varsayılan, teacher_amount güncel öğretmen ücretinden yeniden hesaplanır), `DELETE .../{cid}`. Düzenleme/silme yayınevi bakiyesini anında günceller (admin-only).
- **Finansal Rapor — Yayınevi Geliri**: `get_financial_report` summary_cards'a `publisher_income` (publisher_id olan student_payment ödemeleri toplamı) eklendi; frontend'de 6. özet kartı "Yayınevi Geliri". Test: curl ile düzenle (-9500), sil (-500), rapor yayınevi geliri (7000) + ekran görüntüsü doğrulandı.

### YENİ ÖZELLİK: Yayınevi & Sponsorlu Paylaşım ✅ (Ekim 2026)
- Feature flag: "Yeni Geliştirmeler" > **Yayınevi & Sponsorlu Paylaşım** (key `sponsor_enabled`, varsayılan kapalı). Pasifken tüm sponsor endpoint'leri 403; admin "Yayınevleri" menüsü + öğretmen "Sponsor" menü/kart gizli. Durum: `GET /api/system-settings/sponsor-status`.
- Yeni koleksiyonlar: `publishers` (name, contacts[], reels_price?, story_price?), `sponsored_contents` (snapshot: publisher_name_snapshot, publisher_amount, teacher_amount, share_type, share_date, season_id). Teacher'a `sponsor_reels_price`/`sponsor_story_price`; Payment'a `publisher_id`.
- Admin: "Yayınevleri" sayfası Branşlar'ın hemen altında (ayrı menü) — liste (Ad, İletişim Kişileri, Reels/Hikaye Ücreti, Bakiye, İşlemler), oluştur/düzenle (çoklu iletişim kişisi), "Sponsorlu Paylaşım Ekle" dialog. Öğretmen profilinde "Sponsorlu Paylaşım" ücret bölümü. Ödemeler formunda opsiyonel "Yayınevi" alanı (öğrenci XOR yayınevi).
- Sponsorlu paylaşım tutarı: manuel tutar > yayınevi varsayılan ücreti; ikisi de yoksa 400. Öğretmen kazancı öğretmenin kendi sponsor ücretinden (yayınevi tutarından bağımsız). Yayınevi bakiyesi = ödemeler − sponsorlu tutarlar (negatif=borçlu).
- Öğretmen: dashboard "Sponsorlu İçerik" kartı + üst menü "Sponsor"; `/teacher/sponsor` detay ekranı (YouTube detay tasarımı, aylık filtre, toplam kazanç, tablo). Bakiye ekranında 4. kart "Sponsor Kazancı". Öğretmen toplam bakiyesine sponsor kazancı dahil (aylık, share_date). Snapshot: ücret değişse bile eski kayıt değişmez.
- Endpoint'ler: GET/POST/PUT /api/publishers, POST/GET /api/publishers/{id}/sponsored-content(s), GET /api/teachers/{id}/sponsored-contents, GET /api/teacher/sponsored-contents. Yetki backend'de zorlanır (öğretmen/veli yönetim endpoint'lerine 403, öğretmen sadece kendi kayıtları). Test: Backend 18/18, Frontend E2E (iteration_30).


- Öğrenci formunda veli eklerken MEVCUT bir veli kullanıcı adı girilirse onay dialogu çıkar: "{username} velisi mevcut, {öğrenciler} öğrencilerinin velisi. Bu öğrenciyi de {username} velisine eklemek istiyor musunuz?" Onaylanırsa öğrenci o veliye eklenir (linked_student_ids'e append). Böylece bir veliye önyüzden birden fazla öğrenci bağlanabilir.
- Yeni endpoint: `GET /api/admin/veli-lookup?username=` → {exists, is_parent, student_names, student_count} (admin).
- Backend `create_student`: mevcut parent kullanıcı adıyla gelince hata vermek yerine öğrenciyi mevcut veliye ekler; şifre gerekmez. Parent olmayan (admin/teacher) kullanıcı adı → 400. `update_student`: girilen kullanıcı adı başka mevcut veliye aitse öğrenciyi eski veliden çıkarıp hedef veliye taşır; eski veli öğrencisiz kalırsa silinir.
- Frontend: AdminStudentForm submit öncesi lookup + AlertDialog onayı; mevcut veli seçilince şifre zorunlu değil. Curl + ekran görüntüsüyle doğrulandı (multi_veli → 2 öğrenci).


- **REGRESYON FIX**: `/api/students/by-branch/{branch_id}` route decorator'ı önceki düzenlemede yanlışlıkla silinmişti → Admin Öğrenciler branş seçince "Veriler yüklenemedi" hatası. Decorator geri eklendi (200).
- Veli ana sayfasında branş kartına tıklayınca Dersler sayfası o branş filtresiyle açılır (`/veli/lessons?branch=&student=` query param + `useSearchParams`).
- Veli Dersler: belirli bir branş seçilince altında öğrencinin o branşta girdiği ders tarihleri + ders sayıları listelenir; ücretsiz dersler "Ücretsiz" rozetiyle belirtilir. `compute_student_finance` her branşa `lessons` (tarih/adet/ücretsiz) ekler.
- Veli Ödemeler: hesap adı artık ödemenin kendi `bank_account_id` (format "bankaAdı- hesapSahibi") veya `cashbox_id` adından gelir (ör. "örnek banka2- Oğuz Yılmaz"). Önceki hatalı öğrenci-varsayılan-hesap mantığı kaldırıldı.


- "Veli Kullanıcısı" artık "Yeni Geliştirmeler" ekranından açılıp kapatılabilir (system setting key: `veli_enabled`, UI: "Veli Kullanıcısı"). Diğer bayraklar gibi dinamik toggle.
- Pasifken: veli girişi 401 ("Veli girişi şu anda kapalı"), tüm `/api/veli/*` endpoint'leri 403, `/auth/register` parent 403, öğrenci create/update veli oluşturma 403; öğrenci formundaki "Veli Giriş Bilgileri" bölümü ve kullanıcı formundaki "Veli" seçeneği gizlenir. Aktifken her şey çalışır.
- Public durum endpoint'i: `GET /api/system-settings/veli-status`. Frontend formlar bu duruma göre koşullu render eder. Curl ile OFF→401/403, ON→200 doğrulandı; toggle AdminSettings'te görünür. Şu an AKTİF bırakıldı.

### YENİ ÖZELLİK: Veli (Parent) Kullanıcı Tipi ✅ (7 Ekim 2026)
- Yeni rol: kod `user_type="parent"`, UI etiketi "Veli". User modeline `linked_student_ids` (çoklu öğrenci) eklendi; parent için zorunlu. Token yanıtı `linked_student_ids` döner. Şifreler diğer kullanıcılar gibi bcrypt ile hash'li saklanır.
- **Öğrenci oluşturma/düzenleme**: "Veli Giriş Bilgileri" bölümü — opsiyonel "Veli kullanıcısı ekle" checkbox'ı; işaretlenirse veli kullanıcı adı + şifre zorunlu. Create → aynı anda parent user oluşturulur (linked_student_ids=[öğrenci]). Update → veli kullanıcı adı/şifre değişimi bağlı parent user'a yansır (yoksa oluşturulur). Student modelinde `veli_username` saklanır. Öğrenci silinince bağlı veli (başka öğrencisi yoksa) silinir.
- **Kullanıcı Yönetimi (AdminUserForm)**: kullanıcı tipi select'ine "Veli" eklendi; seçilince aranabilir çoklu öğrenci seçici gösterilir (en az 1 zorunlu). Liste görünümü parent rolünü ve bağlı öğrencileri gösterir.
- **Yetki (backend, source of truth)**: `/api/veli/*` yalnızca parent; istenen `student_id` parent'ın linked_student_ids'inde olmalı yoksa 403. Parent admin/teacher endpoint'lerine 403; admin/teacher `/api/veli/*`'e 403. Frontend ProtectedRoute + App.js catch-all yalnızca UX yönlendirmesi.
- **Veli paneli (frontend)**: `/veli` (Ana Sayfa - branş kartları), `/veli/lessons` (Dersler - branş filtreli tablo), `/veli/payments` (Ödemeler). Üstte çoklu öğrenci için öğrenci seçici (tek öğrencide gizli). VeliLayout menüsü: Ana Sayfa, Dersler, Ödemeler.
- **Hesaplama**: Mevcut `compute_student_finance` helper'ı kullanılır (admin finance-detail ile ortak). Kalan bakiye = toplam ödeme − (ücretli ders × öğrenci fiyatı). Ücretsiz dersler bakiyeyi düşürmez. Grup dersleri öğrenci sayısıyla çarpılmaz. Durum: balance<0 → "Borçlu", değilse "Bakiye Mevcut".
- API: GET /api/veli/students, /api/veli/summary, /api/veli/lessons, /api/veli/payments (hepsi opsiyonel student_id). Test: Backend 14/14 pytest, Frontend ~%95 (iteration_29). Test velisi: veli_test/veli123 (Ali Yılmaz'a bağlı).


### Performans & UX İyileştirmeleri (5 Ekim 2026)
- **Ödemeler — sunucu taraflı sayfalama + zenginleştirme (7 Ekim 2026 güncellemesi)**: Sayfa artık TÜM ödemeleri/öğrencileri istemciye indirmiyor. Yeni endpoint'ler: `GET /api/payments/paginated` (filtre+sayfalama+isim zenginleştirme+özet) ve `GET /api/payments/months` (benzersiz aylar). Liste satırları isim/kasa bilgisini sunucudan hazır alır (student_name/teacher_name/cashbox_name/branch_name) — isimler artık anında gelir. Özet kartları (Gelir/Gider/Net) sunucudaki tam filtreli küme üzerinden hesaplanır (sekmeden bağımsız). Sekmeler (Tümü/Gelir/Gider) her biri sunucudan sayfalanır. Öğrenci kursları (branş etiketleri) ayrı/bloklamadan yüklenir, böylece giriş formundaki öğrenci listesi beklemeden açılır. Test: Backend 11/11 pytest, Frontend %100 (iteration_28).
- **Ödemeler sayfalama**: 10/25/50/100 (varsayılan 10), sayfa altında; filtre/sekme/sayfa boyutu değişince 1. sayfaya döner.
- **Aylık Program hızlandırma (N+1 giderme)**: `/monthly-program-detailed` artık `student_price_history` (birebir) ve `teacher_prices` verilerini tek seferde belleğe alıp lookup dict'lerle hesaplar (yeni yardımcı: `get_teacher_rate_cached`). Hesap mantığı birebir aynı; endpoint ~0.1-0.2s.
- **Menü sırası**: Muhasebe menüsünde "Aylık Program" artık "Finansal Rapor"un üstünde.


### Ödemeler - Opsiyonel Alanlar (18 Eylül 2026)
- Admin Ödemeler ekranında ödeme girişi/para çıkışı yaparken Branş/Kasa ve Banka hesabı artık zorunlu değil. Boş bırakılırsa hata yerine onay penceresi çıkar ("<alan> alanı boş. Böyle kaydetmek istediğinize emin misiniz?"). Onaylanınca: banka boşsa işlem yalnızca branş/kasaya, kasa boşsa yalnızca bankaya yansır. Backend'deki zorunluluk kontrolleri (create/update) kaldırıldı. Test: Backend 6/6, Frontend 3/3 (iteration_27).

### YENİ ÖZELLİK: YNS League (Öğrenci Yıldız Sistemi) ✅ (18 Eylül 2026)
- "Yeni Geliştirmeler" ekranından açılıp kapatılabilen toggle: `yns_league_enabled` (varsayılan KAPALI). Kapalıyken menüler/kartlar gizli ve tüm YNS endpoint'leri 403.
- Sadece POZİTİF yıldız; yıldız düşürme/seviye/rozet/otomatik kontrol YOK. Manuel giriş. Kayıtlar aktif dönem (season_id) + point_date/month/year ile saklanır; snapshot alanlarıyla (tanım adı/kategori/puan) geçmiş korunur (soft-delete).
- Admin: Rozetler altında "YNS League" sayfası — yıldız tanımı CRUD + aktif/pasif; Liderlik Tablosu sekmesi. Öğrenciler sayfasında "YNS League" butonu. İlk açılışta 13 varsayılan başarı otomatik seed edilir (değerler admin tarafından değiştirilebilir).
- Öğretmen: Ödev ekranında (`/teacher/students/:studentId/homework/:branchId`) "YNS League - Yıldız Ver" bölümü; Doğru Cevap türünde adet × puan; ana ekranda YNS League kartı + liderlik tablosu (`/teacher/yns-league`).
- Yetki (backend): öğretmen yalnızca kendi branşı (teacher_branches) + kendi öğrencisine (student_courses) yıldız verir; yalnızca kendi kaydını siler; admin hepsini siler. Branştan bağımsız başarılar yalnızca veren öğretmenin branş sıralamasına yazılır.
- Liderlik: toplam yıldıza göre azalan, eşit puanlar aynı derece; aylık/dönemlik görünüm; sınıf(5-8)/branş filtreleri.
- API: GET /api/system-settings/yns-league-status; GET/POST/PUT/PATCH /api/admin/student-point-definitions; GET /api/student-point-definitions (aktif); POST/DELETE /api/teacher/student-points; DELETE /api/admin/student-points/{id}; GET /api/student-points; GET /api/student-points/leaderboard.
- Test: Backend 16/16 pytest, Frontend %100 (iteration_26). Flag test sonrası KAPALI bırakıldı.

---
## Önceki Güncelleme: 14 Eylül 2026

### GÜNCELLEME: 6 Yeni Özellik ✅ (14 Eylül 2026)

**1. Öğretmen Liste Bakiyeleri (Maskeli):**
- /admin/teachers listesinde her öğretmenin net bakiyesi satırında gösterilir
- Varsayılan maskeli (••••••), tek buton (`toggle-balances-btn`) ile tümü açılır/kapanır
- Pozitif yeşil, negatif kırmızı
- API: GET /api/teacher-balances-summary (sadece admin, {teacher_id: net_bakiye})

**2. Öğretmen Adres Alanı:**
- Teacher/TeacherCreate modeline `address` eklendi
- AdminTeacherForm'da telefon altında Adres inputu
- AdminTeacherProfile'da adres gösterimi

**3. Takvim Özel Etkinlik Tipleri:**
- "Etkinlik Tanımla" butonu → ad (free-text), emoji ikon (liste + serbest + önizleme), renk, "Öğretmen görecek mi?" (Evet/Hayır)
- Özel tip event dialog dropdown'una eklenir; seçilince öğretmen seçimi + not alanları gelir
- teacher_visible=false ise öğretmen takviminde gizlenir
- API: GET/POST/PUT/DELETE /api/calendar/custom-event-types (silme: o tipte etkinlik varsa 400)
- Koleksiyon: `calendar_event_types` {key, label, icon, color, teacher_visible}

**4. Tekrarlı Etkinlik Kopyalama:**
- Kopyalama dialog'unda Tek Seferlik / Tekrarlı seçimi
- Tekrarlı: Haftalık (X hafta, seçili günler) veya Her X günde bir (bitiş tarihine kadar)
- Canlı önizleme (kaç etkinlik oluşacak); her tarih için POST /api/calendar/events

**5. YouTube Ay + Öğretmen Filtresi:**
- /admin/youtube varsayılan olarak içinde bulunulan ayı listeler
- Ay (month input) ve öğretmen filtresi + Temizle butonu; özet tutar filtreye göre güncellenir

**6. Dashboard Banka Hesapları Maskesi:**
- Banka hesabı bakiyeleri maskeli (••••••), "Göster/Gizle" butonu (`toggle-bank-balances-btn`)

Test: Backend 9/9 pytest geçti, Frontend %100 (iteration_20).

**Takip Düzeltmeleri (iteration_21):**
- YouTube "Ay" filtresi artık tıklamalı bir dropdown (yazmaya gerek yok; "Tüm Aylar" + "Eylül 2026" gibi Türkçe etiketler)
- Öğretmen takvimi: özel (öğretmene açık) etkinlik tipleri artık ikon+renk+etiketle görünüyor (önceden boş gri kutu çıkıyordu), dinamik lejant eklendi, etkinliğe tıklayınca salt-okunur detay (tarih, saat, öğretmen, not) açılıyor

**Takip Düzeltmeleri (iteration_22):**
- Admin takvim: bir günde 3'ten fazla etkinlik olduğunda "+N daha" artık tıklanabilir; o güne ait TÜM etkinlikleri listeleyen dialog açılıyor, satıra tıklayınca ilgili etkinliğin düzenleme ekranı geliyor
- Öğretmen ödev ekranı: sol paneldeki "Kitaplar" başlığı tıklanabilir; öğrencinin kütüphanesindeki tüm kitapları yüzdeleriyle (ve ortalama %) tek ekranda gösteren dialog açılıyor

**Takip Düzeltmeleri (iteration_23):**
- Öğretmen bakiyesinde ay filtresi uygulandığında kamp kazancı artık dahil (kampın created_at tarihine göre) — bakiye özeti ile kamp detayı tutarlı (admin + öğretmen)
- Admin Öğretmenler ekranı üstüne maskeli "Toplam Bakiye" kartı eklendi; aynı "Bakiyeleri Göster/Gizle" butonu hem toplamı hem tekil bakiyeleri açar/gizler
- Admin Ödemeler > para çıkışı gider kategorilerine "Vergi" eklendi (form + filtre)

### YENİ ÖZELLİK: Finansal Rapor ✅ (iteration_24)
- Muhasebe menüsü altında "Finansal Rapor" (yalnızca admin; teacher/veli 403)
- Üst özet kartları: Toplam Gelir, Toplam Gider, Net Bilanço, Öğretmen Ödemeleri, Seçili Dönem
- Filtreler (backend'e parametre): ay/tarih aralığı, kasa, branş, kategori, öğretmen, banka hesabı
- 4+ çizgi grafik: Genel + her branş (Fen/Matematik/Türkçe) — Gelir/Gider/Net her zaman açık, gider kalemleri (Öğretmen Ödemesi/Reklam/Ofis/Vergi/Sermaye/Diğer) isteğe bağlı toggle
- Aylık özet tablo; boş veri mesajı; responsive grafikler
- Tahsilat bazlı: Gelir=student_payment, Gider=gerçekleşen teacher_payment+expense (hakediş DEĞİL), transferler hariç
- API: GET /api/admin/financial-report (start_date,end_date,month,cashbox_id,branch_id,category,teacher_id,bank_account_id)
- Test: Backend 10/10 pytest, Frontend %100 (cashboxes response shape bug'ı bulundu ve düzeltildi)

**Finansal Rapor Düzeltmeleri (iteration_24):**
- Branş grafik/tablolarında gider ve öğretmen ödemeleri artık görünüyor: giderler/öğretmen ödemeleri branch_id taşımadığı için KASA→branş eşlemesi (cashbox_branch_map + effective_branch) eklendi; örn. Matematik kasasından yapılan Vergi ödemesi Matematik grafiğinde/tablosunda görünüyor
- Alt tablo tek yerine her branş (kasa) için ayrı ayrı 3 tablo olarak render ediliyor
- Test: Backend 11/11 pytest, Frontend %100

**Finansal Rapor Eklemeleri (iteration_25):**
- Varsayılan tarih aralığı artık "aktif dönem başlangıcı → bugün" (season.start_date → today); backend default böyle geliyor, frontend tarih inputları ilk yüklemede bu aralıkla doluyor (applied_start/applied_end)
- Her branş tablosunun en altına, filtreli aylardaki her kolonun (Toplam Gelir/Gider/Net + Öğretmen Ödemesi/Reklam/Ofis/Vergi/Diğer) TOPLAM değerini gösteren "TOPLAM" satırı eklendi

**Finansal Rapor - Dinamik Gider Kalemleri (iteration_26):**
- Tüm gider kalemleri (Öğretmen Ödemesi, Kira, Reklam, Ofis Gideri, Vergi, Sermaye Çıkışı, Diğer) HER ZAMAN gösteriliyor (veride 0 olsa bile) — hem grafiklerde hem filtre/toggle'da hem tablolarda. Veride bulunan özel kategoriler de sona ekleniyor.
- Backend `expense_categories` sabit tam listeyi + ekstraları döndürüyor; grafik çizgileri, tablo kolonları, toggle pill'leri ve TOPLAM satırı bundan besleniyor.

---
## Önceki Güncelleme: 8 Eylül 2026

### GÜNCELLEME: Veri Tabanı Yedekleme ve Geri Yükleme ✅ (8 Eylül 2026)

**Veri Tabanı Yedekleme:**
- Admin panelinde "Yeni Geliştirmeler" > "Veri Tabanı İşlemleri" altında
- "Yedek Al" butonu ile tüm veritabanı ZIP olarak indirilir
- Dosya formatı: `yeni-nesil-sinif-db-backup-YYYY-MM-DD-HH-mm.zip`
- ZIP içeriği: Her collection için JSON dosyası + backup_metadata.json
- Metadata: app_name, backup_version, created_at, collections, record_counts

**Veri Tabanını Geri Yükle (İki Aşamalı):**
1. **Ön İzleme Aşaması:**
   - ZIP dosyası yüklenir, analiz edilir
   - Metadata doğrulanır (app_name, backup_version kontrolü)
   - Karşılaştırma tablosu gösterilir (mevcut vs yedek kayıt sayıları)
   - Hiçbir veri değiştirilmez

2. **Geri Yükleme Aşaması:**
   - Admin "VERİ TABANINI GERİ YÜKLE" metnini yazmalı
   - **Pre-restore yedeği otomatik olarak bilgisayara indirilir** (restore başlamadan hemen önce)
   - Collection'lar yedekten geri yüklenir
   - Tamamlanınca sayfa yenileme uyarısı

**Güvenlik:**
- Sadece admin kullanabilir (backend yetki kontrolü)
- Öğretmen/veli 403 hatası alır
- Bozuk/geçersiz dosya kabul edilmez
- Restore öncesi otomatik yedek alınmadan işlem başlamaz

**API Endpoints:**
- POST /api/admin/database/backup
- POST /api/admin/database/restore/preview
- POST /api/admin/database/restore/execute

---

### GÜNCELLEME: Etkinlik Sürükleme ve Kopyalama ✅ (30 Ağustos 2026)

**Sürükle-Bırak Taşıma:**
- Etkinlik kartlarında sol tarafta sürükleme ikonu (grip handle)
- Etkinliği sürükleyip başka güne bırakarak taşıyabilirsiniz
- Hedef gün üzerine gelince mor vurgu
- Taşıma sonrası "Etkinlik taşındı" bildirimi

**Etkinlik Kopyalama:**
- Etkinlik kartlarına hover edince sağda kopyalama butonu
- Edit dialog'unda da "Kopyala" butonu (mavi)
- Kopyalama dialog'u: Etkinlik bilgileri + Hedef tarih seçici
- Kopyalama sonrası "Etkinlik kopyalandı" bildirimi

---

### GÜNCELLEME: Admin Takvim Filtreleme ✅ (29 Ağustos 2026)

**Filtre Özellikleri:**
- Hoca adına göre filtreleme (dropdown ile seçim)
- Etkinlik tipine göre filtreleme (Video Çekimi, Kamp, Canlı Yayın, Buluşma, Video Paylaşımı)
- Video statüsüne göre filtreleme (Çekilecek, Çekildi, Düzenlendi, Planlandı)
- Filtreler "VE" mantığıyla çalışır (tüm koşullar sağlanmalı)
- Aktif filtre sayısı gösterimi
- "Temizle" butonu ile tüm filtreleri sıfırlama
- Filtre seçildiğinde bilgi mesajı: "X filtre aktif - Sonuçlar "VE" mantığıyla filtreleniyor"

**Not:** Video statüsü filtresi seçildiğinde sadece Video Paylaşımı etkinlikleri gösterilir (diğer etkinlik tiplerinde statü olmadığı için).

---

### GÜNCELLEME: Etkinlik Renk Özelleştirme ✅ (29 Ağustos 2026)

**Renk Seçici Özelliği:**
- Lejant'taki etkinlik renk kutularına tıklayarak renk değiştirebilirsiniz
- Hoca renklerine de tıklayarak değiştirebilirsiniz
- 20 hazır renk paleti + özel renk seçici (color picker)
- Renkler veritabanında kalıcı olarak saklanır
- Değişiklikler anında takvime yansır

**Varsayılan Etkinlik Renkleri (artık farklı):**
- Video Çekimi: Sarı (#facc15)
- Kamp: Yeşil (#10b981) - eskiden mor, artık farklı
- Canlı Yayın: Mor (#8b5cf6)
- Buluşma: Pembe (#f472b6)

**API Endpoints:**
- GET /api/calendar/event-type-colors - Renkleri getir
- PUT /api/calendar/event-type-colors - Renkleri güncelle

---

### GÜNCELLEME: Takvim UI ve Mantık İyileştirmeleri ✅ (29 Ağustos 2026)

**1. Lejant Kompakt Hale Getirildi:**
- Üç satırlı kompakt düzen
- Satır 1: Etkinlik tipleri (Video Çekimi, V. Paylaşımı, Kamp, Canlı Yayın, Buluşma)
- Satır 2: Video statüleri (⏳ Çekilecek, 🎬 Çekildi, ✂️ Düzenlendi, ✓ Planlandı)
- Satır 3: Hoca renkleri (her hocanın renkli noktası ve adı)

**2. Statü Görselleştirmesi İyileştirildi:**
- Video paylaşımı kartlarına statü ikonu eklendi
- ⏳ Çekilecek, 🎬 Çekildi, ✂️ Düzenlendi, ✓ Planlandı
- Hover'da tam statü adı görünür

**3. Buluşma Etkinliği Özel Mantığı:**
- İsim otomatik "Buluşma" (değiştirilemez)
- Hoca seçimi gizlendi
- Backend'de tüm aktif hocalar otomatik atanır
- Dialog'da bilgi mesajı: "Buluşma etkinliği tüm hocalara otomatik olarak atanacaktır"

**4. Canlı Yayın ve Kamp Görüntüleme Formatı:**
- Takvimde: `{Saat} {Hoca Adı} - {Etkinlik Adı}` formatında
- Örnek: "20:00 Buse - Soru Çözümü" veya "14:00 İlknur - TYT Matematik"
- Kamp için "Kamp Adı" input alanı eklendi

---

### GÜNCELLEME: Takvim İyileştirmeleri ✅ (29 Ağustos 2026)

**Video Adı Alanı:**
- Video Paylaşımı etkinliğinde "Video Adı" alanı eklendi
- Takvimde video adı görünüyor (öğretmen adı yerine)

**Yeni Renk Şeması:**
- Kamp: Mor 🏕️
- Canlı Yayın: Mor 📡
- Video Çekimi: Sarı 🎬
- Buluşma: Pembe ☕ (eskiden sarıydı, artık farklı)
- Video Paylaşımı 📺:
  - Çekilecek: Beyaz border
  - Çekildi: Turuncu (eskiden sarıydı)
  - Düzenlendi: Mavi (eskiden açık yeşildi)
  - Planlandı: Yeşil

**İkonlar:**
- Her etkinlik tipine emoji ikonu eklendi
- Takvimde ve legend'da görünüyor

**Bug Fix:**
- 1 Eylül gibi ay başı etkinlikleri artık doğru ayda görünüyor
- UTC timezone sorunu düzeltildi (yerel tarih formatı kullanılıyor)

---

### YENİ ÖZELLİK: Takvim Sistemi ✅ (29 Ağustos 2026)

Kapsamlı takvim özelliği eklendi - Admin etkinlik yönetimi ve öğretmen takvim görünümü.

#### Admin Takvim (Tam Yetki)
- Sol menüde "Takvim" bağlantısı
- Ay görünümü, aylar arası geçiş
- Güne tıklayarak etkinlik ekleme
- Etkinlik tipleri:
  - **Kamp** / **Canlı Yayın**: Mor renk, saat girişi gerekli
  - **Video Çekimi** / **Buluşma**: Sarı renk
  - **Video Paylaşımı**: Öğretmen rengi, statü renkleri (çekilecek/çekildi/düzenlendi/planlandı)
- Öğretmen seçimi (renkli gösterim)
- Video paylaşımında birden fazla öğretmen seçilebilir (ortak paylaşım)
- Etkinlik düzenleme ve silme
- Tarih değiştirme

#### Öğretmen Takvim (Salt Okunur)
- Dashboard'da "Takvim" barı (Planlama Ustası altında)
- Sıradaki etkinlik gösterimi: "5 Eylül - Kamp"
- Bara tıklayınca takvim dialog'u açılır
- Sadece kendi etkinliklerini görür (Kamp, Canlı Yayın, Video Çekimi, Buluşma)
- Video Paylaşımı görünmez
- Ekleme/düzenleme/silme yapamaz

#### Renk Kuralları
- Kamp/Canlı Yayın: Mor (#8b5cf6)
- Video Çekimi/Buluşma: Sarı (#facc15)
- Video Paylaşımı statü renkleri:
  - Çekilecek: Beyaz border
  - Çekildi: Sarı arka plan
  - Düzenlendi: Açık yeşil
  - Planlandı: Yeşil
- Öğretmen renkleri: Sistem tarafından otomatik atanır

#### Veritabanı
- `calendar_events` koleksiyonu
- `teachers.color` field'ı (otomatik atanan)

---

### YENİ ÖZELLİK: Kitap Sıralama ve Admin Grup Arama ✅ (29 Ağustos 2026)

**1. Öğrenci Kitap Sıralama**
- Öğretmen ödev takip ekranında kitap listesinin solunda yukarı/aşağı ok butonları eklendi
- Kitaplar sürükle-bırak olmadan kolayca sıralanabiliyor
- Sıralama otomatik olarak backend'e kaydediliyor

**2. Admin Grup Arama**
- Admin Gruplar sayfasına isimle arama alanı eklendi
- "Grup adına göre ara..." placeholder
- Anlık filtreleme (hem aktif hem pasif grupları filtreler)

---

### YENİ ÖZELLİK: Ünite/Konu Checkbox ve Yüzdeleri + Gün Gruplu Ödev Kontrolü ✅ (29 Ağustos 2026)

Öğretmen ödev takip ekranında kapsamlı geliştirmeler yapıldı.

#### Özellikler

**1. Ünite ve Konu Tamamlanma Yüzdeleri**
- Her ünitenin yanında %0-%100 arası tamamlanma yüzdesi gösteriliyor
- Her konunun yanında %0-%100 arası tamamlanma yüzdesi gösteriliyor
- Yüzdeler renk kodlu: %0 gri, %1-99 sarı, %100 yeşil

**2. Ünite ve Konu Checkbox'ları**
- Her ünitenin solunda tamamlama checkbox'u
- Her konunun solunda tamamlama checkbox'u
- Ünite checkbox tıklanınca: Altındaki TÜM konuların TÜM testleri tamamlandı/sıfırlandı işaretlenir
- Konu checkbox tıklanınca: Altındaki TÜM testler tamamlandı/sıfırlandı işaretlenir

**3. Gün Gruplu Ödev Kontrolü**
- Ödevler tarihe göre gruplandı (Perşembe 13, Cuma 14, vb.)
- Her günün başında gün tamamlama checkbox'u
- "Günü Tamamla" butonu (bekleyen ödev varsa)
- "Tüm Ödevi Tamamla" butonu (footer'da)

#### Test Sonuçları
- Ünite checkbox çalışıyor ✅
- Konu checkbox çalışıyor ✅
- Yüzde hesaplamaları doğru ✅
- Gün gruplama çalışıyor ✅
- Günü tamamla özelliği çalışıyor ✅

---

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

### 2026-10-15 — Duyurular (Announcements) Sistemi
- **Feature flag**: `announcements_enabled` (Yeni Geliştirmeler sayfasından aç/kapa). Kapalıyken menü, login ticker ve veli duyuruları gizlenir.
- **Admin Duyurular sayfası** (`/admin/announcements`, AdminAnnouncements.jsx): başlık, metin, başlangıç/bitiş tarihi, çoklu "Kimler Görecek" hedefi (checkbox, VEYA mantığı). CRUD + aktif/pasif rozet.
- **Hedef türleri**: individual_students, group_students, math_students, turkish_students, science_students, grade_5..8, everyone, login_only. Öğrenci branş/ders tipi `student_courses`'tan, sınıf `student.level`'dan çözülür.
- **Login ekranı**: altta sabit kayan yazı (ticker) — yalnızca `login_only` aktif duyuruları. Tıkla → tam metin popup. Public endpoint `/api/announcements/login`.
- **Veli paneli**: üstte kayan duyuru alanı (hedefe uyan aktif duyurular, deduped). İlk girişte görülmemiş duyurular otomatik popup; `announcement_views` (parent_id+announcement_id) ile tekrar açılmaz. Birden fazla → başlık listesi → tıkla → detay.
- **Collections**: `announcements`, `announcement_views`.
- **Endpoints**: admin CRUD `/api/admin/announcements`, `/api/announcements/login` (public), `/api/parent/announcements`, `/api/parent/announcements/unseen`, `POST /api/parent/announcements/{id}/seen`. Yetki + hedefleme backend'de uygulanır.
- **Test**: curl ile OR eşleşme, login_only izolasyonu, süre filtresi, idempotent seen doğrulandı. Frontend smoke (login ticker+modal, veli auto-popup+seen suppression, admin CRUD) desktop+mobil geçti.

### 2026-10-15 — Kitap Takip Listesi (Book Tracking)
- Mevcut ödev takip sistemi üzerine kurulu, **ikinci truth source YOK**. Tek kaynak: book_units/topics/tests + student_test_progress.
- **Backend** (server.py ~8264): `GET /api/homework/students/{id}/book-tracking?branch_id=` (matris özeti, tek endpoint, toplu sorgu — N+1 yok) ve `PUT .../books/{book_id}/units/{unit_id}/complete` (ünitenin tüm testlerini `completed` yapar). Yetki `_verify_student_access` ile backend'de (öğretmen sadece kendi branşındaki öğrencisi — 403 doğrulandı).
- Yüzde mevcut `/books` mantığıyla aynı (done=completed+skipped / total). Ünite yeşil = o ünitenin tüm testleri done. Kitapta olmayan ünite hücresi pasif, %'ye dahil değil.
- **Frontend**: `BookTrackingModal.jsx` (satır=kitap, kolon=ortak üniteler, yuvarlak hücreler: yeşil/beyaz/gri, sticky kitap kolonu, yatay scroll, responsive). "Takip Listesi" butonu ödev ekranı Kitaplar panelinde. Hücreye tıkla → onay → ünite tamamla → çift yönlü senkron (ödev ekranı % + ağaç progress güncellenir).
- **PDF**: `bookTrackingPdf.js` — bağımsız "PDF İndir" (landscape) + ödev PDF'inin sonuna otomatik eklenir (handlePDFExport async, aynı veri kaynağı). Mevcut ödev PDF içeriği korundu.
- **Test**: curl (tracking, complete, 80%→100% iki yönlü senkron, 403) + frontend (buton, matris, hücre tıkla tamamla, mobil, standalone PDF içeriği) geçti.

Son Test: 15 Ekim 2026
Durum: Sponsorlu paylaşıma zorunlu tarih seçimi eklendi (AdminPublishers dialog). Öğretmen kazancı share_date'in ait olduğu aya yazılıyor (backend zaten mevcut). Smoke test geçti ✅
