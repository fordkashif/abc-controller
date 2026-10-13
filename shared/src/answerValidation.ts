export type AnswerCategory = 'boy' | 'girl' | 'animal' | 'place' | 'food' | 'thing';

const WORDS: Record<AnswerCategory, string[]> = {
  boy: [
    'aaron', 'adam', 'adrian', 'alex', 'andrew', 'anthony', 'ben', 'brandon', 'brian', 'caleb', 'carl', 'chris',
    'daniel', 'david', 'dennis', 'devon', 'dylan', 'edward', 'elijah', 'ethan', 'frank', 'gabriel', 'george',
    'henry', 'ian', 'isaac', 'jacob', 'jaden', 'james', 'john', 'joseph', 'kevin', 'kyle', 'liam', 'lucas',
    'mark', 'matthew', 'michael', 'nathan', 'noah', 'oliver', 'omar', 'paul', 'peter', 'ryan', 'samuel',
    'thomas', 'tyler', 'victor', 'wayne', 'xavier', 'zachary',
  ],
  girl: [
    'abigail', 'ada', 'amanda', 'amelia', 'amy', 'anna', 'ashley', 'bella', 'brianna', 'camila', 'candice',
    'chloe', 'danielle', 'diana', 'emma', 'emily', 'faith', 'gabrielle', 'grace', 'hannah', 'isabella',
    'jasmine', 'jessica', 'julia', 'kayla', 'keisha', 'latoya', 'leah', 'lisa', 'maya', 'mia', 'michelle',
    'natalie', 'nicole', 'olivia', 'paula', 'rachel', 'samantha', 'sarah', 'shania', 'sophia', 'tanya',
    'taylor', 'vanessa', 'victoria', 'zoe',
  ],
  animal: [
    'alligator', 'ant', 'ape', 'bat', 'bear', 'bee', 'bird', 'cat', 'cheetah', 'chicken', 'cow', 'crab',
    'crocodile', 'dog', 'dolphin', 'donkey', 'duck', 'eagle', 'elephant', 'fish', 'frog', 'giraffe', 'goat',
    'hamster', 'horse', 'iguana', 'jaguar', 'kangaroo', 'lion', 'lizard', 'monkey', 'mouse', 'octopus',
    'owl', 'parrot', 'pig', 'rabbit', 'rat', 'shark', 'sheep', 'snake', 'spider', 'tiger', 'turtle', 'whale',
    'zebra',
  ],
  place: [
    'africa', 'america', 'argentina', 'aruba', 'australia', 'bahamas', 'barbados', 'belize', 'brazil',
    'canada', 'china', 'cuba', 'denmark', 'dominica', 'egypt', 'england', 'france', 'germany', 'ghana',
    'grenada', 'guyana', 'haiti', 'india', 'ireland', 'italy', 'jamaica', 'japan', 'kingston', 'london',
    'mexico', 'miami', 'montego bay', 'nigeria', 'panama', 'paris', 'portmore', 'spain', 'st lucia',
    'suriname', 'trinidad', 'uganda', 'venezuela',
  ],
  food: [
    'ackee', 'apple', 'banana', 'beef', 'bread', 'burger', 'cake', 'carrot', 'cheese', 'chicken', 'curry',
    'dumpling', 'egg', 'fish', 'fries', 'grape', 'guava', 'hamburger', 'ice cream', 'jerk chicken', 'juice',
    'kiwi', 'mango', 'noodles', 'orange', 'pasta', 'patty', 'pear', 'pepper', 'pizza', 'plantain', 'pork',
    'rice', 'roti', 'salad', 'saltfish', 'soup', 'taco', 'yam',
  ],
  thing: [
    'airplane', 'bag', 'ball', 'bed', 'bike', 'book', 'bottle', 'box', 'brush', 'camera', 'car', 'chair',
    'clock', 'computer', 'cup', 'desk', 'door', 'fan', 'fork', 'glass', 'hat', 'house', 'key', 'knife',
    'lamp', 'laptop', 'mirror', 'phone', 'pencil', 'plate', 'radio', 'ring', 'shoe', 'spoon', 'table',
    'television', 'toothbrush', 'train', 'watch',
  ],
};

export function normalizeAnswer(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop accents so "Émile" counts for E
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidCategoryAnswer(category: AnswerCategory, value: string, targetLetter: string) {
  const normalized = normalizeAnswer(value);
  if (!normalized || normalized[0]?.toUpperCase() !== targetLetter.toUpperCase()) return false;
  return WORDS[category].includes(normalized);
}

export function isObviousGarbageAnswer(value: string) {
  const normalized = normalizeAnswer(value).replace(/\s|-/g, '');
  if (normalized.length < 2) return true;
  if (/^(.)\1{2,}$/.test(normalized)) return true;
  if (['asdf', 'qwerty', 'abcd', 'test', 'none', 'nothing'].includes(normalized)) return true;
  return false;
}

export function answerReviewKey(playerId: string, category: AnswerCategory) {
  return `${playerId}:${category}`;
}
