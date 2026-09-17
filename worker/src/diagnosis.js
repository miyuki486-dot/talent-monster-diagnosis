export const TYPE_ORDER = [
  "spark", "maker", "explorer", "challenger", "grower", "messenger",
  "empath", "connector", "artist", "planner", "host", "leader"
];

export const ZODIAC_MAP = {
  aries: ["challenger", "leader"],
  taurus: ["grower", "maker"],
  gemini: ["messenger", "connector"],
  cancer: ["empath", "host"],
  leo: ["leader", "artist"],
  virgo: ["planner", "maker"],
  libra: ["connector", "artist"],
  scorpio: ["explorer", "empath"],
  sagittarius: ["explorer", "challenger"],
  capricorn: ["grower", "planner"],
  aquarius: ["spark", "messenger"],
  pisces: ["artist", "empath"]
};

export const DIAGNOSIS_QUESTIONS = [
  { id: "personality_1", category: "personality", options: [["challenger", "leader"], ["explorer", "planner"], ["spark", "artist"], ["connector", "messenger"]] },
  { id: "personality_2", category: "personality", options: [["grower", "maker"], ["spark", "challenger"], ["messenger", "connector"], ["empath", "planner"]] },
  { id: "personality_3", category: "personality", options: [["planner", "grower"], ["maker", "artist"], ["messenger", "host"], ["challenger", "explorer"]] },
  { id: "personality_4", category: "personality", options: [["empath", "host"], ["messenger", "planner"], ["challenger", "leader"], ["spark", "artist"]] },
  { id: "likes_1", category: "likes", options: [["maker", "spark"], ["explorer", "messenger"], ["challenger", "host"], ["artist", "leader"]] },
  { id: "likes_2", category: "likes", options: [["maker", "grower"], ["explorer", "spark"], ["host", "empath"], ["connector", "leader"]] },
  { id: "likes_3", category: "likes", options: [["spark", "artist"], ["connector", "empath"], ["planner", "explorer"], ["leader", "challenger"]] }
];

export const RECEIPT_PREFIXES = {
  spark: "HIRA",
  maker: "TSUK",
  explorer: "MIKK",
  challenger: "TOBI",
  grower: "KOTU",
  messenger: "KOTO",
  empath: "YORI",
  connector: "MUSU",
  artist: "IROD",
  planner: "MICHI",
  host: "YORO",
  leader: "SEND"
};

const RESPONDENT_TYPES = new Set(["adult", "child"]);
const GENDER_CHOICES = new Set(["boy", "girl", "other"]);
const MONSTER_VARIANTS = new Set(["male", "female"]);
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanFreeText(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(CONTROL_CHARACTERS, "").trim().slice(0, 300);
}

export function normalizeDiagnosisPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_payload");
  const respondentType = String(input.respondentType || "");
  if (!RESPONDENT_TYPES.has(respondentType)) throw new Error("invalid_respondent");

  const guardianConfirmed = input.guardianConfirmed === true;
  if (respondentType === "child" && !guardianConfirmed) throw new Error("guardian_confirmation_required");

  const inputVersion = Number(input.version || 1);
  let genderChoice;
  let monsterVariant;
  if (inputVersion === 1) {
    genderChoice = "legacy";
    monsterVariant = "female";
  } else if (inputVersion === 2) {
    genderChoice = String(input.genderChoice || "");
    monsterVariant = String(input.monsterVariant || "");
    if (!GENDER_CHOICES.has(genderChoice)) throw new Error("invalid_gender_choice");
    if (!MONSTER_VARIANTS.has(monsterVariant)) throw new Error("invalid_monster_variant");
    if (genderChoice === "boy" && monsterVariant !== "male") throw new Error("gender_variant_mismatch");
    if (genderChoice === "girl" && monsterVariant !== "female") throw new Error("gender_variant_mismatch");
  } else {
    throw new Error("invalid_version");
  }

  const zodiac = String(input.zodiac || "");
  if (!Object.hasOwn(ZODIAC_MAP, zodiac)) throw new Error("invalid_zodiac");
  if (!Array.isArray(input.answers)) throw new Error("invalid_answers");
  const inputAnswers = inputVersion === 1 && input.answers.length === 8
    ? input.answers.filter((_answer, index) => index !== 2)
    : input.answers;
  if (inputAnswers.length !== DIAGNOSIS_QUESTIONS.length) throw new Error("invalid_answers");

  const answers = inputAnswers.map((answer, index) => {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new Error("invalid_answer");
    const question = DIAGNOSIS_QUESTIONS[index];
    const answerType = answer.answerType === "free" ? "free" : "choice";
    if (answerType === "free") {
      return { questionId: question.id, answerType, choiceIndex: null, freeText: cleanFreeText(answer.freeText) };
    }
    const choiceIndex = Number(answer.choiceIndex);
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.options.length) throw new Error("invalid_choice");
    return { questionId: question.id, answerType, choiceIndex, freeText: "" };
  });

  return { version: 2, respondentType, guardianConfirmed, genderChoice, monsterVariant, zodiac, answers };
}

export function calculateDiagnosis(diagnosis) {
  const total = Object.fromEntries(TYPE_ORDER.map(key => [key, 0]));
  const personality = Object.fromEntries(TYPE_ORDER.map(key => [key, 0]));
  const likes = Object.fromEntries(TYPE_ORDER.map(key => [key, 0]));
  const zodiac = Object.fromEntries(TYPE_ORDER.map(key => [key, 0]));
  const zodiacTypes = ZODIAC_MAP[diagnosis.zodiac];
  zodiac[zodiacTypes[0]] += 20;
  zodiac[zodiacTypes[1]] += 9;

  const choiceAnswers = diagnosis.answers.map(answer => answer.answerType === "choice" ? answer.choiceIndex : null);
  const personalityCount = DIAGNOSIS_QUESTIONS.filter((question, index) => question.category === "personality" && Number.isInteger(choiceAnswers[index])).length;
  const likesCount = DIAGNOSIS_QUESTIONS.filter((question, index) => question.category === "likes" && Number.isInteger(choiceAnswers[index])).length;

  DIAGNOSIS_QUESTIONS.forEach((question, index) => {
    const choiceIndex = choiceAnswers[index];
    if (!Number.isInteger(choiceIndex)) return;
    const [primary, secondary] = question.options[choiceIndex];
    const isPersonality = question.category === "personality";
    const answerCount = isPersonality ? personalityCount : likesCount;
    if (!answerCount) return;
    const mainPoints = (isPersonality ? 50 : 30) / answerCount;
    const secondaryPoints = mainPoints * 0.42;
    const bucket = isPersonality ? personality : likes;
    bucket[primary] += mainPoints;
    bucket[secondary] += secondaryPoints;
  });

  TYPE_ORDER.forEach(key => { total[key] = zodiac[key] + personality[key] + likes[key]; });
  const ranking = [...TYPE_ORDER].sort((a, b) =>
    total[b] - total[a] || personality[b] - personality[a] || likes[b] - likes[a] || zodiac[b] - zodiac[a] || TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)
  );
  return { typeKey: ranking[0], ranking, scores: total };
}

export function normalizeReceiptCode(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase().replace(/[‐‑‒–—―ー−]/g, "-").replace(/\s+/g, "");
}

export function looksLikeReceiptCode(value) {
  return /^[A-Z]{4,5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(normalizeReceiptCode(value));
}
