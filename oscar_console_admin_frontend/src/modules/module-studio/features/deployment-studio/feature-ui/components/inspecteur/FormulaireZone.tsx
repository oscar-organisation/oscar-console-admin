import { useEffect, useState } from "react";
import {
  EXIGENCE_FACULTATIVE,
  EXIGENCE_OBLIGATOIRE,
  SORTES,
  type CatalogueStudio,
  type Element,
} from "../../../feature-domain/modele/types";
import { ChampChoix, ChampTexte, Explication } from "./champs";
import ChampsCommuns from "./ChampsCommuns";
import type { Reglage } from "./reglage";

/**
 * Une zone d'environnement : son nom, son code, son type, et si le bundle
 * peut s'en passer (spécification 5.3). Une zone facultative dit pourquoi :
 * tant que la justification n'est pas écrite, la zone reste obligatoire, et
 * l'écran dit ce qu'il manque.
 */
export default function FormulaireZone({ element, catalogue, reglage }: {
  readonly element: Element;
  readonly catalogue: CatalogueStudio;
  readonly reglage: Reglage;
}) {
  const reglages = element.reglages ?? {};
  const facultative = reglages.exigence === EXIGENCE_FACULTATIVE;
  const justification = typeof reglages.justification === "string" ? reglages.justification : "";
  // « Facultative » choisie, mais sans justification encore : rien n'est changé dans le modèle.
  const [facultativeEnAttente, setFacultativeEnAttente] = useState(false);
  useEffect(() => setFacultativeEnAttente(false), [element.id, facultative]);

  const types = catalogue.types.filter((type) => type.sorte === SORTES.ZONE && type.dans_la_palette);
  const typeActuel = element.type ? `${element.type.code}@${element.type.version}` : "";
  const definition = element.type ? catalogue.types.find((type) => type.code === element.type?.code) : undefined;

  return (
    <>
      <ChampsCommuns element={element} reglage={reglage} sansDescription etiquetteDuNom="Nom de la zone" />
      <ChampChoix
        etiquette="Type de zone"
        valeur={typeActuel}
        libelleHorsListe={definition?.nom ?? "À préciser"}
        choix={types.map((type) => ({ valeur: `${type.code}@${type.version}`, libelle: type.nom }))}
        aide="Le type dit ce que la zone reçoit : des services (robot, serveur) ou des applications."
        onValider={(valeur) => {
          const [code = "", version = ""] = valeur.split("@");
          return reglage.regler({ type: { code, version } });
        }}
      />
      {definition && <Explication>{definition.description}</Explication>}
      <ChampChoix
        etiquette="Le bundle peut-il s’en passer ?"
        valeur={facultative || facultativeEnAttente ? EXIGENCE_FACULTATIVE : EXIGENCE_OBLIGATOIRE}
        choix={[
          { valeur: EXIGENCE_OBLIGATOIRE, libelle: "Obligatoire : il ne fonctionne pas sans elle" },
          { valeur: EXIGENCE_FACULTATIVE, libelle: "Facultative : il fonctionne sans elle" },
        ]}
        onValider={(valeur) => {
          if (valeur === EXIGENCE_OBLIGATOIRE) {
            setFacultativeEnAttente(false);
            // Redevenue obligatoire, la zone n'a plus de justification à garder.
            return facultative ? reglage.regler({ reglages: { exigence: EXIGENCE_OBLIGATOIRE } }) : null;
          }
          if (justification.trim()) return reglage.regler({ reglages: { exigence: EXIGENCE_FACULTATIVE, justification } });
          setFacultativeEnAttente(true);
          return null;
        }}
      />
      {(facultative || facultativeEnAttente) && (
        <ChampTexte
          etiquette="Pourquoi le bundle fonctionne sans elle"
          forme="justification"
          multiligne
          valeur={justification}
          indication="Par exemple : le robot se pilote sans ce serveur."
          aide={facultativeEnAttente
            ? "Écrivez la justification, puis quittez le champ : la zone deviendra facultative."
            : "Une zone facultative dit toujours pourquoi le bundle s’en passe."}
          onValider={(texte) => reglage.regler({ reglages: { exigence: EXIGENCE_FACULTATIVE, justification: texte } })}
          onAbandon={reglage.abandonner}
        />
      )}
    </>
  );
}
