"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickQuestionIds = pickQuestionIds;
const firestore_1 = require("../utils/firestore");
const CATEGORIES = ["MAT", "TURKCE", "FEN", "SOSYAL"];
async function pickQuestionIds(total) {
    const snap = await firestore_1.db.collection("questions").where("isActive", "==", true).limit(200).get();
    const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((q) => CATEGORIES.includes(q.category));
    // naive shuffle (MVP)
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, total).map((q) => q.id);
}
