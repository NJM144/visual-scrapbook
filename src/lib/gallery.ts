/**
 * Photographies de paysages africains utilisées comme décor du site.
 *
 * Toutes proviennent de Wikimedia Commons et sont librement réutilisables.
 * Les licences CC BY-SA imposent de créditer l'auteur : les mentions ci-dessous
 * sont affichées en pied de page, ne les retirez pas sans remplacer les images.
 */

export interface GalleryImage {
  src: string;
  /** Texte alternatif : décrit la scène, pas le rôle décoratif. */
  alt: string;
  place: string;
  author: string;
  license: string;
  /** Page d'origine sur Wikimedia Commons. */
  source: string;
}

export const ACACIA: GalleryImage = {
  src: "/images/savane-acacia.jpg",
  alt: "Acacia se détachant sur un lever de soleil orange dans la savane du Serengeti",
  place: "Serengeti, Tanzanie",
  author: "Daniel Zaas",
  license: "Domaine public",
  source:
    "https://commons.wikimedia.org/wiki/File:Acacia_tree_on_a_sunrise_safari_at_the_Serengeti_National_Park,_Tanzania.jpg",
};

export const SERENGETI: GalleryImage = {
  src: "/images/serengeti-aube.jpg",
  alt: "Plaine dorée du Serengeti à l’aube, colline bleutée au loin",
  place: "Serengeti, Tanzanie",
  author: "Giles Laurent",
  license: "CC BY-SA 4.0",
  source:
    "https://commons.wikimedia.org/wiki/File:004_Sunrise_at_Serengeti_National_Park_Photo_by_Giles_Laurent.jpg",
};

export const DENT_DE_MAN: GalleryImage = {
  src: "/images/dent-de-man.jpg",
  alt: "La Dent de Man, piton rocheux émergeant d’une forêt verte sous un ciel nuageux",
  place: "Man, Côte d’Ivoire",
  author: "Milequem Diarassouba",
  license: "CC BY-SA 4.0",
  source: "https://commons.wikimedia.org/wiki/File:The_Dent_de_Man_mountain.jpg",
};

export const BAOBABS: GalleryImage = {
  src: "/images/allee-des-baobabs.jpg",
  alt: "Allée de baobabs géants sur une piste de terre au coucher du soleil",
  place: "Morondava, Madagascar",
  author: "Rod Waddington",
  license: "CC BY-SA 2.0",
  source:
    "https://commons.wikimedia.org/wiki/File:Sunset,_Allee_des_Baobabs,_Madagascar_(27610142306).jpg",
};

export const DUNES: GalleryImage = {
  src: "/images/dunes-erg-chebbi.jpg",
  alt: "Dunes ondulées de l’Erg Chebbi éclairées par un soleil rasant",
  place: "Erg Chebbi, Maroc",
  author: "Snowmanstudios",
  license: "CC BY-SA 4.0",
  source: "https://commons.wikimedia.org/wiki/File:Erg_Chebbi_sunset.jpg",
};

/** Les trois paysages présentés en exemple d'albums sur la page d'accueil. */
export const SHOWCASE: GalleryImage[] = [DENT_DE_MAN, BAOBABS, DUNES];

/** Ensemble complet, pour la mention légale du pied de page. */
export const CREDITS: GalleryImage[] = [ACACIA, SERENGETI, DENT_DE_MAN, BAOBABS, DUNES];
