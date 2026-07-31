// All copy + data for the DAUST public site. This is the DEFAULT content; the site
// CMS layers per-path bilingual text overrides + image overrides on top at runtime
// (see SiteOverrides / applyOverrides below). EN/FR are swapped by the `lang` argument.

import { z } from "zod";

export type Lang = "en" | "fr";
export type PageKey =
  | "home" | "academics" | "admissions" | "research"
  | "faculty" | "innovation" | "campus" | "about" | "portal" | "contact"
  | "news";

export interface FacultyMember {
  id: string; slot: string; initials: string; name: string; title: string;
  dept: string; interests: string[]; bio: string; scholar: string;
  /** Optional uploaded photo; falls back to the initials monogram when absent. */
  image?: string;
}

export function buildContent(lang: Lang) {
  const fr = lang === "fr";
  const T = (en: string, frr: string) => (fr ? frr : en);

  const tx = {
    uNews: T("News", "Actualités"), uResearch: T("Research", "Recherche"),
    uPortal: T("myDAUST Portal", "Portail myDAUST"), uContact: T("Contact", "Contact"),
    askAI: T("Ask AI", "Demander à l’IA"), apply: T("Apply", "Postuler"), applyNow: T("Apply Now", "Postuler"),
    heroKicker: T("Admissions Open — September 2026", "Admissions ouvertes — septembre 2026"),
    heroTitle: T("Educating Africa’s future world-class engineers.", "Former les ingénieurs de classe mondiale de demain en Afrique."),
    heroSub: T("An American-style, five-year engineering university in Somone, Senegal — rigorous academics, state-of-the-art labs, and research that shapes the continent.", "Une université d’ingénierie de type américain, en cinq ans, à Somone, au Sénégal — des études rigoureuses, des laboratoires de pointe et une recherche qui façonne le continent."),
    heroExplore: T("Explore programs →", "Découvrir les programmes →"),
    heroLoc: T("Somone · Thiès · Senegal", "Somone · Thiès · Sénégal"),
    recTitle: T("Recognized & accredited", "Reconnue & accréditée"),
    whyKicker: T("Why DAUST", "Pourquoi DAUST"), whyTitle: T("An education built for impact.", "Une formation conçue pour avoir de l’impact."),
    progKicker: T("Programs", "Programmes"), progTitle: T("A five-year engineering degree.", "Un diplôme d’ingénieur en cinq ans."), viewAll: T("View all →", "Tout voir →"),
    learnMore: T("Learn more →", "En savoir plus →"),
    spotKicker: T("Spotlight · Research", "À la une · Recherche"),
    spotTitle: T("Research that solves real African challenges.", "Une recherche qui répond aux défis concrets de l’Afrique."),
    spotBody: T("Across eight interdisciplinary centers under SIRDIC — from Smart Agriculture and DAIR (AI) to Photonics & Quantum and the Space Technology Lab — DAUST students and faculty build technology with measurable impact, starting in their first year.", "À travers huit centres interdisciplinaires sous SIRDIC — de l’Agriculture intelligente et DAIR (IA) à la Photonique & Quantique et au Laboratoire de technologie spatiale — étudiants et enseignants de DAUST développent des technologies à impact mesurable, dès la première année."),
    exploreResearch: T("Explore research →", "Découvrir la recherche →"),
    newsKicker: T("News & Stories", "Actualités & Récits"), newsAll: T("All news →", "Toutes les actualités →"),
    newsTitle: T("News & Stories", "Actualités & Récits"),
    newsSub: T("Stories from the DAUST community — research, campus life, and milestones.", "Des histoires de la communauté DAUST — recherche, vie de campus et jalons."),
    newsEmpty: T("More news stories are on the way. Check back soon.", "De nouvelles actualités arrivent bientôt. Revenez vite !"),
    lifeKicker: T("Life @ DAUST", "La vie @ DAUST"),
    ctaTitle: T("Your engineering journey starts in Somone.", "Votre parcours d’ingénieur commence à Somone."),
    askOurAI: T("Ask our AI", "Demander à notre IA"),
    eduKicker: T("Education", "Formation"),
    eduTitle: T("A five-year engineering degree, taught in English.", "Un diplôme d’ingénieur en cinq ans, enseigné en anglais."),
    eduSub: T("Our undergraduate curriculum combines a full five-year course sequence with an extensive set of related co-curricular activities and hands-on labs.", "Notre cursus combine une séquence complète de cinq ans avec de nombreuses activités co-curriculaires et des travaux pratiques en laboratoire."),
    coeKicker: T("College of Engineering", "École d’ingénierie"),
    pathKicker: T("Global Pathways", "Passerelles internationales"),
    pathTitle: T("2 + 2 Joint Bachelor with the University of Nebraska.", "Licence conjointe 2 + 2 avec l’Université du Nebraska."),
    pathP1: T("DAUST’s two-year PREPA program delivers intensive preparatory courses in sciences and the foundations of engineering. After completion, students may finish their degree at DAUST or enroll at a top university abroad.", "Le programme PREPA de deux ans de DAUST offre des cours préparatoires intensifs en sciences et fondamentaux de l’ingénierie. À l’issue, les étudiants peuvent terminer à DAUST ou intégrer une grande université à l’étranger."),
    pathP2: T("DAUST has signed a partnership with the University of Nebraska (UNL) for a joint 2 + 2 Bachelor degree in Mechanical Engineering.", "DAUST a signé un partenariat avec l’Université du Nebraska (UNL) pour une licence conjointe 2 + 2 en génie mécanique."),
    applyToday: T("Apply Today →", "Postuler aujourd’hui →"),
    admKicker: T("Admissions Open — September 2026", "Admissions ouvertes — septembre 2026"),
    admTitle: T("Join us at DAUST.", "Rejoignez DAUST."),
    admSub: T("An elite American engineering education close to home — the best education in Senegal at a fraction of the cost of studying in the USA, UK or Canada.", "Une formation d’ingénieur américaine d’élite près de chez vous — la meilleure éducation au Sénégal à une fraction du coût des États-Unis, du Royaume-Uni ou du Canada."),
    admApply: T("Apply for Admission →", "Demander l’admission →"),
    procKicker: T("Admission Procedure", "Procédure d’admission"),
    costKicker: T("Cost & Scholarships", "Coûts & Bourses"),
    reqKicker: T("Requirements", "Conditions"), reqTitle: T("First-year undergraduate.", "Première année de licence."),
    reqContact: T("Questions? admissions@daust.org · +221 78 128 4458 / +221 77 488 25 15 (mobile & WhatsApp).", "Questions ? admissions@daust.org · +221 78 128 4458 / +221 77 488 25 15 (mobile & WhatsApp)."),
    faqKicker: T("FAQ", "FAQ"), faqTitle: T("Good to know.", "Bon à savoir."),
    resKicker: T("Research", "Recherche"),
    resTitle: T("An R&D enterprise for Africa’s future.", "Une entreprise de R&D pour l’avenir de l’Afrique."),
    resSub: T("Research at DAUST is an interdisciplinary, collaborative international R&D enterprise addressing Africa’s societal challenges and the most fundamental problems in science — while exploring new technologies to keep African economies competitive.", "La recherche à DAUST est une entreprise de R&D internationale, interdisciplinaire et collaborative, qui répond aux défis sociétaux de l’Afrique et aux problèmes les plus fondamentaux de la science — tout en explorant les technologies qui maintiennent les économies africaines compétitives."),
    centersKicker: T("SIRDIC · Research Centers", "SIRDIC · Centres de recherche"),
    dirKicker: T("Center Directors", "Directeurs de centres"),
    facKicker: T("Faculty", "Corps professoral"),
    facTitle: T("Meet the people behind the research.", "Rencontrez celles et ceux derrière la recherche."),
    facSub: T("World-class faculty trained at leading global institutions lead teaching and research across DAUST’s six centers. Explore their work and research profiles.", "Un corps professoral de classe mondiale, formé dans les meilleures institutions, dirige l’enseignement et la recherche dans les centres de DAUST. Découvrez leurs travaux et leurs pages de recherche."),
    facLink: T("Research Page →", "Page de recherche →"),
    facAll: T("All faculty", "Tout le corps professoral"),
    facInterests: T("Research Interests", "Thèmes de recherche"),
    facCenter: T("Research center →", "Centre de recherche →"), facPubs: T("Publications →", "Publications →"),
    innKicker: T("Technology Ventures Program", "Programme Technology Ventures"),
    innTitle: T("From classroom idea to launched startup.", "De l’idée en cours à la startup lancée."),
    innSub: T("The DAUST Technology Ventures Program gives engineering students a supportive environment to take ideas from concept to viable startup — with resources, mentorship and training, ensuring Africa’s inclusive participation in emerging technology.", "Le programme Technology Ventures de DAUST offre aux étudiants un environnement propice pour transformer une idée en startup viable — avec ressources, mentorat et formation, garantissant la participation inclusive de l’Afrique aux technologies émergentes."),
    deepKicker: T("Deep Tech Incubation", "Incubation Deep Tech"),
    deepBody: T("We support early-stage entrepreneurs developing engineering and technology based on scientific breakthroughs — AI, machine learning, biotech, nanotech, robotics and quantum computing — that address Africa’s pressing issues while creating wealth and jobs.", "Nous accompagnons les entrepreneurs en phase d’amorçage développant des technologies fondées sur des avancées scientifiques — IA, apprentissage automatique, biotech, nanotech, robotique et informatique quantique — pour répondre aux enjeux de l’Afrique tout en créant richesse et emplois."),
    startKicker: T("Startups & Partners", "Startups & Partenaires"),
    lifeTitle: T("A home away from home.", "Un second chez-soi."),
    lifeSub: T("A powerfully positive environment on a beautiful coastal campus in Somone — with an Office of Student Affairs dedicated to every student’s success.", "Un environnement profondément positif sur un magnifique campus côtier à Somone — avec un Bureau de la vie étudiante dédié à la réussite de chacun."),
    aboutKicker: T("About DAUST", "À propos de DAUST"),
    aboutTitle: T("An American-style university, rooted in African impact.", "Une université de type américain, ancrée dans l’impact africain."),
    aboutSub: T("Founded in 2017 by Prof. Sidy Ndao, DAUST is a five-year engineering university in the natural resort of Somone, in the Thiès region of Senegal.", "Fondée en 2017 par le Pr Sidy Ndao, DAUST est une université d’ingénierie de cinq ans dans la station balnéaire de Somone, région de Thiès, au Sénégal."),
    missionKicker: T("Our Mission", "Notre mission"), missionTitle: T("Educating Africa’s future engineers.", "Former les ingénieurs de demain en Afrique."),
    missionP1: T("The human resource is the most important resource of any nation, and the best way to develop it is through education — with science and engineering at the forefront. Across Africa, tertiary enrolment sits near 12%, and fewer than a quarter of those students are in STEM fields.", "La ressource humaine est la plus importante de toute nation, et le meilleur moyen de la développer est l’éducation — avec la science et l’ingénierie au premier plan. En Afrique, le taux d’inscription dans le supérieur avoisine 12 %, et moins d’un quart de ces étudiants sont en filières STEM."),
    missionP2: T("DAUST provides an alternative and a solution: to educate Africa’s future world-class engineers, scientists and innovators, while creating positive impact across the continent through applied research and extension programs.", "DAUST apporte une alternative et une solution : former les futurs ingénieurs, scientifiques et innovateurs de classe mondiale de l’Afrique, tout en créant un impact positif sur le continent par la recherche appliquée et les programmes d’extension."),
    storyKicker: T("Our Story", "Notre histoire"),
    presKicker: T("Meet the President", "Le mot du Président"),
    presQuote: T("“DAUST strives to provide a high-quality education that prepares its students for successful careers and to contribute to the development of their communities and the African continent.”", "“DAUST s’efforce d’offrir une éducation de haute qualité qui prépare ses étudiants à des carrières réussies et à contribuer au développement de leurs communautés et du continent africain.”"),
    presRole: T("Founder & President · Ph.D. RPI, Postdoc MIT, former Assoc. Prof. at UNL", "Fondateur & Président · Doctorat RPI, Postdoc MIT, ancien Prof. associé à UNL"),
    portalTitle: T("The campus platform for students, faculty & staff.", "La plateforme du campus pour les étudiants, enseignants et personnel."),
    portalSub: T("Access academics, admissions, billing, dining, student affairs and the innovation tracker — all in one place.", "Accédez à la scolarité, aux admissions, à la facturation, à la restauration, à la vie étudiante et au suivi de l’innovation — au même endroit."),
    signInTitle: T("Sign in", "Connexion"), signInSub: T("Use your DAUST account credentials.", "Utilisez vos identifiants de compte DAUST."),
    signInBtn: T("Sign in →", "Se connecter →"),
    portalNote: T("The myDAUST portal is launching soon. Prospective students can", "Le portail myDAUST arrive bientôt. Les futurs étudiants peuvent"),
    portalNoteApply: T("start an application", "démarrer une candidature"), portalNoteOr: T("or", "ou"), portalNoteAI: T("ask the AI assistant", "demander à l’assistant IA"),
    portalNew: T("New here?", "Nouveau ?"), portalApplyLink: T("Apply for admission →", "Demander l’admission →"),
    emailLabel: T("Email", "E-mail"), passwordLabel: T("Password", "Mot de passe"),
    contactTitle: T("Get in touch with DAUST.", "Contactez DAUST."),
    contactSub: T("Questions about programs, admissions or partnerships? Reach our team or send a message and we’ll get back to you.", "Des questions sur les programmes, les admissions ou les partenariats ? Contactez notre équipe ou envoyez un message, nous vous répondrons."),
    reachKicker: T("Reach Us", "Nous joindre"), sendKicker: T("Send a Message", "Envoyer un message"),
    nameLabel: T("Full name", "Nom complet"), messageLabel: T("Message", "Message"),
    namePh: T("Your full name", "Votre nom complet"), messagePh: T("How can we help?", "Comment pouvons-nous aider ?"),
    sendBtn: T("Send message →", "Envoyer le message →"),
    sentTitle: T("Message sent", "Message envoyé"), sentBody: T("Thank you for reaching out. Our team will respond to you shortly.", "Merci de votre message. Notre équipe vous répondra sous peu."),
    applyKicker: T("Admissions · Fall 2026", "Admissions · Rentrée 2026"), applyTitle: T("Start your application", "Démarrer votre candidature"),
    applyName: T("Full name", "Nom complet"), applyEmail: T("Email", "E-mail"), applyProgram: T("Program of interest", "Programme visé"),
    applySubmit: T("Submit application →", "Soumettre la candidature →"),
    applyQ: T("Questions?", "Questions ?"), applyAI: T("Ask our AI assistant", "Demander à notre assistant IA"),
    thankTitle: T("Thank you!", "Merci !"),
    thankBody: T("Your interest has been received. Our admissions team will reach out with next steps for the September 2026 intake.", "Votre intérêt a bien été reçu. Notre équipe des admissions vous contactera pour la suite concernant la rentrée de septembre 2026."),
    done: T("Done", "Terminé"),
    footTagline: T("Dakar American University of Science & Technology — educating Africa’s future world-class engineers, scientists and innovators. Somone, Thiès, Senegal.", "Dakar American University of Science & Technology — former les futurs ingénieurs, scientifiques et innovateurs de classe mondiale de l’Afrique. Somone, Thiès, Sénégal."),
    footRights: T("© DAUST 2026. All Rights Reserved.", "© DAUST 2026. Tous droits réservés."),
    // AI panel
    aiWelcome: T("Hi! I’m the DAUST assistant. Ask me anything about our engineering programs, admissions, tuition, or life on campus in Somone.", "Bonjour ! Je suis l’assistant DAUST. Posez-moi vos questions sur nos programmes d’ingénierie, les admissions, les frais ou la vie sur le campus à Somone."),
    aiSuggestLabel: T("Try asking", "Suggestions"),
    aiPlaceholder: T("Ask about programs or admissions…", "Programmes ou admissions…"),
    aiComingSoon: T("Thanks for your question! The DAUST AI assistant is launching soon. In the meantime, email admissions@daust.org or use the Apply button and our team will help you directly.", "Merci pour votre question ! L’assistant IA de DAUST arrive bientôt. En attendant, écrivez à admissions@daust.org ou utilisez le bouton Postuler et notre équipe vous aidera directement."),
  };

  const nav: [string, PageKey][] = [
    [T("Academics", "Formation"), "academics"], [T("Admissions", "Admissions"), "admissions"],
    [T("Research", "Recherche"), "research"], [T("Faculty", "Corps professoral"), "faculty"],
    [T("Innovation", "Innovation"), "innovation"], [T("Campus Life", "Vie du campus"), "campus"],
    [T("About", "À propos"), "about"],
  ];

  const suggestions = fr
    ? ["Quels programmes propose DAUST ?", "Combien coûtent les études et les bourses ?", "Comment postuler à DAUST ?", "Faut-il parler anglais pour être admis ?"]
    : ["What engineering programs does DAUST offer?", "How much is tuition, and are there scholarships?", "How do I apply to DAUST?", "Do I need to speak English to be admitted?"];

  const footCols: { head: string; items: { label: string; page?: PageKey; apply?: boolean; ai?: boolean }[] }[] = [
    { head: T("Study", "Étudier"), items: [
      { label: T("Admissions", "Admissions"), page: "admissions" },
      { label: T("Academics", "Formation"), page: "academics" },
      { label: T("Intensive English", "Anglais intensif"), page: "academics" },
      { label: T("Tuition & Aid", "Frais & Aides"), page: "admissions" },
    ] },
    { head: T("Discover", "Découvrir"), items: [
      { label: T("Research", "Recherche"), page: "research" },
      { label: T("Faculty", "Corps professoral"), page: "faculty" },
      { label: T("Innovation", "Innovation"), page: "innovation" },
      { label: T("Campus Life", "Vie du campus"), page: "campus" },
      { label: T("About DAUST", "À propos"), page: "about" },
    ] },
    { head: T("Connect", "Contact"), items: [
      { label: T("Apply Now", "Postuler"), apply: true },
      { label: T("Our Mission", "Notre mission"), page: "about" },
      { label: T("Ask the AI", "Demander à l’IA"), ai: true },
      { label: T("myDAUST Portal", "Portail myDAUST"), page: "portal" },
      { label: T("Contact", "Contact"), page: "contact" },
    ] },
  ];

  const heroStats = [
    { n: "100", mark: "%", label: T("Graduate job placement", "Insertion des diplômés") },
    { n: "1:5", mark: "", label: T("Faculty–student ratio", "Ratio enseignant–étudiant") },
    { n: "100", mark: "+", label: T("Student design projects", "Projets étudiants") },
    { n: "2017", mark: "", label: T("Founded in Somone", "Fondée à Somone") },
  ];

  const pillars = [
    { icon: "target", title: T("Competency-based education", "Éducation par compétences"), desc: T("Graduates gain the technical and problem-solving skills to adapt to a fast-evolving technological landscape.", "Les diplômés acquièrent les compétences techniques et de résolution de problèmes pour s’adapter à un paysage technologique en évolution rapide.") },
    { icon: "flask-conical", title: T("Teaching & research labs", "Laboratoires d’enseignement & recherche"), desc: T("World-renowned labs with cutting-edge technology and state-of-the-art facilities.", "Des laboratoires de renommée mondiale dotés de technologies de pointe et d’équipements ultramodernes.") },
    { icon: "lightbulb", title: T("Student projects", "Projets étudiants"), desc: T("Hands-on learning that fosters creativity, innovation and real-world problem-solving.", "Un apprentissage pratique qui stimule la créativité, l’innovation et la résolution de problèmes réels.") },
    { icon: "users", title: T("Faculty excellence", "Excellence du corps professoral"), desc: T("World-class faculty deliver high-quality education and a culture of research and innovation.", "Un corps professoral de classe mondiale offre une éducation de haute qualité et une culture de recherche et d’innovation.") },
    { icon: "rocket", title: T("Technology Ventures Program", "Programme Technology Ventures"), desc: T("Empowering students to build entrepreneurial skills and bring innovative ideas to market.", "Permet aux étudiants de développer des compétences entrepreneuriales et de commercialiser des idées innovantes.") },
    { icon: "languages", title: T("Intensive English Program", "Programme d’anglais intensif"), desc: T("Language training that helps non-native speakers reach the proficiency to succeed at DAUST.", "Une formation linguistique qui aide les non-anglophones à atteindre le niveau requis pour réussir à DAUST.") },
  ];

  const recognition = [
    { name: "ANAQ-Sup", note: T("Nationally accredited (habilitation)", "Accréditée au niveau national (habilitation)") },
    { name: T("U. of Nebraska", "U. du Nebraska"), note: T("2+2 joint Bachelor partner", "Partenaire licence conjointe 2+2") },
    { name: T("American model", "Modèle américain"), note: T("U.S.-style engineering curriculum", "Cursus d’ingénierie de type américain") },
    { name: T("Est. 2017", "Fondée en 2017"), note: "Somone · Thiès · Sénégal" },
  ];

  const programs = [
    { no: 1, slot: "prog-cs", code: "BSCS", icon: "cpu", title: T("Computer Science", "Informatique"), tag: "5-Year", desc: T("Computer systems, programming and the theory and design of software.", "Systèmes informatiques, programmation et théorie et conception de logiciels."), long: T("Computer science majors learn about computer systems, including programming and the theory and design of software. Graduates work across artificial intelligence, data science, software development, web technology, games and graphics.", "Les étudiants en informatique étudient les systèmes informatiques, la programmation et la théorie et la conception de logiciels. Les diplômés travaillent en intelligence artificielle, science des données, développement logiciel, technologies web, jeux et graphisme."), topics: [T("Artificial Intelligence", "Intelligence artificielle"), T("Data Science", "Science des données"), T("Software Development", "Développement logiciel"), T("Web & Graphics", "Web & Graphisme")] },
    { no: 2, slot: "prog-me", code: "BSME", icon: "cog", title: T("Mechanical Engineering", "Génie mécanique"), tag: "5-Year", desc: T("Automotive, aerospace, bioengineering and energy systems.", "Systèmes automobiles, aérospatiaux, bio-ingénierie et énergie."), long: T("Mechanical engineers design automotive and aerospace systems, bioengineering devices and energy-related technologies. Graduates work in aerospace, energy, robotics, material engineering and advanced manufacturing.", "Les ingénieurs mécaniciens conçoivent des systèmes automobiles et aérospatiaux, des dispositifs de bio-ingénierie et des technologies liées à l’énergie. Les diplômés travaillent dans l’aérospatiale, l’énergie, la robotique, les matériaux et la fabrication avancée."), topics: [T("Aerospace", "Aérospatiale"), T("Energy", "Énergie"), T("Robotics", "Robotique"), T("Advanced Manufacturing", "Fabrication avancée")] },
    { no: 3, slot: "prog-ee", code: "BSEE", icon: "zap", title: T("Electrical Engineering", "Génie électrique"), tag: "5-Year", desc: T("Electrical, electronic and computer-based devices and systems.", "Dispositifs et systèmes électriques, électroniques et informatiques."), long: T("Electrical engineering applies mathematical and physical principles to a wide variety of electrical, electronic and computer-based devices and systems. Graduates work in microelectronics, robotics, communication, and power & transmission.", "Le génie électrique applique les principes mathématiques et physiques à une grande variété de dispositifs électriques, électroniques et informatiques. Les diplômés travaillent en microélectronique, robotique, communication et énergie & transmission."), topics: [T("Microelectronics", "Microélectronique"), T("Robotics", "Robotique"), T("Communication", "Communication"), T("Power & Transmission", "Énergie & Transmission")] },
    { no: 4, slot: "prog-che", code: "BSCHE", icon: "flask-conical", title: T("Chemical Engineering", "Génie chimique"), tag: "5-Year", desc: T("Chemical processes, materials, energy and reaction engineering.", "Procédés chimiques, matériaux, énergie et génie des réactions."), long: T("Chemical engineers apply chemistry, physics, biology and mathematics to design and operate processes that transform raw materials into valuable products. Graduates work in energy, materials, pharmaceuticals, food processing, water treatment and sustainable manufacturing.", "Les ingénieurs chimistes appliquent la chimie, la physique, la biologie et les mathématiques pour concevoir des procédés transformant les matières premières en produits utiles. Les diplômés travaillent dans l’énergie, les matériaux, la pharmacie, l’agroalimentaire, le traitement de l’eau et la fabrication durable."), topics: [T("Process Engineering", "Génie des procédés"), T("Materials", "Matériaux"), T("Reaction Engineering", "Génie des réactions"), T("Sustainable Processes", "Procédés durables")] },
  ];

  const impactStats = [
    { value: 100, suffix: "%", label: T("Graduate job placement", "Insertion des diplômés") },
    { value: 100, suffix: "+", label: T("Student design projects", "Projets étudiants") },
    { value: 1000, suffix: "+", label: T("DAUST Impact attendees", "Participants DAUST Impact") },
    { value: 8, suffix: "", label: T("Research centers", "Centres de recherche") },
  ];

  const news = [
    { slot: "news1", tag: T("Projects", "Projets"), date: T("April 2026", "Avril 2026"), href: "https://daust.org/2026/04/le-senegal-decroche-la-lune-pourquoi-2026-marque-un-tournant-historique-pour-linnovation-africaine/", title: "Le Sénégal décroche la Lune", excerpt: T("Why 2026 marks a historic turning point for African innovation — West Africa’s “Sputnik” moment.", "Pourquoi 2026 marque un tournant historique pour l’innovation africaine — le “Spoutnik” de l’Afrique de l’Ouest.") },
    { slot: "news2", tag: T("Projects", "Projets"), date: T("March 2026", "Mars 2026"), href: "https://daust.org/2026/03/daust-career-fair-2026-shaping-futures-creating-opportunities/", title: "DAUST Career Fair 2026", excerpt: T("On March 28, the DAUST campus in Somone came alive for a career fair shaping futures and creating opportunities.", "Le 28 mars, le campus de DAUST à Somone s’est animé pour un forum carrières : façonner l’avenir et créer des opportunités.") },
    { slot: "news3", tag: T("Research", "Recherche"), date: "2026", href: "https://daust.org/dnews", title: T("Inclusive participation of Africa in emerging technology", "La participation inclusive de l’Afrique aux technologies émergentes"), excerpt: T("How DAUST is ensuring Africa takes an active, inclusive role in the technologies shaping the future.", "Comment DAUST veille à ce que l’Afrique prenne un rôle actif et inclusif dans les technologies de demain.") },
  ];

  const model = [
    { icon: "graduation-cap", title: T("PREPA foundation", "Socle PREPA"), desc: T("Two intensive years of sciences and engineering foundations.", "Deux années intensives de sciences et fondamentaux de l’ingénierie.") },
    { icon: "plane", title: T("Transfer abroad", "Transfert à l’étranger"), desc: T("Finish at DAUST or transfer to a top university abroad.", "Terminer à DAUST ou rejoindre une grande université à l’étranger.") },
    { icon: "handshake", title: T("UNL partnership", "Partenariat UNL"), desc: T("Joint 2+2 Bachelor in Mechanical Engineering with Nebraska.", "Licence conjointe 2+2 en génie mécanique avec le Nebraska.") },
    { icon: "wrench", title: T("Hands-on labs", "Travaux pratiques"), desc: T("Extensive co-curricular activities and real lab work.", "De nombreuses activités co-curriculaires et du vrai travail en laboratoire.") },
  ];

  const admSteps = [
    { n: "01", title: T("Apply online", "Postuler en ligne"), desc: T("Start by submitting the online application to open your file.", "Soumettez la candidature en ligne pour ouvrir votre dossier.") },
    { n: "02", title: T("Send documents", "Envoyer les documents"), desc: T("Provide your high-school diploma and 11th & 12th grade transcripts.", "Fournissez votre diplôme du secondaire et vos relevés de Première et Terminale.") },
    { n: "03", title: T("Assessment", "Évaluation"), desc: T("Decisions assess the academic foundation needed for DAUST courses.", "La décision évalue les bases académiques nécessaires aux cours de DAUST.") },
    { n: "04", title: T("Enroll", "Inscription"), desc: T("Pay the 30,000 FCFA fee and join the September 2026 intake.", "Payez les frais de 30 000 FCFA et rejoignez la rentrée de septembre 2026.") },
  ];

  const scholarships = [
    { pct: "20%", cond: T("Merit discount with a Baccalauréat average of 15 and above.", "Réduction au mérite pour une moyenne au Baccalauréat de 15 et plus.") },
    { pct: "15%", cond: T("Merit discount with a Baccalauréat average of 13.5 – 14.9.", "Réduction au mérite pour une moyenne au Baccalauréat de 13,5 – 14,9.") },
    { pct: "10%", cond: T("Merit discount with a Baccalauréat average of 12 – 13.4.", "Réduction au mérite pour une moyenne au Baccalauréat de 12 – 13,4.") },
  ];

  const tuition = [
    { label: T("Tuition", "Frais de scolarité"), note: T("Paid at the start of each semester", "Payés au début de chaque semestre"), amount: "2,975,000 FCFA", sub: T("1,487,500 / semester", "1 487 500 / semestre") },
    { label: T("Housing", "Logement"), note: T("Optional · furnished dorms", "Optionnel · résidences meublées"), amount: "300,000–400,000 FCFA", sub: T("per semester", "par semestre") },
    { label: T("Cafeteria", "Restauration"), note: T("Optional · full or half pension", "Optionnel · pension complète ou demi"), amount: "315,000 / 202,500", sub: T("per semester", "par semestre") },
    { label: T("Fees", "Frais"), note: T("Application + insurance", "Candidature + assurance"), amount: "30,000 + 10,000 FCFA", sub: T("one-time", "unique") },
  ];

  const admReq = [
    T("Start by submitting the online application.", "Commencez par soumettre la candidature en ligne."),
    T("Submit official documents to the Office of Admissions (high-school diploma or equivalent).", "Soumettez les documents officiels au Bureau des admissions (diplôme du secondaire ou équivalent)."),
    T("Submit transcripts from 11th and 12th grades (Première & Terminale).", "Soumettez les relevés de notes de Première et Terminale."),
    T("Pay the application fee of 30,000 FCFA.", "Payez les frais de candidature de 30 000 FCFA."),
    T("No English required to apply — non-English speakers join the one-semester IEP after admission.", "Aucun anglais requis pour postuler — les non-anglophones rejoignent le programme d’anglais intensif d’un semestre après admission."),
  ];

  const faq = [
    { q: T("Is DAUST recognized?", "DAUST est-elle reconnue ?"), a: T("Yes — DAUST is nationally and internationally recognized, with accreditation (habilitation) from ANAQ-Sup, Senegal’s national quality-assurance authority for higher education.", "Oui — DAUST est reconnue au niveau national et international, avec une accréditation (habilitation) de l’ANAQ-Sup, l’autorité nationale d’assurance qualité de l’enseignement supérieur au Sénégal.") },
    { q: T("Do I need to speak English to be admitted?", "Faut-il parler anglais pour être admis ?"), a: T("No. After admission, DAUST offers a one-semester Intensive English Program (IEP) for non-English speakers.", "Non. Après admission, DAUST propose un programme d’anglais intensif (IEP) d’un semestre pour les non-anglophones.") },
    { q: T("Can I transfer abroad after two years?", "Puis-je partir à l’étranger après deux ans ?"), a: T("Yes — you can transfer to universities in North America and elsewhere after two years, including a joint 2+2 Bachelor in Mechanical Engineering with the University of Nebraska (UNL).", "Oui — vous pouvez rejoindre des universités en Amérique du Nord et ailleurs après deux ans, dont une licence conjointe 2+2 en génie mécanique avec l’Université du Nebraska (UNL).") },
    { q: T("Will I get a job after graduating?", "Trouverai-je un emploi après le diplôme ?"), a: T("To date, 100% of DAUST graduates are fully employed, supported by a wide network of industry connections.", "À ce jour, 100 % des diplômés de DAUST sont pleinement employés, grâce à un large réseau de partenaires industriels.") },
  ];

  const researchAreas = [
    { icon: "sprout", title: T("Center of Smart Agriculture", "Centre d’agriculture intelligente"), desc: T("Precision agriculture, food science, IoT, machine learning and robotics to improve the efficiency and sustainability of farming.", "Agriculture de précision, science alimentaire, IoT, apprentissage automatique et robotique pour améliorer l’efficacité et la durabilité de l’agriculture.") },
    { icon: "bot", title: T("Center for Robotics & Autonomous Systems", "Centre de robotique & systèmes autonomes"), desc: T("Autonomous systems, human-robot interaction and robotic perception — building robotics designed for real-world, resource-aware use.", "Systèmes autonomes, interaction homme-robot et perception robotique — une robotique conçue pour un usage réel et économe en ressources.") },
    { icon: "atom", title: T("Center for Photonics & Quantum Technologies", "Centre de photonique & technologies quantiques"), desc: T("Light-based and quantum technologies spanning sensing, communication and next-generation computing.", "Technologies photoniques et quantiques couvrant la détection, la communication et l’informatique de nouvelle génération.") },
    { icon: "brain-circuit", title: T("DAUST Artificial Intelligence Research (DAIR)", "Recherche en intelligence artificielle DAUST (DAIR)"), desc: T("Applied AI, deep & reinforcement learning and generative AI for agriculture, health, language and decision-making across the continent.", "IA appliquée, apprentissage profond et par renforcement et IA générative pour l’agriculture, la santé, la langue et la décision sur le continent.") },
    { icon: "heart-pulse", title: T("Global Health Technology Research Center", "Centre de recherche en technologies de santé mondiale"), desc: T("The DAUST–IRESSEF center advances health through engineering — precision medicine, point-of-care microfluidics, biobanking and neurotechnology.", "Le centre DAUST–IRESSEF fait progresser la santé par l’ingénierie — médecine de précision, microfluidique au point de soin, biobanques et neurotechnologie.") },
    { icon: "zap", title: T("Advanced Energy & Materials Research Center", "Centre de recherche en énergie & matériaux avancés"), desc: T("Safe, reliable, affordable and clean energy — advanced power generation, energy storage, grid modernization, renewables and engineered materials.", "Une énergie sûre, fiable, abordable et propre — production avancée, stockage, modernisation du réseau, renouvelables et matériaux d’ingénierie.") },
    { icon: "hexagon", title: T("DAUST Nanotechnology Institute", "Institut de nanotechnologie DAUST"), desc: T("Nanoscale science and engineering — from nanoscale heat transfer and thermal devices to advanced nanomaterials and fabrication.", "Science et ingénierie à l’échelle nanométrique — du transfert thermique nanométrique aux nanomatériaux avancés et à la fabrication.") },
    { icon: "satellite", title: T("Space Technology Laboratory", "Laboratoire de technologie spatiale"), desc: T("Satellite, remote-sensing and space systems engineering to observe earth, tackle climate challenges and expand Africa’s space capability.", "Ingénierie des satellites, télédétection et systèmes spatiaux pour observer la Terre, relever les défis climatiques et développer la capacité spatiale de l’Afrique.") },
  ];

  const directors = [
    { name: "Dr. Sidy Ndao", role: T("Director, Nano & Quantum Engineering", "Directeur, Nano & Ingénierie quantique"), initials: "SN" },
    { name: "Dr. Timothy Wei", role: T("Associate Director of Research", "Directeur associé de la recherche"), initials: "TW" },
    { name: "Dr. El Hadji Amadou Gning", role: T("Director, Robotics & AI", "Directeur, Robotique & IA"), initials: "AG" },
    { name: "Dr. Tagbo Niepa", role: T("co-Director, Health", "co-Directeur, Santé"), initials: "TN" },
    { name: "Dr. Lamine Toure", role: T("co-Director, Health", "co-Directeur, Santé"), initials: "LT" },
  ];

  const researchStats = [
    { n: "8", mark: "", label: T("Research centers under SIRDIC", "Centres de recherche sous SIRDIC") },
    { n: "100", mark: "+", label: T("Student design projects", "Projets étudiants") },
    { n: "1", mark: "st", label: T("Research from your first year", "La recherche dès la première année") },
  ];

  const faculty: FacultyMember[] = [
    { id: "ndao", slot: "fac-ndao", initials: "SN", name: "Dr. Sidy Ndao", title: T("Founder & President", "Fondateur & Président"), dept: T("Nano & Quantum Engineering", "Nano & Ingénierie quantique"), interests: [T("Nanoscale heat transfer", "Transfert thermique nanométrique"), T("Thermal energy systems", "Systèmes d’énergie thermique"), T("Thermal computing", "Calcul thermique")], bio: T("Founder and President of DAUST, Dr. Ndao holds a Ph.D. from Rensselaer Polytechnic Institute and completed postdoctoral work at MIT. A former Associate Professor at the University of Nebraska-Lincoln, his research advances nanoscale heat transfer, thermal energy conversion and thermal computing devices.", "Fondateur et Président de DAUST, le Dr Ndao est titulaire d’un doctorat de Rensselaer Polytechnic Institute et a effectué un postdoctorat au MIT. Ancien professeur associé à l’Université du Nebraska-Lincoln, ses recherches portent sur le transfert thermique nanométrique, la conversion d’énergie thermique et les dispositifs de calcul thermique."), scholar: "https://scholar.google.com/" },
    { id: "wei", slot: "fac-wei", initials: "TW", name: "Dr. Timothy Wei", title: T("Associate Director of Research", "Directeur associé de la recherche"), dept: T("Mechanical Engineering", "Génie mécanique"), interests: [T("Fluid dynamics", "Dynamique des fluides"), T("Experimental mechanics", "Mécanique expérimentale"), T("Biomechanics", "Biomécanique")], bio: T("Dr. Wei leads DAUST’s research strategy across its six centers. His work spans experimental fluid dynamics, quantitative flow measurement and applications of engineering mechanics to problems in energy, health and sport.", "Le Dr Wei dirige la stratégie de recherche de DAUST à travers ses centres. Ses travaux couvrent la dynamique des fluides expérimentale, la mesure quantitative des écoulements et les applications de la mécanique aux problèmes d’énergie, de santé et de sport."), scholar: "https://scholar.google.com/" },
    { id: "gning", slot: "fac-gning", initials: "AG", name: "Dr. El Hadji Amadou Gning", title: T("Director, Robotics & AI", "Directeur, Robotique & IA"), dept: T("Computer & Electrical Engineering", "Génie informatique & électrique"), interests: [T("Autonomous systems", "Systèmes autonomes"), T("Reinforcement learning", "Apprentissage par renforcement"), T("Robotic perception", "Perception robotique")], bio: T("Director of the Robotics & AI center, Dr. Gning researches autonomous systems, deep and reinforcement learning, human-robot interaction and robotic perception — building AI designed for real-world, resource-aware deployment across Africa.", "Directeur du centre Robotique & IA, le Dr Gning étudie les systèmes autonomes, l’apprentissage profond et par renforcement, l’interaction homme-robot et la perception robotique — une IA conçue pour un déploiement réel et économe en ressources en Afrique."), scholar: "https://scholar.google.com/" },
    { id: "niepa", slot: "fac-niepa", initials: "TN", name: "Dr. Tagbo Niepa", title: T("co-Director, Global Health Technology", "co-Directeur, Technologies de santé mondiale"), dept: T("Bioengineering", "Bio-ingénierie"), interests: [T("Microbial systems", "Systèmes microbiens"), T("Biomaterials", "Biomatériaux"), T("Point-of-care devices", "Dispositifs au point de soin")], bio: T("A co-Director of the DAUST–IRESSEF Global Health Technology center, Dr. Niepa studies microbial systems, engineered biomaterials and point-of-care diagnostic devices at the interface of medical science and engineering.", "co-Directeur du centre DAUST–IRESSEF de technologies de santé mondiale, le Dr Niepa étudie les systèmes microbiens, les biomatériaux et les dispositifs de diagnostic au point de soin, à l’interface de la science médicale et de l’ingénierie."), scholar: "https://scholar.google.com/" },
    { id: "toure", slot: "fac-toure", initials: "LT", name: "Dr. Lamine Toure", title: T("co-Director, Global Health Technology", "co-Directeur, Technologies de santé mondiale"), dept: T("Electrical Engineering", "Génie électrique"), interests: [T("Microfluidics", "Microfluidique"), T("Biosensors", "Biocapteurs"), T("Neurotechnology", "Neurotechnologie")], bio: T("Co-Director of the Global Health Technology center, Dr. Toure develops microfluidic platforms, biosensors and neurotechnology aimed at precision medicine and affordable diagnostics for African clinics.", "co-Directeur du centre de technologies de santé mondiale, le Dr Toure développe des plateformes microfluidiques, des biocapteurs et des neurotechnologies pour la médecine de précision et des diagnostics abordables pour les cliniques africaines."), scholar: "https://scholar.google.com/" },
    { id: "energy", slot: "fac-energy", initials: "AE", name: T("Advanced Energy Faculty", "Enseignants Énergie avancée"), title: T("Director, Advanced Energy", "Directeur, Énergie avancée"), dept: T("Mechanical Engineering", "Génie mécanique"), interests: [T("Renewable energy", "Énergies renouvelables"), T("Energy storage", "Stockage d’énergie"), T("Grid modernization", "Modernisation du réseau")], bio: T("The Advanced Energy center advances safe, reliable, affordable and clean energy — spanning advanced power generation, energy storage, grid modernization and renewables tailored to the African context.", "Le centre Énergie avancée fait progresser une énergie sûre, fiable, abordable et propre — production avancée, stockage, modernisation du réseau et renouvelables adaptés au contexte africain."), scholar: "https://daust.org/research/" },
  ];

  const ventureSteps = [
    { no: 1, icon: "lightbulb", title: T("Ideation & Validation", "Idéation & Validation"), desc: T("Workshops on ideation, problem identification and market research.", "Ateliers d’idéation, d’identification de problèmes et d’étude de marché.") },
    { no: 2, icon: "hammer", title: T("Product Development", "Développement produit"), desc: T("Focus on MVP development and product validation.", "Développement du MVP et validation du produit.") },
    { no: 3, icon: "trending-up", title: T("Customer Acquisition", "Acquisition clients"), desc: T("Customer acquisition and growth strategies.", "Stratégies d’acquisition et de croissance.") },
    { no: 4, icon: "coins", title: T("Investment Readiness", "Préparation à l’investissement"), desc: T("Preparing for fundraising and pitching to investors.", "Préparation à la levée de fonds et au pitch investisseurs.") },
    { no: 5, icon: "scale", title: T("Business & Legal", "Business & Juridique"), desc: T("Business development, legal considerations and intellectual property.", "Développement commercial, aspects juridiques et propriété intellectuelle.") },
    { no: 6, icon: "award", title: T("Demo Day & Graduation", "Demo Day & Fin de programme"), desc: T("Preparing for Demo Day and program graduation.", "Préparation au Demo Day et à la fin du programme.") },
  ];

  const ventures = [
    { tag: T("Robotics & AI", "Robotique & IA"), name: "Caytu Robotics", desc: T("A DAUST-affiliated venture building AI and robotics solutions for African markets.", "Une startup affiliée à DAUST développant des solutions d’IA et de robotique pour les marchés africains."), href: "https://caytu.ai", cta: "Visit caytu.ai →" },
    { tag: T("Clean Energy", "Énergie propre"), name: "SolarBox", desc: T("Solar energy solutions expanding reliable, affordable power access.", "Des solutions d’énergie solaire pour un accès fiable et abordable à l’électricité."), href: "http://www.solarbox.energy/", cta: "Visit solarbox.energy →" },
    { tag: "Deep Tech", name: T("Deep Tech Incubator", "Incubateur Deep Tech"), desc: T("Early-stage founders building on breakthroughs in AI, biotech, nanotech, robotics and quantum computing.", "Des fondateurs en amorçage bâtissant sur des avancées en IA, biotech, nanotech, robotique et informatique quantique."), href: "https://daust.org/startups/", cta: T("Learn more →", "En savoir plus →") },
  ];

  const campusFeatures = [
    { icon: "home", title: T("On-campus living", "Vie sur le campus"), desc: T("All incoming freshmen live on campus in beautiful, furnished dorms — a true home away from home.", "Tous les nouveaux étudiants vivent sur le campus dans de belles résidences meublées — un véritable second chez-soi.") },
    { icon: "heart-handshake", title: T("Student Affairs", "Vie étudiante"), desc: T("A dedicated Office of Student Affairs enhances academic success through its programs and services.", "Un Bureau de la vie étudiante dédié favorise la réussite académique par ses programmes et services.") },
    { icon: "flask-conical", title: T("Labs & Makerspace", "Labos & Makerspace"), desc: T("State-of-the-art teaching and research labs, open to students from year one.", "Des laboratoires d’enseignement et de recherche de pointe, ouverts aux étudiants dès la première année.") },
    { icon: "users-round", title: T("Clubs & Community", "Clubs & Communauté"), desc: T("Students are encouraged to be active in one or more of the student organizations on campus.", "Les étudiants sont encouragés à s’investir dans une ou plusieurs associations du campus.") },
  ];

  const aboutFacts = [
    { n: "100%", label: T("Graduate job placement", "Insertion des diplômés") },
    { n: "1:5", label: T("Faculty–student ratio", "Ratio enseignant–étudiant") },
    { n: "100+", label: T("Student design projects", "Projets étudiants") },
    { n: "2017", label: T("Founded in Somone", "Fondée à Somone") },
  ];

  const timeline = [
    { year: "2017", label: T("DAUST is founded by Prof. Sidy Ndao in Somone, Senegal.", "DAUST est fondée par le Pr Sidy Ndao à Somone, au Sénégal.") },
    { year: "2019", label: T("First cohorts begin the five-year engineering journey.", "Les premières promotions entament le cursus d’ingénierie de cinq ans.") },
    { year: "2021", label: T("Research centers and labs expand hands-on learning.", "Les centres de recherche et laboratoires développent l’apprentissage pratique.") },
    { year: "2023", label: T("Technology Ventures Program launches to back student founders.", "Le programme Technology Ventures est lancé pour soutenir les fondateurs étudiants.") },
    { year: "2025", label: T("DAUST Impact showcases 100+ student projects to 1000+ guests.", "DAUST Impact présente plus de 100 projets étudiants à plus de 1000 invités.") },
    { year: "2026", label: T("Admissions open for the September 2026 intake.", "Ouverture des admissions pour la rentrée de septembre 2026.") },
  ];

  const portalRoles = [T("Students", "Étudiants"), T("Faculty", "Enseignants"), T("Staff", "Personnel"), T("Admissions", "Admissions")];

  const contactInfo = [
    { icon: "map-pin", label: T("Campus", "Campus"), value: T("DAUST, Somone, Thiès region, Senegal", "DAUST, Somone, région de Thiès, Sénégal") },
    { icon: "mail", label: T("General", "Général"), value: "info@daust.org" },
    { icon: "graduation-cap", label: T("Admissions", "Admissions"), value: "admissions@daust.org" },
    { icon: "phone", label: T("Phone & WhatsApp", "Téléphone & WhatsApp"), value: "+221 77 488 25 15 · +221 78 128 44 58" },
  ];

  // --- FAQ assistant knowledge base (grounded in the content above) ---
  const progBullets = programs.map((p) => `• **${p.title}**`).join("\n");
  const chatKb: { patterns: string[]; answer: string }[] = [
    {
      patterns: ["program", "programs", "programme", "programmes", "major", "majors", "degree", "degrees", "filiere", "filieres", "cursus", "study", "etudes", "engineering", "ingenierie", "genie", "offer", "propose", "what can i study", "quels programmes"],
      answer: T(
        `DAUST offers four five-year engineering degrees:\n${progBullets}\n\nThe first two years are an intensive PREPA foundation in science and engineering. After that you finish at DAUST or transfer abroad — including a 2+2 Bachelor in Mechanical Engineering with the University of Nebraska.`,
        `DAUST propose quatre diplômes d’ingénierie de cinq ans :\n${progBullets}\n\nLes deux premières années forment un socle PREPA intensif en sciences et ingénierie. Ensuite vous terminez à DAUST ou partez à l’étranger — dont une licence 2+2 en génie mécanique avec l’Université du Nebraska.`,
      ),
    },
    {
      patterns: ["tuition", "cost", "costs", "price", "prices", "fee", "fees", "frais", "cout", "how much", "combien", "expensive", "cher", "pay", "payer", "budget"],
      answer: T(
        "Here’s the cost breakdown:\n• **Tuition:** 2,975,000 FCFA/year (1,487,500/semester)\n• **Housing** (optional, furnished dorms): 300,000–400,000 FCFA/semester\n• **Cafeteria** (optional): 202,500–315,000 FCFA/semester\n• **One-time fees:** 30,000 application + 10,000 insurance\n\nMerit scholarships of **10–20%** are available based on your Baccalauréat average.",
        "Voici le détail des frais :\n• **Scolarité :** 2 975 000 FCFA/an (1 487 500/semestre)\n• **Logement** (optionnel, résidences meublées) : 300 000–400 000 FCFA/semestre\n• **Restauration** (optionnelle) : 202 500–315 000 FCFA/semestre\n• **Frais uniques :** 30 000 candidature + 10 000 assurance\n\nDes bourses au mérite de **10 à 20 %** sont possibles selon votre moyenne au Baccalauréat.",
      ),
    },
    {
      patterns: ["scholarship", "scholarships", "bourse", "bourses", "financial aid", "aid", "aide", "aides", "discount", "reduction", "merit", "merite", "grant"],
      answer: T(
        "Merit scholarships are based on your Baccalauréat average:\n• **20%** — average of 15 and above\n• **15%** — average of 13.5–14.9\n• **10%** — average of 12–13.4",
        "Les bourses au mérite dépendent de votre moyenne au Baccalauréat :\n• **20 %** — moyenne de 15 et plus\n• **15 %** — moyenne de 13,5–14,9\n• **10 %** — moyenne de 12–13,4",
      ),
    },
    {
      patterns: ["apply", "application", "admission", "admissions", "how do i apply", "how to apply", "postuler", "candidature", "candidater", "enroll", "enrol", "inscrire", "inscription", "register", "join", "rejoindre"],
      answer: T(
        "Applying takes four steps:\n• **1. Apply online** — submit the application to open your file\n• **2. Send documents** — your high-school diploma and 11th & 12th grade (Première & Terminale) transcripts\n• **3. Assessment** — your academic foundation is reviewed\n• **4. Enroll** — pay the 30,000 FCFA fee for the September 2026 intake\n\nNo English is required to apply — use the **Apply** button at the top of the page to start.",
        "La candidature se fait en quatre étapes :\n• **1. Postuler en ligne** — soumettez la candidature pour ouvrir votre dossier\n• **2. Envoyer les documents** — diplôme du secondaire et relevés de Première & Terminale\n• **3. Évaluation** — vos bases académiques sont examinées\n• **4. Inscription** — payez les 30 000 FCFA pour la rentrée de septembre 2026\n\nAucun anglais n’est requis pour postuler — utilisez le bouton **Postuler** en haut de la page pour commencer.",
      ),
    },
    {
      patterns: ["english", "anglais", "language", "langue", "iep", "intensive english", "speak english", "parler anglais", "do i need english"],
      answer: T(
        "No — you don’t need to speak English to apply. After admission, non-English speakers join a one-semester Intensive English Program (IEP) to reach the level needed for DAUST courses.",
        "Non — vous n’avez pas besoin de parler anglais pour postuler. Après admission, les non-anglophones suivent un programme d’anglais intensif (IEP) d’un semestre pour atteindre le niveau requis pour les cours de DAUST.",
      ),
    },
    {
      patterns: ["deadline", "deadlines", "when", "start", "starts", "intake", "rentree", "september", "septembre", "begin", "begins", "next intake", "date limite", "quand"],
      answer: T(
        "Admissions are open for the September 2026 intake. Apply online as early as possible — files are reviewed on a rolling basis, and places for the year are limited.",
        "Les admissions sont ouvertes pour la rentrée de septembre 2026. Postulez en ligne le plus tôt possible — les dossiers sont examinés au fil de l’eau et les places pour l’année sont limitées.",
      ),
    },
    {
      patterns: ["recognized", "recognised", "recognition", "accredited", "accreditation", "anaq", "habilitation", "reconnue", "reconnu", "accreditee", "official", "diploma valid"],
      answer: T(
        "Yes — DAUST is nationally and internationally recognized, with accreditation (habilitation) from ANAQ-Sup, Senegal’s national quality-assurance authority for higher education.",
        "Oui — DAUST est reconnue au niveau national et international, avec une accréditation (habilitation) de l’ANAQ-Sup, l’autorité nationale d’assurance qualité de l’enseignement supérieur au Sénégal.",
      ),
    },
    {
      patterns: ["transfer", "abroad", "etranger", "nebraska", "unl", "2+2", "exchange", "study abroad", "partir", "north america", "amerique"],
      answer: T(
        "Yes — after two years you can transfer to universities in North America and elsewhere, including a joint 2+2 Bachelor in Mechanical Engineering with the University of Nebraska (UNL).",
        "Oui — après deux ans, vous pouvez rejoindre des universités en Amérique du Nord et ailleurs, dont une licence conjointe 2+2 en génie mécanique avec l’Université du Nebraska (UNL).",
      ),
    },
    {
      patterns: ["job", "jobs", "employment", "employed", "hire", "hired", "career", "careers", "emploi", "travail", "placement", "salary", "after graduating", "get a job", "debouches"],
      answer: T(
        "To date, 100% of DAUST graduates are fully employed, supported by a wide network of industry connections and an annual career fair.",
        "À ce jour, 100 % des diplômés de DAUST sont pleinement employés, grâce à un large réseau de partenaires industriels et à un forum carrières annuel.",
      ),
    },
    {
      patterns: ["where", "location", "located", "campus", "somone", "thies", "senegal", "address", "adresse", "situe", "live", "living", "dorm", "dorms", "housing", "logement", "residence", "ou est"],
      answer: T(
        "DAUST’s campus is in Somone, in the Thiès region of Senegal. All incoming students live on campus in furnished dorms, with labs, a makerspace, an Office of Student Affairs, and student clubs.",
        "Le campus de DAUST se trouve à Somone, dans la région de Thiès, au Sénégal. Tous les nouveaux étudiants vivent sur le campus dans des résidences meublées, avec laboratoires, makerspace, un Bureau de la vie étudiante et des clubs étudiants.",
      ),
    },
    {
      patterns: ["research", "recherche", "lab", "labs", "laboratoire", "laboratoires", "center", "centre", "centers", "centres", "robotics", "robotique", "artificial intelligence", "intelligence artificielle", "quantum", "space", "spatiale"],
      answer: T(
        "DAUST runs eight research centers, and students take part from year one:\n• Center of Smart Agriculture\n• Robotics & Autonomous Systems\n• Photonics & Quantum Technologies\n• Artificial Intelligence (DAIR)\n• Global Health Technology\n• Advanced Energy & Materials\n• Nanotechnology Institute\n• Space Technology Laboratory",
        "DAUST compte huit centres de recherche, et les étudiants y participent dès la première année :\n• Centre d’agriculture intelligente\n• Robotique & systèmes autonomes\n• Photonique & technologies quantiques\n• Intelligence artificielle (DAIR)\n• Technologies de santé mondiale\n• Énergie & matériaux avancés\n• Institut de nanotechnologie\n• Laboratoire de technologie spatiale",
      ),
    },
    {
      patterns: ["contact", "email", "e-mail", "mail", "phone", "telephone", "whatsapp", "reach", "call", "joindre", "numero", "coordonnees"],
      answer: T(
        "Here’s how to reach us:\n• **Admissions:** admissions@daust.org\n• **Phone / WhatsApp:** +221 77 488 25 15 · +221 78 128 44 58\n• **General:** info@daust.org\n• **Campus:** Somone, Thiès region, Senegal",
        "Voici comment nous contacter :\n• **Admissions :** admissions@daust.org\n• **Téléphone / WhatsApp :** +221 77 488 25 15 · +221 78 128 44 58\n• **Général :** info@daust.org\n• **Campus :** Somone, région de Thiès, Sénégal",
      ),
    },
    {
      patterns: ["hi", "hey", "hello", "bonjour", "salut", "hola", "yo", "good morning", "good afternoon"],
      answer: T(
        "Hello! I can help with questions about DAUST’s engineering programs, admissions, tuition and scholarships, the Intensive English Program, or life on campus in Somone. What would you like to know?",
        "Bonjour ! Je peux vous renseigner sur les programmes d’ingénierie de DAUST, les admissions, les frais et bourses, le programme d’anglais intensif, ou la vie sur le campus à Somone. Que souhaitez-vous savoir ?",
      ),
    },
  ];
  const chatFallback = T(
    "I don’t have a direct answer to that one. For anything specific, email admissions@daust.org or call +221 77 488 25 15, or use the Apply button and our team will help you personally. You can also ask me about programs, admissions, tuition, scholarships, English requirements, or campus life.",
    "Je n’ai pas de réponse directe à cette question. Pour tout point précis, écrivez à admissions@daust.org ou appelez le +221 77 488 25 15, ou utilisez le bouton Postuler et notre équipe vous aidera personnellement. Vous pouvez aussi me poser des questions sur les programmes, les admissions, les frais, les bourses, l’anglais ou la vie sur le campus.",
  );

  return {
    fr, tx, nav, suggestions, footCols, heroStats, pillars, recognition, programs,
    impactStats, news, model, admSteps, scholarships, tuition, admReq, faq,
    researchAreas, directors, researchStats, faculty, ventureSteps, ventures,
    campusFeatures, aboutFacts, timeline, portalRoles, contactInfo,
    chatKb, chatFallback,
  };
}

