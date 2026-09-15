/**
 * Effets appliqués aux photos du livre.
 *
 * Un effet appartient au livre, pas à la photo : l'album garde toujours
 * l'image d'origine, et le même cliché peut sortir en noir et blanc dans un
 * livre et intact dans un autre. Il est donc rangé dans la disposition
 * (`AlbumLayout.effects`), au même titre que la couleur d'une page.
 *
 * Chaque effet est décrit **une seule fois**, en opérations élémentaires. On
 * en tire deux rendus qui doivent rester identiques :
 *
 * - à l'écran, une chaîne `filter` CSS ;
 * - au PDF, le même `filter` posé sur le canvas de recadrage — c'est le même
 *   moteur que celui du CSS, donc le même résultat.
 *
 * Les navigateurs sans `context.filter` (Safari d'avant 17) retombent sur une
 * matrice de couleurs calculée à partir des mêmes opérations : les formules
 * sont celles de la spécification des filtres, dont le CSS se sert aussi.
 * Un effet ne peut donc pas être « joli à l'écran, faux à l'impression ».
 */

/** Opération élémentaire, telle que la nomme la spécification des filtres. */
type EffectOp =
  | ["grayscale", number]
  | ["sepia", number]
  | ["saturate", number]
  | ["hue-rotate", number]
  | ["brightness", number]
  | ["contrast", number];

export interface PhotoEffect {
  id: string;
  label: string;
  /** Ce que l'effet fait, en une ligne, pour l'auteur. */
  hint: string;
  ops: EffectOp[];
}

/** `aucun` n'est pas dans la liste : c'est l'absence d'effet. */
export const PHOTO_EFFECTS: PhotoEffect[] = [
  {
    id: "nb",
    label: "Noir et blanc",
    hint: "Toute la couleur retirée, les contrastes un peu relevés.",
    ops: [
      ["grayscale", 1],
      ["contrast", 1.08],
    ],
  },
  {
    id: "sepia",
    label: "Sépia",
    hint: "Le brun des photographies anciennes.",
    ops: [
      ["sepia", 0.75],
      ["contrast", 1.05],
    ],
  },
  {
    id: "vintage",
    label: "Vieille photo",
    hint: "Couleurs passées, lumière adoucie, comme un tirage oublié.",
    ops: [
      ["sepia", 0.32],
      ["saturate", 0.82],
      ["brightness", 1.06],
      ["contrast", 0.92],
    ],
  },
  {
    id: "eclat",
    label: "Éclatant",
    hint: "Les couleurs poussées : pagnes, ballons, décoration de fête.",
    ops: [
      ["saturate", 1.38],
      ["contrast", 1.12],
    ],
  },
  {
    id: "doux",
    label: "Doux",
    hint: "Lumière tendre, couleurs calmées — les portraits d'enfants.",
    ops: [
      ["saturate", 0.86],
      ["brightness", 1.07],
      ["contrast", 0.94],
    ],
  },
  {
    id: "soleil",
    label: "Soleil",
    hint: "La chaleur d'une fin d'après-midi.",
    ops: [
      ["sepia", 0.22],
      ["saturate", 1.22],
      ["hue-rotate", -8],
      ["brightness", 1.04],
    ],
  },
  {
    id: "lagune",
    label: "Lagune",
    hint: "Des bleus plus francs, une lumière plus fraîche.",
    ops: [
      ["saturate", 1.1],
      ["hue-rotate", 12],
      ["brightness", 1.02],
    ],
  },
  {
    id: "studio",
    label: "Contrasté",
    hint: "Noirs profonds et blancs francs, façon studio.",
    ops: [
      ["contrast", 1.32],
      ["saturate", 0.96],
    ],
  },
];

const BY_ID = new Map(PHOTO_EFFECTS.map((effect) => [effect.id, effect]));

export function findEffect(id: string | null | undefined): PhotoEffect | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/**
 * La chaîne à poser dans `filter`, en CSS comme sur un canvas.
 *
 * `undefined` quand il n'y a pas d'effet : une propriété absente coûte moins
 * cher au navigateur qu'un `filter: none` sur chaque photo.
 */
export function effectFilter(id: string | null | undefined): string | undefined {
  const effect = findEffect(id);
  if (!effect) return undefined;
  return effect.ops
    .map(([name, value]) => name + "(" + (name === "hue-rotate" ? value + "deg" : value) + ")")
    .join(" ");
}

