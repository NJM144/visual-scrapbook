import { contientEmoji, decouper, urlTwemoji } from "@/lib/emoji";

/**
 * Un texte du livre, ses emoji dessinés comme à l'impression.
 *
 * Le PDF remplace chaque emoji par son dessin Twemoji (voir emoji.ts) : sans
 * ce composant, l'aperçu montrerait l'emoji du téléphone — un cœur Apple ici,
 * un cœur Samsung là — et l'auteur découvrirait l'autre à l'impression. Le
 * dessin prend la hauteur d'une lettre et se pose sur la ligne de base.
 */
export function TexteEmoji({ texte }: { texte: string }) {
  if (!contientEmoji(texte)) return <>{texte}</>;
  return (
    <>
      {decouper(texte).map((morceau, index) =>
        morceau.type === "texte" ? (
          <span key={index}>{morceau.valeur}</span>
        ) : (
          <img
            key={index}
            src={urlTwemoji(morceau.code)}
            alt={morceau.valeur}
            draggable={false}
            loading="lazy"
            decoding="async"
            className="inline-block"
            style={{
              width: "1em",
              height: "1em",
              margin: "0 0.05em",
              verticalAlign: "-0.12em",
            }}
          />
        ),
      )}
    </>
  );
}