export type Content = ReturnType<typeof buildContent>;

// ---------------------------------------------------------------------------
// Site CMS: image slots, editable-text flattening, and the override contract.
// ---------------------------------------------------------------------------

/** Default image path per slot (mirrors the vitrine's IMG map). Array slots use dotted keys. */
export const DEFAULT_IMAGES: Record<string, string> = {
  hero: "/images/campus.jpg",
  researchFeature: "/images/labs.jpg",
  researchHero: "/images/research-drone.jpg",
  campus: "/images/students-impact.jpg",
  aerial: "/images/campus.jpg",
  lab: "/images/labs.jpg",
  students: "/images/iep.jpg",
  event: "/images/event-impact.jpg",
  dorms: "/images/bcie.jpg",
  "news.0": "/images/news1.jpg",
  "news.1": "/images/event-impact.jpg",
  "news.2": "/images/news2.jpg",
  "programs.0": "/images/labs.jpg",
  "programs.1": "/images/research-drone.jpg",
  "programs.2": "/images/graduation.jpg",
  "programs.3": "/images/iep.jpg",
};

/** Human labels for the CMS media page, in display order. */
export const SITE_IMAGE_SLOTS: { key: string; label: string }[] = [
  { key: "hero", label: "Homepage hero" },
  { key: "researchFeature", label: "Homepage research spotlight" },
  { key: "researchHero", label: "Research page hero" },
  { key: "campus", label: "Campus hero" },
  { key: "aerial", label: "Campus — aerial" },
  { key: "lab", label: "Campus — lab" },
  { key: "students", label: "Campus — students" },
  { key: "event", label: "Campus — event" },
  { key: "dorms", label: "Campus — dorms" },
  { key: "news.0", label: "News card 1" },
  { key: "news.1", label: "News card 2" },
  { key: "news.2", label: "News card 3" },
  { key: "programs.0", label: "Program card 1" },
  { key: "programs.1", label: "Program card 2" },
  { key: "programs.2", label: "Program card 3" },
  { key: "programs.3", label: "Program card 4" },
];

