/** Patient education topics (Figma 06 Patient Screens · Learn).
 *  General, widely accepted guidance (WHO / ADA); each article ends with the
 *  "ask your doctor" note. The care team should review the wording. */

export type LearnLang = "en" | "fr";

export interface LearnSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LearnTopic {
  slug: string;
  icon: "activity" | "heart-pulse" | "shield-check";
  minutes: number;
  title: Record<LearnLang, string>;
  summary: Record<LearnLang, string>;
  sections: Record<LearnLang, LearnSection[]>;
}

export const LEARN_TOPICS: LearnTopic[] = [
  {
    slug: "diabetes-basics",
    icon: "activity",
    minutes: 5,
    title: { en: "Diabetes basics", fr: "Les bases du diabète" },
    summary: {
      en: "How blood sugar, insulin, food, and activity work together.",
      fr: "Comment la glycémie, l’insuline, l’alimentation et l’activité fonctionnent ensemble.",
    },
    sections: {
      en: [
        {
          heading: "Blood sugar and insulin",
          paragraphs: [
            "The food you eat is turned into glucose (sugar), which your body uses for energy. Insulin, a hormone made by the pancreas, lets glucose move from the blood into your cells.",
            "Diabetes means the body does not make enough insulin, or does not use it well, so glucose builds up in the blood.",
          ],
        },
        {
          heading: "The main types",
          bullets: [
            "Type 1: the body makes little or no insulin. It often starts in childhood or young adulthood and always needs insulin.",
            "Type 2: the most common type. The body uses insulin poorly. It is linked to age, family history, weight and inactivity.",
            "Gestational diabetes: high blood sugar during pregnancy. It raises the later risk of type 2 for the mother.",
            "Prediabetes: blood sugar is higher than normal but not yet diabetes. Healthy changes can often bring it back to normal.",
          ],
        },
        {
          heading: "Common signs",
          bullets: [
            "Being very thirsty or urinating often",
            "Unusual tiredness",
            "Blurry vision",
            "Wounds that heal slowly",
          ],
          paragraphs: ["Many people with type 2 diabetes have no signs at first, which is why regular checks matter."],
        },
        {
          heading: "How it is checked",
          paragraphs: [
            "Doctors use blood tests such as HbA1c (average sugar over about 3 months) and fasting glucose. As a guide, an HbA1c of 6.5% or more, or a fasting glucose of 126 mg/dL or more, suggests diabetes; 5.7–6.4% or 100–125 mg/dL suggests prediabetes. Only a doctor can confirm a diagnosis.",
          ],
        },
        {
          heading: "Living well with diabetes",
          bullets: [
            "Balanced meals with vegetables, whole grains and fewer sugary drinks",
            "Regular physical activity",
            "Taking medicines as prescribed",
            "Regular follow-up visits and blood tests",
          ],
        },
      ],
      fr: [
        {
          heading: "Glycémie et insuline",
          paragraphs: [
            "Les aliments sont transformés en glucose (sucre), que le corps utilise comme énergie. L’insuline, une hormone produite par le pancréas, permet au glucose de passer du sang vers les cellules.",
            "Le diabète signifie que le corps ne produit pas assez d’insuline, ou l’utilise mal : le glucose s’accumule alors dans le sang.",
          ],
        },
        {
          heading: "Les principaux types",
          bullets: [
            "Type 1 : le corps produit peu ou pas d’insuline. Il débute souvent chez l’enfant ou le jeune adulte et nécessite toujours de l’insuline.",
            "Type 2 : le plus fréquent. Le corps utilise mal l’insuline. Il est lié à l’âge, aux antécédents familiaux, au poids et à la sédentarité.",
            "Diabète gestationnel : glycémie élevée pendant la grossesse. Il augmente ensuite le risque de diabète de type 2 chez la mère.",
            "Prédiabète : glycémie plus élevée que la normale sans être un diabète. Des changements de mode de vie permettent souvent de la normaliser.",
          ],
        },
        {
          heading: "Les signes fréquents",
          bullets: [
            "Avoir très soif ou uriner souvent",
            "Une fatigue inhabituelle",
            "Une vision floue",
            "Des plaies qui cicatrisent lentement",
          ],
          paragraphs: ["Beaucoup de personnes atteintes de diabète de type 2 n’ont aucun signe au début : d’où l’importance des contrôles réguliers."],
        },
        {
          heading: "Comment le dépister",
          paragraphs: [
            "Les médecins utilisent des analyses de sang comme l’HbA1c (sucre moyen sur environ 3 mois) et la glycémie à jeun. À titre indicatif, une HbA1c de 6,5 % ou plus, ou une glycémie à jeun de 126 mg/dL ou plus, évoque un diabète ; 5,7–6,4 % ou 100–125 mg/dL évoquent un prédiabète. Seul un médecin peut confirmer le diagnostic.",
          ],
        },
        {
          heading: "Bien vivre avec le diabète",
          bullets: [
            "Des repas équilibrés avec des légumes, des céréales complètes et moins de boissons sucrées",
            "Une activité physique régulière",
            "La prise des traitements comme prescrit",
            "Des visites de suivi et des analyses régulières",
          ],
        },
      ],
    },
  },
  {
    slug: "complications",
    icon: "heart-pulse",
    minutes: 6,
    title: { en: "Complications", fr: "Les complications" },
    summary: {
      en: "Understand how long-term health may affect eyes, kidneys, feet, and heart.",
      fr: "Comprendre comment le diabète peut toucher les yeux, les reins, les pieds et le cœur.",
    },
    sections: {
      en: [
        {
          heading: "Why complications happen",
          paragraphs: [
            "Over years, high blood sugar can damage small and large blood vessels and nerves. Keeping blood sugar, blood pressure and cholesterol in range lowers this risk a lot.",
          ],
        },
        {
          heading: "Eyes",
          paragraphs: [
            "Diabetic retinopathy affects the back of the eye and may cause no symptoms early on. An eye exam (retina check) at least once a year helps find it in time.",
          ],
        },
        {
          heading: "Kidneys",
          paragraphs: [
            "Diabetes can slowly harm the kidneys. A yearly urine test (albumin) and blood test (kidney function) can detect early changes.",
          ],
        },
        {
          heading: "Feet",
          bullets: [
            "Nerve damage can reduce feeling, so small wounds go unnoticed.",
            "Look at your feet every day for cuts, blisters, redness or swelling.",
            "Wear comfortable shoes and never walk barefoot.",
            "See a doctor quickly if a wound does not heal.",
          ],
        },
        {
          heading: "Heart and blood vessels",
          paragraphs: [
            "Diabetes increases the risk of heart attack and stroke. Not smoking, staying active, and controlling blood pressure and cholesterol protect your heart.",
          ],
        },
        {
          heading: "When to seek urgent care",
          bullets: [
            "Signs of very low sugar (shaking, sweating, confusion) that do not improve after eating sugar",
            "Very high sugar with vomiting, deep breathing or drowsiness",
            "Chest pain, sudden weakness or difficulty speaking",
          ],
        },
      ],
      fr: [
        {
          heading: "Pourquoi les complications apparaissent",
          paragraphs: [
            "Au fil des années, une glycémie élevée peut abîmer les petits et gros vaisseaux sanguins ainsi que les nerfs. Maintenir la glycémie, la tension et le cholestérol dans les objectifs réduit fortement ce risque.",
          ],
        },
        {
          heading: "Les yeux",
          paragraphs: [
            "La rétinopathie diabétique touche le fond de l’œil et peut ne donner aucun symptôme au début. Un examen des yeux (fond d’œil) au moins une fois par an permet de la détecter à temps.",
          ],
        },
        {
          heading: "Les reins",
          paragraphs: [
            "Le diabète peut abîmer lentement les reins. Une analyse d’urine (albumine) et une prise de sang (fonction rénale) chaque année détectent les premiers changements.",
          ],
        },
        {
          heading: "Les pieds",
          bullets: [
            "L’atteinte des nerfs peut diminuer la sensibilité : de petites plaies passent inaperçues.",
            "Regardez vos pieds chaque jour : coupures, ampoules, rougeurs ou gonflements.",
            "Portez des chaussures confortables et ne marchez jamais pieds nus.",
            "Consultez rapidement si une plaie ne guérit pas.",
          ],
        },
        {
          heading: "Le cœur et les vaisseaux",
          paragraphs: [
            "Le diabète augmente le risque d’infarctus et d’AVC. Ne pas fumer, rester actif et contrôler la tension et le cholestérol protègent votre cœur.",
          ],
        },
        {
          heading: "Quand consulter en urgence",
          bullets: [
            "Des signes d’hypoglycémie (tremblements, sueurs, confusion) qui ne s’améliorent pas après avoir pris du sucre",
            "Une glycémie très élevée avec vomissements, respiration profonde ou somnolence",
            "Une douleur dans la poitrine, une faiblesse soudaine ou des difficultés à parler",
          ],
        },
      ],
    },
  },
  {
    slug: "prevention",
    icon: "shield-check",
    minutes: 5,
    title: { en: "Prevention", fr: "Prévention" },
    summary: {
      en: "Everyday movement, balanced meals, sleep, and regular health checks.",
      fr: "Bouger au quotidien, manger équilibré, bien dormir et se faire contrôler régulièrement.",
    },
    sections: {
      en: [
        {
          heading: "Move every day",
          paragraphs: [
            "Aim for at least 150 minutes of moderate activity a week — for example 30 minutes of brisk walking, 5 days a week. Short walks after meals also help lower blood sugar.",
          ],
        },
        {
          heading: "A balanced plate",
          bullets: [
            "Fill half the plate with vegetables",
            "Choose whole grains and legumes (lentils, chickpeas, beans)",
            "Drink water instead of sodas and sweet juices",
            "Keep sweets and fried food for occasional treats",
          ],
        },
        {
          heading: "A healthy weight",
          paragraphs: [
            "If you are overweight, losing even 5–7% of your body weight can greatly lower the risk of type 2 diabetes.",
          ],
        },
        {
          heading: "Sleep and stress",
          paragraphs: [
            "Most adults need 7–9 hours of sleep. Poor sleep and long-term stress can raise blood sugar.",
          ],
        },
        {
          heading: "Regular checks",
          paragraphs: [
            "Ask your doctor about a blood sugar test, especially if you are 35 or older, overweight, have a family history of diabetes, high blood pressure, or had diabetes during pregnancy. Not smoking also protects your health.",
          ],
        },
      ],
      fr: [
        {
          heading: "Bouger chaque jour",
          paragraphs: [
            "Visez au moins 150 minutes d’activité modérée par semaine — par exemple 30 minutes de marche rapide, 5 jours par semaine. Une courte marche après les repas aide aussi à baisser la glycémie.",
          ],
        },
        {
          heading: "Une assiette équilibrée",
          bullets: [
            "Remplissez la moitié de l’assiette de légumes",
            "Choisissez des céréales complètes et des légumineuses (lentilles, pois chiches, haricots)",
            "Buvez de l’eau plutôt que des sodas et des jus sucrés",
            "Gardez les sucreries et les fritures pour les occasions",
          ],
        },
        {
          heading: "Un poids santé",
          paragraphs: [
            "En cas de surpoids, perdre même 5 à 7 % de son poids réduit fortement le risque de diabète de type 2.",
          ],
        },
        {
          heading: "Sommeil et stress",
          paragraphs: [
            "La plupart des adultes ont besoin de 7 à 9 heures de sommeil. Le manque de sommeil et le stress prolongé peuvent augmenter la glycémie.",
          ],
        },
        {
          heading: "Des contrôles réguliers",
          paragraphs: [
            "Demandez à votre médecin un dosage de la glycémie, surtout si vous avez 35 ans ou plus, un surpoids, des antécédents familiaux de diabète, une tension élevée ou un diabète pendant une grossesse. Ne pas fumer protège aussi votre santé.",
          ],
        },
      ],
    },
  },
];

export function learnTopic(slug: string): LearnTopic | undefined {
  return LEARN_TOPICS.find((topic) => topic.slug === slug);
}
