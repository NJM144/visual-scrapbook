export interface Album {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
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
