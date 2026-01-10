/**
 * Bot Class - Stress Test için headless oyuncu
 * 
 * Architecture:
 * - Admin SDK ile custom token oluşturulur
 * - Client SDK ile authenticate olur
 * - httpsCallable ile functions çağırır
 * 
 * Test botları gerçek kullanıcı gibi davranır:
 * - match_queue'ya girerler
 * - Birbirleriyle veya pasif botlarla eşleşebilirler
 * - Her hamle öncesi rastgele bekleme yaparlar (0-3s)
 */

import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithCustomToken, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, type Firestore } from "firebase/firestore";
import { getFunctions, httpsCallable, connectFunctionsEmulator, type Functions } from "firebase/functions";
import * as admin from "firebase-admin";

import { 
  BOT_CONFIG, 
  FIREBASE_CONFIG, 
  TEST_CONFIG, 
  PASSIVE_BOT_CORRECT_RATES, 
  getActionDelay,
  type ChoiceKey 
} from "./config";

// Admin SDK singleton
let adminInitialized = false;
function getAdminApp() {
  if (!adminInitialized) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: FIREBASE_CONFIG.projectId,
      });
    }
    // Admin SDK emulator connection
    process.env.FIRESTORE_EMULATOR_HOST = TEST_CONFIG.FIRESTORE_EMULATOR_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = TEST_CONFIG.AUTH_EMULATOR_HOST;
    adminInitialized = true;
  }
  return admin;
}

// ============================================================================
// TYPES
// ============================================================================

type EnterQueueResult = { 
  status: "MATCHED" | "QUEUED"; 
  matchId: string | null; 
  opponentType: "HUMAN" | "BOT" | null;
  waitSeconds?: number;
};

// ============================================================================
// BOT CLASS
// ============================================================================

export class Bot {
  readonly uid: string;
  readonly name: string;
  readonly isReused: boolean;
  
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private db: Firestore | null = null;
  private functions: Functions | null = null;
  private initialized = false;
  
  /**
   * @param name Display name for logging
   * @param existingUid Optional - reuse existing bot uid from Firestore
   */
  constructor(name: string, existingUid?: string) {
    this.name = name;
    this.isReused = !!existingUid;
    this.uid = existingUid ?? `bot-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  
  /**
   * Initialize bot: create custom token and sign in
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    const adminApp = getAdminApp();
    
    // 1. Create custom token via Admin SDK
    const customToken = await adminApp.auth().createCustomToken(this.uid);
    
    // 2. Initialize Firebase Client SDK (unique instance per bot)
    this.app = initializeApp(FIREBASE_CONFIG, `bot-${this.uid}`);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.functions = getFunctions(this.app, "us-central1");
    
    // 3. Connect to emulators
    connectAuthEmulator(this.auth, `http://${TEST_CONFIG.AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    connectFirestoreEmulator(this.db, "localhost", 8080);
    connectFunctionsEmulator(this.functions, "localhost", 5001);
    
    // 4. Sign in with custom token
    await signInWithCustomToken(this.auth, customToken);
    
    // 5. Ensure user profile exists (Admin SDK ile direkt oluştur)
    // NOTE: ensureUserProfile artık callable değil, bir Auth Trigger.
    // Emulator'da trigger çalışmayabilir, bu yüzden Admin SDK ile direkt oluşturuyoruz.
    const adminApp = getAdminApp();
    const db = adminApp.firestore();
    const userRef = db.collection("users").doc(this.uid);
    
    const existing = await userRef.get();
    if (!existing.exists) {
      // guestNameFromUid logic'i (basit hash)
      const hashInt = this.uid.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
      const n = Math.abs(hashInt) % 10000;
      const suffix = String(n).padStart(4, "0");
      const displayName = `Misafir #${suffix}`;
      
      await userRef.set({
        displayName,
        photoURL: null,
        trophies: 0,
        level: 1,
        league: { currentLeague: "Teneke", weeklyTrophies: 0 },
        stats: { totalMatches: 0, totalWins: 0 },
        economy: {
          energy: 30,
          maxEnergy: 5,
          lastEnergyRefill: adminApp.firestore.FieldValue.serverTimestamp(),
        },
        createdAt: adminApp.firestore.FieldValue.serverTimestamp(),
      });
    }
    
    this.initialized = true;
    const icon = this.isReused ? "♻️" : "🤖";
    console.log(`${icon} Bot ${this.name} initialized (uid: ${this.uid.slice(0, 20)}...)`);
  }
  
  /**
   * Create an invite code
   */
  async createInvite(): Promise<{ code: string }> {
    this.ensureInit();
    const fn = httpsCallable<void, { code: string }>(this.functions!, "matchCreateInvite");
    const result = await fn();
    console.log(`  📨 ${this.name} created invite: ${result.data.code}`);
    return result.data;
  }
  
  /**
   * Join an invite by code
   */
  async joinInvite(code: string): Promise<{ matchId: string }> {
    this.ensureInit();
    const fn = httpsCallable<{ code: string }, { matchId: string }>(this.functions!, "matchJoinInvite");
    const result = await fn({ code });
    console.log(`  🎮 ${this.name} joined match: ${result.data.matchId.slice(0, 8)}...`);
    return result.data;
  }

