# ommnimarket

## Menjalankan situs dan backend

Aplikasi menggunakan Node.js bawaan tanpa dependensi npm:

```sh
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

Formulir pembelian paket website menerima email aktif pemesan, nomor WhatsApp, nama brand, email perusahaan/usaha, gambar brand (PNG/JPG/WebP, maksimal 2,5 MB), dan catatan opsional. Gambar disimpan sebagai file privat di `OOMNI_DATA_DIR/brand-uploads` dan hanya dapat diambil lewat endpoint admin terautentikasi. Pesanan disimpan bersama di backend (`developmentOrders`), status awalnya `pending`, dan hanya dapat dibaca/diperbarui melalui sesi admin. Dashboard memiliki tab **Pesanan web** dengan aksi Confirm, Cancel, dan Pending. Email diperiksa formatnya; alamat email aktif tetap perlu diisi oleh pemesan (verifikasi email/OTP belum diterapkan).

Pendaftaran langganan paket reseller top up game memiliki formulir terpisah yang hanya meminta email dan nomor WhatsApp; paket yang dipilih tersimpan sebagai konteks. Permintaan disimpan di `resellerSubscriptions`, memicu notifikasi admin, dan muncul pada tab admin **Langganan reseller**. Admin dapat membuka email atau WhatsApp pemohon dari inbox, lalu mengubah status menjadi Sudah dihubungi, Terkonfirmasi, atau Dibatalkan. Tidak ada provider pesan keluar otomatis; admin mengirim pesan dan konfirmasi secara manual.

Konsultasi website memakai formulir terpisah yang hanya meminta email dan nomor WhatsApp; layanan yang dipilih ikut disimpan sebagai konteks. Permintaan baru tersimpan di `developmentConsultations`, memicu notifikasi admin, dan muncul di dashboard pada tab **Pesanan web** dengan status Baru, Sudah dihubungi, atau Selesai. Admin menindaklanjuti secara manual lewat email atau WhatsApp; belum ada provider pesan keluar otomatis. Alur ini tidak mengubah persyaratan **Beli paket** di atas.

## Penempatan etalase kustom

Admin dapat menambahkan nama penempatan etalase sendiri dari formulir produk pada bagian **Tambah penempatan etalase** (maksimal 100 nama, 60 karakter per nama). Nama tersimpan bersama di database server, tersedia sebagai saran saat mengisi kategori produk, dan muncul sebagai filter kategori di katalog publik. Setelah nama dibuat, pilih nama tersebut di kolom **Penempatan etalase** ketika membuat atau mengedit produk.

## Customer Service

Tombol **Customer Service** di beranda membuka chatbot Gemini AI yang menjawab pertanyaan seputar katalog dan layanan ommnimarket berdasarkan data produk terkini serta panduan toko. Riwayat pertanyaan dan jawaban disimpan di `customerServiceMessages` dan tampil di inbox admin; chatbot tidak meminta email atau WhatsApp. Admin dapat menandai pertanyaan selesai atau membukanya kembali. Endpoint `POST /api/customer-service` dibatasi delapan kiriman per menit per alamat koneksi; perubahan status admin memerlukan sesi admin.

Kolom katalog menjalankan pencarian pintar secara otomatis setelah pengguna berhenti mengetik sejenak. Pengguna dapat menulis kebutuhan dan anggaran dalam Bahasa Indonesia. Server memakai Gemini jika API key tersedia, lalu memvalidasi kata kunci dan batas harga terhadap katalog aktif; bila Gemini tidak tersedia, parser lokal tetap menyaring berdasarkan istilah dan anggaran. Endpoint `POST /api/product-search` dibatasi 12 permintaan per menit, tidak menyimpan query, dan tidak mengirim data akun pelanggan ke Gemini.

Admin juga dapat memasukkan atau menghapus key melalui tab **Pengaturan AI**. Key yang dimasukkan di dashboard disimpan di file privat `OOMNI_DATA_DIR/gemini-api-key` dengan izin akses terbatas, tidak ditampilkan kembali atau dikirim ke browser pengunjung, dan tetap tersedia setelah restart selama volume data persisten dipertahankan. Untuk konfigurasi persisten, atur `GEMINI_API_KEY` sebagai secret environment di server (jangan pernah taruh API key di frontend, chat, atau Git). Model dapat diganti dengan `GEMINI_MODEL`; default-nya `gemini-3-flash-preview` (Gemini 3 Flash). Server deployment harus dapat membuat koneksi HTTPS keluar ke `generativelanguage.googleapis.com`. Jika key belum diatur, koneksi Gemini gagal, atau kuota habis, chatbot menampilkan pesan yang sesuai dan pertanyaan tetap tersimpan untuk admin.

## Konsistensi data dan pengujian

Jalankan `npm test` untuk memeriksa sinkronisasi admin, migrasi katalog, penanganan database rusak, pencarian harga, pengiriman laporan/ulasan, akun pelanggan, dan hash CSP. Pengujian memakai data sementara terpisah di `tests/.tmp/` dan tidak menghubungi layanan eksternal.

Perubahan admin dikirim bersama snapshot dasar (`baseState`). Server menggabungkan perubahan per ID agar kiriman pengunjung dan edit pada data lain tetap dipertahankan. Perubahan bersamaan pada record yang sama ditolak HTTP 409. Jika sinkronisasi gagal, ekspor cadangan perubahan yang masih terlihat sebelum memuat ulang; salinan darurat juga disimpan terpisah di browser. Tab admin versi lama perlu dimuat ulang setelah pembaruan ini.

Katalog browser lama dicadangkan sebelum bootstrap dan hanya dimigrasikan setelah autentikasi admin ke database baru yang belum diinisialisasi. Katalog yang sengaja dikosongkan tidak dipulihkan otomatis. Database lama tanpa flag `catalogInitialized` diperlakukan sebagai sumber yang sudah diinisialisasi; gunakan fitur impor cadangan jika ingin memindahkan katalog lama secara manual.

Server hanya membuat database baru jika `store.json` belum ada. File rusak atau tidak terbaca menghentikan startup; pertahankan file tersebut dan pulihkan dari cadangan, jangan menghapusnya untuk melewati pemeriksaan. Pengiriman laporan/ulasan baru dianggap berhasil setelah konfirmasi server.

Pencarian Gemini meminta JSON dengan `responseJsonSchema`, membatasi thinking ke tingkat rendah, serta menyediakan anggaran keluaran 1.024 token dan timeout 15 detik. Respons yang gagal atau timeout tetap memakai parser lokal. Backend mengabaikan bagian respons bertanda `thought` saat membaca JSON pencarian dan jawaban chatbot. Acuan: [GenerationConfig Gemini](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig) dan [penanda thought pada respons](https://ai.google.dev/gemini-api/docs/generate-content/thinking#thought-summaries).
