import type { CatalogueStudio, Element } from "../../../feature-domain/modele/types";
import { ChampChoix } from "./champs";
import type { Reglage } from "./reglage";

/** Le type d'un élément, choisi dans une liste : ceux que le catalogue propose pour sa sorte. */
export default function ChampDuType({ element, catalogue, reglage, etiquette = "Type", aide }: {
  readonly element: Element;
  readonly catalogue: CatalogueStudio;
  readonly reglage: Reglage;
  readonly etiquette?: string;
  readonly aide?: string;
}) {
  const types = catalogue.types.filter((type) => type.sorte === element.sorte && type.dans_la_palette);
  const actuel = element.type ? `${element.type.code}@${element.type.version}` : "";
  const nomActuel = element.type
    ? catalogue.types.find((type) => type.code === element.type?.code && type.version === element.type?.version)?.nom
      ?? `${element.type.code} (version ${element.type.version})`
    : "À préciser";
  return (
    <ChampChoix
      etiquette={etiquette}
      valeur={actuel}
      libelleHorsListe={nomActuel}
      choix={types.map((type) => ({ valeur: `${type.code}@${type.version}`, libelle: `${type.nom} (version ${type.version})` }))}
      aide={aide ?? "Le type vient du catalogue ; d’autres arriveront avec le catalogue standard."}
      onValider={(valeur) => {
        const [code = "", version = ""] = valeur.split("@");
        return reglage.regler({ type: { code, version } });
      }}
    />
  );
}
