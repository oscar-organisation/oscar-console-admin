import { FORMATS_DE_DONNEES, TYPES_D_EMISSION, TYPES_DE_RECEPTION } from "../../../feature-domain/modele/canaux";
import { SORTES, type Element } from "../../../feature-domain/modele/types";
import { ChampChoix, Explication } from "./champs";
import ChampsCommuns from "./ChampsCommuns";
import type { Reglage } from "./reglage";

/**
 * Un canal, comme dans l'ancien inspecteur : son sens en bandeau, son nom,
 * son code, son type et le format de sa donnée choisis dans des listes (les
 * valeurs de l'ancien Studio, reprises telles quelles jusqu'aux types
 * d'entrées et de sorties du lot suivant).
 */
export default function FormulaireCanal({ element, reglage }: {
  readonly element: Element;
  readonly reglage: Reglage;
}) {
  const reglages = element.reglages ?? {};
  const entree = element.sorte === SORTES.CANAL_RECEPTION;
  const types = entree ? TYPES_DE_RECEPTION : TYPES_D_EMISSION;
  const type = String(reglages.type ?? "");
  const format = String(reglages.format ?? "");
  const aideDuType = types.find((choix) => choix.code === type)?.aide;
  return (
    <>
      <div className={`direction-banner direction-banner--${entree ? "reception" : "emission"}`}>
        {entree ? "Canal de réception (entrée)" : "Canal d’émission (sortie)"}
      </div>
      <ChampsCommuns element={element} reglage={reglage} etiquetteDuNom="Nom du canal" />
      <ChampChoix
        etiquette={entree ? "Type d’entrée" : "Type de sortie"}
        valeur={type}
        choix={types.map((choix) => ({ valeur: choix.code, libelle: choix.libelle }))}
        onValider={(valeur) => reglage.regler({ reglages: { ...reglages, type: valeur } })}
      />
      {aideDuType && <Explication>{aideDuType}</Explication>}
      <ChampChoix
        etiquette="Format des données"
        valeur={format}
        choix={FORMATS_DE_DONNEES.map((choix) => ({ valeur: choix.code, libelle: choix.aide }))}
        aide="Une liaison relie de préférence deux canaux au même format."
        onValider={(valeur) => reglage.regler({ reglages: { ...reglages, format: valeur } })}
      />
    </>
  );
}