  /**
   * Enter queue for random matchmaking
   * 
   * Yeni akış:
   * - İlk 15 saniye: Sadece gerçek kullanıcılarla eşleş
   * - 15 saniye sonra: bot_pool da dahil edilir
   * - forceBot yok - backend otomatik yönetiyor
   */
  async enterQueue(maxRetries = 3): Promise<EnterQueueResult> {
    this.ensureInit();
    const fn = httpsCallable<Record<string, never>, EnterQueueResult>(
      this.functions!,
      "matchEnterQueue"
    );
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn({});
        const icon = result.data.status === "MATCHED" ? "🎮" : "⏳";
        const waitInfo = result.data.waitSeconds ? ` (waited ${result.data.waitSeconds}s)` : "";
        console.log(`  ${icon} ${this.name} enterQueue: status=${result.data.status}, opponent=${result.data.opponentType || "N/A"}${waitInfo}`);
        return result.data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const errMsg = lastError.message;
        
        // INTERNAL veya UNAVAILABLE hataları retry edilebilir
        const isRetryable = errMsg.includes("INTERNAL") || errMsg.includes("UNAVAILABLE");
        
        if (isRetryable && attempt < maxRetries) {
          const delay = attempt * 500;
          console.log(`  ⚠️ ${this.name} enterQueue failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
          await this.delay(delay);
          continue;
        }
        
        throw lastError;
      }
    }
    
    throw lastError || new Error("enterQueue failed after max retries");
  }

  /**
   * Leave queue (cancel matchmaking)
   */
  async leaveQueue(): Promise<void> {
    this.ensureInit();
    const fn = httpsCallable<void, { success: boolean }>(this.functions!, "matchLeaveQueue");
    await fn();
    console.log(`  ↩️ ${this.name} left queue`);
  }
  
  /**
   * Spin the wheel - random delay ile (gerçek kullanıcı simülasyonu)
   */
  async spin(matchId: string): Promise<{ symbol: string; questionId: string }> {
    this.ensureInit();
    
    // Random bekleme (0-3s)
    const delay = getActionDelay();
    await this.delay(delay);
    
    const fn = httpsCallable<{ matchId: string }, { symbol: string; questionId: string }>(
      this.functions!,
      "matchSpin"
    );
    const result = await fn({ matchId });
    console.log(`  🎰 ${this.name} spun: ${result.data.symbol}`);
    return result.data;
  }
  
  /**
   * Submit an answer - random delay ile (gerçek kullanıcı simülasyonu)
   */
  async submitAnswer(matchId: string, answer: ChoiceKey): Promise<{ status: string; phase: string }> {
    this.ensureInit();
    
    // Random bekleme (0-3s) - düşünme süresi
    const delay = getActionDelay();
    await this.delay(delay);
    
    const fn = httpsCallable<{ matchId: string; answer: string }, { status: string; phase: string }>(
      this.functions!,
      "matchSubmitAnswer"
    );
    const result = await fn({ matchId, answer });
    console.log(`  ✏️ ${this.name} answered: ${answer} → status=${result.data.status}, phase=${result.data.phase}`);
    return result.data;
  }
  
  /**
   * Continue to next question - random delay ile
   */
  async continueToNextQuestion(matchId: string): Promise<{ status: string; phase: string }> {
    this.ensureInit();
    
    // Random bekleme (0-3s)
    const delay = getActionDelay();
    await this.delay(delay);
    
    const fn = httpsCallable<{ matchId: string }, { status: string; phase: string }>(
      this.functions!,
      "matchContinueToNextQuestion"
    );
    const result = await fn({ matchId });
    return result.data;
  }
  
  /**
   * Get question document to find correct answer
   */
  async getQuestion(questionId: string): Promise<{ answer: ChoiceKey }> {
    this.ensureInit();
    const qRef = doc(this.db!, "questions", questionId);
    const snap = await getDoc(qRef);
    if (!snap.exists()) throw new Error(`Question ${questionId} not found`);
    const data = snap.data();
    return { answer: data.answer as ChoiceKey };
  }
  
  /**
   * Pick answer based on correct answer rate config
   */
  pickAnswer(correctAnswer: ChoiceKey, overrideRate?: number): ChoiceKey {
    const rate = overrideRate ?? BOT_CONFIG.CORRECT_ANSWER_RATE;
    if (Math.random() < rate) {
      return correctAnswer;
    }
    const choices: ChoiceKey[] = ["A", "B", "C", "D", "E"];
    const wrongChoices = choices.filter(c => c !== correctAnswer);
    return wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
  }
  
  /**
   * Passive bot difficulty'sine göre doğru cevaplama oranı
   */
  static getPassiveBotCorrectRate(difficulty: number): number {
    return PASSIVE_BOT_CORRECT_RATES[difficulty] ?? 0.60;
  }
  
  /**
   * Cleanup bot resources
   */
  async destroy(): Promise<void> {
    if (this.app) {
      await deleteApp(this.app);
      this.app = null;
      this.auth = null;
      this.db = null;
      this.functions = null;
      this.initialized = false;
    }
  }
  
  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error(`Bot ${this.name} not initialized. Call init() first.`);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