/** Friendly section names for the CMS editor, keyed by the top-level content key. */
export const SITE_SECTION_LABELS: Record<string, string> = {
  tx: "Text & headings",
  pillars: "Why DAUST — pillars",
  programs: "Programs",
  recognition: "Recognition",
  heroStats: "Hero stats",
  impactStats: "Impact stats",
  news: "News & Stories",
  model: "Academic model",
  admSteps: "Admission steps",
  scholarships: "Scholarships",
  tuition: "Tuition & fees",
  admReq: "Admission requirements",
  faq: "FAQ",
  researchAreas: "Research centers",
  directors: "Center directors",
  researchStats: "Research stats",
  faculty: "Faculty",
  ventureSteps: "Venture program steps",
  ventures: "Startups & partners",
  campusFeatures: "Campus features",
  aboutFacts: "About — facts",
  timeline: "About — timeline",
  portalRoles: "Portal roles",
  contactInfo: "Contact info",
  footCols: "Footer links",
  suggestions: "AI suggested questions",
  chatKb: "AI knowledge base",
  chatFallback: "AI fallback answer",
};

/** Leaf keys that are structural (routes/icons/ids/urls), never editable copy. */
const BLACKLIST_LEAF = new Set(["icon", "slot", "id", "no", "code", "href", "scholar", "mark", "suffix", "page", "fr"]);
/** Top-level keys excluded from the text editor (structural or handled elsewhere). */
const SKIP_TOP_LEVEL = new Set(["fr", "nav"]);