/* ------------------------------------------------- repli sans filtre canvas */

/**
 * Matrice 4×5 (RGBA + constante) équivalente aux opérations de l'effet.
 *
 * Les coefficients sont ceux de la spécification des filtres : c'est ce que le
 * navigateur applique lui-même pour un `filter` CSS. Les matrices se composent
 * dans l'ordre de lecture, comme les filtres s'enchaînent.
 */
type Matrix = number[]; // 20 valeurs, 4 lignes de 5

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Applique `b` après `a`. */
function multiply(a: Matrix, b: Matrix): Matrix {
  const out: Matrix = new Array(20).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      let sum = col === 4 ? (b[row * 5 + 4] ?? 0) : 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (b[row * 5 + k] ?? 0) * (a[k * 5 + col] ?? 0);
      }
      out[row * 5 + col] = sum;
    }
  }
  return out;
}

/** Interpole entre l'identité et `target`, comme le fait un filtre partiel. */
function blend(target: Matrix, amount: number): Matrix {
  return target.map((value, index) => {
    const base = IDENTITY[index] ?? 0;
    return base + (value - base) * amount;
  });
}

function matrixForOp([name, value]: EffectOp): Matrix {
  switch (name) {
    case "grayscale":
      return blend(
        [
          0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0,
          0, 0, 0, 1, 0,
        ],
        value,
      );
    case "sepia":
      return blend(
        [
          0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0,
          1, 0,
        ],
        value,
      );
    case "saturate":
      return [
        0.213 + 0.787 * value,
        0.715 - 0.715 * value,
        0.072 - 0.072 * value,
        0,
        0,
        0.213 - 0.213 * value,
        0.715 + 0.285 * value,
        0.072 - 0.072 * value,
        0,
        0,
        0.213 - 0.213 * value,
        0.715 - 0.715 * value,
        0.072 + 0.928 * value,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
      ];
    case "hue-rotate": {
      const radians = (value * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return [
        0.213 + cos * 0.787 - sin * 0.213,
        0.715 - cos * 0.715 - sin * 0.715,
        0.072 - cos * 0.072 + sin * 0.928,
        0,
        0,
        0.213 - cos * 0.213 + sin * 0.143,
        0.715 + cos * 0.285 + sin * 0.14,
        0.072 - cos * 0.072 - sin * 0.283,
        0,
        0,
        0.213 - cos * 0.213 - sin * 0.787,
        0.715 - cos * 0.715 + sin * 0.715,
        0.072 + cos * 0.928 + sin * 0.072,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
      ];
    }
    case "brightness":
      return [value, 0, 0, 0, 0, 0, value, 0, 0, 0, 0, 0, value, 0, 0, 0, 0, 0, 1, 0];
    case "contrast": {
      const offset = 0.5 - value * 0.5;
      return [
        value,
        0,
        0,
        0,
        offset,
        0,
        value,
        0,
        0,
        offset,
        0,
        0,
        value,
        0,
        offset,
        0,
        0,
        0,
        1,
        0,
      ];
    }
  }
}

export function effectMatrix(id: string | null | undefined): Matrix | null {
  const effect = findEffect(id);
  if (!effect) return null;
  return effect.ops.reduce<Matrix>((acc, op) => multiply(acc, matrixForOp(op)), IDENTITY);
}

/**
 * Applique l'effet pixel par pixel, pour les navigateurs sans `context.filter`.
 *
 * Les constantes de la matrice sont exprimées sur 0-1, les pixels sur 0-255 :
 * d'où le facteur 255 sur la dernière colonne.
 */
export function applyEffectToImageData(data: Uint8ClampedArray, matrix: Matrix): void {
  const [r0, r1, r2, r3, r4, g0, g1, g2, g3, g4, b0, b1, b2, b3, b4] = matrix as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const a = data[i + 3] ?? 0;
    data[i] = r0 * r + r1 * g + r2 * b + r3 * a + r4 * 255;
    data[i + 1] = g0 * r + g1 * g + g2 * b + g3 * a + g4 * 255;
    data[i + 2] = b0 * r + b1 * g + b2 * b + b3 * a + b4 * 255;
  }
}
