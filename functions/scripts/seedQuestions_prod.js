/**
 * Seed 60 questions into PRODUCTION Firestore.
 *
 * Run:
 *   cd functions
 *   node scripts/seedQuestions_prod.js
 * 
 * Requirements:
 *   - Firebase CLI authenticated: firebase login
 *   - Application Default Credentials set: gcloud auth application-default login
 *   - OR: GOOGLE_APPLICATION_CREDENTIALS env var pointing to serviceAccountKey.json
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

// CRITICAL: Do NOT set FIRESTORE_EMULATOR_HOST - we want production!
// If this env var is set, explicitly unset it
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("⚠️  FIRESTORE_EMULATOR_HOST is set! Unsetting for production...");
  delete process.env.FIRESTORE_EMULATOR_HOST;
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || "yks-arena-1a0f8";

// Initialize Admin SDK for PRODUCTION
// Try service account key first (from root directory), fallback to applicationDefault
if (!admin.apps.length) {
  try {
    // Try to find serviceAccountKey.json in project root
    // Script is in functions/scripts/, so root is 2 levels up
    const projectRoot = path.resolve(__dirname, "..", "..");
    const serviceAccountPath = path.join(projectRoot, "serviceAccountKey.json");
    
    let credential = null;
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Explicit env var set - use it
      const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      if (fs.existsSync(credPath)) {
        credential = admin.credential.cert(require(credPath));
        console.log(`✅ Using service account from GOOGLE_APPLICATION_CREDENTIALS`);
      } else {
        throw new Error(`Service account file not found: ${credPath}`);
      }
    } else if (fs.existsSync(serviceAccountPath)) {
      // Found in project root (relative to functions/scripts/)
      credential = admin.credential.cert(require(serviceAccountPath));
      console.log(`✅ Using service account key from project root`);
    } else {
      // Fallback to applicationDefault (requires gcloud auth or Firebase CLI)
      try {
        credential = admin.credential.applicationDefault();
        console.log(`✅ Using Application Default Credentials (Firebase CLI auth)`);
      } catch (appDefaultError) {
        throw new Error(
          `No credentials found!\n` +
          `  1. Place serviceAccountKey.json in project root\n` +
          `  2. OR set GOOGLE_APPLICATION_CREDENTIALS env var\n` +
          `  3. OR run: firebase login`
        );
      }
    }
    
    admin.initializeApp({
      credential,
      projectId: PROJECT_ID,
    });
    console.log(`✅ Initialized Firebase Admin SDK for PROJECT: ${PROJECT_ID}`);
  } catch (error) {
    console.error("❌ Failed to initialize Admin SDK:", error.message);
    console.error("\n💡 Try one of these:");
    console.error("   1. Place serviceAccountKey.json in project root");
    console.error("   2. Set GOOGLE_APPLICATION_CREDENTIALS env var");
    console.error("   3. Firebase CLI: firebase login (then use applicationDefault)");
    process.exit(1);
  }
}

const db = admin.firestore();

function stableHash(str, n = 12) {
  return crypto.createHash("sha1").update(str).digest("hex").slice(0, n);
}
function docIdFor(q) {
  const base = `${q.category}|${q.question}|${Object.values(q.choices).join("|")}|${q.answer}`;
  return stableHash(base, 20);
}
function randomHashFor(q) {
  const base = `${q.category}|${q.question}|${Object.values(q.choices).join("|")}|${q.answer}`;
  return stableHash(base, 12);
}

// Random ID pattern: 0..9,999,999
function randomId() {
  return Math.floor(Math.random() * 10000000);
}

function q(category, question, choices, answer) {
  return { category, question, choices, answer };
}

const QUESTIONS = [
  // ========= BILIM (15) =========
  q("BILIM","DNA'nın açılımı nedir?",{A:"Deoksiribonükleik asit",B:"Dinamik nükleer asit",C:"Deoksi nöral alan",D:"Dimer nükleik asit",E:"Doğal nükleer asit"},"A"),
  q("BILIM","Işığın boşluktaki hızı yaklaşık kaç km/s'dir?",{A:"30.000",B:"300.000",C:"3.000",D:"3.000.000",E:"150.000"},"B"),
  q("BILIM","Suyun kimyasal formülü nedir?",{A:"CO2",B:"H2O",C:"O2",D:"NaCl",E:"H2SO4"},"B"),
  q("BILIM","Fotosentezde bitkiler hangi gazı kullanır?",{A:"O2",B:"CO2",C:"N2",D:"He",E:"Ar"},"B"),
  q("BILIM","Elektrik akımının birimi nedir?",{A:"Volt",B:"Ohm",C:"Amper",D:"Watt",E:"Tesla"},"C"),
  q("BILIM","Asitlerin pH değeri genellikle kaçtan küçüktür?",{A:"7",B:"0",C:"14",D:"10",E:"9"},"A"),
  q("BILIM","Newton’un 3. yasası hangisidir?",{A:"Eylemsizlik",B:"F=ma",C:"Etki-tepki",D:"Kütle çekimi",E:"Enerji korunumu"},"C"),
  q("BILIM","Atomun merkezinde ne bulunur?",{A:"Elektron",B:"Çekirdek",C:"Proton bulutu",D:"İyon",E:"Molekül"},"B"),
  q("BILIM","Dünya atmosferinde en fazla bulunan gaz hangisidir?",{A:"Oksijen",B:"Azot",C:"Karbondioksit",D:"Helyum",E:"Hidrojen"},"B"),
  q("BILIM","İnsanda kanı pompalayan organ hangisidir?",{A:"Böbrek",B:"Akciğer",C:"Karaciğer",D:"Kalp",E:"Mide"},"D"),
  q("BILIM","Aşağıdakilerden hangisi yenilenebilir enerji kaynağıdır?",{A:"Kömür",B:"Doğalgaz",C:"Güneş",D:"Petrol",E:"Linyit"},"C"),
  q("BILIM","İnsan vücudunda kütlece en fazla bulunan element hangisidir?",{A:"Karbon",B:"Oksijen",C:"Kalsiyum",D:"Azot",E:"Demir"},"B"),
  q("BILIM","Buzun erime noktası (°C) kaçtır?",{A:"-10",B:"0",C:"10",D:"25",E:"100"},"B"),
  q("BILIM","Ses hangi ortamda en hızlı yayılır?",{A:"Boşluk",B:"Hava",C:"Su",D:"Katı",E:"Hiçbiri"},"D"),
  q("BILIM","Aşağıdakilerden hangisi gezegendir?",{A:"Güneş",B:"Ay",C:"Mars",D:"Samanyolu",E:"Kuyruklu yıldız"},"C"),

  // ========= COGRAFYA (15) =========
  q("COGRAFYA","Türkiye'nin başkenti neresidir?",{A:"İstanbul",B:"Ankara",C:"İzmir",D:"Bursa",E:"Antalya"},"B"),
  q("COGRAFYA","Dünyanın en büyük okyanusu hangisidir?",{A:"Atlas",B:"Hint",C:"Pasifik",D:"Arktik",E:"Güney"},"C"),
  q("COGRAFYA","Ekvator hangi iki yarımküreyi ayırır?",{A:"Doğu-Batı",B:"Kuzey-Güney",C:"Yaz-Kış",D:"Kara-Deniz",E:"Dağ-Ova"},"B"),
  q("COGRAFYA","Sahra Çölü hangi kıtadadır?",{A:"Asya",B:"Afrika",C:"Avrupa",D:"Amerika",E:"Okyanusya"},"B"),
  q("COGRAFYA","Amazon Nehri hangi kıtadadır?",{A:"Afrika",B:"Güney Amerika",C:"Kuzey Amerika",D:"Avrupa",E:"Asya"},"B"),
  q("COGRAFYA","Dünyanın en yüksek dağı hangisidir?",{A:"K2",B:"Everest",C:"Elbruz",D:"Kilimanjaro",E:"Aconcagua"},"B"),
  q("COGRAFYA","Türkiye hangi denize kıyısı yoktur?",{A:"Karadeniz",B:"Akdeniz",C:"Hazar",D:"Ege",E:"Marmara"},"C"),
  q("COGRAFYA","Nil Nehri hangi kıtadadır?",{A:"Asya",B:"Afrika",C:"Avrupa",D:"Amerika",E:"Okyanusya"},"B"),
  q("COGRAFYA","Kutup noktalarına yaklaştıkça sıcaklık genellikle nasıl değişir?",{A:"Artar",B:"Azalır",C:"Aynı kalır",D:"Rastgele",E:"Sabit artar"},"B"),
  q("COGRAFYA","Kapadokya hangi ilimizle en çok ilişkilidir?",{A:"Nevşehir",B:"Trabzon",C:"Muğla",D:"Edirne",E:"Van"},"A"),
  q("COGRAFYA","Akdeniz ikliminde yazlar genellikle nasıldır?",{A:"Ilık yağışlı",B:"Sıcak kurak",C:"Soğuk karlı",D:"Serin yağışlı",E:"Çok soğuk"},"B"),
  q("COGRAFYA","Dünya'nın dönüşü hangi olayı oluşturur?",{A:"Mevsimler",B:"Gece-gündüz",C:"Depremler",D:"Gelgit",E:"İklim kuşakları"},"B"),
  q("COGRAFYA","Türkiye'nin en uzun nehri hangisidir?",{A:"Kızılırmak",B:"Fırat",C:"Dicle",D:"Sakarya",E:"Meriç"},"A"),
  q("COGRAFYA","Rüzgârın hızını ölçen alet hangisidir?",{A:"Barometre",B:"Anemometre",C:"Termometre",D:"Higrometre",E:"Altimetre"},"B"),
  q("COGRAFYA","Dünya üzerinde en fazla ülke hangi kıtadadır?",{A:"Avrupa",B:"Afrika",C:"Asya",D:"Amerika",E:"Okyanusya"},"B"),

  // ========= SPOR (15) =========
  q("SPOR","Futbolda bir takım sahada kaç oyuncuyla oynar?",{A:"9",B:"10",C:"11",D:"12",E:"8"},"C"),
  q("SPOR","Basketbolda bir takım sahada kaç oyuncuyla oynar?",{A:"5",B:"6",C:"7",D:"11",E:"4"},"A"),
  q("SPOR","Teniste '0' puan hangi terimle ifade edilir?",{A:"Zero",B:"Love",C:"Nil",D:"Blank",E:"Ace"},"B"),
  q("SPOR","Olimpiyatlar kaç yılda bir yapılır?",{A:"2",B:"3",C:"4",D:"5",E:"6"},"C"),
  q("SPOR","Voleybolda bir set normalde kaç sayıda biter?",{A:"15",B:"20",C:"25",D:"30",E:"21"},"C"),
  q("SPOR","Maraton kaç km'dir? (yaklaşık)",{A:"21",B:"42",C:"10",D:"50",E:"30"},"B"),
  q("SPOR","Yüzmede olimpik havuz uzunluğu kaç metredir?",{A:"25",B:"50",C:"100",D:"75",E:"40"},"B"),
  q("SPOR","Futbolda penaltı noktası kaleden kaç metre uzaklıktadır?",{A:"9",B:"11",C:"13",D:"15",E:"7"},"B"),
  q("SPOR","Satrançta oyuna başlayan taraf hangisidir?",{A:"Siyah",B:"Beyaz",C:"Rastgele",D:"Hakem seçer",E:"Kura"},"B"),
  q("SPOR","Futbolda maç kaç dakika sürer? (uzatmalar hariç)",{A:"80",B:"90",C:"100",D:"60",E:"120"},"B"),
  q("SPOR","Basketbolda serbest atış kaç puandır?",{A:"1",B:"2",C:"3",D:"4",E:"0"},"A"),
  q("SPOR","Voleybolda bir takım sahada kaç oyuncu bulundurur?",{A:"5",B:"6",C:"7",D:"8",E:"11"},"B"),
  q("SPOR","Futbolda kırmızı kart gören oyuncu ne olur?",{A:"Uyarılır",B:"Oyundan atılır",C:"Yedek olur",D:"Penaltı atar",E:"Gol sayılır"},"B"),
  q("SPOR","Basketbolda pota yüksekliği yaklaşık kaç metredir?",{A:"2.5",B:"3.05",C:"3.5",D:"2.8",E:"4.0"},"B"),
  q("SPOR","Teniste bir seti kazanmak için en az kaç oyun gerekir?",{A:"4",B:"5",C:"6",D:"7",E:"8"},"C"),

  // ========= MATEMATIK (15) =========
  q("MATEMATIK","7 + 8 kaçtır?",{A:"14",B:"15",C:"16",D:"17",E:"13"},"B"),
  q("MATEMATIK","12 ÷ 3 kaçtır?",{A:"2",B:"3",C:"4",D:"5",E:"6"},"C"),
  q("MATEMATIK","9 × 6 kaçtır?",{A:"42",B:"48",C:"54",D:"56",E:"60"},"C"),
  q("MATEMATIK","Bir üçgenin iç açıları toplamı kaç derecedir?",{A:"90",B:"180",C:"270",D:"360",E:"120"},"B"),
  q("MATEMATIK","10'un %20'si kaçtır?",{A:"1",B:"2",C:"3",D:"4",E:"5"},"B"),
  q("MATEMATIK","15 - 9 kaçtır?",{A:"4",B:"5",C:"6",D:"7",E:"8"},"C"),
  q("MATEMATIK","2^5 kaçtır?",{A:"8",B:"16",C:"24",D:"32",E:"64"},"D"),
  q("MATEMATIK","36'nın karekökü kaçtır?",{A:"5",B:"6",C:"7",D:"8",E:"9"},"B"),
  q("MATEMATIK","0.5 + 0.25 kaçtır?",{A:"0.65",B:"0.7",C:"0.75",D:"0.8",E:"0.85"},"C"),
  q("MATEMATIK","Bir sayının %10'u 8 ise sayı kaçtır?",{A:"80",B:"8",C:"18",D:"70",E:"90"},"A"),
  q("MATEMATIK","3x = 12 ise x kaçtır?",{A:"2",B:"3",C:"4",D:"5",E:"6"},"C"),
  q("MATEMATIK","En küçük asal sayı hangisidir?",{A:"0",B:"1",C:"2",D:"3",E:"5"},"C"),
  q("MATEMATIK","1/2 ile 1/4'ün toplamı kaçtır?",{A:"1/8",B:"1/4",C:"3/4",D:"3/8",E:"2/4"},"D"),
  q("MATEMATIK","100'ün %5'i kaçtır?",{A:"2",B:"3",C:"4",D:"5",E:"6"},"D"),
  q("MATEMATIK","8 × 7 kaçtır?",{A:"54",B:"56",C:"58",D:"60",E:"48"},"B"),
];

async function main() {
  console.log("🚀 Seeding questions to PRODUCTION Firestore");
  console.log(`📁 Project: ${PROJECT_ID}`);
  console.log(`📊 Questions to seed: ${QUESTIONS.length}\n`);

  const col = db.collection("questions");
  const now = admin.firestore.Timestamp.now();

  // Deterministic IDs => rerun is safe (no duplicates).
  const batchSize = 400;
  let batch = db.batch();
  let inBatch = 0;
  let totalWritten = 0;

  console.log("Writing questions in batches...");
  for (const qd of QUESTIONS) {
    const ref = col.doc(docIdFor(qd));
    batch.set(ref, {
      category: qd.category,            // IMPORTANT: matches SymbolKey
      question: qd.question,
      choices: qd.choices,
      answer: qd.answer,
      isActive: true,
      randomHash: randomHashFor(qd),
      randomId: randomId(),
      createdAt: now,
    });
    inBatch++;
    totalWritten++;
    
    if (inBatch >= batchSize) {
      await batch.commit();
      console.log(`  ✅ Wrote batch: ${totalWritten}/${QUESTIONS.length} questions`);
      batch = db.batch();
      inBatch = 0;
    }
  }
  
  if (inBatch > 0) {
    await batch.commit();
    console.log(`  ✅ Wrote final batch: ${totalWritten}/${QUESTIONS.length} questions`);
  }

  const countSnap = await col.get();
  console.log(`\n✅ Done! Total questions in PRODUCTION: ${countSnap.size}`);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