/** Walk a Content object and produce a flat { "path": "string value" } of every editable text leaf. */
export function flattenSiteText(content: Content): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (val: unknown, path: string, leafKey: string) => {
    if (typeof val === "string") {
      if (!BLACKLIST_LEAF.has(leafKey)) out[path] = val;
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((item, i) => walk(item, `${path}.${i}`, leafKey));
      return;
    }
    if (val && typeof val === "object") {
      for (const [k, v] of Object.entries(val)) walk(v, path ? `${path}.${k}` : k, k);
    }
  };
  for (const [k, v] of Object.entries(content)) {
    if (SKIP_TOP_LEVEL.has(k)) continue;
    walk(v, k, k);
  }
  return out;
}

function setAtPath(root: Record<string, unknown>, path: string, value: string) {
  const parts = path.split(".");
  let node: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (node && typeof node === "object") node = (node as Record<string, unknown>)[key] ?? (Array.isArray(node) ? undefined : undefined);
    if (node == null) return; // path no longer exists in current shape — skip stale override
  }
  const last = parts[parts.length - 1]!;
  if (node && typeof node === "object") {
    const container = node as Record<string, unknown>;
    if (last in container) container[last] = value;
  }
}

/** Homepage sections the CMS may show/hide (also the only valid `hidden` values). */
export const HIDEABLE_SECTIONS = ["recognition", "news", "heroStats", "programs", "impact", "spotlight", "why"] as const;

