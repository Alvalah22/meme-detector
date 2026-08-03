import {
  FaceLandmarker, HandLandmarker, FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";

/* ================= Konfigurasi meme ================= */
const DAFTAR_MEME = ["Sonic.jpeg", "cara.jpeg", "cristiano.jpg", "gato1.jpg", "perro.jpeg", "rata.jpeg"];
const NAMA_RAMAH = {
  "Sonic.jpeg":    "Sonic.exe",
  "cara.jpeg":     "Emoji Pasrah",
  "cristiano.jpg": "Ronaldo Gigit Jari",
  "gato1.jpg":     "Kucing Lidah",
  "perro.jpeg":    "Anjing Skeptis",
  "rata.jpeg":     "Hamster Oke",
};
const DESKRIPSI_GESTUR = [
  ["2 tangan terbuka di sisi wajah", "Emoji Pasrah"],
  ["Jari nempel di mulut", "Ronaldo Gigit Jari"],
  ["Mulut terbuka + lidah turun", "Kucing Lidah"],
  ["Alis terangkat / berkerut", "Anjing Skeptis"],
  ["Tangan bentuk V (telunjuk + tengah)", "Hamster Oke"],
  ["2 tangan terbuka di atas kepala", "Sonic.exe"],
];

const GAMBAR = {};
function muatSemuaGambar(){
  return Promise.all(DAFTAR_MEME.map(nama => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve(); // tetap lanjut walau satu gambar gagal
    img.src = `assets/${nama}`;
    GAMBAR[nama] = img;
  })));
}

/* ================= Util geometri (sama seperti versi desktop) ================= */
function jarak(a, b){
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
}
function skala(lm){ return jarak(lm[152], lm[10]) + 1e-6; }
function px(pt, W, H){ return [pt.x*W, pt.y*H]; }

function statusJari(lm, kiri){
  const tip = [8,12,16,20];
  const midJ = [6,10,14,18];
  const pergelangan = lm[0];
  const out = [ (kiri ? lm[4].x > lm[3].x : lm[4].x < lm[3].x) ? 1 : 0 ];
  for(let i=0;i<tip.length;i++){
    // Bandingkan jarak ujung jari & buku tengah terhadap pergelangan tangan (3D),
    // bukan cuma koordinat Y. Ini jauh lebih tahan saat tangan dimiringkan --
    // termasuk pose "V" yang biasa dipegang miring di depan wajah -- karena
    // cek berbasis Y gampang salah baca saat jari tidak benar-benar mengarah lurus ke atas.
    const jarakTip = jarak(lm[tip[i]], pergelangan);
    const jarakMid = jarak(lm[midJ[i]], pergelangan);
    out.push(jarakTip > jarakMid ? 1 : 0);
  }
  return out;
}

