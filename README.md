# SLEEPMATE di Netlify

Siswa membuka link dan langsung mengisi tanpa login. Data disimpan di Netlify Blobs
lewat satu Netlify Function (`netlify/functions/api.mjs`).

## Cara deploy (tanpa command line)

Netlify drag-and-drop **tidak** menjalankan Functions, jadi gunakan salah satu cara ini:

### A. Lewat GitHub (paling mudah)
1. Buat repository GitHub baru, unggah semua isi folder ini
   (`index.html`, `netlify.toml`, `package.json`, folder `netlify/`).
2. Di Netlify: **Add new site → Import an existing project → GitHub**, pilih repo itu.
   Pengaturan build biarkan default (sudah dibaca dari `netlify.toml`).
3. Sebelum/sesudah deploy: **Site configuration → Environment variables → Add a variable**
   - Key: `ADMIN_KEY`
   - Value: kata sandi tim yang panjang dan sulit ditebak
4. **Deploys → Trigger deploy** agar kata sandi terbaca.

### B. Lewat Netlify CLI
```
npm i -g netlify-cli
netlify login
netlify deploy --prod
netlify env:set ADMIN_KEY "kata-sandi-tim-anda"
```

## Dipakai
- Siswa: bagikan link situs (mis. `https://nama-situs.netlify.app`).
- Tim: klik tombol **📊 Tim** di pojok kanan atas, masukkan `ADMIN_KEY`.
  Dashboard dan ekspor CSV hanya bisa diakses dengan kata sandi itu.

## Catatan
- Tiap siswa dikenali lewat ID acak di browser (localStorage). Jika ganti HP/browser
  atau menghapus data browser, ia mulai dari awal. Minta siswa memakai perangkat yang sama.
- Siapa pun yang tahu link bisa mengisi formulir (tidak ada login). Untuk kelas
  tertentu, sebarkan link hanya di grup kelas.
- Data siswa (usia sekolah) bersifat pribadi: jangan bagikan `ADMIN_KEY`, dan
  sampaikan tujuan serta izin pengumpulan data sesuai aturan sekolah/kampus.