/** The exact set of override paths the CMS is allowed to edit (excludes routes/urls/icons). */
let _editablePaths: Set<string> | null = null;
export function editablePaths(): Set<string> {
  if (!_editablePaths) _editablePaths = new Set(Object.keys(flattenSiteText(buildContent("en"))));
  return _editablePaths;
}

/** A value safe to place in an image slot: a relative /uploads path or an http(s) URL. */
function isSafeImageUrl(v: string): boolean {
  return /^\/[^/]/.test(v) || /^https?:\/\//i.test(v);
}

/** Safe href/image value, else "" — blocks javascript:/data: and other schemes. */
function safeUrl(v: string | undefined): string {
  return typeof v === "string" && isSafeImageUrl(v) ? v.slice(0, 300) : "";
}
const bi = (b: { en?: string; fr?: string } | undefined) => ({ en: (b?.en ?? "").slice(0, 4000), fr: (b?.fr ?? "").slice(0, 4000) });

/**
 * Drop anything a CMS write must never persist: text keys outside the editable
 * allowlist (blocks injecting into href/scholar/icon leaves), unknown image slots
 * or unsafe image URLs (blocks javascript: etc.), and unknown hidden section keys.
 */
export function sanitizeSiteOverrides(raw: SiteOverrides): SiteOverrides {
  const editable = editablePaths();
  const pickText = (m: Record<string, string>) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(m ?? {})) if (editable.has(k) && typeof v === "string") out[k] = v;
    return out;
  };
  const images: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.images ?? {})) {
    if (k in DEFAULT_IMAGES && typeof v === "string" && isSafeImageUrl(v)) images[k] = v;
  }
  const allowedHidden = new Set<string>(HIDEABLE_SECTIONS);
  const col = raw.collections ?? {};
  const collections: SiteOverrides["collections"] = {};
  if (col.ventures) {
    collections.ventures = col.ventures.slice(0, 50).map((v) => ({
      name: (v.name ?? "").slice(0, 120), href: safeUrl(v.href), tag: bi(v.tag), desc: bi(v.desc), cta: bi(v.cta),
    }));
  }
  if (col.faculty) {
    collections.faculty = col.faculty.slice(0, 100).map((f) => ({
      name: (f.name ?? "").slice(0, 120), initials: (f.initials ?? "").slice(0, 4),
      image: safeUrl(f.image), scholar: safeUrl(f.scholar),
      title: bi(f.title), dept: bi(f.dept), bio: bi(f.bio), interests: bi(f.interests),
    }));
  }
  return {
    text: { en: pickText(raw.text?.en ?? {}), fr: pickText(raw.text?.fr ?? {}) },
    images,
    hidden: [...new Set((raw.hidden ?? []).filter((k) => allowedHidden.has(k)))],
    collections,
  };
}

