export interface Album {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
  /** Thème graphique du livre imprimé (voir book-themes.ts). */
  theme: string;
  /** Format d'impression (voir print-formats.ts). */
  page_format: string;
  /** Titre de couverture ; retombe sur `title` s'il est vide. */
  cover_title: string | null;
  cover_subtitle: string | null;
  cover_photo_id: string | null;
  /** Composition de la couverture (voir cover-templates.ts). */
  cover_template: string;
  /**
   * Disposition manuelle des pages ; `null` = découpage automatique.
   * Typée explicitement plutôt qu'en `unknown` : les valeurs traversant une
   * fonction serveur doivent être sérialisables de façon vérifiable.
   */
  layout: { pages: { id: string; slots: (string | null)[] }[] } | null;
}

export interface Photo {
  id: string;
  album_id: string;
  user_id: string;
  storage_path: string;
  url: string | null;
  caption: string | null;
  order_index: number;
  created_at: string;
  /** Point focal horizontal du cadrage, 0 à 1. */
  crop_x: number;
  crop_y: number;
  /** Zoom au-delà du cadrage couvrant. 1 = aucun. */
  crop_zoom: number;
  /** 'cover' rogne pour remplir, 'contain' montre la photo entière. */
  fit: string;
  /** Largeur / hauteur de l'image, mesurée à l'analyse. */
  aspect_ratio: number | null;
  /** Date de prise de vue lue dans l'EXIF. */
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  place: string | null;
  /** Noms saisis par l'auteur ; aucune reconnaissance faciale n'est faite. */
  people: string[];
  /** Ambiance proposée par l'IA, modifiable. */
  mood: string | null;
  face_count: number | null;
  /** Dimensions du fichier d'impression, orientation appliquée. */
  width?: number | null;
  height?: number | null;
  dominant_color?: string | null;
  /** uploading | done | failed : la ligne existe avant la fin de l'envoi. */
  upload_status?: string;
  print_path?: string | null;
  mime_type?: string | null;
  file_hash?: string | null;
}

export interface PhotoWithSignedUrl extends Photo {
  /** Version d'affichage (1 400 px). Jamais le fichier d'impression. */
  signedUrl: string;
  /** Vignette de 400 px. */
  thumbUrl: string | null;
  /** Fichier d'impression signé, pour l'export ; `null` hors administration. */
  printUrl: string | null;
}

/** Photo telle que l'affiche la grille d'un album : colonnes utiles seulement. */
export interface GridPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
  order_index: number;
  taken_at: string | null;
  width: number | null;
  height: number | null;
  aspect_ratio: number | null;
  dominant_color: string | null;
  upload_status: string;
  thumbUrl: string | null;
  displayUrl: string | null;
}

/** Une page de la grille ; `total` n'est calculé que pour la première. */
export interface PhotoPage {
  photos: GridPhoto[];
  total: number | null;
  nextOffset: number | null;
}

/** Album enrichi pour la bibliothèque : nombre de photos et vignette de couverture. */
export interface AlbumPreview extends Album {
  photo_count: number;
  /** URL signée de la première photo, `null` si l'album est vide. */
  cover_url: string | null;
}

/** Ligne de la vue administrateur : un album, quel qu'en soit le propriétaire. */
export interface AdminAlbumRow {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  theme: string;
  page_format: string;
  photo_count: number;
}
