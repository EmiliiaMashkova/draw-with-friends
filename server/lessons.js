// Пошаговые уроки для полотна «с помощником»: каждый шаг показывает контур-подсказку (SVG path)
// в логических координатах полотна 1600×1200, который игроки обводят вместе.
// Тексты (title, hint) на трёх языках: me (черногорский), en, ru.

function circle(cx, cy, r) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
}

function petals(cx, cy, dist, r, count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    parts.push(circle(Math.round(cx + Math.cos(a) * dist), Math.round(cy + Math.sin(a) * dist), r));
  }
  return parts.join(' ');
}

const LESSONS = [
  {
    id: 'cat',
    title: { me: 'Mačkica', en: 'Kitty', ru: 'Котик' },
    steps: [
      { hint: { me: 'Nacrtaj veliki krug: to je glava.', en: 'Draw a big circle: that\'s the head.', ru: 'Нарисуйте большой круг: это голова.' }, path: circle(800, 560, 220) },
      { hint: { me: 'Dodaj dva trouglasta uha.', en: 'Add two triangle ears.', ru: 'Добавьте два треугольных уха.' }, path: 'M 620 420 L 600 250 L 740 350 M 980 420 L 1000 250 L 860 350' },
      { hint: { me: 'Oči: dva mala kruga.', en: 'Eyes: two small circles.', ru: 'Глаза: два маленьких круга.' }, path: `${circle(720, 530, 30)} ${circle(880, 530, 30)}` },
      { hint: { me: 'Nosić u obliku trougla i osmijeh.', en: 'A triangle nose and a smile.', ru: 'Носик-треугольник и улыбка.' }, path: 'M 785 600 L 815 600 L 800 620 Z M 800 620 Q 800 660 760 660 M 800 620 Q 800 660 840 660' },
      { hint: { me: 'Brkovi: po dvije linije sa svake strane.', en: 'Whiskers: two lines on each side.', ru: 'Усы: по две линии с каждой стороны.' }, path: 'M 690 610 L 520 580 M 690 630 L 520 640 M 910 610 L 1080 580 M 910 630 L 1080 640' },
      { hint: { me: 'Tijelo ispod glave.', en: 'The body under the head.', ru: 'Туловище под головой.' }, path: 'M 660 760 Q 600 1000 680 1080 L 920 1080 Q 1000 1000 940 760' },
      { hint: { me: 'Pahuljasti rep. Gotovo, možeš bojiti!', en: 'A fluffy tail. Done, time to color it in!', ru: 'Пушистый хвост. Готово, можно раскрашивать!' }, path: 'M 930 1050 Q 1150 1050 1120 850 Q 1100 780 1160 760' },
    ],
  },
  {
    id: 'house',
    title: { me: 'Kućica', en: 'Little house', ru: 'Домик' },
    steps: [
      { hint: { me: 'Zidovi: veliki pravougaonik.', en: 'Walls: a big rectangle.', ru: 'Стены: большой прямоугольник.' }, path: 'M 500 600 L 1100 600 L 1100 1050 L 500 1050 Z' },
      { hint: { me: 'Krov u obliku trougla.', en: 'A triangle roof.', ru: 'Крыша-треугольник.' }, path: 'M 440 600 L 800 300 L 1160 600' },
      { hint: { me: 'Vrata u sredini.', en: 'A door in the middle.', ru: 'Дверь посередине.' }, path: 'M 730 1050 L 730 830 L 870 830 L 870 1050' },
      {
        hint: { me: 'Dva prozora sa okvirima.', en: 'Two windows with frames.', ru: 'Два окна с рамами.' },
        path: 'M 560 680 L 680 680 L 680 790 L 560 790 Z M 620 680 L 620 790 M 560 735 L 680 735 '
          + 'M 920 680 L 1040 680 L 1040 790 L 920 790 Z M 980 680 L 980 790 M 920 735 L 1040 735',
      },
      { hint: { me: 'Dimnjak na krovu.', en: 'A chimney on the roof.', ru: 'Труба на крыше.' }, path: 'M 960 435 L 960 330 L 1030 330 L 1030 495' },
      { hint: { me: 'Dim iz dimnjaka. Gotovo!', en: 'Smoke from the chimney. Done!', ru: 'Дымок из трубы. Готово!' }, path: 'M 995 300 Q 960 260 1000 230 Q 1040 200 1000 160' },
    ],
  },
  {
    id: 'flower',
    title: { me: 'Cvijet', en: 'Flower', ru: 'Цветок' },
    steps: [
      { hint: { me: 'Sredina: krug.', en: 'The middle: a circle.', ru: 'Серединка: круг.' }, path: circle(800, 450, 70) },
      { hint: { me: 'Pet latica oko sredine.', en: 'Five petals around the middle.', ru: 'Пять лепестков вокруг серединки.' }, path: petals(800, 450, 145, 75, 5) },
      { hint: { me: 'Stabljika.', en: 'The stem.', ru: 'Стебель.' }, path: 'M 800 520 Q 780 800 800 1100' },
      { hint: { me: 'Dva listića.', en: 'Two leaves.', ru: 'Два листика.' }, path: 'M 795 850 Q 650 760 600 820 Q 680 900 795 850 M 800 950 Q 950 860 1000 920 Q 920 1000 800 950' },
      { hint: { me: 'Zemlja. Oboji cvijet!', en: 'The ground. Now color the flower!', ru: 'Земля. Раскрасьте цветок!' }, path: 'M 500 1100 Q 800 1060 1100 1100' },
    ],
  },
  {
    id: 'fish',
    title: { me: 'Ribica', en: 'Little fish', ru: 'Рыбка' },
    steps: [
      { hint: { me: 'Tijelo ribice: izduženi ovalni oblik.', en: 'The fish body: a long oval.', ru: 'Тело рыбки: вытянутый овал.' }, path: 'M 500 600 Q 750 380 1000 600 Q 750 820 500 600' },
      { hint: { me: 'Rep.', en: 'The tail.', ru: 'Хвост.' }, path: 'M 1000 600 L 1180 480 L 1150 600 L 1180 720 Z' },
      { hint: { me: 'Oko.', en: 'The eye.', ru: 'Глаз.' }, path: circle(600, 570, 25) },
      { hint: { me: 'Škrge i peraja.', en: 'Gills and fins.', ru: 'Жабры и плавники.' }, path: 'M 680 520 Q 700 600 680 680 M 780 440 Q 850 380 920 470 M 800 720 Q 850 790 900 720' },
      { hint: { me: 'Mjehurići. Gotovo!', en: 'Bubbles. Done!', ru: 'Пузырьки. Готово!' }, path: `${circle(420, 480, 20)} ${circle(380, 400, 14)} ${circle(400, 330, 10)}` },
    ],
  },
];

module.exports = { LESSONS };