/* ================= Kalibrasi (persis logika versi Python) ================= */
class Kalibrasi{
  constructor(){
    this.N = 45;
    this.buf = { alis_kiri:[], alis_kanan:[], alis_tengah:[], bibir_buka:[], lidah_bawah:[], alis_kiri_y:[], alis_kanan_y:[], jarak_alis:[] };
    this.selesai = false;
    this.thr = {
      alis_kiri:0.180, alis_kanan:0.180, alis_tengah_lo:0.185,
      bibir_buka:0.055, lidah_bawah:0.145,
      alis_kiri_y_lo:0.30, alis_kanan_y_lo:0.30,
      jarak_alis_lo:0.10
    };
  }
  masukkan(lm){
    if(this.selesai) return;
    const s = skala(lm);
    this.buf.alis_kiri.push(jarak(lm[52], lm[159]) / s);
    this.buf.alis_kanan.push(jarak(lm[282], lm[386]) / s);
    this.buf.alis_tengah.push(jarak(lm[55], lm[285]) / s);
    this.buf.bibir_buka.push(jarak(lm[13], lm[14]) / s);
    this.buf.lidah_bawah.push(jarak(lm[17], lm[152]) / s);
    this.buf.alis_kiri_y.push(lm[55].y - lm[9].y);
    this.buf.alis_kanan_y.push(lm[285].y - lm[9].y);
    this.buf.jarak_alis.push(Math.abs(lm[55].x - lm[285].x));
    if(this.buf.alis_kiri.length >= this.N) this._hitung();
  }
  _hitung(){
    const median = arr => {
      const s = [...arr].sort((a,b)=>a-b);
      const m = Math.floor(s.length/2);
      return s.length % 2 ? s[m] : (s[m-1]+s[m]) / 2;
    };
    const std = arr => {
      const m = arr.reduce((a,b)=>a+b,0) / arr.length;
      const v = arr.reduce((a,b)=>a+(b-m)**2,0) / arr.length;
      return Math.sqrt(v);
    };
    const marginKecil = k => Math.max(1.5*std(this.buf[k]), 0.015);
    const marginBesar = (k,mn) => Math.max(3*std(this.buf[k]), mn);
    this.thr.alis_kiri       = median(this.buf.alis_kiri)   + marginKecil('alis_kiri');
    this.thr.alis_kanan      = median(this.buf.alis_kanan)  + marginKecil('alis_kanan');
    this.thr.alis_tengah_lo  = median(this.buf.alis_tengah) - marginKecil('alis_tengah');
    this.thr.bibir_buka      = median(this.buf.bibir_buka)  + marginBesar('bibir_buka', 0.032);
    this.thr.lidah_bawah     = median(this.buf.lidah_bawah) - marginBesar('lidah_bawah', 0.018);
    this.thr.alis_kiri_y_lo  = median(this.buf.alis_kiri_y)  + marginKecil('alis_kiri_y');
    this.thr.alis_kanan_y_lo = median(this.buf.alis_kanan_y) + marginKecil('alis_kanan_y');
    this.thr.jarak_alis_lo   = median(this.buf.jarak_alis)   - marginKecil('jarak_alis');
    this.selesai = true;
  }
  get progres(){ return Math.min(this.buf.alis_kiri.length / this.N, 1.0); }
}

/* ================= Sistem keyakinan / hysteresis (pengganti voting sederhana) ================= */
class DeteksiState{
  constructor(decay=0.82, gain=0.38, ambangNyala=0.62, ambangMati=0.28){
    this.conf = {};
    this.aktif = null;
    this.decay = decay; this.gain = gain; this.on = ambangNyala; this.off = ambangMati;
  }
  reset(){ this.conf = {}; this.aktif = null; }
  update(label){
    for(const k of Object.keys(this.conf)){
      this.conf[k] *= this.decay;
      if(this.conf[k] < 0.01) delete this.conf[k];
    }
    if(label){ this.conf[label] = Math.min(1.0, (this.conf[label]||0) + this.gain); }
    if(this.aktif && (this.conf[this.aktif]||0) < this.off){ this.aktif = null; }

    const entries = Object.entries(this.conf);
    if(entries.length){
      let [labelTop, nilaiTop] = entries[0];
      for(const [k,v] of entries){ if(v > nilaiTop){ labelTop = k; nilaiTop = v; } }
      if(nilaiTop >= this.on && labelTop !== this.aktif) this.aktif = labelTop;
    }
    const keyakinan = this.aktif ? (this.conf[this.aktif]||0)
      : (entries.length ? Math.max(...entries.map(e=>e[1])) : 0);
    return [this.aktif, keyakinan];
  }
}

