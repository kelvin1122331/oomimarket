# ommnimarket

## Menjalankan situs dan backend

Aplikasi memakai Node.js 24 atau lebih baru. Instal dependensi GeoIP lokal sebelum menjalankan server:

```sh
npm ci
npm start
```

Buka `http://localhost:4173`. Backend menyediakan katalog publik, penyimpanan bersama untuk produk/laporan/ulasan/riwayat, akun pelanggan, notifikasi admin, dan pencatatan analitik. Data toko ditulis secara atomik ke `.data/store.json`, sedangkan kredensial pelanggan berada di `.data/accounts.json` (folder `.data` diabaikan Git).

- `PORT` mengubah port server (default `4173`).
- `OOMNI_DATA_DIR` dapat diarahkan ke folder volume persisten saat deployment.
- Login admin server memverifikasi kredensial admin yang sudah dipakai aplikasi dan menggunakan cookie sesi HTTP-only.
- Saat login admin pertama pada backend kosong, data browser yang ada akan dimigrasikan ke database server.

Untuk penggunaan lintas pengguna/perangkat di produksi, deploy server pada host bersama dengan volume penyimpanan persisten dan HTTPS. File JSON ini adalah database ringan satu proses; untuk trafik besar atau beberapa instance, pindahkan penyimpanan ke SQLite/PostgreSQL. Akun pelanggan disimpan bersama di `.data/accounts.json` dengan hash kata sandi PBKDF2 dan salt unik; file akun dibatasi ke permission privat. Cookie sesi akun bersifat HttpOnly dan sesi aktif akan meminta login ulang setelah server restart. Akun lama yang masih tersimpan di browser dicoba migrasikan otomatis saat situs dibuka. Keranjang dan klaim pembelian masih tersimpan per browser; verifikasi transaksi Shopee belum terintegrasi. Backup volume `.data` secara berkala agar akun tetap tersedia jika server atau disk bermasalah.

## Pengamanan deployment

Backend menerapkan batas ukuran JSON, validasi dasar state, rate limit untuk login/ulasan/laporan/analitik, cookie admin `HttpOnly; SameSite=Strict` (dan `Secure` di HTTPS), pemeriksaan same-origin untuk aksi admin, serta header keamanan. Rate limit disimpan di memori proses dan hanya efektif per instance; letakkan layanan di balik reverse proxy/WAF dengan pembatasan request dan HTTPS.

**Jangan gunakan kredensial bawaan untuk produksi.** Saat `NODE_ENV=production`, server menolak berjalan kecuali variabel berikut disetel melalui pengelola secret platform:

- `OOMNI_ADMIN_USERNAME`
- `OOMNI_ADMIN_SALT` — salt acak 16 byte dalam hex
- `OOMNI_ADMIN_PASSWORD_HASH` — PBKDF2-HMAC-SHA256, 600.000 iterasi, 32 byte dalam hex, dengan salt di atas

Buat salt dan hash secara lokal dengan Node.js (ganti `PASSWORD_KUAT` secara lokal; jangan tempelkan password ke chat atau commit hasilnya):

```sh
node -e "const c=require('node:crypto');const s=c.randomBytes(16).toString('hex');console.log('OOMNI_ADMIN_SALT='+s);console.log('OOMNI_ADMIN_PASSWORD_HASH='+c.pbkdf2Sync(process.argv[1],Buffer.from(s,'hex'),600000,32,'sha256').toString('hex'))" 'PASSWORD_KUAT'
```

Simpan nilai tersebut di secret manager deployment, bukan file `.env` yang di-commit. Gunakan HTTPS, firewall/proxy tepercaya, backup terlindungi, pembaruan runtime, dan volume data privat. Ini adalah hardening baseline, bukan jaminan kebal serangan; JSON store satu proses belum memiliki audit log tahan perubahan atau mitigasi rate-limit lintas instance.

## Pesanan layanan website

Formulir pembelian paket website menerima email aktif pemesan, nomor WhatsApp, nama brand, email perusahaan/usaha, gambar brand (PNG/JPG/WebP, maksimal 2,5 MB), dan catatan opsional. Gambar disimpan sebagai file privat di `OOMNI_DATA_DIR/brand-uploads` dan hanya dapat diambil lewat endpoint admin terautentikasi. Pesanan disimpan bersama di backend (`developmentOrders`), status awalnya `pending`, dan hanya dapat dibaca/diperbarui melalui sesi admin. Dashboard memiliki halaman **Pesanan website** dengan aksi Confirm, Cancel, dan Pending. Email diperiksa formatnya; alamat email aktif tetap perlu diisi oleh pemesan (verifikasi email/OTP belum diterapkan).

