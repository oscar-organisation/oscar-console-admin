import { Cable, CheckCircle2, Cpu, Plus } from "lucide-react";
import { SORTES, type CatalogueStudio, type Element, type ModeleBundle } from "../../../feature-domain/modele/types";
import { Section } from "./champs";
import ChampDuType from "./ChampDuType";
import ChampsCommuns from "./ChampsCommuns";
import DonneesReprises from "./DonneesReprises";
import type { Reglage } from "./reglage";

/**
 * Une unité, comme dans l'ancien inspecteur : nom, code, type, puis la
 * structure créée automatiquement avec elle (traitement, interface, bande,
 * bus), cochée ; et deux boutons pour ajouter une entrée ou une sortie.
 */
export default function FormulaireUnite({ element, modele, catalogue, reglage, onAjouterUnCanal }: {
  readonly element: Element;
  readonly modele: ModeleBundle;
  readonly catalogue: CatalogueStudio;
  readonly reglage: Reglage;
  /** Ajouter un canal dans ce bus : il naît sélectionné, son formulaire ouvert. */
  readonly onAjouterUnCanal: (bus: string, entree: boolean) => void;
}) {
  const enfantsDe = (id: string) => modele.elements.filter((enfant) => enfant.parent === id);
  const traitement = enfantsDe(element.id).find((enfant) => enfant.sorte === SORTES.TRAITEMENT);
  const interfaces = enfantsDe(element.id).filter((enfant) => enfant.sorte === SORTES.INTERFACE);
  const bandes = interfaces.flatMap((itf) => enfantsDe(itf.id)).filter((enfant) => enfant.sorte === SORTES.BANDE);
  const lesBus = bandes.flatMap((bande) => enfantsDe(bande.id));
  const busDeReception = lesBus.filter((bus) => bus.sorte === SORTES.BUS_RECEPTION);
  const busDEmission = lesBus.filter((bus) => bus.sorte === SORTES.BUS_EMISSION);
  const lignes: { libelle: string; element: Element | undefined }[] = [
    { libelle: "Traitement métier", element: traitement },
    { libelle: "Interface de communication", element: interfaces[0] },
    ...bandes.map((bande) => ({ libelle: "Bande de données", element: bande })),
    ...busDeReception.map((bus) => ({ libelle: "Bus de réception", element: bus })),
    ...busDEmission.map((bus) => ({ libelle: "Bus d’émission", element: bus })),
  ];
  // Avec plusieurs bus du même sens, le Studio ne choisit pas à votre place : on passe par la structure.
  const seulBusDeReception = busDeReception.length === 1 ? busDeReception[0] : undefined;
  const seulBusDEmission = busDEmission.length === 1 ? busDEmission[0] : undefined;
  return (
    <>
      <ChampsCommuns element={element} reglage={reglage} etiquetteDuNom="Nom de l’unité" />
      <ChampDuType
        element={element}
        catalogue={catalogue}
        reglage={reglage}
        etiquette="Type d’unité"
        aide="Le type décrit sa fonction ; chaque unité garde son propre nom."
      />
      <Section icone={<Cpu size={15} aria-hidden="true" />}>Structure créée automatiquement</Section>
      <div className="generated-structure">
        {lignes.map((ligne, rang) => (
          <div key={`${ligne.libelle}-${ligne.element?.id ?? rang}`}>
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>{ligne.libelle}{ligne.element?.nom ? ` : ${ligne.element.nom}` : ""}</span>
            <code>{ligne.element?.code ?? "absent"}</code>
          </div>
        ))}
      </div>
      <Section icone={<Cable size={15} aria-hidden="true" />}>Canaux de données</Section>
      <div className="channel-actions">
        <button
          type="button"
          disabled={!seulBusDeReception}
          title={seulBusDeReception ? "Ajouter une entrée dans le bus de réception" : "Plusieurs bus de réception : choisissez-le dans la structure"}
          onClick={() => seulBusDeReception && onAjouterUnCanal(seulBusDeReception.id, true)}
        >
          <Plus size={14} aria-hidden="true" /> Entrée
        </button>
        <button
          type="button"
          disabled={!seulBusDEmission}
          title={seulBusDEmission ? "Ajouter une sortie dans le bus d’émission" : "Plusieurs bus d’émission : choisissez-le dans la structure"}
          onClick={() => seulBusDEmission && onAjouterUnCanal(seulBusDEmission.id, false)}
        >
          <Plus size={14} aria-hidden="true" /> Sortie
        </button>
      </div>
      <DonneesReprises donnees={element.donnees_reprises} />
    </>
  );
}