/** Build localized content and apply the store's text + image overrides for that language. */
export function buildSiteContent(lang: Lang, overrides?: SiteOverrides): Content & { images: Record<string, string> } {
  const content = buildContent(lang);
  const images = { ...DEFAULT_IMAGES };
  if (overrides) {
    // Apply the same allowlist at render time — the store is not the only trust boundary.
    const clean = sanitizeSiteOverrides(overrides);
    for (const [path, value] of Object.entries(clean.text[lang])) {
      setAtPath(content as unknown as Record<string, unknown>, path, value);
    }
    for (const [key, value] of Object.entries(clean.images)) images[key] = value;
    if (clean.collections?.ventures) {
      content.ventures = clean.collections.ventures.map((v) => ({
        tag: v.tag[lang], name: v.name, desc: v.desc[lang], href: v.href, cta: v.cta[lang],
      }));
    }
    if (clean.collections?.faculty) {
      content.faculty = clean.collections.faculty.map((f, i) => ({
        id: `fac-${i}`, slot: `fac-${i}`, initials: f.initials, name: f.name,
        title: f.title[lang], dept: f.dept[lang], bio: f.bio[lang], scholar: f.scholar,
        interests: f.interests[lang].split(",").map((s) => s.trim()).filter(Boolean),
        image: f.image || undefined,
      }));
    }
  }
  return { ...content, images };
}

