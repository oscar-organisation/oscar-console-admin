import { SORTES, type Element } from "../../../feature-domain/modele/types";
import { LectureSeule } from "./champs";
import ChampsCommuns from "./ChampsCommuns";
import type { Reglage } from "./reglage";

/**
 * La salle temps réel, et la structure d'une unité : traitement, interface,
 * bande, bus. Ce qui ne se règle pas le dit, avec la raison.
 */
export default function FormulaireStructure({ element, reglage }: {
  readonly element: Element;
  readonly reglage: Reglage;
}) {
  if (element.sorte === SORTES.SALLE) {
    return (
      <ChampsCommuns
        element={element}
        reglage={reglage}
        sansDescription
        etiquetteDuNom="Nom de la salle"
        raisonDuCodeFixe="Une salle par bundle, posée avec la première zone : son code ne change pas."
      />
    );
  }
  if (element.sorte === SORTES.TRAITEMENT || element.sorte === SORTES.INTERFACE) {
    return (
      <LectureSeule
        etiquette="Identifiant technique"
        valeur={element.code}
        raison="Créé avec l’unité ; son mode se réglera dans une prochaine version du Studio."
      />
    );
  }
  const reception = element.sorte === SORTES.BUS_RECEPTION;
  const bus = reception || element.sorte === SORTES.BUS_EMISSION;
  return (
    <>
      {bus && (
        <div className={`direction-banner direction-banner--${reception ? "reception" : "emission"}`}>
          {reception ? "Bus de réception : les entrées de l’unité" : "Bus d’émission : les sorties de l’unité"}
        </div>
      )}
      <ChampsCommuns element={element} reglage={reglage} />
    </>
  );
}
