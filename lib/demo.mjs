/**
 * The demo subtitle and sample translations, so the whole flow can be seen
 * without an API key. Translations are keyed by the English piece text the
 * default layout produces (and the whole first cue, for "line break" mode).
 */

export const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:08,600
When we started this project, we thought the hardest part would be the technology, but it turned out to be understanding what people truly needed.

2
00:00:09,100 --> 00:00:14,800
That changed everything. What should we do next? Let's find out!`;

const P1 = "When we started this project, we thought";
const P2 = "the hardest part would be the technology,";
const P3 = "but it turned out to be understanding what people truly needed.";
const FULL = `${P1} ${P2} ${P3}`;
const S1 = "That changed everything.";
const S2 = "What should we do next?";
const S3 = "Let's find out!";

function sample(p1, p2, p3, full, s1, s2, s3) {
  return { [P1]: p1, [P2]: p2, [P3]: p3, [FULL]: full, [S1]: s1, [S2]: s2, [S3]: s3 };
}

export const DEMO_TRANSLATIONS = {
  "zh-Hans": sample(
    "我们刚开始做这个项目时，以为", "最难的会是技术，", "结果最难的是理解大家真正需要什么。",
    "我们刚开始做这个项目时，以为最难的会是技术，结果最难的是理解大家真正需要什么。",
    "这改变了一切。", "接下来该做什么？", "一起来看看吧！",
  ),
  "zh-Hant": sample(
    "我們剛開始做這個專案時，以為", "最難的會是技術，", "結果最難的是理解大家真正需要什麼。",
    "我們剛開始做這個專案時，以為最難的會是技術，結果最難的是理解大家真正需要什麼。",
    "這改變了一切。", "接下來該做什麼？", "一起來看看吧！",
  ),
  ja: sample(
    "このプロジェクトを始めたとき、", "一番難しいのは技術だと思っていた。", "でも本当に難しかったのは、人が何を求めているかを知ることだった。",
    "このプロジェクトを始めたとき、一番難しいのは技術だと思っていた。でも本当に難しかったのは、人が何を求めているかを知ることだった。",
    "それですべてが変わった。", "次は何をすべき？", "確かめてみよう！",
  ),
  ko: sample(
    "이 프로젝트를 시작했을 때 우리는", "가장 어려운 건 기술일 거라 생각했지만,", "알고 보니 사람들이 정말 필요로 하는 걸 이해하는 일이었어요.",
    "이 프로젝트를 시작했을 때 우리는 가장 어려운 건 기술일 거라 생각했지만, 알고 보니 사람들이 정말 필요로 하는 걸 이해하는 일이었어요.",
    "그게 모든 걸 바꿨죠.", "이제 뭘 해야 할까요?", "한번 알아봅시다!",
  ),
  es: sample(
    "Cuando empezamos este proyecto, pensábamos", "que lo más difícil sería la tecnología,", "pero resultó ser entender lo que la gente necesitaba de verdad.",
    "Cuando empezamos este proyecto, pensábamos que lo más difícil sería la tecnología, pero resultó ser entender lo que la gente necesitaba de verdad.",
    "Eso lo cambió todo.", "¿Qué hacemos ahora?", "¡Vamos a averiguarlo!",
  ),
  fr: sample(
    "Quand on a lancé ce projet, on pensait", "que le plus dur serait la technique,", "mais c'était de comprendre ce dont les gens avaient vraiment besoin.",
    "Quand on a lancé ce projet, on pensait que le plus dur serait la technique, mais c'était de comprendre ce dont les gens avaient vraiment besoin.",
    "Ça a tout changé.", "Que faire maintenant ?", "Allons voir !",
  ),
  de: sample(
    "Als wir mit dem Projekt anfingen, dachten wir,", "das Schwierigste wäre die Technik,", "aber es war zu verstehen, was die Leute wirklich brauchten.",
    "Als wir mit dem Projekt anfingen, dachten wir, das Schwierigste wäre die Technik, aber es war zu verstehen, was die Leute wirklich brauchten.",
    "Das hat alles verändert.", "Was machen wir jetzt?", "Finden wir es heraus!",
  ),
  pt: sample(
    "Quando começamos este projeto, achávamos", "que o mais difícil seria a tecnologia,", "mas era entender do que as pessoas realmente precisavam.",
    "Quando começamos este projeto, achávamos que o mais difícil seria a tecnologia, mas era entender do que as pessoas realmente precisavam.",
    "Isso mudou tudo.", "O que fazemos agora?", "Vamos descobrir!",
  ),
  ru: sample(
    "Когда мы начинали этот проект, мы думали,", "что сложнее всего будет технология,", "но оказалось — понять, что людям действительно нужно.",
    "Когда мы начинали этот проект, мы думали, что сложнее всего будет технология, но оказалось — понять, что людям действительно нужно.",
    "Это всё изменило.", "Что делать дальше?", "Давайте выясним!",
  ),
  ar: sample(
    "عندما بدأنا هذا المشروع، ظننا", "أن الجزء الأصعب سيكون التقنية،", "لكن تبيّن أنه فهم ما يحتاجه الناس حقًا.",
    "عندما بدأنا هذا المشروع، ظننا أن الجزء الأصعب سيكون التقنية، لكن تبيّن أنه فهم ما يحتاجه الناس حقًا.",
    "هذا غيّر كل شيء.", "ماذا نفعل الآن؟", "لنكتشف ذلك!",
  ),
};

/** The three pieces the default layout cuts the first cue into, for the home page. */
export const DEMO_PIECES = [P1, P2, P3];