Pendaftaran langganan paket reseller top up game memiliki formulir terpisah yang hanya meminta email dan nomor WhatsApp; paket yang dipilih tersimpan sebagai konteks. Permintaan disimpan di `resellerSubscriptions`, memicu notifikasi admin, dan muncul pada halaman admin **Langganan reseller**. Admin dapat membuka email atau WhatsApp pemohon dari inbox, lalu mengubah status menjadi Sudah dihubungi, Terkonfirmasi, atau Dibatalkan. Tidak ada provider pesan keluar otomatis; admin mengirim pesan dan konfirmasi secara manual.

Konsultasi website memakai formulir terpisah yang hanya meminta email dan nomor WhatsApp; layanan yang dipilih ikut disimpan sebagai konteks. Permintaan baru tersimpan di `developmentConsultations`, memicu notifikasi admin, dan muncul di dashboard pada halaman **Konsultasi** dengan status Baru, Sudah dihubungi, atau Selesai. Admin menindaklanjuti secara manual lewat email atau WhatsApp; belum ada provider pesan keluar otomatis. Alur ini tidak mengubah persyaratan **Beli paket** di atas.

## Penempatan etalase kustom

Admin dapat menambahkan nama penempatan etalase sendiri dari formulir produk pada bagian **Tambah penempatan etalase** (maksimal 100 nama, 60 karakter per nama). Nama tersimpan bersama di database server, tersedia sebagai saran saat mengisi kategori produk, dan muncul sebagai filter kategori di katalog publik. Setelah nama dibuat, pilih nama tersebut di kolom **Penempatan etalase** ketika membuat atau mengedit produk.

## Customer Service

Tombol **Customer Service** di beranda membuka chatbot Gemini AI yang menjawab pertanyaan seputar katalog dan layanan ommnimarket berdasarkan data produk terkini serta panduan toko. Riwayat pertanyaan dan jawaban disimpan di `customerServiceMessages` dan tampil di inbox admin; chatbot tidak meminta email atau WhatsApp. Admin dapat menandai pertanyaan selesai atau membukanya kembali. Endpoint `POST /api/customer-service` dibatasi delapan kiriman per menit per alamat koneksi; perubahan status admin memerlukan sesi admin.

Kolom katalog menjalankan pencarian pintar secara otomatis setelah pengguna berhenti mengetik sejenak. Pengguna dapat menulis kebutuhan dan anggaran dalam Bahasa Indonesia. Server memakai Gemini jika API key tersedia, lalu memvalidasi kata kunci dan batas harga terhadap katalog aktif; bila Gemini tidak tersedia, parser lokal tetap menyaring berdasarkan istilah dan anggaran. Endpoint `POST /api/product-search` dibatasi 12 permintaan per menit, tidak menyimpan query, dan tidak mengirim data akun pelanggan ke Gemini.

Admin juga dapat memasukkan atau menghapus key melalui halaman **Pengaturan AI**. Key yang dimasukkan di dashboard disimpan di file privat `OOMNI_DATA_DIR/gemini-api-key` dengan izin akses terbatas, tidak ditampilkan kembali atau dikirim ke browser pengunjung, dan tetap tersedia setelah restart selama volume data persisten dipertahankan. Untuk konfigurasi persisten, atur `GEMINI_API_KEY` sebagai secret environment di server (jangan pernah taruh API key di frontend, chat, atau Git). Model dapat diganti dengan `GEMINI_MODEL`; default-nya `gemini-3-flash-preview` (Gemini 3 Flash). Server deployment harus dapat membuat koneksi HTTPS keluar ke `generativelanguage.googleapis.com`. Jika key belum diatur, koneksi Gemini gagal, atau kuota habis, chatbot menampilkan pesan yang sesuai dan pertanyaan tetap tersimpan untuk admin.

## Konsistensi data dan pengujian

Jalankan `npm test` untuk memeriksa sinkronisasi admin, migrasi katalog, penanganan database rusak, pencarian harga, pengiriman laporan/ulasan, akun pelanggan, dan hash CSP. Pengujian memakai data sementara terpisah di `tests/.tmp/` dan tidak menghubungi layanan eksternal.

Perubahan admin dikirim bersama snapshot dasar (`baseState`). Server menggabungkan perubahan per ID agar kiriman pengunjung dan edit pada data lain tetap dipertahankan. Perubahan bersamaan pada record yang sama ditolak HTTP 409. Jika sinkronisasi gagal, ekspor cadangan perubahan yang masih terlihat sebelum memuat ulang; salinan darurat juga disimpan terpisah di browser. Tab admin versi lama perlu dimuat ulang setelah pembaruan ini.