/* ================= Fungsi deteksi gestur (identik dengan versi Python) ================= */
function deteksiLidah(lm, kal){
  const s = skala(lm);
  const mulutTerbuka = jarak(lm[13], lm[14]) / s > kal.thr.bibir_buka;
  const lidahTurun   = jarak(lm[17], lm[152]) / s < kal.thr.lidah_bawah;
  const ujungKeluar  = lm[17].y > lm[14].y + 0.012;
  return mulutTerbuka && lidahTurun && ujungKeluar;
}
function deteksiAlis(lm, kal){
  const s = skala(lm);
  const alisKiri   = jarak(lm[52], lm[159]) / s;
  const alisKanan  = jarak(lm[282], lm[386]) / s;
  const alisTengah = jarak(lm[55], lm[285]) / s;
  const alisKiriY  = lm[55].y - lm[9].y;
  const alisKananY = lm[285].y - lm[9].y;
  const jarakAlis  = Math.abs(lm[55].x - lm[285].x);
  return (
    alisKiri   > kal.thr.alis_kiri       ||
    alisKanan  > kal.thr.alis_kanan      ||
    alisTengah < kal.thr.alis_tengah_lo  ||
    alisKiriY  > kal.thr.alis_kiri_y_lo  ||
    alisKananY > kal.thr.alis_kanan_y_lo ||
    jarakAlis  < kal.thr.jarak_alis_lo
  );
}
function deteksiCristiano(tangan, lmWajah){
  const mulut = lmWajah[13];
  return tangan.some(({lm}) => jarak(lm[8], mulut) < 0.09 || jarak(lm[12], mulut) < 0.09);
}
function deteksiTikus(jari){
  // jari = [ibuJari, telunjuk, tengah, manis, kelingking]
  // Sebelumnya ini mencocokkan seluruh array persis "0,1,1,0,0", artinya kalau
  // ibu jari sedikit saja terbaca "keluar" (hal yang wajar saat bikin tanda V),
  // gesturenya gagal terdeteksi total. Sekarang ibu jari diabaikan -- yang
  // penting cuma telunjuk & tengah lurus, manis & kelingking terlipat.
  const [, telunjuk, tengah, manis, kelingking] = jari;
  return telunjuk === 1 && tengah === 1 && manis === 0 && kelingking === 0;
}
function deteksiSonic(tangan, lmWajah){
  if(tangan.length !== 2) return false;
  const hidungY = lmWajah[1].y;
  return tangan.every(({lm}) => lm[9].y < hidungY);
}
function deteksiWajah(tangan){
  if(tangan.length !== 2) return false;
  for(const {jari, lm} of tangan){
    if(jari.slice(1).join(',') !== "1,1,1,1" || lm[0].y < 0.50) return false;
  }
  return Math.abs(tangan[0].lm[0].x - tangan[1].lm[0].x) >= 0.20;
}

/* ================= Data indeks landmark untuk gambar overlay ================= */
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const EYE_L  = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7,33];
const EYE_R  = [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382,362];
const BROW_L = [70,63,105,66,107,55,65,52,53,46];
const BROW_R = [300,293,334,296,336,285,295,282,283,276];
const LIPS_OUT = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const LIPS_IN  = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191,78];
const NOSE = [168,6,197,195,5,4,1,19,94,2];
const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],[9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],[5,9],[9,13],[13,17]];

function gambarJalur(ctx, lm, indeks, W, H, warna, tutup=false){
  ctx.strokeStyle = warna; ctx.fillStyle = warna; ctx.lineWidth = 1;
  ctx.beginPath();
  const pts = indeks.map(i => px(lm[i], W, H));
  pts.forEach(([x,y], j) => { if(j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  if(tutup && pts.length>1) ctx.lineTo(pts[0][0], pts[0][1]);
  ctx.stroke();
  pts.forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x,y,1,0,Math.PI*2); ctx.fill(); });
}

function gambarWajahMinimal(ctx, lm, W, H, kal){
  const s = skala(lm);
  const alisKiri = jarak(lm[52], lm[159]) / s;
  const alisKanan = jarak(lm[282], lm[386]) / s;
  const alisTengah = jarak(lm[55], lm[285]) / s;
  const mulutAktif = (jarak(lm[13], lm[14]) / s > kal.thr.bibir_buka) && (jarak(lm[17], lm[152]) / s < kal.thr.lidah_bawah);
  const alisAktif = alisKiri > kal.thr.alis_kiri || alisKanan > kal.thr.alis_kanan || alisTengah < kal.thr.alis_tengah_lo;

  const DASAR = 'rgb(90,150,155)';
  const AKTIF = 'rgb(111,191,155)';
  const warnaAlis = alisAktif ? AKTIF : DASAR;
  const warnaMulut = mulutAktif ? AKTIF : DASAR;

  gambarJalur(ctx, lm, FACE_OVAL, W, H, DASAR, false);
  gambarJalur(ctx, lm, EYE_L, W, H, DASAR, true);
  gambarJalur(ctx, lm, EYE_R, W, H, DASAR, true);
  gambarJalur(ctx, lm, BROW_L, W, H, warnaAlis);
  gambarJalur(ctx, lm, BROW_R, W, H, warnaAlis);
  gambarJalur(ctx, lm, NOSE, W, H, DASAR);
  gambarJalur(ctx, lm, LIPS_OUT, W, H, warnaMulut, true);
  gambarJalur(ctx, lm, LIPS_IN, W, H, warnaMulut, true);
}

