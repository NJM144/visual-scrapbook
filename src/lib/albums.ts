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
}

export interface PhotoWithSignedUrl extends Photo {
  signedUrl: string;
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