Katalog browser lama dicadangkan sebelum bootstrap dan hanya dimigrasikan setelah autentikasi admin ke database baru yang belum diinisialisasi. Katalog yang sengaja dikosongkan tidak dipulihkan otomatis. Database lama tanpa flag `catalogInitialized` diperlakukan sebagai sumber yang sudah diinisialisasi; gunakan fitur impor cadangan jika ingin memindahkan katalog lama secara manual.

Server hanya membuat database baru jika `store.json` belum ada. File rusak atau tidak terbaca menghentikan startup; pertahankan file tersebut dan pulihkan dari cadangan, jangan menghapusnya untuk melewati pemeriksaan. Pengiriman laporan/ulasan baru dianggap berhasil setelah konfirmasi server.

Pencarian Gemini meminta JSON dengan `responseJsonSchema`, membatasi thinking ke tingkat rendah, serta menyediakan anggaran keluaran 1.024 token dan timeout 15 detik. Respons yang gagal atau timeout tetap memakai parser lokal. Backend mengabaikan bagian respons bertanda `thought` saat membaca JSON pencarian dan jawaban chatbot. Acuan: [GenerationConfig Gemini](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig) dan [penanda thought pada respons](https://ai.google.dev/gemini-api/docs/generate-content/thinking#thought-summaries).

## Workspace admin

Aktivitas login sekarang dicatat server untuk admin dan pelanggan yang berhasil masuk, termasuk login pertama setelah pendaftaran. Halaman **Aktivitas login** menampilkan nama akun/jenis akun, merek dan model perangkat bila dilaporkan browser, browser/OS, waktu server lengkap dalam WIB, serta perkiraan kota/negara dari IP. Merek komputer Windows tidak selalu tersedia; antarmuka menampilkannya sebagai tidak dilaporkan, tanpa menebak merek. Data lama dari localStorage tetap ditampilkan sebagai **Catatan lama**, tanpa mengisi perangkat atau lokasi yang dahulu belum dicatat.

Riwayat disimpan privat dan atomik di `OOMNI_DATA_DIR/login-activity.json`, maksimal 500 login terbaru selama 90 hari. Hanya endpoint admin terautentikasi `/api/admin/login-activity` yang dapat membacanya; data ini tidak masuk katalog publik atau payload sinkronisasi produk. Password, token sesi, dan koordinat GPS tidak dicatat. Kegagalan penyimpanan riwayat tidak menggagalkan autentikasi; file rusak dipertahankan dan halaman aktivitas melaporkan ketidaktersediaan riwayat.

Lokasi dicari secara lokal memakai **geoip-lite** dengan data GeoLite dari [MaxMind](https://www.maxmind.com/); IP login tidak dikirim ke API lokasi lain. Hasil merupakan perkiraan jaringan dan dapat berbeda jika pengguna memakai VPN. Alamat privat/localhost ditandai **Jaringan lokal**. Ikuti [petunjuk geoip-lite](https://github.com/geoip-lite/node-geoip#built-in-updater) untuk memperbarui basis data GeoIP dengan lisensi MaxMind sendiri bila diperlukan.

Jika server berada di balik reverse proxy, isi `OOMNI_TRUSTED_PROXIES` dengan alamat IP proxy langsung yang benar-benar dikelola (dipisahkan koma). Secara default header `X-Forwarded-For` diabaikan. Rantai proxy diperiksa dari kanan ke kiri dan berhenti pada alamat pertama yang tidak dipercaya; jangan mengisi daftar dengan alamat klien umum. Waktu perangkat/zona waktu bukan bukti lokasi fisik. API [Client Hints](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues) hanya dipakai bila tersedia dan tidak menghalangi login bila ditolak atau lambat.

Klik satu kali teks/logo **ommnimarket** di beranda untuk membuka formulir login admin, atau buka `/admin/overview` langsung. Pintasan ini tetap memerlukan username dan password admin. Aktivasi keyboard lewat Enter juga didukung; Ctrl/Cmd+klik membuka alamat admin secara normal di tab baru.

Setiap fitur admin memiliki alamat sendiri di `/admin/`: `overview`, `products`, `product-editor`, `analytics`, `orders`, `consultations`, `reseller-subscriptions`, `customer-service`, `reviews`, `reports`, `history`, `activity`, `ai-settings`, dan `backup`. Sidebar tetap tersedia saat berpindah halaman; pada HP sidebar menjadi menu geser. Browser Back/Forward dan pemuatan langsung URL didukung. Tautan edit produk memakai `/admin/product-editor?product=ID` agar dapat dimuat ulang.

Form tambah/edit produk dipisahkan dari daftar produk. Pesanan dan konsultasi website juga mempunyai halaman terpisah. Ekspor/impor lengkap dan unduhan CSV berada di halaman Cadangan data. Pencarian fitur dapat dibuka dari ikon pencarian atau `Ctrl/Cmd+K`, dipilih dengan keyboard, dan ditutup dengan Escape. Angka ringkasan, badge inbox, status Gemini, dan grafik interaksi menggunakan data yang tersimpan tanpa angka contoh.

Perubahan tampilan dibatasi ke workspace admin melalui selector `#adminDashboard`; markup halaman pengunjung dipertahankan. Pengujian mencakup konsistensi 14 rute, pemuatan langsung, pemisahan formulir produk, dan ketetapan markup pengunjung, selain seluruh regresi backend.


## Animasi UI

Seluruh tampilan publik dan 14 halaman admin memakai CSS transitions, Web Animations API, dan satu Intersection Observer bersama tanpa dependensi animasi eksternal. Judul, kartu, gambar, serta daftar muncul bertahap; kartu baru dari render dinamis ikut terdaftar. Navigasi tetap memakai scroll browser asli, termasuk layar layanan, katalog, formulir laporan, dan admin yang mempunyai area scroll sendiri.

Hover memakai perpindahan kecil, perubahan border, dan glow sesuai warna toko. Modal dan pencarian admin mendukung transisi buka/tutup melalui transition-behavior: allow-discrete pada browser yang mendukung; browser lain tetap memakai perilaku dasar. Parallax dibatasi 10 px pada dekorasi desktop/tablet, dimatikan di HP, dan diperbarui hanya ketika ada scroll atau resize. Animasi memakai opacity, translate, dan scale; tidak ada scroll hijacking atau loop render saat halaman diam.

Mode prefers-reduced-motion dan Save-Data menonaktifkan peningkatan gerak. Perubahan preferensi saat halaman terbuka membatalkan animasi aktif. Konten tidak disembunyikan sambil menunggu observer; kegagalan observer/animasi mengembalikan tampilan dasar. Memakai kontrol langsung menghentikan animasi masuknya, dan penggantian baris inbox yang tidak berubah saat polling tidak mengulang animasi.

Jalankan npm test untuk pengujian integritas data, autentikasi, riwayat login privat, deteksi perangkat, perlindungan header proxy, retensi, waktu WIB, serta fallback animasi. Angka 60 FPS merupakan target desain, bukan hasil benchmark di semua perangkat.

## Galaksi interaktif pada intro

Intro memakai proyeksi perspektif koordinat 3D ke Canvas 2D tanpa WebGL atau pustaka eksternal. Bintang memiliki posisi x/y/z, ukuran mengikuti kedalaman, dan objek diurutkan dari jauh ke dekat. Planet bercincin dan planet biru memakai tekstur pencahayaan bola yang dibuat sekali; cincin dan kristal berputar diproyeksikan melalui kamera yang sama. Orbit, nebula, gerakan melayang, dan satu meteor berkala melengkapi adegan. Meteor dan kristal latar dinonaktifkan pada Save-Data.

Judul memakai kedalaman visual, lapisan CSS preserve-3d, serta gradasi hangat. Tombol mempunyai sisi timbul dan sorotan bergerak; navigasi memakai panel kaca. Kamera dan UI merespons mouse/sentuhan dengan kemiringan maksimal 3 derajat. Klik/tap pada latar membuat gelombang perspektif dan percikan; respons dorongan serta kemiringan kembali netral saat jari/pena dilepas atau pointer keluar. Tombol menerima input normal tanpa mengambil alih scroll maupun gestur browser. Canvas dan animasi CSS berhenti ketika intro ditutup, modal akun terbuka, atau tab tidak terlihat. Tata letak menjaga area aman perangkat dan target sentuh minimal 44 px.

Sprite cahaya dan tekstur planet dibuat sekali dan dipakai ulang, jumlah bintang dibatasi 280 pada HP dan 600 pada desktop, serta resolusi canvas dibatasi sesuai layar. Save-Data memakai 80 bintang dengan target 24 FPS; mode biasa menargetkan 60 FPS. Prefers-reduced-motion menampilkan adegan statis dan mematikan animasi CSS, termasuk saat preferensi berubah ketika halaman terbuka. Jika canvas gagal, latar CSS dan semua tombol tetap dapat digunakan. Tidak ada dependensi, aset gambar eksternal, atau permintaan jaringan baru. Pengujian mencakup perspektif dekat/jauh, batas bidang kamera, koordinat geometri hingga layar 2560×1440, interaksi, kemiringan, siklus berhenti/lanjut, fallback, batas resolusi, dan perubahan preferensi gerak.
