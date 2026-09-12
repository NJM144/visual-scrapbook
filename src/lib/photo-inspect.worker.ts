import { inspect } from "./photo-inspect";
import { emptyResult, type InspectRequest, type InspectResult } from "./photo-kind";

// Typage minimal du contexte du worker : inclure la bibliothèque « webworker »
// entrerait en conflit avec celle du DOM, utilisée par le reste du projet.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<InspectRequest>) => void) | null;
  postMessage: (message: InspectResult) => void;
};

scope.onmessage = (event) => {
  void inspect(event.data).then(
    (result) => scope.postMessage(result),
    () => scope.postMessage(emptyResult(event.data.id)),
  );
};
