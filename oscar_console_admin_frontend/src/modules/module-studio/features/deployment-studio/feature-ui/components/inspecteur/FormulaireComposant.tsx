import type { CatalogueStudio, Element } from "../../../feature-domain/modele/types";
import ChampDuType from "./ChampDuType";
import ChampsCommuns from "./ChampsCommuns";
import DonneesReprises from "./DonneesReprises";
import type { Reglage } from "./reglage";

/** Un service ou une application : nom, code, type, description ; et ce que la reprise a gardé. */
export default function FormulaireComposant({ element, catalogue, reglage }: {
  readonly element: Element;
  readonly catalogue: CatalogueStudio;
  readonly reglage: Reglage;
}) {
  return (
    <>
      <ChampsCommuns element={element} reglage={reglage} />
      <ChampDuType element={element} catalogue={catalogue} reglage={reglage} />
      <DonneesReprises donnees={element.donnees_reprises} />
    </>
  );
}