function gambarTanganMinimal(ctx, lm, W, H, jari){
  const WARNA = 'rgb(90,150,155)';
  ctx.strokeStyle = WARNA; ctx.fillStyle = WARNA; ctx.lineWidth = 1;
  HAND_CONNECTIONS.forEach(([a,b]) => {
    const [x1,y1] = px(lm[a],W,H), [x2,y2] = px(lm[b],W,H);
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  });
  for(let i=0;i<21;i++){
    const [x,y] = px(lm[i],W,H);
    ctx.fillStyle = WARNA;
    ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill();
  }
  [4,8,12,16,20].forEach((tip,i) => {
    if(jari[i]){
      const [x,y] = px(lm[tip],W,H);
      ctx.fillStyle = 'rgb(111,191,155)';
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    }
  });
}

/* ================= HUD (bar pil, fps, label) ================= */
function roundRectPath(ctx,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function gambarBarPil(ctx, x1,y1,x2,y2, warnaLatar, warnaIsi, rasio){
  const r = Math.max(1, (y2-y1)/2);
  rasio = Math.max(0, Math.min(1, rasio));
  ctx.fillStyle = warnaLatar;
  roundRectPath(ctx, x1, y1, x2-x1, y2-y1, r); ctx.fill();
  const lebarIsi = Math.max(0, (x2-x1) * rasio);
  if(lebarIsi > 0){
    ctx.fillStyle = warnaIsi;
    roundRectPath(ctx, x1, y1, Math.max(lebarIsi, r*2*Math.min(1,rasio*4)), y2-y1, r); ctx.fill();
  }
}

function gambarHud(ctx, W, H, {gambarAktif, keyakinan, fps, infoTangan}){
  const nama = gambarAktif ? (NAMA_RAMAH[gambarAktif] || gambarAktif) : 'Netral';
  const warna = gambarAktif ? 'rgb(111,191,155)' : 'rgb(150,158,155)';
  const lebarPanel = Math.min(W-16, Math.max(220, 26 + nama.length*12));

  ctx.fillStyle = 'rgba(6,8,9,0.55)';
  roundRectPath(ctx, 8,8, lebarPanel, 78, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  roundRectPath(ctx, 8,8, lebarPanel, 78, 6); ctx.stroke();

  ctx.fillStyle = warna;
  ctx.font = '600 19px "Plus Jakarta Sans", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(nama, 18, 34);

  gambarBarPil(ctx, 18, 46, 18+lebarPanel-20, 58, 'rgba(255,255,255,0.12)',
    keyakinan >= 0.62 ? 'rgb(111,191,155)' : 'rgb(122,147,168)', keyakinan);

  ctx.fillStyle = 'rgb(150,160,162)';
  ctx.font = '400 12px "JetBrains Mono", monospace';
  ctx.fillText(`FPS ${fps.toFixed(1)}`, 18, 76);

  infoTangan.forEach(([sisi, jari], i) => {
    const teks = `${sisi} ${jari.join('')}`;
    ctx.font = '400 12px "JetBrains Mono", monospace';
    const w = ctx.measureText(teks).width;
    ctx.fillStyle = 'rgb(150,160,162)';
    ctx.fillText(teks, W-w-14, 24+18*i);
  });
}

/* ================= Elemen DOM ================= */
const gerbang       = document.getElementById('gerbang');
const btnMulai       = document.getElementById('btnMulai');
const statusGerbang  = document.getElementById('statusGerbang');
const panelUtama     = document.getElementById('panelUtama');
const footerEl       = document.getElementById('footer');
const video          = document.getElementById('videoKamera');
const kanvasKamera   = document.getElementById('kanvasKamera');
const kanvasMeme     = document.getElementById('kanvasMeme');
const fpsLabel       = document.getElementById('fpsLabel');
const titikStatus    = document.getElementById('titikStatus');
const btnKalibrasi   = document.getElementById('btnKalibrasi');
const btnBantuan     = document.getElementById('btnBantuan');
const btnGantiKamera = document.getElementById('btnGantiKamera');
const btnMatikan     = document.getElementById('btnMatikan');
const btnDebug       = document.getElementById('btnDebug');
const panelDebug     = document.getElementById('panelDebug');
const modalBantuan   = document.getElementById('modalBantuan');
const tutupBantuan   = document.getElementById('tutupBantuan');
const daftarGestur   = document.getElementById('daftarGestur');

DESKRIPSI_GESTUR.forEach(([gestur, target]) => {
  const li = document.createElement('li');
  li.innerHTML = `${gestur} <br><b>-> ${target}</b>`;
  daftarGestur.appendChild(li);
});

const ctxKamera = kanvasKamera.getContext('2d');
const ctxMeme   = kanvasMeme.getContext('2d');

const flipCanvas = document.createElement('canvas');
const flipCtx = flipCanvas.getContext('2d', { willReadFrequently: true });

const prevCanvas = document.createElement('canvas');
const prevCtx = prevCanvas.getContext('2d');

/* ================= State global ================= */
let faceLandmarker = null;
let handLandmarker = null;
let kal = new Kalibrasi();
let deteksiState = new DeteksiState(0.82, 0.42, 0.55, 0.25);
let tampilkanBantuan = false;
let tampilkanDebug = false;
let fps = 0, lastT = performance.now();
let targetSebelumnya = null;
let progresTransisi = 1.0;
const LANGKAH_TRANSISI = 0.16;
let facingMode = 'user';
let stream = null;
let siap = false;

/* ================= Inisialisasi model ================= */
async function muatModel(){
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU"
    },
    outputFaceBlendshapes: false,
    runningMode: "VIDEO",
    numFaces: 1
  });
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });
}