/** Bilingual defaults for the CMS collection editor to prefill from. */
export function defaultCollections(): { ventures: VentureItem[]; faculty: FacultyItem[] } {
  const en = buildContent("en");
  const fr = buildContent("fr");
  const ventures = en.ventures.map((v, i) => ({
    name: v.name, href: v.href,
    tag: { en: v.tag, fr: fr.ventures[i]!.tag },
    desc: { en: v.desc, fr: fr.ventures[i]!.desc },
    cta: { en: v.cta, fr: fr.ventures[i]!.cta },
  }));
  const faculty = en.faculty.map((f, i) => ({
    name: f.name, initials: f.initials, image: f.image ?? "", scholar: f.scholar,
    title: { en: f.title, fr: fr.faculty[i]!.title },
    dept: { en: f.dept, fr: fr.faculty[i]!.dept },
    bio: { en: f.bio, fr: fr.faculty[i]!.bio },
    interests: { en: f.interests.join(", "), fr: fr.faculty[i]!.interests.join(", ") },
  }));
  return { ventures, faculty };
}

// --- Override contract (stored as JSON in SiteContent.draftJson / publishedJson) ---

const Bi = z.object({ en: z.string().max(4000), fr: z.string().max(4000) });
export type Bi = z.infer<typeof Bi>;

