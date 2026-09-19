/**
 * Le « clic fantôme » des écrans tactiles.
 *
 * Quand un doigt se relève, le navigateur envoie encore un `click`, à la même
 * place, une fraction de seconde plus tard. Le studio ouvre ses panneaux dès
 * le relâchement du doigt (pour distinguer l'appui bref de l'appui long) :
 * ce clic tardif tombait alors sur le fond sombre du panneau tout juste
 * ouvert — et le refermait. Un panneau court, comme celui d'un sticker,
 * s'ouvrait et se fermait dans la même fraction de seconde : on ne pouvait
 * jamais toucher « Retirer ».
 *
 * `avalerClicFantome` intercepte ce seul clic, et lui seul : l'écouteur se
 * retire dès qu'il a servi, ou au bout de `duree` si aucun clic ne vient.
 */
export function avalerClicFantome(duree = 600): void {
  if (typeof window === "undefined") return;

  let minuteur = 0;
  const nettoyer = () => {
    window.removeEventListener("click", avaler, true);
    window.clearTimeout(minuteur);
  };
  function avaler(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    nettoyer();
  }

  window.addEventListener("click", avaler, true);
  minuteur = window.setTimeout(nettoyer, duree);
}