async function mulaiKamera(mode){
  if(stream){ stream.getTracks().forEach(t => t.stop()); }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  await new Promise(resolve => {
    if(video.readyState >= 2) return resolve();
    video.onloadedmetadata = () => resolve();
  });
  const W = video.videoWidth, H = video.videoHeight;
  kanvasKamera.width = W; kanvasKamera.height = H;
  kanvasMeme.width = W; kanvasMeme.height = H;
  flipCanvas.width = W; flipCanvas.height = H;
  prevCanvas.width = W; prevCanvas.height = H;
}

/* ================= Loop utama ================= */
function gambarTujuanMeme(ctx, W, H, target){
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,W,H);
  const img = target ? GAMBAR[target] : null;
  if(img && img.complete && img.naturalWidth > 0){
    ctx.drawImage(img, 0, 0, W, H);
  } else if(target){
    ctx.fillStyle = 'rgb(255,107,107)';
    ctx.font = '400 14px "JetBrains Mono", monospace';
    ctx.fillText(`Gambar tidak ditemukan: ${target}`, 16, H-16);
  }
}

function perbaruiPanelMeme(target){
  const W = kanvasMeme.width, H = kanvasMeme.height;
  if(target !== targetSebelumnya){
    prevCtx.clearRect(0,0,W,H);
    prevCtx.drawImage(kanvasMeme, 0, 0);
    targetSebelumnya = target;
    progresTransisi = 0;
  }
  if(progresTransisi < 1){
    progresTransisi = Math.min(1, progresTransisi + LANGKAH_TRANSISI);
    gambarTujuanMeme(ctxMeme, W, H, target);
    ctxMeme.globalAlpha = 1 - progresTransisi;
    ctxMeme.drawImage(prevCanvas, 0, 0);
    ctxMeme.globalAlpha = 1;
  } else {
    gambarTujuanMeme(ctxMeme, W, H, target);
  }
}

function tandaiAktif(aktif){
  titikStatus.classList.toggle('aktif', !!aktif);
}

