import type { EnTeteDuBundle } from "../../../feature-domain/modele/types";
import { ChampTexte } from "./champs";
import { lienDuChamp, type Reglage } from "./reglage";

/** L'en-tête du bundle : son nom, son code, sa description. */
export default function FormulaireBundle({ bundle, reglage }: {
  readonly bundle: EnTeteDuBundle;
  readonly reglage: Reglage<Partial<EnTeteDuBundle>>;
}) {
  return (
    <>
      <ChampTexte
        etiquette="Nom du bundle"
        forme="nom"
        valeur={bundle.nom}
        aide="Le nom que voient les opérateurs."
        {...lienDuChamp(reglage, (nom) => ({ nom }))}
      />
      <ChampTexte
        etiquette="Identifiant technique"
        forme="code"
        valeur={bundle.code}
        aide="Par exemple BUNDLE_DEPLOIEMENT_TELEOPERATION_M3."
        {...lienDuChamp(reglage, (code) => ({ code }))}
      />
      <ChampTexte
        etiquette="Description"
        forme="description"
        multiligne
        valeur={bundle.description ?? ""}
        indication="Ce que fait ce bundle, en une phrase."
        {...lienDuChamp(reglage, (description) => ({ description }))}
      />
    </>
  );
}
