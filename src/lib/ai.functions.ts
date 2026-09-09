import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Assistance par modèle de vision (GLM, via Z.ai).
 *
 * La clé reste côté serveur : ces fonctions sont le seul point de passage, et
 * elles exigent une session — sans quoi n'importe qui consommerait le quota.
 *
 * Le navigateur envoie une vignette, pas la photo d'origine : une image de
 * 512 px suffit largement à situer un sujet et à le décrire, là où l'originale
 * ferait exploser la taille des requêtes pour rien.
 */

const ZAI_URL = process.env["ZAI_URL"] ?? "https://api.z.ai/api/paas/v4/chat/completions";
const ZAI_MODEL = process.env["ZAI_MODEL"] ?? "glm-4.6v";

/**
 * GLM-4.6v raisonne avant de répondre, et ce raisonnement consomme le budget de
 * sortie. Mesuré sur une photo réelle : environ 470 jetons de raisonnement pour
 * 55 de réponse utile. À 900 la réponse revenait vide, le raisonnement ayant tout
 * absorbé — d'où cette marge, facturée seulement si elle sert.
 */
const MAX_TOKENS = 2500;

interface ChatMessage {
  role: "user";
  content: unknown;
}

async function callZai(messages: ChatMessage[], maxTokens = MAX_TOKENS): Promise<string> {
  const key = process.env["ZAI_API_KEY"];
  if (!key) throw new Error("Assistance IA non configurée sur ce serveur.");

  const response = await fetch(ZAI_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: ZAI_MODEL, max_tokens: maxTokens, messages }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Service IA indisponible (" + response.status + ") " + detail.slice(0, 200));
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Réponse vide du service IA.");
  return text.trim();
}

/**
 * Extrait l'objet JSON d'une réponse.
 *
 * Le modèle encadre volontiers son JSON de texte ou de balises de code : on
 * découpe entre la première accolade et la dernière plutôt que d'exiger une
 * réponse parfaitement propre, qu'aucun modèle ne garantit.
 */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Réponse IA illisible.");
  return JSON.parse(text.slice(start, end + 1));
}

function clamp01(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

const PHOTO_PROMPT =
  "Tu écris pour un album photo souvenir. Réponds UNIQUEMENT par du JSON : " +
  '{"legende": "...", "ambiance": "...", "focusX": <0-1>, "focusY": <0-1>, ' +
  '"entiere": <true|false>, "visages": <entier>}. ' +
  // Le premier jet du modèle était un inventaire — « étui de violon bleu
  // ouvert, instrument visible ». Exact, et sans intérêt dans un livre
  // souvenir : on lui demande explicitement le ressenti, pas le catalogue.
  "legende : 70 caracteres maximum, en francais. Evoque le moment et ce qu'on " +
  "ressent, PAS un inventaire de ce qui est visible. Pas de point final. " +
  "ambiance : deux ou trois mots donnant l'atmosphere (par exemple : paisible, " +
  "festif, intime, solennel). " +
  "focusX/focusY : position du sujet principal, 0 = bord gauche/haut. " +
  "entiere : true si un recadrage couperait le sujet. " +
  "visages : nombre de personnes dont le visage est visible, 0 si aucune.";

export const describePhotoAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        // Vignette encodée en base64, sans le préfixe data:.
        imageBase64: z.string().min(100).max(3_000_000),
        mimeType: z.string().max(60).default("image/jpeg"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const text = await callZai([
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: "data:" + data.mimeType + ";base64," + data.imageBase64 },
          },
          { type: "text", text: PHOTO_PROMPT },
        ],
      },
    ]);

    const parsed = extractJson(text) as Record<string, unknown>;
    const caption = typeof parsed["legende"] === "string" ? parsed["legende"].trim() : "";
    const mood = typeof parsed["ambiance"] === "string" ? parsed["ambiance"].trim() : "";
    const faces = Number(parsed["visages"]);

    return {
      caption: caption.slice(0, 120),
      mood: mood.slice(0, 60),
      focusX: clamp01(parsed["focusX"], 0.5),
      focusY: clamp01(parsed["focusY"], 0.5),
      wholeImage: parsed["entiere"] === true,
      faceCount: Number.isFinite(faces) ? Math.min(100, Math.max(0, Math.round(faces))) : 0,
    };
  });

const ALBUM_PROMPT =
  "Voici les légendes des photos d'un album, dans l'ordre. Propose un titre et un " +
  "sous-titre de couverture. Réponds UNIQUEMENT par du JSON : " +
  '{"titre": "<=45 caracteres, francais, evocateur>", "sousTitre": "<=60 caracteres>"}. ' +
  "N'invente ni lieu ni date absents des légendes.";

export const suggestAlbumTextsAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        captions: z.array(z.string().max(200)).min(1).max(120),
        dateLabel: z.string().max(60).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const list = data.captions
      .map((caption, index) => index + 1 + ". " + caption)
      .join("\n")
      .slice(0, 6000);

    const text = await callZai([
      {
        role: "user",
        content:
          ALBUM_PROMPT +
          "\n\nPériode : " +
          (data.dateLabel ?? "inconnue") +
          "\n\nLégendes :\n" +
          list,
      },
    ]);

    const parsed = extractJson(text) as Record<string, unknown>;
    return {
      title: typeof parsed["titre"] === "string" ? parsed["titre"].trim().slice(0, 60) : "",
      subtitle:
        typeof parsed["sousTitre"] === "string" ? parsed["sousTitre"].trim().slice(0, 80) : "",
    };
  });