function loop(){
  if(!siap) return; // dimatikan lewat tombol Matikan -- stop total, tidak dijadwalkan lagi
  requestAnimationFrame(loop);
  if(video.readyState < 2) return;

  const W = kanvasKamera.width, H = kanvasKamera.height;
  if(W === 0 || H === 0) return;

  flipCtx.save();
  flipCtx.scale(-1,1);
  flipCtx.drawImage(video, -W, 0, W, H);
  flipCtx.restore();

  const now = performance.now();
  const faceResult = faceLandmarker.detectForVideo(flipCanvas, now);
  const handResult = handLandmarker.detectForVideo(flipCanvas, now);

  const dt = Math.max(1e-6, (now - lastT) / 1000);
  lastT = now;
  fps = fps > 0 ? (0.9*fps + 0.1*(1/dt)) : (1/dt);

  ctxKamera.drawImage(flipCanvas, 0, 0, W, H);

  if(!kal.selesai){
    ctxKamera.fillStyle = 'rgba(6,8,9,0.55)';
    ctxKamera.fillRect(0,0,W,H);
    ctxKamera.fillStyle = 'rgb(220,224,225)';
    ctxKamera.font = '600 20px "Plus Jakarta Sans", sans-serif';
    ctxKamera.textAlign = 'center';
    ctxKamera.fillText('Lihat ke depan, wajah netral', W/2, H/2-30);

    const persen = kal.progres;
    gambarBarPil(ctxKamera, W/2-140, H/2+8, W/2+140, H/2+26, 'rgba(255,255,255,0.12)', 'rgb(122,147,168)', persen);

    ctxKamera.font = '400 15px "JetBrains Mono", monospace';
    ctxKamera.fillText(`${Math.round(persen*100)}%`, W/2, H/2+50);
    ctxKamera.textAlign = 'left';

    if(faceResult.faceLandmarks && faceResult.faceLandmarks.length){
      kal.masukkan(faceResult.faceLandmarks[0]);
    }
    perbaruiPanelMeme(null);
    return;
  }

  let lmWajah = null;
  const tangan = [];
  const infoTangan = [];

  if(faceResult.faceLandmarks && faceResult.faceLandmarks.length){
    lmWajah = faceResult.faceLandmarks[0];
    gambarWajahMinimal(ctxKamera, lmWajah, W, H, kal);
  }

  if(handResult.landmarks && handResult.landmarks.length){
    handResult.landmarks.forEach((lm, i) => {
      const label = handResult.handednesses?.[i]?.[0]?.categoryName || 'Right';
      const kiri = label === 'Left';
      const jari = statusJari(lm, kiri);
      gambarTanganMinimal(ctxKamera, lm, W, H, jari);
      tangan.push({ jari, lm });
      infoTangan.push([kiri ? 'KI' : 'KA', jari]);
    });
  }

  const statusGestur = {
    sonic:    !!(lmWajah && tangan.length === 2 && deteksiSonic(tangan, lmWajah)),
    wajah:    !!(tangan.length === 2 && deteksiWajah(tangan)),
    ronaldo:  !!(lmWajah && tangan.length && deteksiCristiano(tangan, lmWajah)),
    lidah:    !!(lmWajah && deteksiLidah(lmWajah, kal)),
    alis:     !!(lmWajah && deteksiAlis(lmWajah, kal)),
    tikus:    !!(tangan.length === 1 && deteksiTikus(tangan[0].jari)),
  };

  let terdeteksi = null;
  if(statusGestur.sonic) terdeteksi = 'Sonic.jpeg';
  else if(statusGestur.wajah) terdeteksi = 'cara.jpeg';
  else if(statusGestur.ronaldo) terdeteksi = 'cristiano.jpg';
  else if(statusGestur.lidah) terdeteksi = 'gato1.jpg';
  else if(statusGestur.alis) terdeteksi = 'perro.jpeg';
  else if(statusGestur.tikus) terdeteksi = 'rata.jpeg';

  const [gambarAktif, keyakinan] = deteksiState.update(terdeteksi);
  tandaiAktif(gambarAktif);
  gambarHud(ctxKamera, W, H, { gambarAktif, keyakinan, fps, infoTangan });
  fpsLabel.textContent = `FPS ${fps.toFixed(1)}`;

  perbaruiPanelMeme(gambarAktif);

  if(tampilkanDebug){
    perbaruiPanelDebug({ lmWajah, tangan, statusGestur, gambarAktif, keyakinan });
  }
}

function perbaruiPanelDebug({ lmWajah, tangan, statusGestur, gambarAktif, keyakinan }){
  const tanda = v => v ? 'YA ' : 'tidak';
  const baris = [
    `wajah terdeteksi : ${lmWajah ? 'ya' : 'tidak'}    tangan terdeteksi: ${tangan.length}`,
    ``,
    `Sonic.exe          (2 tangan di atas kepala) : ${tanda(statusGestur.sonic)}`,
    `Emoji Pasrah       (2 tangan di sisi wajah)   : ${tanda(statusGestur.wajah)}`,
    `Ronaldo Gigit Jari (jari di mulut)            : ${tanda(statusGestur.ronaldo)}`,
    `Kucing Lidah       (mulut+lidah)              : ${tanda(statusGestur.lidah)}`,
    `Anjing Skeptis     (alis)                     : ${tanda(statusGestur.alis)}`,
    `Hamster Oke        (tangan bentuk V)          : ${tanda(statusGestur.tikus)}`,
    ``,
    `aktif sekarang : ${gambarAktif ? (NAMA_RAMAH[gambarAktif] || gambarAktif) : '-'}   (keyakinan ${(keyakinan*100).toFixed(0)}%)`,
  ];
  panelDebug.textContent = baris.join('\n');
}