/** An authored "startups & partners" card (Innovation page). */
export const VentureItemInput = z.object({
  name: z.string().max(120),
  href: z.string().max(300),
  tag: Bi,
  desc: Bi,
  cta: Bi,
});
export type VentureItem = z.infer<typeof VentureItemInput>;

/** An authored faculty member (Faculty page), with an optional uploaded photo. */
export const FacultyItemInput = z.object({
  name: z.string().max(120),
  initials: z.string().max(4),
  image: z.string().max(300),
  scholar: z.string().max(300),
  title: Bi,
  dept: Bi,
  bio: Bi,
  interests: Bi, // comma-separated per language
});
export type FacultyItem = z.infer<typeof FacultyItemInput>;

export const SiteOverridesInput = z.object({
  text: z.object({
    en: z.record(z.string(), z.string()),
    fr: z.record(z.string(), z.string()),
  }),
  images: z.record(z.string(), z.string()),
  hidden: z.array(z.string()),
  // Authored collections replace the built-in list for that key when present.
  collections: z
    .object({
      ventures: z.array(VentureItemInput).max(50).optional(),
      faculty: z.array(FacultyItemInput).max(100).optional(),
    })
    .optional(),
});
export type SiteOverrides = z.infer<typeof SiteOverridesInput>;

export const EMPTY_SITE_OVERRIDES: SiteOverrides = { text: { en: {}, fr: {} }, images: {}, hidden: [], collections: {} };

/** Reshape a flat image map into the structured IMG object the vitrine renders from. */
export function siteImgMap(images: Record<string, string>) {
  const at = (k: string) => images[k] ?? DEFAULT_IMAGES[k]!;
  return {
    hero: at("hero"),
    researchFeature: at("researchFeature"),
    researchHero: at("researchHero"),
    campus: at("campus"),
    aerial: at("aerial"),
    lab: at("lab"),
    students: at("students"),
    event: at("event"),
    dorms: at("dorms"),
    news: [at("news.0"), at("news.1"), at("news.2")],
    programs: [at("programs.0"), at("programs.1"), at("programs.2"), at("programs.3")],
  };
}
