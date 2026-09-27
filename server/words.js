// Слова для «Угадайки»: простые предметы, которые легко нарисовать. Угадать можно на любом из трёх языков.
const WORDS = [
  { me: 'mačka', en: 'cat', ru: 'кошка', alt: ['mace', 'kitty', 'кот', 'котик'] },
  { me: 'pas', en: 'dog', ru: 'собака', alt: ['kuca', 'puppy', 'пёс', 'щенок'] },
  { me: 'sunce', en: 'sun', ru: 'солнце' },
  { me: 'kuća', en: 'house', ru: 'дом', alt: ['home', 'домик'] },
  { me: 'drvo', en: 'tree', ru: 'дерево', alt: ['stablo'] },
  { me: 'riba', en: 'fish', ru: 'рыба', alt: ['рыбка'] },
  { me: 'auto', en: 'car', ru: 'машина', alt: ['automobil', 'машинка'] },
  { me: 'cvijet', en: 'flower', ru: 'цветок', alt: ['cvet', 'цветы'] },
  { me: 'jabuka', en: 'apple', ru: 'яблоко' },
  { me: 'zvijezda', en: 'star', ru: 'звезда', alt: ['zvezda'] },
  { me: 'mjesec', en: 'moon', ru: 'луна', alt: ['mesec', 'месяц'] },
  { me: 'brod', en: 'boat', ru: 'корабль', alt: ['ship', 'лодка', 'кораблик'] },
  { me: 'lopta', en: 'ball', ru: 'мяч', alt: ['мячик'] },
  { me: 'torta', en: 'cake', ru: 'торт', alt: ['тортик'] },
  { me: 'duga', en: 'rainbow', ru: 'радуга' },
  { me: 'snješko', en: 'snowman', ru: 'снеговик', alt: ['sneško', 'snjegović'] },
  { me: 'leptir', en: 'butterfly', ru: 'бабочка' },
  { me: 'ptica', en: 'bird', ru: 'птица', alt: ['птичка'] },
  { me: 'srce', en: 'heart', ru: 'сердце', alt: ['сердечко'] },
  { me: 'raketa', en: 'rocket', ru: 'ракета' },
  { me: 'kišobran', en: 'umbrella', ru: 'зонт', alt: ['зонтик'] },
  { me: 'sladoled', en: 'ice cream', ru: 'мороженое', alt: ['icecream'] },
  { me: 'banana', en: 'banana', ru: 'банан' },
  { me: 'sat', en: 'clock', ru: 'часы', alt: ['watch'] },
  { me: 'naočare', en: 'glasses', ru: 'очки', alt: ['naocale'] },
  { me: 'kruna', en: 'crown', ru: 'корона' },
  { me: 'robot', en: 'robot', ru: 'робот' },
  { me: 'kornjača', en: 'turtle', ru: 'черепаха' },
  { me: 'zmaj', en: 'dragon', ru: 'дракон' },
  { me: 'oblak', en: 'cloud', ru: 'облако', alt: ['тучка', 'облачко'] },
  { me: 'balon', en: 'balloon', ru: 'шарик', alt: ['воздушный шар', 'шар'] },
  { me: 'pizza', en: 'pizza', ru: 'пицца', alt: ['pica'] },
  { me: 'zec', en: 'rabbit', ru: 'заяц', alt: ['bunny', 'кролик', 'зайчик'] },
  { me: 'avion', en: 'plane', ru: 'самолёт', alt: ['airplane', 'aeroplan'] },
  { me: 'kapa', en: 'hat', ru: 'шапка', alt: ['шляпа'] },
  { me: 'pauk', en: 'spider', ru: 'паук' },
];

// Сравниваем без регистра, диакритики и пробелов: «Kišobran» = «kisobran», «самолет» = «самолёт».
function normalize(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ё/g, 'е')
    .replace(/đ/g, 'dj').replace(/[^\p{L}\p{N}]/gu, '');
}

function isCorrect(word, said) {
  const s = normalize(said);
  return Boolean(s) && [word.me, word.en, word.ru, ...(word.alt || [])].some((w) => normalize(w) === s);
}

// Маска для тех, кто угадывает: буквы превращаются в «_», пробелы остаются.
function mask(word) {
  const m = (w) => w.replace(/[^\s-]/gu, '_');
  return { me: m(word.me), en: m(word.en), ru: m(word.ru) };
}

module.exports = { WORDS, normalize, isCorrect, mask };