/* ================= Kontrol UI ================= */
btnMulai.addEventListener('click', async () => {
  btnMulai.disabled = true;
  statusGerbang.classList.remove('galat');
  try{
    statusGerbang.textContent = 'Meminta izin kamera...';
    await mulaiKamera(facingMode);

    statusGerbang.textContent = 'Menyiapkan model deteksi (bisa makan waktu beberapa detik)...';
    await Promise.all([ muatModel(), muatSemuaGambar() ]);

    gerbang.classList.add('tersembunyi');
    panelUtama.classList.remove('tersembunyi');
    footerEl.classList.remove('tersembunyi');
    btnKalibrasi.disabled = false;
    btnBantuan.disabled = false;
    btnGantiKamera.disabled = false;
    btnDebug.disabled = false;
    btnMatikan.classList.remove('tersembunyi');

    siap = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
  }catch(err){
    console.error(err);
    statusGerbang.classList.add('galat');
    if(err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')){
      statusGerbang.textContent = 'Akses kamera ditolak. Izinkan kamera di pengaturan browser, lalu coba lagi.';
    } else if(err && err.name === 'NotFoundError'){
      statusGerbang.textContent = 'Kamera tidak ditemukan di perangkat ini.';
    } else {
      statusGerbang.textContent = 'Gagal memuat model atau kamera. Cek koneksi internet, lalu muat ulang halaman.';
    }
    btnMulai.disabled = false;
  }
});

btnKalibrasi.addEventListener('click', () => {
  kal = new Kalibrasi();
  deteksiState.reset();
  tandaiAktif(false);
});

btnBantuan.addEventListener('click', () => {
  modalBantuan.classList.remove('tersembunyi');
});
tutupBantuan.addEventListener('click', () => {
  modalBantuan.classList.add('tersembunyi');
});
modalBantuan.addEventListener('click', (e) => {
  if(e.target === modalBantuan) modalBantuan.classList.add('tersembunyi');
});

btnGantiKamera.addEventListener('click', async () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  btnGantiKamera.disabled = true;
  try{ await mulaiKamera(facingMode); }
  catch(err){ console.error(err); }
  btnGantiKamera.disabled = false;
});

btnDebug.addEventListener('click', () => {
  tampilkanDebug = !tampilkanDebug;
  panelDebug.classList.toggle('tersembunyi', !tampilkanDebug);
  btnDebug.textContent = tampilkanDebug ? 'Sembunyikan info' : 'Info deteksi';
});

btnMatikan.addEventListener('click', () => {
  matikanSistem();
});

function matikanSistem(){
  siap = false; // loop() akan berhenti menjadwalkan diri sendiri di frame berikutnya

  if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  try{ faceLandmarker?.close(); }catch(e){ /* abaikan */ }
  try{ handLandmarker?.close(); }catch(e){ /* abaikan */ }
  faceLandmarker = null;
  handLandmarker = null;

  kal = new Kalibrasi();
  deteksiState.reset();
  tandaiAktif(false);
  targetSebelumnya = null;
  progresTransisi = 1.0;

  tampilkanDebug = false;
  panelDebug.classList.add('tersembunyi');
  btnDebug.textContent = 'Info deteksi';
  modalBantuan.classList.add('tersembunyi');

  panelUtama.classList.add('tersembunyi');
  footerEl.classList.add('tersembunyi');
  btnKalibrasi.disabled = true;
  btnBantuan.disabled = true;
  btnGantiKamera.disabled = true;
  btnDebug.disabled = true;
  btnMatikan.classList.add('tersembunyi');

  statusGerbang.classList.remove('galat');
  statusGerbang.textContent = '';
  btnMulai.disabled = false;
  gerbang.classList.remove('tersembunyi');
}

document.addEventListener('keydown', (e) => {
  if(!siap) return;
  if(e.key === 'r' || e.key === 'R') btnKalibrasi.click();
  if(e.key === 'h' || e.key === 'H') modalBantuan.classList.toggle('tersembunyi');
  if(e.key === 'Escape') modalBantuan.classList.add('tersembunyi');
});
