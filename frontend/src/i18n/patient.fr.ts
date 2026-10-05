// Portail patient (Figma « 06 Patient Screens »), textes français — repris
// des cadres [FR] quand ils existent.
const ptFr: Record<string, string> = {
  // shell
  "pt.nav.home": "Accueil",
  "pt.nav.questionnaire": "Questionnaire",
  "pt.nav.learn": "Apprendre",
  "pt.nav.chat": "Chat",
  "pt.nav.settings": "Paramètres",
  "pt.menu.settings": "Paramètres",
  "pt.menu.notifications": "Notifications",

  // accueil
  "pt.home.morning": "Bonjour, {name}",
  "pt.home.afternoon": "Bon après-midi, {name}",
  "pt.home.evening": "Bonsoir, {name}",
  "pt.home.subtitle": "De petits gestes aujourd’hui soutiennent votre santé à long terme.",
  "pt.home.myHealth": "Ma santé",
  "pt.home.private": "Privé",
  "pt.home.lastCheck": "Dernier contrôle",
  "pt.home.nextVisit": "Prochaine visite",
  "pt.home.none": "—",
  "pt.home.notScheduled": "Non planifiée",
  "pt.home.riskQuestionnaire": "Questionnaire de risque",
  "pt.home.forYou": "Pour vous",
  "pt.home.readTime": "{n} min de lecture",
  "pt.home.learnBasics": "Les bases",
  "pt.home.learnBasicsDesc": "Des informations claires et pratiques pour la prévention au quotidien.",
  "pt.home.myCare": "Mon suivi",
  "pt.home.results": "Mes résultats",
  "pt.home.resultsDesc": "Les résultats confirmés par votre médecin.",
  "pt.home.foot": "Photo du pied",
  "pt.home.footDesc": "Envoyez une photo du pied pour un dépistage d’ulcère.",
  "pt.home.neck": "Photo du cou",
  "pt.home.neckDesc": "Envoyez une photo du cou pour un dépistage d’acanthosis.",

  // questionnaire de risque
  "pt.q.title": "Questionnaire de risque",
  "pt.q.subtitle":
    "Un bref contrôle général des risques. Choisissez une réponse pour chaque question.",
  "pt.q.answered": "{n} réponses sur {total}",
  "pt.q.yes": "Oui",
  "pt.q.no": "Non",
  "pt.q.age": "Avez-vous 45 ans ou plus ?",
  "pt.q.family": "Un proche a-t-il du diabète ?",
  "pt.q.inactive": "Faites-vous de l’activité physique moins de 3 jours par semaine ?",
  "pt.q.bloodPressure": "On vous a-t-il dit que votre tension artérielle est élevée ?",
  "pt.q.pregnancy": "Avez-vous eu un taux de sucre élevé pendant une grossesse ?",
  "pt.q.thirst": "Avez-vous souvent très soif ?",
  "pt.q.yourResult": "Votre résultat",
  "pt.q.consult": "Consultez un médecin",
  "pt.q.low": "Risque faible",
  "pt.q.disclaimer":
    "Ce questionnaire n’est pas un diagnostic. Il vous aide à identifier des facteurs de risque. Consultez un médecin pour une évaluation complète.",
  "pt.q.reset": "Recommencer",

  // auto-contrôle des symptômes
  "pt.s.title": "Vérifiez vos symptômes",
  "pt.s.subtitle": "Auto-contrôle éducatif, pas un diagnostic.",
  "pt.s.seeResult": "Voir le résultat",
  "pt.s.prompt": "Ces dernières semaines, avez-vous remarqué ceci ?",
  "pt.s.thirst": "Plus soif que d’habitude",
  "pt.s.urination": "Envie d’uriner plus fréquente",
  "pt.s.fatigue": "Fatigue inhabituelle",
  "pt.s.vision": "Vision floue",
  "pt.s.wounds": "Plaies qui cicatrisent lentement",
  "pt.s.guidance": "Interprétation",
  "pt.s.lowRange": "0–1 oui",
  "pt.s.lowTitle": "Peu préoccupant",
  "pt.s.lowText": "Gardez vos bonnes habitudes.",
  "pt.s.highRange": "2+ oui",
  "pt.s.highText": "Ceci n’est pas un diagnostic. Veuillez consulter un médecin.",
  "pt.s.consult": "Consulter un médecin",
  "pt.s.findClinic": "Trouver une clinique",
  "pt.s.answerAll": "Répondez à chaque symptôme pour voir votre résultat.",
  "pt.s.footer": "Éducation uniquement — cette application ne peut pas poser de diagnostic.",

  // consulter un médecin
  "pt.consult.title": "Consulter un médecin",
  "pt.consult.intro": "Contactez votre équipe soignante pour prendre rendez-vous.",
  "pt.consult.none":
    "Aucun médecin n’est encore lié à votre compte. Contactez votre clinique ou un médecin généraliste.",
  "pt.consult.close": "Fermer",

  // apprendre
  "pt.learn.title": "Apprendre",
  "pt.learn.subtitle": "Une éducation à la santé simple, pensée pour la vie quotidienne en Algérie.",
  "pt.learn.back": "Retour à Apprendre",
  "pt.learn.note":
    "Éducation générale à la santé — demandez à votre médecin ce qui s’applique à vous.",

  // chat
  "pt.chat.title": "Chat IA",
  "pt.chat.subtitle": "Posez vos questions de santé à notre assistant éducatif.",
  "pt.chat.badge": "Assistant éducatif",
  "pt.chat.placeholder": "Posez une question de santé…",
  "pt.chat.consult": "Consulter un médecin",
  "pt.chat.sources": "Informations de référence",
  "pt.chat.banner": "Éducation uniquement — pas un diagnostic.",
  "pt.chat.empty":
    "Posez une question sur le diabète, l’alimentation, l’activité ou vos symptômes.",
  "pt.chat.thinking": "Recherche dans la base de connaissances…",
  "pt.chat.send": "Envoyer",
  "pt.chat.page": "p. {n}",

  // paramètres
  "pt.set.title": "Paramètres",
  "pt.set.subtitle": "Gérez votre profil, votre langue et vos préférences d’assistance.",
  "pt.set.edit": "Modifier le profil",
  "pt.set.language": "Langue",
  "pt.set.languageDesc": "Choisissez la langue du portail",
  "pt.set.chatbot": "Préférences du chatbot",
  "pt.set.friendly": "Explications simples",
  "pt.set.friendlyDesc": "Un langage simple et bienveillant dans le chat.",
  "pt.set.notifications": "Notifications",
  "pt.set.notificationsDesc": "Rappels et nouveautés éducatives uniquement.",
  "pt.set.privacy":
    "Vos préférences restent privées et peuvent être modifiées à tout moment.",
  "pt.set.newPassword": "Nouveau mot de passe (facultatif)",
  "pt.set.saved": "Profil enregistré",

  // notifications
  "pt.notif.title": "Notifications",
  "pt.notif.subtitle": "Rappels, résultats et nouveautés éducatives.",
  "pt.notif.all": "Toutes",
  "pt.notif.reminders": "Rappels",
  "pt.notif.education": "Éducation",
  "pt.notif.tag.reminder": "Rappel",
  "pt.notif.tag.education": "Éducation",
  "pt.notif.tag.result": "Résultat",
  "pt.notif.tag.care": "Équipe soignante",
  "pt.notif.visitTitle": "Rappel de visite",
  "pt.notif.visitBody": "Votre visite à la clinique est prévue le {date} à {time}.",
  "pt.notif.resultTitle": "Nouveau résultat",
  "pt.notif.careTitle": "Équipe soignante",
  "pt.notif.yesterday": "Hier",
  "notif.visit_reminder": "{doctor} a planifié votre prochaine visite",
  "pt.notif.empty": "Rien pour le moment.",
};

export default ptFr;
