# 🎯 YKS Arena

**YKS'ye hazırlanan öğrenciler için dopamin döngüsü odaklı 1v1 trivia oyunu.**

YKS Arena, uzun deneme sınavları yerine kısa, eğlenceli ve rekabetçi maçlarla soru çözümünü teşvik eden bir platformdur. YouTube Shorts gibi hızlı içerik tüketimi mantığıyla, az sorulu serilerle öğrencilerin motivasyonunu canlı tutar.

---

## 📖 Proje Hakkında

### Amaç
YKS'ye hazırlanan öğrencilerin:
- Kısa maçlarla (8-12 soru) dopamin döngüsünü canlı tutmak
- Rekabetçi ortamda soru çözmeyi eğlenceli hale getirmek
- Enerji sistemi ile kontrollü oyun süresi sağlamak
- Symbol ve kupa sistemi ile ilerleme hissi yaratmak

### Oyun Mekaniği

1. **Spin Aşaması**: Oyuncu bir kategori seçer (BİLİM, COĞRAFYA, SPOR, MATEMATİK) (Kategoriler YKS'ye uygun hale getirilecek)
2. **Soru Aşaması**: Seçilen kategoriden soru gelir
3. **Doğru Cevap**: Kupa kazanılır
4. **2 Soru Doğru**: Kategorinin symbol'ü kazanılır
5. **4 Symbol**: Maç kazanılır

**Energy Sistemi:**
- Her maç başlatmak için 1 enerji harcanır
- Enerji 0 ise soru cevaplanamaz
- Saatlik otomatik refill sistemi
- Enerji = aynı anda açık olabilecek maç sayısı

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **Animations**: Framer Motion 12
- **Icons**: Lucide React
- **State Management**: 
  - React Hooks (local state)
  - Zustand (planned - global store)
  - React Query (planned - server state)

### Backend
- **Platform**: Firebase
  - **Firestore**: Real-time database
  - **Functions**: Cloud Functions (v2)
  - **Auth**: Anonymous Authentication
- **Language**: TypeScript 5

### Validation & Type Safety
- **Zod**: Runtime validation (MANDATORY for all schemas)
- **TypeScript**: Compile-time type checking

### Development Tools
- **Package Manager**: npm
- **Linting**: ESLint + Next.js config
- **Build Tool**: Next.js built-in
- **Firebase Emulators**: Local development

### Testing (Planned)
- **E2E Testing**: Playwright

---

## 📋 Gereksinimler

### Sistem Gereksinimleri
- **Node.js**: v20.x veya üzeri
- **npm**: v9.x veya üzeri
- **Firebase CLI**: v14.x veya üzeri
- **Java**: v17+ (Firestore Emulator için)

### Firebase Setup
1. Firebase projesi oluşturun
2. Firestore Database'i etkinleştirin
3. Authentication'da Anonymous Auth'u açın
4. Cloud Functions için billing hesabı (emulator için gerekli değil)

### Environment Variables
Proje root'unda `.env.local` dosyası oluşturun:

```env
# Firebase Config (NEXT_PUBLIC_* browser'a gider)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Functions Region (optional, default: europe-west1)
NEXT_PUBLIC_FIREBASE_REGION=europe-west1

# Emulator Flag (development için)
NEXT_PUBLIC_USE_EMULATORS=true
```

---

## 🚀 Kurulum

### 1. Repository'yi Klonlayın
```bash
git clone <repository-url>
cd yks-arena
```

### 2. Dependencies Kurulumu
```bash
# Root dependencies
npm install

# Functions dependencies
cd functions
npm install
cd ..
```

### 3. Firebase Setup
```bash
# Firebase CLI'yi global olarak kurun (eğer yoksa)
npm install -g firebase-tools

# Firebase'e login olun
firebase login

# Projeyi bağlayın
firebase use --add
```

### 4. Environment Variables
`.env.local` dosyasını oluşturun (yukarıdaki template'e göre)

### 5. Firestore Indexes
```bash
# Firestore indexes'i deploy edin (production için)
firebase deploy --only firestore:indexes

# Development için emulator kullanıyorsanız gerekli değil
```

### 6. Development Server'ı Başlatın

**Terminal 1 - Firebase Emulators:**
```bash
firebase emulators:start
```

**Terminal 2 - Next.js Dev Server:**
```bash
npm run dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde çalışacak.

**Emulator UI**: [http://localhost:4000](http://localhost:4000)

---

## 📁 Proje Yapısı

```
yks-arena/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Home (dashboard)
│   │   ├── match/[matchId]/    # Match page
│   │   └── results/[matchId]/  # Results page
│   ├── components/              # React components
│   │   ├── dashboard/          # Dashboard components
│   │   ├── game/               # Game UI components
│   │   ├── layout/              # Layout components
│   │   └── match/               # Match-specific components
│   ├── features/               # Feature-based modules
│   │   ├── auth/               # Authentication hooks
│   │   ├── match/              # Match feature
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── services/       # API services
│   │   │   └── types.ts        # Type definitions
│   │   └── users/              # User feature
│   ├── hooks/                  # Global hooks
│   └── lib/                    # Utilities & configs
│       ├── config/             # Environment config
│       ├── firebase/           # Firebase client setup
│       ├── validation/         # Zod schemas & validators
│       └── utils/              # Helper functions
├── functions/                  # Firebase Cloud Functions
│   ├── src/                    # TypeScript source
│   │   ├── match/             # Match-related functions
│   │   ├── questions/         # Question picking logic
│   │   ├── users/             # User management
│   │   └── utils/             # Shared utilities
│   └── lib/                    # Compiled JavaScript
├── data/                       # Seed data
│   └── questions_seed.csv     # Question database
├── scripts/                    # Utility scripts
│   ├── importQuestions.ts     # Question import script
│   └── backfillRandomHash.ts  # Data migration
└── public/                     # Static assets
    └── sounds/                 # Game sound effects
```

---

## 🎮 Mevcut Özellikler

### ✅ Implemented
- [x] **Anonymous Authentication**: Firebase Anonymous Auth
- [x] **Match Engine**: 
  - Invite code ile maç oluşturma
  - Davet koduna katılma
  - Real-time match sync (Firestore onSnapshot)
- [x] **Game Flow**:
  - Spin → Kategori seçimi
  - Soru cevaplama (A/B/C/D/E)
  - Kupa kazanma sistemi
  - Symbol kazanma (2 soru doğru)
  - Maç bitirme (4 symbol)
- [x] **Energy System**:
  - Saatlik otomatik refill
  - Enerji bazlı maç limiti
  - Enerji 0 kontrolü
- [x] **User Profile**:
  - Trophies (lifetime)
  - Stats (total matches, wins)
  - League system (backend'de var, UI'da pasif)
- [x] **Real-time Updates**: Firestore real-time listeners
- [x] **Type Safety**: 
  - Zod validation (runtime)
  - TypeScript (compile-time)
- [x] **Sound Effects**: Game audio feedback

### 🚧 In Progress
- [ ] Component refactoring (150 line limit)
- [ ] `any` type elimination
- [ ] State management (Zustand + React Query)

### 📅 Planned (Ideal Version)

#### Matchmaking & Social
- [ ] Random matchmaking
- [ ] Friend system
- [ ] Chat/communication
- [ ] Match history & replays

#### Progression & Rewards
- [ ] League/ranking system (UI)
- [ ] Daily challenges
- [ ] Weekly tournaments
- [ ] Achievement system
- [ ] Profile customization

#### Analytics & Insights
- [ ] Performance dashboard
- [ ] Category-wise statistics
- [ ] Weakness analysis
- [ ] Study recommendations

#### Platform
- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] Offline mode
- [ ] PWA support

---

## 🏗️ Architecture

### Design Principles

1. **Hook Architecture**: 
   - UI components "dumb" kalır
   - Logic custom hooks'a taşınır
   - Component limit: 150 satır

2. **Type Safety**:
   - `any` kullanımı yasak
   - Zod ile runtime validation (MANDATORY)
   - TypeScript ile compile-time checking

3. **Feature-Based Structure**:
   - Her feature kendi modülünde
   - Co-located hooks, services, types

4. **Real-time First**:
   - Firestore onSnapshot kullanımı
   - State synchronization öncelik #1

### Key Decisions

- **Zod Validation**: Firestore'dan gelen tüm data validate edilir
- **Anonymous Auth**: Hızlı onboarding, privacy-friendly
- **Energy System**: Kontrollü oyun süresi, monetization hazır
- **Symbol System**: Dopamin döngüsü için küçük kazanımlar

---

## 🧪 Development

### Available Scripts

```bash
# Development
npm run dev              # Next.js dev server
firebase emulators:start # Firebase emulators

# Build
npm run build            # Production build
npm run start           # Production server

# Linting
npm run lint             # ESLint check

# Data Seeding
npm run seed:questions   # Seed questions to emulator (60 questions)

# Functions
cd functions
npm run build            # Compile TypeScript
npm run serve            # Local functions emulator
npm run seed             # Seed questions (alternative)
```

### Firebase Emulators

Emulator'lar şu servisleri içerir:
- **Auth**: Port 9099
- **Firestore**: Port 8080
- **Functions**: Port 5001
- **UI**: Port 4000

### Data Seeding

**Emulator'a soruları yüklemek için:**

```bash
# Root'tan (kolay yol)
npm run seed:questions

# Veya functions klasöründen
cd functions
npm run seed
```

**Not:** Emulator'lar çalışırken script'i çalıştırın. Her emulator restart'tan sonra soruları tekrar yüklemeniz gerekir.

---

## 📝 Coding Standards

Proje `.cursorrules` dosyasında tanımlı kurallara uyar:

- **Hook Architecture**: Logic hooks'a, UI components'a değil
- **Type Safety**: Zod + TypeScript, `any` yok
- **Component Size**: Max 150 satır
- **Refactoring > Patching**: Quick hack'lerden kaçın

Detaylar için `.cursorrules` dosyasına bakın.

---

## 🐛 Known Issues

- [ ] Component'ler 150 satır limitini aşıyor (refactor gerekli)
- [ ] Bazı `any` kullanımları kaldırılmayı bekliyor
- [ ] Zustand + React Query henüz implement edilmedi

---

## 📄 License

[Lisans bilgisi eklenecek]

---

## 👥 Contributors

[Contributor listesi eklenecek]

---

## 🔗 Links

- [Firebase Documentation](https://firebase.google.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Zod Documentation](https://zod.dev)

---

**Not**: Bu proje aktif development aşamasındadır. Production deployment henüz yapılmamıştır.
