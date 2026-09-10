/**
 * Photographies d'événements familiaux utilisées comme décor du site.
 *
 * Anthologie sert à garder les mariages, baptêmes, anniversaires et réunions
 * de famille : le décor doit montrer des gens qui se retrouvent, pas des
 * paysages. Toutes viennent de Wikimedia Commons (concours Wiki Loves Africa)
 * sous CC BY-SA 4.0, qui impose de créditer l'auteur : les mentions ci-dessous
 * sont affichées en pied de page, ne les retirez pas sans remplacer les images.
 */

export interface GalleryImage {
  src: string;
  /** Texte alternatif : décrit la scène, pas le rôle décoratif. */
  alt: string;
  /** L'occasion, telle qu'on nommerait l'album. */
  event: string;
  place: string;
  author: string;
  license: string;
  /** Page d'origine sur Wikimedia Commons. */
  source: string;
  /** Point de cadrage (object-position) quand l'image est rognée. */
  position?: string;
}

export const DANSE_MARIAGE: GalleryImage = {
  src: "/images/mariage-danse.jpg",
  alt: "Danseuses en tenue traditionnelle, bras levés et souriantes, pendant un mariage",
  event: "Mariage",
  place: "Rwanda",
  author: "Davyimage",
  license: "CC BY-SA 4.0",
  source: "https://commons.wikimedia.org/wiki/File:Rwanda_tradional_dance_in_wedding.jpg",
  position: "50% 30%",
};

export const REUNION_FAMILLE: GalleryImage = {
  src: "/images/reunion-famille.jpg",
  alt: "Une grande famille assise en cercle sur des chaises colorées devant une maison en briques",
  event: "Réunion de famille",
  place: "Pays bamiléké, Cameroun",
  author: "Mndetatsin",
  license: "CC BY-SA 4.0",
  source:
    "https://commons.wikimedia.org/wiki/File:Reunion_familliale_dans_une_concession_bamil%C3%A9k%C3%A9_au_Cameroun.jpg",
};

export const MARIAGE: GalleryImage = {
  src: "/images/mariage.jpg",
  alt: "La mariée en corail et le marié en blanc échangent une coupe, entourés de la famille",
  event: "Mariage traditionnel",
  place: "Esan, Nigeria",
  author: "Pictureperfect photography",
  license: "CC BY-SA 4.0",
  source: "https://commons.wikimedia.org/wiki/File:Esan_traditional_wedding_001.jpg",
};

export const BAPTEME: GalleryImage = {
  src: "/images/bapteme.jpg",
  alt: "Quatre jeunes baptisés vêtus de blanc posent ensemble le jour de leur baptême",
  event: "Baptême",
  place: "Cameroun",
  author: "NZALLI MAMBOU Freddy",
  license: "CC BY-SA 4.0",
  source: "https://commons.wikimedia.org/wiki/File:C%C3%A9l%C3%A9bration_du_bapt%C3%AAme.jpg",
  position: "50% 35%",
};

export const ANNIVERSAIRE: GalleryImage = {
  src: "/images/anniversaire.jpg",
  alt: "Un gâteau surmonté d’un cierge magique apporté à un couple qui sourit",
  event: "Anniversaire",
  place: "Rwanda",
  author: "Kian bless",
  license: "CC BY-SA 4.0",
  source: "https://commons.wikimedia.org/wiki/File:Birthday_show_04.jpg",
  position: "62% 50%",
};

/**
 * Version de 960 px de large, pour les téléphones : le tiers du poids, et
 * aucune différence visible sur un écran de cette taille.
 */
export function smallSrc(src: string): string {
  return src.replace(/\.jpg$/, "-960.jpg");
}

/** Photo d'accueil, en pleine largeur. */
export const HERO = DANSE_MARIAGE;

/** Bande panoramique entre deux sections. */
export const BAND = REUNION_FAMILLE;

/** Les trois événements présentés en exemple d'albums sur la page d'accueil. */
export const SHOWCASE: GalleryImage[] = [MARIAGE, BAPTEME, ANNIVERSAIRE];

/** Ensemble complet, pour la mention légale du pied de page. */
export const CREDITS: GalleryImage[] = [
  DANSE_MARIAGE,
  REUNION_FAMILLE,
  MARIAGE,
  BAPTEME,
  ANNIVERSAIRE,
];
