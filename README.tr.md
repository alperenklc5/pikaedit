# pikaedit-share (Türkçe özet)

[pikaedit.com](https://pikaedit.com)'daki **Dosya Paylaş** ve **URL Kısaltıcı**
araçlarının gerçek kodu; referans uygulama olarak yayımlanmıştır. Ayrıntılar,
kaynak satırları ve bilinen sınırlar için [README.md](README.md) (İngilizce).

## Nedir, ne değildir

- 33 dosya canlı sitedeki dosyalarla birebir aynıdır (API'ler, veritabanı
  katmanı, indirme takibi, hatalı şifre sınırı, zamanlı temizlik, sayfalar,
  ayarlar).
- Tam site değildir: navbar, footer, rehberler ve diğer 40+ araç çıkarıldı.
  Layout, ana sayfa, ToolLayout, ToolGuideBox, cleanup ve middleware sade
  sürümdür; her birinin başında canlı sitenin ne gösterdiğini söyleyen bir
  yorum var.

## Önemli gerçekler

- Yükleme sınırı 500 MB. Süre: 30 dk – 7 gün (yükleme bitince başlar).
- **Dosyalar diskte şifrelenmeden saklanır.** Şifre (bcrypt, maliyet 10)
  yalnızca indirmeyi kısıtlar.
- Şifreli paylaşımda şifre girilmeden yalnız `{id, has_password, limit_reached}` döner.
- Hatalı şifre sınırı: aynı IP ve aynı paylaşım için 10 dakika içinde 10 hatalı
  şifreden sonra 429 + `Retry-After`. Doğru şifre sayacı sıfırlar; şifresiz
  istek (401) sayılmaz; indirme hakkı harcanmaz.
- İndirme limiti 1–100; yarıda kesilen indirmenin hakkı iade edilir, dosya
  silinmez. Son hak tam bitince dosya silinir.
- Süresi dolan paylaşım/link hemen reddedilir; veriler 5 dakikada bir çalışan
  temizlikte silinir.
- Uygulama IP adresini yalnızca bellekteki hız sınırları için kullanır;
  veritabanına ve kendi loglarına yazmaz. `X-Real-IP`, yoksa
  `X-Forwarded-For`'un son değeri. Önündeki reverse proxy'nin logları (ör. nginx
  erişim günlüğü) ayrıdır ve genellikle IP kaydeder; onları ayrıca yapılandırın.
- Uygulamanın kendi log satırlarında IP, ID, dosya adı veya yol yok; yalnız hata
  kodu. Next.js ve reverse proxy kendi loglarını ayrıca tutar.
- `/go/<kod>` 307 ve `Cache-Control: no-store` ile yönlendirir.
- Next.js görsel optimizasyonu kapalı (`images.unoptimized`); `/_next/image` 404 döner.

## Çalıştırma

Node.js 20 veya üstü. Test edilen sürümler: Node 20.20.2 (production) ve
24.14.1 (geliştirme).

```bash
npm ci
cp .env.example .env.local   # NEXT_PUBLIC_BASE_URL ayarlayın
npm run build
npm start
```

Tek süreç olarak çalıştırın (pm2 fork modu); hız sınırları, hatalı şifre
sayacı ve süren indirmeler bellekte tutulur. Reverse proxy `X-Real-IP`
başlığını ayarlamalı ve uygulamaya doğrudan erişim olmamalı.

## Güvenlik

Açıklar için GitHub'ın özel güvenlik bildirimi (Security → Report a
vulnerability) veya contact@pikaedit.com.

- `next@14.2.35` için hâlâ açık olan advisory'ler ve bu koda etkileri README.md'de.
- `next-intl@3.26.5` open redirect (GHSA-8f24): yalnız `localePrefix: "as-needed"`
  ile oluşuyor; bu kod `"always"` kullanıyor ve 20 yönlendirme denemesinin
  hiçbiri başka bir alan adına gitmedi. 3.x'te `"always"` olarak kalmalı.

## Lisans

MIT — bkz. [LICENSE](LICENSE). Üçüncü taraf lisanslar:
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
